/**
 * Source discovery for spoken claims.
 *
 * A Veridex claim is scored from sources people attached. A spoken claim has
 * none, so this step finds them and labels them the way a Veridex source is
 * labelled (sourceType + AI stance):
 *
 *   1. Search the web for the claim (Tavily or Brave; see searchWeb.js).
 *   2. One Gemini call reads the results, decides whether the claim is
 *      checkable at all (opinion / vague / prediction are not), and gives each
 *      result a stance: supports, contradicts or unrelated.
 *   3. Each domain gets a source type from fixed lists (classifySource.js).
 *
 * Every source is a real search hit, so the model cannot invent a citation.
 * Unrelated hits are dropped before scoring: in Veridex an unrelated source is
 * a person's mistake and is penalised, but here it is only search noise.
 *
 * With SEARCH_PROVIDER=gemini-grounding (needs a billed Gemini key) steps 1 and
 * 2 run as a single Gemini call with Google Search grounding instead.
 */

const { classifySource, normalizeDomain } = require("./classifySource");
const { searchWeb, searchProvider } = require("./searchWeb");
const { generate, responseText, parseJsonLoose } = require("./gemini");

// Veridex claims accept at most five sources; keep live checks comparable.
const MAX_SOURCES = 5;
const CLAIM_TYPES = ["checkable", "opinion", "vague", "prediction"];

const CLAIM_TYPE_GUIDE = `Classify the CLAIM:
- "checkable": a factual statement about the world that evidence can confirm or refute.
- "opinion": a value judgement or preference ("X is the best", "Y is ugly").
- "vague": too unspecific to check ("they are hiding the truth", "prices went up").
- "prediction": about the future, so it cannot be verified yet.`;

const JUDGE_PROMPT = `You are the evidence step of a voice fact-checker.
${CLAIM_TYPE_GUIDE}
Then, for each numbered SEARCH RESULT, judge from its text only whether it
SUPPORTS the claim, CONTRADICTS it, or is UNRELATED.
- SUPPORTS: the source itself states the claim is true.
- CONTRADICTS: the source states the claim is false, a myth, a misconception, a hoax or debunked.
- UNRELATED: the source does not address the claim, or only mentions it as a
  popular belief, rumour or question without saying whether it is true.
  "Many people believe X" or "it is often said that X" is NOT support for X.
If a snippet introduces a belief and then corrects it, it CONTRADICTS.

Return ONLY JSON in exactly this shape:
{"claimType":"checkable|opinion|vague|prediction",
 "restatedClaim":"the claim as one short neutral sentence",
 "reasonIfNotCheckable":"one short sentence, empty if checkable",
 "results":[{"n":1,"stance":"supports|contradicts|unrelated",
   "kind":"official|document|media|user",
   "finding":"what this result says about the claim, max 20 words"}]}`;

const GROUNDED_PROMPT = `You are the research step of a voice fact-checker.
${CLAIM_TYPE_GUIDE}
Only if checkable, search the web and list up to ${MAX_SOURCES + 1} distinct sources you read.
Prefer official bodies, research papers and established news outlets. Include sources that contradict the claim.

Return ONLY JSON, no markdown, in exactly this shape:
{"claimType":"checkable|opinion|vague|prediction",
 "restatedClaim":"the claim as one short neutral sentence",
 "reasonIfNotCheckable":"one short sentence, empty if checkable",
 "sources":[{"publisher":"Reuters","domain":"reuters.com","type":"official|document|media|user",
   "stance":"supports|contradicts|unrelated","published":"YYYY-MM-DD or null",
   "finding":"what this source says about the claim, max 20 words"}]}`;

const STANCES = ["supports", "contradicts", "unrelated"];

// A name that can be spoken: "isro.gov.in" -> "ISRO", "en.wikipedia.org" -> "Wikipedia".
const SECOND_LEVEL = /(^|\.)(gov|nic|ac|co|com|org|net|edu|res)\.[a-z]{2}$/;
const DISPLAY_NAMES = {
  "gov.uk": "UK Government", "icc-cricket": "ICC", "nationalgeographic": "National Geographic",
  "theconversation": "The Conversation", "mayoclinic": "Mayo Clinic", "nytimes": "New York Times",
  "theguardian": "The Guardian", "washingtonpost": "Washington Post", "scientificamerican": "Scientific American",
  "indianexpress": "Indian Express", "hindustantimes": "Hindustan Times", "thehindu": "The Hindu",
  "timesofindia": "Times of India", "economictimes": "Economic Times", "espncricinfo": "ESPNcricinfo",
  "skyatnightmagazine": "Sky at Night Magazine", "psychologicalscience": "Psychological Science",
  "ourworldindata": "Our World in Data", "michiganmedicine": "Michigan Medicine", "tuftsmedicine": "Tufts Medicine",
  "sciencefocus": "Science Focus", "tradingeconomics": "Trading Economics", "ddindia": "DD India"
};
function publisherName(domain) {
  if (DISPLAY_NAMES[domain]) return DISPLAY_NAMES[domain];
  const base = domain.replace(SECOND_LEVEL, "").replace(/\.[a-z]{2,}$/, "");
  const labels = base.split(".");
  const named = labels.find(l => DISPLAY_NAMES[l]);
  if (named) return DISPLAY_NAMES[named];
  const label = labels.pop() || domain;
  if (!label || ["gov", "nic", "ac", "co"].includes(label)) return domain;
  return label.length <= 4 ? label.toUpperCase() : label.charAt(0).toUpperCase() + label.slice(1).replace(/-/g, " ");
}

function shapeSource({ publisher, domain, url, typeHint, stance, finding, published }) {
  return {
    publisher: String(publisher || domain).slice(0, 80),
    domain,
    url,
    sourceType: classifySource(url || domain, typeHint),
    stance: STANCES.includes(stance) ? stance : "unrelated",
    finding: String(finding || "").slice(0, 220),
    // evaluate.js reads createdAt for its freshness rule
    createdAt: published || null,
    published: published ? published.toISOString().slice(0, 10) : null
  };
}

const TYPE_RANK = { official: 0, document: 1, media: 2, user: 3 };
const MAX_USER_SOURCES = 1;

// Search results are full of Wikipedia, YouTube and social posts. Keep the
// strongest evidence first and at most one blog/social source, so five slots
// are not spent on reposts of the same story.
function pickBest(related) {
  const ranked = related
    .map((s, i) => ({ s, i }))
    .sort((a, b) => TYPE_RANK[a.s.sourceType] - TYPE_RANK[b.s.sourceType] || a.i - b.i)
    .map(x => x.s);
  let users = 0;
  return ranked.filter(s => s.sourceType !== "user" || users++ < MAX_USER_SOURCES).slice(0, MAX_SOURCES);
}

function finish(parsed, sources, extra) {
  const claimType = CLAIM_TYPES.includes(parsed.claimType) ? parsed.claimType : "checkable";
  const related = sources.filter(s => s.stance !== "unrelated");
  return {
    ok: true,
    claimType,
    restatedClaim: String(parsed.restatedClaim || "").slice(0, 300),
    reasonIfNotCheckable: String(parsed.reasonIfNotCheckable || ""),
    sources: claimType === "checkable" ? pickBest(related) : [],
    unrelatedDropped: sources.length - related.length,
    ...extra
  };
}

const MIN_RESULTS = 3;

async function viaSearchApi(claimText, { signal, deadline }) {
  let results = await searchWeb(claimText, { signal, maxResults: 10 });

  // A thin first search (seen live: a single hit) would end as "no sources";
  // one more query aimed at fact-checks usually finds the coverage.
  if (results.length < MIN_RESULTS) {
    const more = await searchWeb(`${claimText} fact check`, { signal, maxResults: 10 }).catch(() => []);
    const seen = new Set(results.map(r => r.domain));
    results = results.concat(more.filter(r => !seen.has(r.domain)));
  }

  const listing = results.map((r, i) =>
    `[${i + 1}] ${r.title}\nsite: ${r.domain}${r.published ? ` | published ${r.published.toISOString().slice(0, 10)}` : ""}\n${r.snippet}`
  ).join("\n\n");

  const body = {
    system_instruction: { parts: [{ text: JUDGE_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: `CLAIM: ${claimText}\nTODAY: ${new Date().toISOString().slice(0, 10)}\n\nSEARCH RESULTS:\n${listing || "(none)"}` }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 2048, responseMimeType: "application/json" }
  };

  let g = await generate(body, { signal, deadline });
  if (!g.ok) return { ok: false, error: g.error };
  let parsed = parseJsonLoose(responseText(g.data));

  // A checkable claim whose results came back unjudged would also read as
  // "no sources": ask the next model in the chain once.
  const unjudged = p => !p || (p.claimType === "checkable" && results.length > 0 && !(p.results || []).length);
  if (unjudged(parsed)) {
    const retry = await generate(body, { signal, deadline, skip: [g.model] });
    const reparsed = retry.ok ? parseJsonLoose(responseText(retry.data)) : null;
    if (reparsed && !unjudged(reparsed)) { g = retry; parsed = reparsed; }
  }
  if (!parsed) return { ok: false, error: "Could not parse the evidence response" };

  const byN = new Map((parsed.results || []).map(j => [Number(j.n), j]));
  const sources = results.map((r, i) => {
    const j = byN.get(i + 1) || {};
    return shapeSource({
      // Title suffixes ("... - here's why") are unreliable; the domain is not.
      publisher: publisherName(r.domain),
      domain: r.domain, url: r.url, typeHint: j.kind,
      stance: j.stance, finding: j.finding, published: r.published
    });
  });

  return finish(parsed, sources, { provider: searchProvider(), model: g.model, searched: results.length });
}

function toDate(value) {
  if (!value || value === "null") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 86400000 ? null : d;
}

async function viaGrounding(claimText, { signal, deadline }) {
  const g = await generate({
    system_instruction: { parts: [{ text: GROUNDED_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: `CLAIM: ${claimText}\nTODAY: ${new Date().toISOString().slice(0, 10)}` }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0, maxOutputTokens: 2048 }
  }, { signal, deadline });
  if (!g.ok) return { ok: false, error: g.error };

  const candidate = g.data.candidates?.[0];
  const parsed = parseJsonLoose(responseText(g.data));
  if (!parsed) return { ok: false, error: "Could not parse the research response" };

  // Grounding chunks are the pages Google Search actually returned; a source
  // the model names must be one of them, and we link to that page.
  const grounded = new Map();
  for (const chunk of candidate?.groundingMetadata?.groundingChunks || []) {
    const domain = normalizeDomain(chunk.web?.domain || chunk.web?.title || chunk.web?.uri);
    if (domain && !grounded.has(domain)) grounded.set(domain, chunk.web.uri);
  }

  const seen = new Set();
  const sources = [];
  for (const s of Array.isArray(parsed.sources) ? parsed.sources : []) {
    const domain = normalizeDomain(s.domain || s.url);
    if (!domain || seen.has(domain)) continue;
    const match = [...grounded.keys()].find(d => d === domain || d.endsWith(`.${domain}`) || domain.endsWith(`.${d}`));
    if (grounded.size > 0 && !match) continue;
    seen.add(domain);
    sources.push(shapeSource({
      publisher: s.publisher, domain, url: match ? grounded.get(match) : `https://${domain}`,
      typeHint: s.type, stance: s.stance, finding: s.finding, published: toDate(s.published)
    }));
  }

  return finish(parsed, sources, { provider: "gemini-grounding", model: g.model, searched: grounded.size });
}

/**
 * @returns {Promise<{ok:boolean, claimType?:string, restatedClaim?:string,
 *   reasonIfNotCheckable?:string, sources?:Array, error?:string}>}
 */
async function findSources(claimText, { timeoutMs = 15000, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });
  const opts = { signal: controller.signal, deadline: Date.now() + timeoutMs - 1500 };

  try {
    return searchProvider() === "gemini-grounding"
      ? await viaGrounding(claimText, opts)
      : await viaSearchApi(claimText, opts);
  } catch (err) {
    return { ok: false, error: err.name === "AbortError" ? "Research timed out" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { findSources };
