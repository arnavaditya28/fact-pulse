/**
 * The fact-check pipeline behind every channel (REST voice endpoint and MCP):
 *
 *   spoken text -> clean up -> find sources -> Veridex rules -> speech
 *
 * Voice needs an answer fast, so checkClaim() races the pipeline against a
 * time budget. If the budget runs out, it answers with a holding line and the
 * check keeps running; the finished result is stored under the same id and is
 * picked up by getCheck() / "is it ready?".
 */

const fs = require("fs");
const path = require("path");
const evaluateClaim = require("./scoring/evaluate");
const { findSources } = require("./discovery/findSources");
const { findCommunityClaim } = require("./veridexLookup");
const speech = require("./speech");
const store = require("./store");

const TYPE_WEIGHTS = { official: 40, document: 30, media: 25, user: 10 };
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RESEARCH_TIMEOUT_MS = Number(process.env.RESEARCH_TIMEOUT_MS) || 25000;
const SNAPSHOT_FILE = path.join(__dirname, "..", "data", "snapshots.json");

const PENDING_SPEECH = "I'm still checking the sources on that one. Ask me \"is it ready?\" in a few seconds.";
const FAILED_SPEECH = "I couldn't reach my sources just now, so I won't guess. Please try again in a minute.";

/* ---------- input clean-up ---------- */

const LEAD_INS = [
  /^(hey |ok |okay )?alexa[,!. ]*/i,
  /^(ask|tell|open) fact pulse (to |if |whether |that )?/i,
  /^(can you |could you |please )?(fact[- ]?check|check|verify)( (if|whether|that))?[:, ]*/i,
  /^(is it true|is it a fact|did you know)( that)?[:, ]*/i,
  /^(i heard|someone said|they say|people say)( that)?[:, ]*/i
];

function cleanClaim(raw) {
  let text = String(raw || "").replace(/\s+/g, " ").trim();
  for (let pass = 0; pass < 2; pass++) {
    for (const re of LEAD_INS) text = text.replace(re, "").trim();
  }
  text = text.replace(/[?]+$/, "").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const cacheKey = text => text.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/* ---------- snapshots (offline demo fallback) ---------- */

function loadSnapshots() {
  try { return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8")); } catch { return {}; }
}

function saveSnapshot(claim, research) {
  const all = loadSnapshots();
  all[cacheKey(claim)] = { savedAt: new Date().toISOString(), research };
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(all, null, 1));
}

function reviveSources(sources) {
  return (sources || []).map(s => ({ ...s, createdAt: s.published ? new Date(s.published) : null }));
}

/* ---------- scoring ---------- */

function scoreSources(sources) {
  // In Veridex, people attach sources to back a claim, so every source earns
  // type points. Found sources can just as well refute it, so only supporting
  // sources go through rules 1-4 and 6; contradicting ones count only in the
  // AI evidence check (rule 5), where each takes 15 off.
  // Spoken claims have no submission date, so a source without a date earns
  // no freshness bonus (epoch fallback). Moderator review never applies to
  // discovered sources: reviewStatus is absent, so that rule adds nothing.
  const supporting = sources.filter(s => s.stance === "supports");
  const stanceResults = sources.map(s => ({ sourceType: s.sourceType, stance: s.stance }));
  const result = evaluateClaim(supporting, new Date(0), stanceResults);

  const byType = {};
  for (const s of supporting) {
    byType[s.sourceType] = byType[s.sourceType] || { n: 0, points: 0 };
    byType[s.sourceType].n++;
    byType[s.sourceType].points += TYPE_WEIGHTS[s.sourceType] || 0;
  }
  const unique = Object.keys(byType).length;

  return {
    ...result,
    capped: result.ruleBreakdown.some(r => r.startsWith("Capped at 40")),
    parts: {
      byType,
      contradicting: sources.length - supporting.length,
      diversity: unique >= 3 ? 20 : unique >= 2 ? 10 : 0,
      freshness: result.freshnessScore,
      // evaluate.js only sees the supporting sources, so the penalty follows them
      singleSource: supporting.length === 1,
      ai: result.aiAdjustment
    }
  };
}

function verdictLabel(score, sources) {
  const sup = sources.filter(s => s.stance === "supports").length;
  const con = sources.filter(s => s.stance === "contradicts").length;
  if (!sources.length) return "No evidence found";
  if (con > sup) return "Disputed by sources";
  if (con > 0) return "Mixed evidence";
  if (score >= 65) return "Well supported";
  if (score >= 40) return "Partly supported";
  return "Weak evidence";
}

/* ---------- pipeline ---------- */

async function research(claim) {
  const [found, community] = await Promise.all([
    findSources(claim, { timeoutMs: RESEARCH_TIMEOUT_MS }),
    findCommunityClaim(claim)
  ]);
  if (found.ok) return { found, community, mode: "live" };

  const snap = loadSnapshots()[cacheKey(claim)];
  if (snap) {
    return { found: { ...snap.research, sources: reviveSources(snap.research.sources) }, community, mode: "snapshot", liveError: found.error };
  }
  return { found, community, mode: "failed" };
}

function buildResult(record, { found, community, mode, liveError }) {
  const base = { ...record, status: "done", mode, community, finishedAt: Date.now() };
  base.latencyMs = base.finishedAt - record.startedAt;

  if (mode === "failed") {
    return { ...base, status: "failed", error: found.error, speech: FAILED_SPEECH, checkable: null };
  }
  if (liveError) base.liveError = liveError;

  base.restatedClaim = found.restatedClaim || record.claim;
  base.claimType = found.claimType;
  base.provider = found.provider;
  base.model = found.model;

  if (found.claimType !== "checkable") {
    return {
      ...base,
      checkable: false,
      reasonIfNotCheckable: found.reasonIfNotCheckable,
      score: null,
      sources: [],
      speech: speech.notCheckableSpeech(found.claimType, found.reasonIfNotCheckable)
    };
  }

  const sources = found.sources;
  const scored = scoreSources(sources);
  const check = {
    ...base,
    checkable: true,
    score: scored.totalScore,
    confidenceLevel: scored.confidenceLevel,
    verdict: verdictLabel(scored.totalScore, sources),
    capped: scored.capped,
    parts: scored.parts,
    ruleBreakdown: scored.ruleBreakdown,
    unrelatedDropped: found.unrelatedDropped || 0,
    sources: sources.map(({ createdAt, ...s }) => s)
  };
  check.speech = speech.verdictSpeech(check);
  return check;
}

async function runCheck(record) {
  try {
    const outcome = await research(record.claim);
    const done = buildResult(record, outcome);
    // A checkable claim with no sources may be a search miss, so it is not
    // cached: the next ask searches again instead of repeating "nothing found".
    const emptyMiss = done.checkable && !done.sources.length;
    if (outcome.mode === "live" && done.status === "done" && !emptyMiss) {
      store.put({ ...done, id: `cache:${cacheKey(record.claim)}`, listener: "__cache__" });
      if (process.env.SAVE_SNAPSHOTS === "1") saveSnapshot(record.claim, { ...outcome.found });
    }
    return store.put(done);
  } catch (err) {
    return store.put({ ...record, status: "failed", error: err.message, speech: FAILED_SPEECH });
  }
}

/**
 * @param {string} rawText    what the user said
 * @param {object} options    { listener, budgetMs }
 * @returns {Promise<object>} a stored check (status "done" | "pending" | "failed")
 */
async function checkClaim(rawText, { listener = "guest", budgetMs = Number(process.env.VOICE_BUDGET_MS) || 8000 } = {}) {
  const claim = cleanClaim(rawText);
  const record = { id: store.newId(), listener, claim, heard: String(rawText || "").slice(0, 400), startedAt: Date.now(), status: "pending" };

  if (claim.split(" ").length < 3 || claim.length < 12) {
    return store.put({
      ...record, status: "done", mode: "local", checkable: false, claimType: "vague", sources: [], score: null,
      speech: "I need a full claim to check, like \"the Eiffel Tower is in Berlin\". What did you hear?"
    });
  }
  if (claim.length > 300) {
    return store.put({
      ...record, status: "done", mode: "local", checkable: false, claimType: "vague", sources: [], score: null,
      speech: "That's a lot at once. Give me one claim at a time, in a sentence or two."
    });
  }

  const cached = store.get(`cache:${cacheKey(claim)}`);
  const usable = cached && !(cached.checkable && !(cached.sources || []).length);
  if (usable && Date.now() - cached.finishedAt < CACHE_TTL_MS) {
    return store.put({ ...cached, ...record, status: "done", fromCache: true, latencyMs: Date.now() - record.startedAt, finishedAt: Date.now() });
  }

  store.put(record);
  const work = runCheck(record);
  // On Vercel, keep the function alive to finish a check that outruns the
  // voice budget; elsewhere this is a no-op.
  try { require("@vercel/functions").waitUntil(work); } catch { /* not on Vercel */ }
  const timeout = new Promise(resolve => setTimeout(() => resolve(null), budgetMs));
  const finished = await Promise.race([work, timeout]);
  return finished || { ...record, speech: PENDING_SPEECH };
}

function getCheck(id) {
  return store.get(id);
}

/** Shape sent to clients: drops internals, keeps everything a card needs. */
function toPublic(check) {
  if (!check) return null;
  const { parts, listener, heard, startedAt, finishedAt, ...rest } = check;
  return rest;
}

module.exports = { checkClaim, getCheck, toPublic, cleanClaim, scoreSources, buildResult, PENDING_SPEECH };
