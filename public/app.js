/*
 * Simulated Alexa+ front end for Fact Pulse.
 *
 * Plays the part Alexa+ plays on a device: hears the user (Web Speech API),
 * decides which Fact Pulse tool to call, calls it on the MCP server over
 * Streamable HTTP (JSON-RPC), speaks the "speech" field and draws a card.
 */

const MCP_URL = "/mcp";
const PROTOCOL_VERSION = "2025-11-25";
const $ = id => document.getElementById(id);

const SAMPLES = [
  "Is it true that the Great Wall of China is visible from space?",
  "India landed Chandrayaan-3 near the Moon's south pole",
  "Humans only use 10 percent of their brains",
  "Pineapple is the best pizza topping",
  "The RBI cut the repo rate this month"
];

/* ---------- listener id (stands in for an Alexa+ person / household id) ---------- */
let listener = "guest";
try {
  listener = localStorage.getItem("factpulse.listener") || `home-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem("factpulse.listener", listener);
} catch { /* storage blocked: stay "guest" */ }

/* ---------- minimal MCP client ---------- */
let rpcId = 0;
let mcpReady = null;

async function rpc(method, params, { notify = false } = {}) {
  const body = { jsonrpc: "2.0", method, ...(params ? { params } : {}), ...(notify ? {} : { id: ++rpcId }) };
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL_VERSION
    },
    body: JSON.stringify(body)
  });
  if (notify) return null;
  if (res.status === 429) throw new Error("rate-limited");
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

function connect() {
  mcpReady = (async () => {
    const init = await rpc("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "fact-pulse-alexa-sim", version: "1.0.0" }
    });
    await rpc("notifications/initialized", null, { notify: true });
    const { tools } = await rpc("tools/list", {});
    $("mcpState").textContent = `MCP ${init.protocolVersion} · ${tools.length} tools`;
    $("mcpState").className = "mcp-state ok";
    return init;
  })().catch(err => {
    $("mcpState").textContent = "MCP: offline";
    $("mcpState").className = "mcp-state err";
    mcpReady = null;
    throw err;
  });
  return mcpReady;
}

async function callTool(name, args) {
  if (!mcpReady) connect();
  await mcpReady;
  const started = performance.now();
  const result = await rpc("tools/call", { name, arguments: args });
  const ms = Math.round(performance.now() - started);
  const data = result.structuredContent || JSON.parse(result.content?.[0]?.text || "{}");
  addTrace(name, args, data, ms);
  return data;
}

/* ---------- intent routing (what Alexa+ would decide) ---------- */
let lastCheckId = null;

function route(utterance) {
  const u = utterance.toLowerCase().trim();
  if (/^(why|how come)\b|why (that|this|the) score|explain|break ?down|how did you (get|score)/.test(u)) return { tool: "explain_score" };
  if (/\bsources?\b|where (is|was) (that|this) from|who says|according to whom/.test(u)) return { tool: "list_sources" };
  if (/is it ready|are you done|done yet|any update|what did you find/.test(u)) return { tool: "check_status" };
  if (/what (did|have) i (check|ask)|recent checks|my history|checked (earlier|before|yesterday)/.test(u)) return { tool: "recent_checks" };
  return { tool: "check_claim" };
}

/* ---------- screen states ---------- */
const VIEWS = ["viewIdle", "viewListening", "viewThinking", "viewResult", "viewMessage"];
function show(view, mode = "") {
  VIEWS.forEach(v => $(v).classList.toggle("is-active", v === view));
  $("screen").className = `screen ${mode}`;
}

function setFollowups(items) {
  const box = $("followups");
  box.replaceChildren(...items.map(text => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.addEventListener("click", () => handle(text));
    return b;
  }));
}

const BAND_COLOR = s => (s >= 65 ? "var(--good)" : s >= 40 ? "var(--mid)" : "var(--bad)");
const TYPE_LABEL = { official: "Official", document: "Research", media: "News", user: "Blog / social" };

function renderResult(check, spoken) {
  const score = check.score ?? 0;
  $("ringScore").textContent = score;
  $("ring").setAttribute("aria-label", `Score ${score} out of 100`);
  const ring = $("ringValue");
  ring.style.stroke = BAND_COLOR(score);
  ring.style.strokeDashoffset = 326.7;
  requestAnimationFrame(() => requestAnimationFrame(() => { ring.style.strokeDashoffset = 326.7 * (1 - score / 100); }));

  $("verdict").textContent = `${check.verdict} · ${check.confidenceLevel}`;
  $("verdict").style.color = BAND_COLOR(score);
  $("resultClaim").textContent = check.restatedClaim || check.claim;
  $("spokenLine").textContent = spoken;

  $("sourceList").replaceChildren(...(check.sources || []).slice(0, 4).map(s => {
    const li = document.createElement("li");
    li.className = "source";
    const a = document.createElement("a");
    a.href = s.url; a.target = "_blank"; a.rel = "noopener noreferrer";
    a.textContent = s.publisher;
    a.title = s.domain;
    const meta = document.createElement("div");
    meta.className = "source-meta";
    meta.innerHTML = `<span class="chip ${s.sourceType}"></span><span class="stance ${s.stance}"></span><span class="date"></span>`;
    meta.children[0].textContent = TYPE_LABEL[s.sourceType] || s.sourceType;
    meta.children[1].textContent = s.stance === "supports" ? "✓ supports" : "✕ contradicts";
    meta.children[2].textContent = s.published ? `· ${s.published}` : `· ${s.domain}`;
    const finding = document.createElement("p");
    finding.className = "source-finding";
    finding.textContent = s.finding;
    li.append(a, meta, finding);
    return li;
  }));

  const community = $("community");
  if (check.community) {
    community.hidden = false;
    community.innerHTML = "On Veridex, the community rated a similar claim <strong></strong>. <a target=\"_blank\" rel=\"noopener\">View it</a>";
    community.querySelector("strong").textContent = `${check.community.reliabilityScore}/100`;
    community.querySelector("a").href = check.community.url;
  } else {
    community.hidden = true;
  }

  show("viewResult", "speaking");
  setFollowups(["Why that score?", "What are the sources?"]);
}

function renderMessage(text, icon = "?") {
  $("messageIcon").textContent = icon;
  $("messageText").textContent = text;
  show("viewMessage", "speaking");
}

/* ---------- speech out ---------- */
let voice = null;
function pickVoice() {
  const voices = speechSynthesis.getVoices();
  voice = voices.find(v => /en-US/i.test(v.lang) && /(Aria|Jenny|Samantha|Google US English|Zira)/i.test(v.name))
    || voices.find(v => /^en/i.test(v.lang)) || null;
}
if ("speechSynthesis" in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

function say(text) {
  return new Promise(resolve => {
    if (!("speechSynthesis" in window) || !text) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.rate = 1.03;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

/* ---------- a turn ---------- */
let busy = false;

async function handle(utterance) {
  utterance = String(utterance || "").trim();
  if (!utterance || busy) return;
  busy = true;
  $("micBtn").disabled = true;

  const { tool } = route(utterance);
  try {
    if (tool === "check_claim") {
      $("thinkingClaim").textContent = `“${utterance}”`;
      show("viewThinking", "thinking");
      setFollowups([]);
      const data = await callTool("check_claim", { claim: utterance, listener });
      lastCheckId = data.check_id;
      await present(data);
      if (data.status === "pending") pollPending(data.check_id);
    } else if (tool === "check_status") {
      const data = await callTool("check_status", { check_id: lastCheckId || undefined, listener });
      await present(data);
    } else {
      const data = await callTool(tool, { check_id: lastCheckId || undefined, listener });
      if (tool === "recent_checks") {
        renderMessage(data.speech, "↺");
        setFollowups(["Why that score?"]);
      } else {
        // keep the result card up; replace the spoken line
        if ($("viewResult").classList.contains("is-active")) {
          $("spokenLine").textContent = data.speech;
          $("screen").className = "screen speaking";
        } else {
          renderMessage(data.speech, "i");
        }
      }
      await say(data.speech);
    }
  } catch (err) {
    const line = err.message === "rate-limited"
      ? "I'm getting a lot of questions. Try again in a minute."
      : "I couldn't reach Fact Pulse just now. Please try again.";
    renderMessage(line, "!");
    await say(line);
  } finally {
    $("screen").classList.remove("speaking");
    busy = false;
    $("micBtn").disabled = false;
  }
}

async function present(data) {
  const check = data.result;
  if (data.status === "pending") {
    renderMessage(data.speech, "…");
    setFollowups(["Is it ready?"]);
  } else if (check && check.checkable) {
    renderResult(check, data.speech);
  } else {
    renderMessage(data.speech, check?.status === "failed" ? "!" : "?");
    setFollowups([]);
  }
  await say(data.speech);
}

// If a check outran the voice budget, refresh the card when it lands.
function pollPending(id, tries = 0) {
  if (tries > 15) return;
  setTimeout(async () => {
    if (lastCheckId !== id || busy) return;
    try {
      const res = await fetch(`/api/voice/check/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (data.status === "pending") return pollPending(id, tries + 1);
      if (data.check?.checkable) renderResult(data.check, data.speech);
      $("screen").classList.remove("speaking");
    } catch { pollPending(id, tries + 1); }
  }, 2000);
}

/* ---------- trace panel ---------- */
function addTrace(tool, args, data, ms) {
  const li = document.createElement("li");
  li.innerHTML = `<div class="t-head"><span class="t-tool"></span><span class="t-ms"></span></div><p class="t-said"></p>
    <details><summary>request / response</summary><pre></pre></details>`;
  li.querySelector(".t-tool").textContent = `tools/call → ${tool}`;
  li.querySelector(".t-ms").textContent = `${ms} ms`;
  li.querySelector(".t-said").textContent = `🔊 ${data.speech}`;
  li.querySelector("pre").textContent = JSON.stringify({ arguments: args, structuredContent: data }, null, 2);
  $("trace").prepend(li);
}

/* ---------- speech in ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
if (SR) {
  recognition = new SR();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  let finalText = "";

  recognition.onstart = () => {
    finalText = "";
    $("heardText").textContent = "Listening…";
    show("viewListening", "listening");
    $("micBtn").classList.add("live");
  };
  recognition.onresult = e => {
    let interim = "";
    for (const r of e.results) (r.isFinal ? (finalText = r[0].transcript) : (interim += r[0].transcript));
    $("heardText").textContent = `“${(finalText || interim).trim()}”`;
  };
  recognition.onerror = e => {
    if (e.error === "not-allowed") $("micHint").textContent = "Microphone blocked. Allow it in the browser, or type instead.";
  };
  recognition.onend = () => {
    $("micBtn").classList.remove("live");
    if (finalText.trim()) handle(finalText);
    else if ($("viewListening").classList.contains("is-active")) show("viewIdle");
  };
} else {
  $("micHint").textContent = "Voice input needs Chrome or Edge. You can type instead; answers are still spoken.";
}

$("micBtn").addEventListener("click", () => {
  if (busy) return;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  if (!recognition) return $("askInput").focus();
  try { recognition.start(); } catch { recognition.stop(); }
});

$("askForm").addEventListener("submit", e => {
  e.preventDefault();
  const text = $("askInput").value;
  $("askInput").value = "";
  handle(text);
});

$("samples").replaceChildren(...SAMPLES.map(text => {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.addEventListener("click", () => handle(text));
  return b;
}));

/* ---------- demo mode (?demo): a scripted conversation for recording ---------- */
const DEMO_SCRIPT = [
  "Alexa, is it true that the Great Wall of China is visible from space?",
  "Why that score?",
  "Is it true that the Eiffel Tower grows taller in summer?",
  "What are the sources?",
  "Pineapple is the best pizza topping",
  "What did I check earlier?"
];
const pause = ms => new Promise(r => setTimeout(r, ms));

// Shows the utterance appearing word by word, as speech recognition would.
async function speakAsUser(text) {
  show("viewListening", "listening");
  setFollowups([]);
  const words = text.split(" ");
  for (let i = 1; i <= words.length; i++) {
    $("heardText").textContent = `“${words.slice(0, i).join(" ")}”`;
    await pause(170);
  }
  await pause(500);
}

async function runDemo() {
  document.body.classList.add("demo-running");
  for (const line of DEMO_SCRIPT) {
    await speakAsUser(line);
    await handle(line);
    await pause(1800);
  }
  document.body.classList.remove("demo-running");
}

if (new URLSearchParams(location.search).has("demo")) {
  document.body.classList.add("demo");
  const start = document.createElement("button");
  start.className = "demo-start";
  start.type = "button";
  start.textContent = "▶ Start demo";
  // Speech output needs a user gesture, so the demo starts on a click.
  start.addEventListener("click", () => { start.remove(); runDemo(); });
  document.body.append(start);
}

/* ---------- misc ---------- */
function tick() {
  $("clock").textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
tick();
setInterval(tick, 15000);
$("mcpUrl").textContent = new URL(MCP_URL, location.href).pathname;
connect().catch(() => {});
