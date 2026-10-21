/**
 * Maps a web domain to a Veridex source type: official | document | media | user.
 *
 * Known domains are decided here so the label does not depend on the model.
 * For anything else we fall back to "media" if Gemini judged it a news,
 * research or official site, and otherwise to "user" (the least trusted type),
 * so an unknown site can never lift a claim past the 40-point cap on its own.
 */

const OFFICIAL_SUFFIXES = [
  ".gov", ".gov.in", ".nic.in", ".gov.uk", ".gc.ca", ".gov.au", ".mil",
  ".europa.eu", ".int", ".govt.nz", ".go.jp"
];
const OFFICIAL_DOMAINS = [
  "who.int", "un.org", "worldbank.org", "imf.org", "rbi.org.in", "isro.gov.in",
  "nasa.gov", "cdc.gov", "nih.gov", "federalreserve.gov", "ecb.europa.eu",
  "pib.gov.in", "eci.gov.in", "oecd.org", "fda.gov", "nhs.uk", "unicef.org",
  "unesco.org", "unhcr.org", "wto.org", "ipcc.ch", "iaea.org",
  // governing bodies are the official record for their own events
  "icc-cricket.com", "bcci.tv", "fifa.com", "olympics.com", "uefa.com"
];

const DOCUMENT_SUFFIXES = [".edu", ".ac.in", ".ac.uk", ".edu.au"];
const DOCUMENT_DOMAINS = [
  "doi.org", "arxiv.org", "ncbi.nlm.nih.gov", "pubmed.ncbi.nlm.nih.gov",
  "nature.com", "science.org", "sciencedirect.com", "springer.com",
  "thelancet.com", "nejm.org", "jamanetwork.com", "bmj.com", "plos.org",
  "ieee.org", "acm.org", "jstor.org", "researchgate.net", "britannica.com",
  "ourworldindata.org", "statista.com", "pewresearch.org", "mayoclinic.org",
  "clevelandclinic.org", "hopkinsmedicine.org", "harvard.edu", "cochranelibrary.com"
];

const MEDIA_DOMAINS = [
  "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk", "nytimes.com",
  "theguardian.com", "washingtonpost.com", "cnn.com", "npr.org", "aljazeera.com",
  "thehindu.com", "indianexpress.com", "hindustantimes.com", "ndtv.com",
  "timesofindia.indiatimes.com", "indiatimes.com", "livemint.com",
  "economictimes.indiatimes.com", "business-standard.com", "scroll.in",
  "bloomberg.com", "ft.com", "wsj.com", "cnbc.com", "forbes.com", "time.com",
  "theverge.com", "techcrunch.com", "wired.com", "arstechnica.com",
  "nationalgeographic.com", "scientificamerican.com", "newscientist.com",
  "snopes.com", "factcheck.org", "politifact.com", "fullfact.org", "boomlive.in",
  "altnews.in", "espn.com", "espncricinfo.com", "cricbuzz.com", "space.com"
];

const USER_DOMAINS = [
  "reddit.com", "quora.com", "x.com", "twitter.com", "facebook.com",
  "instagram.com", "tiktok.com", "youtube.com", "medium.com", "substack.com",
  "blogspot.com", "wordpress.com", "tumblr.com", "pinterest.com",
  "wikipedia.org", "fandom.com", "linkedin.com", "threads.net"
];

const VALID_TYPES = ["official", "document", "media", "user"];

function normalizeDomain(input) {
  if (!input) return "";
  let host = String(input).trim().toLowerCase();
  try {
    if (host.includes("/")) host = new URL(host.startsWith("http") ? host : `https://${host}`).hostname;
  } catch {
    return "";
  }
  return host.replace(/^www\./, "").replace(/\.$/, "");
}

const matches = (domain, list) => list.some(d => domain === d || domain.endsWith(`.${d}`));

function classifySource(domainOrUrl, modelSuggestion) {
  const domain = normalizeDomain(domainOrUrl);

  if (domain) {
    if (matches(domain, USER_DOMAINS)) return "user";
    if (matches(domain, DOCUMENT_DOMAINS) || DOCUMENT_SUFFIXES.some(s => domain.endsWith(s))) return "document";
    if (matches(domain, OFFICIAL_DOMAINS) || OFFICIAL_SUFFIXES.some(s => domain.endsWith(s))) return "official";
    if (matches(domain, MEDIA_DOMAINS)) return "media";
    if (/\.pdf($|\?)/i.test(String(domainOrUrl))) return "document";
  }

  // The model may not promote an unknown site to "official" or "document":
  // those labels are only earned through the lists and suffixes above. (In
  // testing it called a thermometer shop and a homework-help site "research".)
  if (modelSuggestion === "official" || modelSuggestion === "document" || modelSuggestion === "media") return "media";
  return "user";
}

module.exports = { classifySource, normalizeDomain };
