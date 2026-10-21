/**
 * Thin Gemini client with a model fallback chain.
 *
 * Newer Gemini models regularly answer 503 ("high demand") or 429 on the free
 * tier, so a call walks GEMINI_MODELS in order and returns the first success.
 */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// Lite models first: judging snippets is a simple task, and on the free tier
// they answer in about a second while the full Flash models often return 503.
const DEFAULT_MODELS = ["gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.5-flash"];
// One slow model must not use up the whole voice budget.
const PER_MODEL_TIMEOUT_MS = Number(process.env.GEMINI_MODEL_TIMEOUT_MS) || 7000;

function modelChain() {
  const fromEnv = (process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_MODELS;
}

/**
 * @param {object} body     generateContent request body
 * @param {object} options  { signal, deadline, skip } deadline = epoch ms to stop trying
 *                          more models; skip = models not to try (e.g. one that already answered badly)
 * @returns {Promise<{ok:boolean, model?:string, data?:object, error?:string}>}
 */
async function generate(body, { signal, deadline = Infinity, skip = [] } = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, error: "GEMINI_API_KEY is not set" };

  const errors = [];
  for (const model of modelChain().filter(m => !skip.includes(m))) {
    if (Date.now() > deadline || signal?.aborted) break;
    const attemptMs = Math.max(1000, Math.min(PER_MODEL_TIMEOUT_MS, deadline - Date.now()));
    const attempt = AbortSignal.timeout(attemptMs);
    try {
      const response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
        method: "POST",
        signal: signal ? AbortSignal.any([signal, attempt]) : attempt,
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body)
      });
      if (response.ok) return { ok: true, model, data: await response.json() };

      errors.push(`${model}: HTTP ${response.status}`);
      // Only overload, quota and retired-model errors are worth another model.
      if (![404, 429, 500, 503].includes(response.status)) break;
    } catch (err) {
      const timedOut = err.name === "AbortError" || err.name === "TimeoutError";
      errors.push(`${model}: ${timedOut ? "timed out" : err.message}`);
      // The caller gave up: stop. Only this model was slow: try the next one.
      if (signal?.aborted) break;
    }
  }
  return { ok: false, error: errors.join("; ") || "No model attempted" };
}

function responseText(data) {
  return (data?.candidates?.[0]?.content?.parts || [])
    .filter(p => !p.thought)
    .map(p => p.text || "")
    .join("");
}

function parseJsonLoose(text) {
  const cleaned = String(text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* fall through */ }
    }
    return null;
  }
}

module.exports = { generate, responseText, parseJsonLoose, modelChain };
