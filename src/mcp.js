/**
 * Fact Pulse MCP server (spec 2025-11-25, Streamable HTTP, stateless).
 *
 * Tools are written for a voice agent such as Alexa+: every result leads with
 * a `speech` line the agent can read out unchanged, followed by structured
 * data for a screen card (Echo Show) or for the agent's own reasoning.
 *
 * State lives in the store, not the MCP session: a check id, or the listener's
 * most recent check, is enough to answer "why that score?" in a later turn or a
 * later day.
 */

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { z } = require("zod");
const { checkClaim, getCheck, toPublic } = require("./factCheck");
const { explainSpeech, sourcesSpeech } = require("./speech");
const store = require("./store");
const pkg = require("../package.json");

const INSTRUCTIONS = `Fact Pulse checks spoken claims and scores them 0-100 with the Veridex reliability rules.
Voice rules: read the "speech" field of a tool result aloud as-is; it is already short and spoken-style.
Do not read URLs aloud. Offer "why that score?" (explain_score) or "what are the sources?" (list_sources) as follow-ups.
If check_claim returns status "pending", say its speech line and call check_status with the same check_id when the user asks again.
Pass a stable "listener" id (person or household) so follow-ups and recent_checks find the right history.`;

const listenerArg = z.string().max(64).optional()
  .describe("Stable id for the person or household speaking. Defaults to 'guest'.");
const checkIdArg = z.string().max(64).optional()
  .describe("Id returned by check_claim. Omit to use this listener's most recent check.");

function reply(speech, data) {
  return {
    content: [{ type: "text", text: JSON.stringify({ speech, ...data }) }],
    structuredContent: { speech, ...data }
  };
}

function resolveCheck({ check_id, listener }) {
  if (check_id) return getCheck(check_id);
  return store.latestFor(listener || "guest");
}

function missing() {
  return reply("I don't have a recent check to talk about. Tell me a claim and I'll check it.", { found: false });
}

function createMcpServer() {
  const server = new McpServer(
    { name: "fact-pulse", title: "Fact Pulse", version: pkg.version },
    { instructions: INSTRUCTIONS }
  );

  server.registerTool("check_claim", {
    title: "Check a claim",
    description: "Fact-check a spoken claim. Searches the web, labels each source (official, research document, news, blog/social), " +
      "judges whether it supports or contradicts the claim, and scores the claim 0-100 with the Veridex rules. " +
      "Opinions, predictions and vague claims are recognised and not scored. Returns a ready-to-speak answer of at most two sentences.",
    inputSchema: {
      claim: z.string().min(1).max(400).describe("The claim as the user said it, e.g. 'Is it true that bananas are radioactive?'"),
      listener: listenerArg
    },
    annotations: { readOnlyHint: true, openWorldHint: true }
  }, async ({ claim, listener }) => {
    const check = await checkClaim(claim, { listener: listener || "guest" });
    return reply(check.speech, { check_id: check.id, status: check.status, result: check.status === "done" ? toPublic(check) : null });
  });

  server.registerTool("check_status", {
    title: "Get a pending check",
    description: "Get the result of a check that was still running (status 'pending'). Use when the user asks 'is it ready?'.",
    inputSchema: { check_id: checkIdArg, listener: listenerArg },
    annotations: { readOnlyHint: true }
  }, async (args) => {
    const check = args.check_id ? getCheck(args.check_id) : store.latestFor(args.listener || "guest");
    if (!check) return missing();
    if (check.status === "pending") {
      return reply("Still checking. Give me a few more seconds.", { check_id: check.id, status: "pending" });
    }
    return reply(check.speech, { check_id: check.id, status: check.status, result: toPublic(check) });
  });

  server.registerTool("explain_score", {
    title: "Explain the score",
    description: "Answer 'why that score?': reads the Veridex rule breakdown for a check as a few short spoken sentences.",
    inputSchema: { check_id: checkIdArg, listener: listenerArg },
    annotations: { readOnlyHint: true }
  }, async (args) => {
    const check = resolveCheck(args);
    if (!check || check.status !== "done") return missing();
    return reply(explainSpeech(check), {
      check_id: check.id,
      score: check.score,
      ruleBreakdown: check.ruleBreakdown || [],
      community: check.community || null
    });
  });

  server.registerTool("list_sources", {
    title: "List the sources",
    description: "Answer 'what are the sources?': the sources behind a check with publisher, type, stance, date and link.",
    inputSchema: { check_id: checkIdArg, listener: listenerArg },
    annotations: { readOnlyHint: true }
  }, async (args) => {
    const check = resolveCheck(args);
    if (!check || check.status !== "done") return missing();
    return reply(sourcesSpeech(check), { check_id: check.id, sources: check.sources || [] });
  });

  server.registerTool("recent_checks", {
    title: "Recent checks",
    description: "Answer 'what did I check earlier?': this listener's recent checks across sessions, newest first.",
    inputSchema: {
      listener: listenerArg,
      limit: z.number().int().min(1).max(10).optional().describe("How many checks to return (default 3).")
    },
    annotations: { readOnlyHint: true }
  }, async ({ listener, limit }) => {
    const recent = store.recentFor(listener || "guest", limit || 3);
    if (!recent.length) return reply("You haven't checked anything yet.", { checks: [] });
    const spoken = recent.map(c => (c.score == null ? `"${c.claim}", not scored` : `"${c.claim}", ${c.score}`));
    return reply(`Your last ${recent.length === 1 ? "check was" : `${recent.length} checks were`}: ${spoken.join("; ")}.`, {
      checks: recent.map(c => ({ check_id: c.id, claim: c.claim, score: c.score, verdict: c.verdict || null, at: new Date(c.finishedAt).toISOString() }))
    });
  });

  return server;
}

module.exports = { createMcpServer };
