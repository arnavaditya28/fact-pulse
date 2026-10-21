// Vendored unchanged from Veridex (backend/rules/evaluate.js) so live voice checks
// and community-submitted claims are scored by exactly the same six rules.

/**
 * Veridex claim reliability scoring.
 *
 * Scores a claim from 0–100 based on the sources attached to it.
 * Key principles:
 *   - Evidence quality and diversity drive the score.
 *   - A claim with no real evidence (or only user-submitted evidence)
 *     cannot be rated highly, regardless of other bonuses.
 *   - Freshness reflects how recently the claim was backed by a source,
 *     not how recently the claim itself was posted.
 *   - Optional AI evidence check: when stance results are supplied, sources
 *     that actually support/contradict the claim adjust the score.
 *
 * @param {Array}  sources         Source documents for the claim.
 * @param {Date}   claimCreatedAt  Claim creation date (freshness fallback).
 * @param {Array}  stanceResults   Optional AI stance results from utils/aiStance.
 *                                  Each item: { sourceType, stance } where stance
 *                                  is "supports" | "contradicts" | "unrelated" | "unanalyzed".
 */
function evaluateClaim(sources, claimCreatedAt, stanceResults = []) {

  let totalScore = 0;
  const ruleBreakdown = [];
  let aiAdjustment = 0;

  /* =========================
     EARLY EXIT: NO EVIDENCE
  ========================= */
  if (!sources || sources.length === 0) {
    return {
      totalScore: 0,
      confidenceLevel: "very low",
      freshnessScore: 0,
      aiAdjustment: 0,
      ruleBreakdown: ["No sources attached — cannot establish reliability"],
      uniqueTypesCount: 0
    };
  }

  /* =========================
     RULE 1: SOURCE TYPE WEIGHT
  ========================= */
  const typeWeights = { official: 40, document: 30, media: 25, user: 10 };
  const uniqueTypes = new Set();

  sources.forEach(src => {
    if (typeWeights[src.sourceType]) {
      totalScore += typeWeights[src.sourceType];
      ruleBreakdown.push(`+${typeWeights[src.sourceType]} from ${src.sourceType} source`);
      uniqueTypes.add(src.sourceType);
    }

    // Moderator adjustments
    if (src.reviewStatus === "relevant")   { totalScore += 10;  ruleBreakdown.push("+10 moderator verified relevant"); }
    if (src.reviewStatus === "irrelevant") { totalScore -= 15;  ruleBreakdown.push("-15 moderator marked irrelevant"); }
    if (src.reviewStatus === "outdated")   { totalScore -= 10;  ruleBreakdown.push("-10 moderator marked outdated"); }
  });

  /* =========================
     RULE 2: SOURCE DIVERSITY
  ========================= */
  if (uniqueTypes.size >= 2) { totalScore += 10; ruleBreakdown.push("+10 diversity bonus (2+ types)"); }
  if (uniqueTypes.size >= 3) { totalScore += 10; ruleBreakdown.push("+10 strong diversity (3+ types)"); }

  /* =========================
     RULE 3: FRESHNESS (based on most recent source, not claim age)
     Falls back to claim creation date if sources lack timestamps.
  ========================= */
  const sourceDates = sources
    .map(src => src.createdAt ? new Date(src.createdAt).getTime() : null)
    .filter(t => t !== null);

  const referenceTime = sourceDates.length
    ? Math.max(...sourceDates)
    : new Date(claimCreatedAt).getTime();

  const ageInDays = (Date.now() - referenceTime) / (1000 * 60 * 60 * 24);
  let freshnessScore = 0;
  if (ageInDays <= 7)        { freshnessScore = 10; }
  else if (ageInDays <= 30)  { freshnessScore = 5; }
  totalScore += freshnessScore;
  if (freshnessScore > 0) ruleBreakdown.push(`+${freshnessScore} freshness bonus (recent supporting source)`);

  /* =========================
     RULE 4: THIN-EVIDENCE PENALTY
  ========================= */
  if (sources.length === 1) {
    totalScore -= 10;
    ruleBreakdown.push("-10 single-source penalty (needs corroboration)");
  }

  /* =========================
     RULE 5: AI EVIDENCE CHECK (optional)
     Adjusts the score based on whether sources actually support the claim.
     Supporting credible sources help; contradicting or unrelated ones hurt.
     Net AI adjustment is capped to keep it a nudge, not a takeover.
  ========================= */
  let supports = 0, contradicts = 0, unrelated = 0;

  (stanceResults || []).forEach(r => {
    const credible = ["official", "document", "media"].includes(r.sourceType);
    if (r.stance === "supports")        { supports++;    aiAdjustment += credible ? 8 : 4; }
    else if (r.stance === "contradicts"){ contradicts++; aiAdjustment -= 15; }
    else if (r.stance === "unrelated")  { unrelated++;   aiAdjustment -= 10; }
  });

  aiAdjustment = Math.max(-30, Math.min(20, aiAdjustment));

  if (supports || contradicts || unrelated) {
    totalScore += aiAdjustment;
    const sign = aiAdjustment >= 0 ? "+" : "";
    ruleBreakdown.push(
      `AI evidence check: ${supports} support, ${contradicts} contradict, ${unrelated} unrelated (${sign}${aiAdjustment})`
    );
  }

  /* =========================
     RULE 6: LOW-EVIDENCE CAP
     If no credible source type (official / document / media) is present,
     the claim cannot exceed "moderate" confidence.
  ========================= */
  const hasCredibleSource =
    uniqueTypes.has("official") ||
    uniqueTypes.has("document") ||
    uniqueTypes.has("media");

  /* =========================
     NORMALIZE
  ========================= */
  totalScore = Math.max(0, Math.min(100, totalScore));

  if (!hasCredibleSource && totalScore > 40) {
    totalScore = 40;
    ruleBreakdown.push("Capped at 40 — no official, document, or media source");
  }

  /* =========================
     CONFIDENCE LEVEL
  ========================= */
  let confidenceLevel;
  if (totalScore >= 80)      confidenceLevel = "very high";
  else if (totalScore >= 65) confidenceLevel = "high";
  else if (totalScore >= 40) confidenceLevel = "moderate";
  else if (totalScore >= 20) confidenceLevel = "low";
  else                       confidenceLevel = "very low";

  return {
    totalScore,
    confidenceLevel,
    freshnessScore,
    aiAdjustment,
    ruleBreakdown,
    uniqueTypesCount: uniqueTypes.size
  };
}

module.exports = evaluateClaim;
