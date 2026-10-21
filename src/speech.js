/**
 * Turns a scored check into speech. Rules for every line here:
 *   - the first answer is at most two sentences, score first;
 *   - say why in plain words (types of sources, not URLs);
 *   - never read out a domain list or a rule code.
 */

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six"];
const TYPE_NOUN = {
  official: ["official source", "official sources"],
  document: ["research document", "research documents"],
  media: ["news report", "news reports"],
  user: ["blog or social post", "blogs or social posts"]
};

const count = n => NUMBER_WORDS[n] || String(n);
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

function nounPhrase(type, n) {
  return `${count(n)} ${TYPE_NOUN[type][n === 1 ? 0 : 1]}`;
}

// "two news reports and one official source"
function describeGroup(sources) {
  const byType = {};
  for (const s of sources) byType[s.sourceType] = (byType[s.sourceType] || 0) + 1;
  const parts = ["official", "document", "media", "user"]
    .filter(t => byType[t])
    .map(t => nounPhrase(t, byType[t]));
  if (parts.length <= 1) return parts[0] || "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

const verb = (sources, singular, plural) => (sources.length === 1 ? singular : plural);

function notCheckableSpeech(claimType, reason) {
  switch (claimType) {
    case "opinion":
      return "That sounds like an opinion, so there's nothing to fact-check. Try a claim about a fact, like a number, a date or an event.";
    case "prediction":
      return "That's about the future, so no source can confirm it yet. Ask me again once it has happened.";
    case "vague":
      return "That's too vague for me to check. Who or what exactly, and when?";
    default:
      return "I couldn't check that one. Try saying it as a single, specific claim.";
  }
}

/** The main answer: "62 out of 100. Two news reports support it, but there's no official source." */
function verdictSpeech(check) {
  const { score, sources = [] } = check;
  const supporting = sources.filter(s => s.stance === "supports");
  const contradicting = sources.filter(s => s.stance === "contradicts");
  const types = new Set(sources.map(s => s.sourceType));
  const credible = ["official", "document", "media"].some(t => types.has(t));

  const first = `${score} out of 100, ${check.confidenceLevel} reliability.`;

  if (sources.length === 0) {
    return `${first} I couldn't find any source that addresses it, so it can't be rated higher.`;
  }

  let second;
  if (contradicting.length > supporting.length) {
    second = `${capitalize(describeGroup(contradicting))} ${verb(contradicting, "contradicts", "contradict")} it`;
    if (supporting.length) second += `, and only ${describeGroup(supporting)} ${verb(supporting, "backs", "back")} it`;
  } else if (supporting.length) {
    second = `${capitalize(describeGroup(supporting))} ${verb(supporting, "supports", "support")} it`;
    if (contradicting.length) second += `, but ${describeGroup(contradicting)} ${verb(contradicting, "disputes", "dispute")} it`;
    else if (!credible) second += ", but none of them is an official, research or news source";
    else if (!types.has("official") && score < 80) second += ", but there's no official source";
  } else {
    second = `I found ${describeGroup(sources)}, but none clearly settles it`;
  }

  if (check.capped) {
    second = `It's capped at 40 because I only found ${describeGroup(sources)}, with no official, research or news source`;
  }

  return `${first} ${second}.`;
}

/** Follow-up: "why that score?" Reads the rule breakdown as sentences. */
function explainSpeech(check) {
  if (!check.checkable) return notCheckableSpeech(check.claimType, check.reasonIfNotCheckable);
  const { parts } = check;
  if (!check.sources.length) {
    return "With no sources, the Veridex rules start and end at zero. A claim needs at least one official, research or news source to score well.";
  }

  if (!parts.byType || !Object.keys(parts.byType).length) {
    const n = check.sources.length;
    const opener = n === 1 ? "The only source I found doesn't back the claim" : `None of the ${count(n)} sources I found back the claim`;
    return `${opener}, and only supporting sources earn points, so it stays at ${check.score}. ` +
      `${capitalize(describeGroup(check.sources))} ${verb(check.sources, "contradicts", "contradict")} it.`;
  }

  const lines = [];
  const typeParts = ["official", "document", "media", "user"]
    .filter(t => parts.byType[t])
    .map(t => `${nounPhrase(t, parts.byType[t].n)} added ${parts.byType[t].points}`);
  lines.push(`${capitalize(typeParts.join(", "))}.`);

  if (parts.diversity) lines.push(`Having different kinds of sources added ${parts.diversity}.`);
  if (parts.freshness) lines.push(`Recent coverage added ${parts.freshness}.`);
  if (parts.singleSource) lines.push("Only one source backs it, so 10 came off for no corroboration.");
  if (parts.ai > 0 && parts.contradicting) {
    lines.push(`The evidence check added ${parts.ai}: support outweighs the ${count(parts.contradicting)} ${parts.contradicting === 1 ? "source" : "sources"} against it.`);
  } else if (parts.ai > 0) {
    lines.push(`The evidence check added ${parts.ai} because the sources back the claim.`);
  } else if (parts.ai < 0) {
    lines.push(`The evidence check took off ${-parts.ai} because ${count(parts.contradicting)} ${parts.contradicting === 1 ? "source contradicts" : "sources contradict"} it.`);
  }
  const raw = Object.values(parts.byType).reduce((sum, t) => sum + t.points, 0)
    + parts.diversity + parts.freshness + (parts.singleSource ? -10 : 0) + parts.ai;
  if (check.capped) lines.push("Then it was capped at 40, since none of the sources is official, research or news.");
  else if (raw > 100) lines.push(`That's ${raw}, and the scale stops at 100.`);
  else if (raw < 0) lines.push("That's below zero, so it stays at 0.");
  if (!check.capped && raw >= 0 && raw <= 100) lines.push(`That makes ${check.score}.`);
  return lines.join(" ");
}

function sourcesSpeech(check) {
  if (!check.sources.length) return "I don't have any sources for that claim.";
  const top = check.sources.slice(0, 3).map(s => {
    const stance = s.stance === "supports" ? "supports it" : "disputes it";
    return `${s.publisher}, ${TYPE_NOUN[s.sourceType][0]}, ${stance}`;
  });
  return `Top sources: ${top.join("; ")}. The full list is on the card.`;
}

module.exports = { verdictSpeech, explainSpeech, sourcesSpeech, notCheckableSpeech };
