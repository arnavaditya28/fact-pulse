/**
 * Looks a spoken claim up in the public Veridex database (GET /api/claims), so
 * the answer can add the community's own score when someone already submitted
 * a similar claim. Best effort: a short timeout and a cached claim list, and
 * any failure simply means "no community match".
 */

const LIST_TTL_MS = 10 * 60 * 1000;
const MATCH_THRESHOLD = 0.55;
const STOPWORDS = new Set("a an the is are was were be been of in on at to for and or that this it its by with as from has have had will not".split(" "));

let cache = { at: 0, claims: [] };

const tokens = text => new Set(
  String(text).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 1 && !STOPWORDS.has(w))
);

function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.min(A.size, B.size) * (2 * shared / (A.size + B.size)) ** 0.5;
}

async function loadClaims(timeoutMs) {
  if (Date.now() - cache.at < LIST_TTL_MS) return cache.claims;
  const base = process.env.VERIDEX_API;
  if (!base) return [];
  const response = await fetch(`${base.replace(/\/$/, "")}/api/claims`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Veridex HTTP ${response.status}`);
  const claims = await response.json();
  cache = { at: Date.now(), claims: Array.isArray(claims) ? claims : [] };
  return cache.claims;
}

async function findCommunityClaim(text, { timeoutMs = 2500 } = {}) {
  try {
    const claims = await loadClaims(timeoutMs);
    let best = null;
    for (const c of claims) {
      if (c.reliabilityScore == null) continue;
      const score = similarity(text, c.claimText);
      if (score >= MATCH_THRESHOLD && (!best || score > best.similarity)) {
        best = { similarity: score, claim: c };
      }
    }
    if (!best) return null;
    return {
      id: best.claim._id,
      claimText: best.claim.claimText,
      reliabilityScore: best.claim.reliabilityScore,
      confidenceLevel: best.claim.confidenceLevel,
      status: best.claim.status,
      url: `${(process.env.VERIDEX_SITE || "https://getveridex.vercel.app").replace(/\/$/, "")}/claim.html?claimId=${best.claim._id}`
    };
  } catch {
    return null;
  }
}

/** Warm the cache at startup: the Veridex API sleeps on Render's free tier. */
function warmVeridex() {
  loadClaims(60000).catch(() => {});
}

module.exports = { findCommunityClaim, warmVeridex, similarity };
