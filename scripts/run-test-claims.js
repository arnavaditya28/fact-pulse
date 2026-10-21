/**
 * Runs the fixed claim list through the live pipeline (no HTTP) and reports
 * score, latency and the exact spoken line, so wording and timing can be
 * reviewed before recording the demo.
 *
 *   node scripts/run-test-claims.js            # all claims
 *   node scripts/run-test-claims.js --save     # also save snapshots for offline demo fallback
 *   node scripts/run-test-claims.js 3 5        # only claims #3 and #5
 *
 * Writes docs/test-run.md.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");

if (process.argv.includes("--save")) process.env.SAVE_SNAPSHOTS = "1";
process.env.VOICE_BUDGET_MS = "60000"; // measure the full pipeline, not the voice cut-off

const { checkClaim, explainSpeech } = (() => {
  const fc = require("../src/factCheck");
  return { checkClaim: fc.checkClaim, explainSpeech: require("../src/speech").explainSpeech };
})();

const claims = require("../data/test-claims.json");
const only = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number);
const VOICE_TARGET_MS = 8000;

function band(check) {
  if (!check.checkable) return check.claimType;
  if (!check.sources.length) return "no_sources";
  if (check.score >= 65) return "high";
  if (check.score >= 40) return "moderate";
  return "low";
}

function meets(expect, got) {
  return expect.split("_or_").some(e => e === got || (e === "mixed" && ["moderate", "low"].includes(got)));
}

(async () => {
  const rows = [];
  for (const [i, item] of claims.entries()) {
    if (only.length && !only.includes(i + 1)) continue;
    const check = await checkClaim(item.claim, { listener: "test-run" });
    const got = check.status === "done" ? band(check) : check.status;
    const ok = meets(item.expect, got);
    const row = {
      n: i + 1, claim: item.claim, expect: item.expect, got, ok,
      score: check.score ?? "-", ms: check.latencyMs ?? "-",
      sources: (check.sources || []).map(s => `${s.domain} (${s.sourceType}, ${s.stance})`).join("; "),
      speech: check.speech,
      explain: check.status === "done" && check.checkable ? explainSpeech(check) : "",
      error: check.error || check.liveError || ""
    };
    rows.push(row);
    console.log(`${ok ? "PASS" : "MISS"} #${row.n} ${row.ms}ms score=${row.score} [${got}] ${item.claim}\n     🔊 ${row.speech}${row.error ? `\n     ⚠ ${row.error}` : ""}`);
  }

  const timed = rows.filter(r => typeof r.ms === "number");
  const sorted = timed.map(r => r.ms).sort((a, b) => a - b);
  const p = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] || 0;
  const summary = `${rows.filter(r => r.ok).length}/${rows.length} as expected · median ${p(0.5)} ms · p90 ${p(0.9)} ms · ` +
    `${timed.filter(r => r.ms <= VOICE_TARGET_MS).length}/${timed.length} within the ${VOICE_TARGET_MS / 1000}s voice budget`;
  console.log(`\n${summary}`);

  const md = [
    `# Test run: ${new Date().toISOString()}`, "",
    `Search: ${process.env.SEARCH_PROVIDER || (process.env.TAVILY_API_KEY ? "tavily" : process.env.BRAVE_API_KEY ? "brave" : "gemini-grounding")} · ${summary}`, "",
    "| # | Claim | Expected | Got | Score | ms | Spoken answer |",
    "|---|---|---|---|---|---|---|",
    ...rows.map(r => `| ${r.n} | ${r.claim} | ${r.expect} | ${r.ok ? "" : "⚠ "}${r.got} | ${r.score} | ${r.ms} | ${r.speech.replace(/\|/g, "/")} |`),
    "", "## Details", "",
    ...rows.map(r => `**#${r.n}** ${r.claim}\n- sources: ${r.sources || "none"}\n- why: ${r.explain || "-"}${r.error ? `\n- error: ${r.error}` : ""}\n`)
  ].join("\n");
  fs.writeFileSync(path.join(__dirname, "..", "docs", "test-run.md"), md);
  console.log("Wrote docs/test-run.md");
  process.exit(0);
})();
