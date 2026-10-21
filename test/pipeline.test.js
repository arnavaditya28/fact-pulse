// Offline tests: scoring, edge cases and spoken wording. No network calls.
const test = require("node:test");
const assert = require("node:assert");
const { buildResult, cleanClaim } = require("../src/factCheck");
const { explainSpeech, sourcesSpeech } = require("../src/speech");
const { classifySource } = require("../src/discovery/classifySource");

const daysAgo = n => new Date(Date.now() - n * 86400000);
const src = (sourceType, stance, extra = {}) => ({
  publisher: `${sourceType}-${stance}`, domain: `${sourceType}.example`, url: "https://example.com",
  sourceType, stance, finding: "", createdAt: null, published: null, ...extra
});
const record = claim => ({ id: "t1", listener: "test", claim, startedAt: Date.now(), status: "pending" });
const run = (sources, claimType = "checkable") =>
  buildResult(record("Test claim about something"), { found: { ok: true, claimType, sources, restatedClaim: "x" }, community: null, mode: "live" });

test("two supporting news reports, no official source", () => {
  const check = run([src("media", "supports"), src("media", "supports")]);
  // 25 + 25 (type) + 16 (AI: two credible supports) = 66
  assert.strictEqual(check.score, 66);
  assert.strictEqual(check.speech, "66 out of 100, high reliability. Two news reports support it, but there's no official source.");
});

test("blogs and social posts only: capped at 40 and says why", () => {
  const check = run([src("user", "supports"), src("user", "supports"), src("user", "supports"), src("user", "supports"), src("user", "supports")]);
  assert.strictEqual(check.score, 40);
  assert.ok(check.capped);
  assert.match(check.speech, /^40 out of 100, moderate reliability\. It's capped at 40 because I only found five blogs or social posts/);
});

test("no sources found ends at zero and says so", () => {
  const check = run([]);
  assert.strictEqual(check.score, 0);
  assert.match(check.speech, /couldn't find any source/);
});

test("contradicted claim scores low and leads with the contradiction", () => {
  const check = run([src("official", "contradicts"), src("media", "contradicts"), src("document", "contradicts")]);
  assert.strictEqual(check.score, 0);
  assert.strictEqual(check.verdict, "Disputed by sources");
  assert.match(check.speech, /One official source, one research document and one news report contradict it\.$/);
  assert.match(explainSpeech(check), /^None of the three sources I found back the claim/);
});

test("mostly supported claim with one contradiction is reduced, not erased", () => {
  const check = run([src("official", "supports"), src("media", "supports"), src("media", "contradicts")]);
  // 40 + 25 + 10 diversity, AI: +8 +8 -15 = +1 -> 76
  assert.strictEqual(check.score, 76);
  assert.strictEqual(check.verdict, "Mixed evidence");
  assert.match(check.speech, /but one news report disputes it\.$/);
});

test("fresh official source earns the freshness bonus", () => {
  const check = run([src("official", "supports", { createdAt: daysAgo(2) }), src("media", "supports")]);
  assert.strictEqual(check.parts.freshness, 10);
  assert.ok(explainSpeech(check).includes("Recent coverage added 10."));
});

test("opinions, predictions and vague claims are not scored", () => {
  for (const type of ["opinion", "prediction", "vague"]) {
    const check = run([], type);
    assert.strictEqual(check.checkable, false);
    assert.strictEqual(check.score, null);
  }
  assert.match(run([], "opinion").speech, /^That sounds like an opinion/);
});

test("spoken answers stay at two sentences", () => {
  const variants = [
    [src("media", "supports")],
    [src("official", "supports"), src("media", "contradicts")],
    [src("user", "unrelated")],
    [src("document", "supports"), src("media", "supports"), src("official", "supports")]
  ];
  for (const sources of variants) {
    const sentences = run(sources).speech.split(/(?<=\.)\s/);
    assert.ok(sentences.length <= 2, sentences.join(" | "));
  }
});

test("explain and sources speech read naturally", () => {
  const check = run([src("media", "supports"), src("official", "supports")]);
  assert.match(explainSpeech(check), /^One official source added 40, one news report added 25\./);
  assert.match(sourcesSpeech(check), /^Top sources: /);
});

test("explain adds up when one supporting source faces several contradictions", () => {
  const check = run([src("media", "supports"), src("official", "contradicts"), src("document", "contradicts"), src("media", "contradicts")]);
  // 25 - 10 single source + AI (8 - 45 = -37, capped -30) = -15 -> 0
  assert.strictEqual(check.score, 0);
  assert.strictEqual(explainSpeech(check),
    "One news report added 25. Only one source backs it, so 10 came off for no corroboration. " +
    "The evidence check took off 30 because three sources contradict it. That's below zero, so it stays at 0.");
});

test("explain says when the total ran past 100", () => {
  const check = run([src("official", "supports"), src("document", "supports"), src("media", "supports")]);
  assert.strictEqual(check.score, 100);
  // 40 + 30 + 25 types, +20 diversity, +20 AI (capped) = 135
  assert.match(explainSpeech(check), /That's 135, and the scale stops at 100\.$/);
});

test("lead-ins are stripped from what the user said", () => {
  assert.strictEqual(cleanClaim("Alexa, ask Fact Pulse is it true that the moon is made of cheese?"), "The moon is made of cheese");
  assert.strictEqual(cleanClaim("fact check: India has 28 states"), "India has 28 states");
});

test("source classification", () => {
  assert.strictEqual(classifySource("https://www.rbi.org.in/x"), "official");
  assert.strictEqual(classifySource("pib.gov.in"), "official");
  assert.strictEqual(classifySource("www.reuters.com"), "media");
  assert.strictEqual(classifySource("https://arxiv.org/abs/1"), "document");
  assert.strictEqual(classifySource("en.wikipedia.org"), "user");
  assert.strictEqual(classifySource("unknown-site.xyz", "official"), "media", "model cannot promote unknown sites to official");
  assert.strictEqual(classifySource("thermoworks.com", "document"), "media", "model cannot promote unknown sites to research");
  assert.strictEqual(classifySource("www.icc-cricket.com"), "official");
  assert.strictEqual(classifySource("unknown-site.xyz"), "user");
});
