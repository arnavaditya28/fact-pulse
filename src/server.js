require("dotenv").config();

const path = require("path");
const express = require("express");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { createMcpServer } = require("./mcp");
const { checkClaim, getCheck, toPublic } = require("./factCheck");
const { explainSpeech, sourcesSpeech } = require("./speech");
const { searchProvider } = require("./discovery/searchWeb");
const { warmVeridex } = require("./veridexLookup");
const store = require("./store");

const app = express();
app.disable("x-powered-by");
// Behind Vercel's (or any) proxy, req.ip must come from X-Forwarded-For, or
// every visitor would share one rate-limit bucket.
app.set("trust proxy", 1);
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

/* Small per-IP limiter: every check spends search and Gemini quota. */
const hits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip;
  const recent = (hits.get(key) || []).filter(t => now - t < 60000);
  if (recent.length >= (Number(process.env.RATE_LIMIT_PER_MIN) || 30)) {
    return res.status(429).json({ error: "Too many requests", speech: "I'm getting a lot of questions. Try again in a minute." });
  }
  recent.push(now);
  hits.set(key, recent);
  next();
}

const listenerOf = req => String(req.body?.listener || req.query.listener || "guest").slice(0, 64);

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "fact-pulse", search: searchProvider(), mcp: "/mcp" });
});

/* ======================
   Voice REST endpoints
====================== */

// POST /api/voice/check { claim, listener? } -> score, verdict, top sources, speech
app.post("/api/voice/check", rateLimit, async (req, res) => {
  const claim = req.body?.claim || req.body?.text;
  if (!claim || typeof claim !== "string") {
    return res.status(400).json({ error: "claim is required", speech: "What claim should I check?" });
  }
  const check = await checkClaim(claim, { listener: listenerOf(req) });
  res.json({ id: check.id, status: check.status, speech: check.speech, check: check.status === "done" ? toPublic(check) : null });
});

// GET /api/voice/check/:id -> poll a pending check
app.get("/api/voice/check/:id", (req, res) => {
  const check = getCheck(req.params.id);
  if (!check) return res.status(404).json({ error: "Unknown check" });
  res.json({ id: check.id, status: check.status, speech: check.speech, check: check.status === "done" ? toPublic(check) : null });
});

function followUp(builder) {
  return (req, res) => {
    const id = req.body?.checkId || req.query.checkId;
    const check = id ? getCheck(id) : store.latestFor(listenerOf(req));
    if (!check || check.status !== "done") {
      return res.status(404).json({ speech: "I don't have a recent check to talk about. Tell me a claim first." });
    }
    res.json({ id: check.id, speech: builder(check), check: toPublic(check) });
  };
}

app.post("/api/voice/explain", followUp(explainSpeech));
app.post("/api/voice/sources", followUp(sourcesSpeech));

app.get("/api/voice/recent", (req, res) => {
  res.json(store.recentFor(listenerOf(req), 5).map(toPublic));
});

/* ======================
   MCP: Streamable HTTP, stateless (a new server + transport per request)
====================== */

app.post("/mcp", rateLimit, async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP error:", err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
});

// Stateless server: no standalone SSE stream and no sessions to delete.
const methodNotAllowed = (req, res) =>
  res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
app.get("/mcp", methodNotAllowed);
app.delete("/mcp", methodNotAllowed);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status === 400 ? "Bad request" : "Internal server error" });
});

const PORT = Number(process.env.PORT) || 3002;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Fact Pulse on http://localhost:${PORT}  (MCP: /mcp, search: ${searchProvider()})`);
    warmVeridex();
  });
}

module.exports = app;
