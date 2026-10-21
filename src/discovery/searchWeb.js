/**
 * Web search providers. Each returns a list of
 *   { title, url, domain, snippet, published }   (published: Date | null)
 *
 *   serper  - https://serper.dev, Google results; 2,500 free queries, no card.
 *   tavily  - https://tavily.com
 *   brave   - https://brave.com/search/api
 *
 * Gemini's own Google Search grounding is handled separately in findSources.js
 * because it does search and judging in one call.
 */

const { normalizeDomain } = require("./classifySource");

const MAX_SNIPPET = 700;

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 86400000) return null;
  return d;
}

// Serper dates are either absolute ("Aug 23, 2023") or relative ("3 days ago").
function serperDate(value) {
  if (!value) return null;
  const rel = /^(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/i.exec(value.trim());
  if (rel) {
    const ms = { minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5, month: 2592e6, year: 31536e6 }[rel[2].toLowerCase()];
    return new Date(Date.now() - Number(rel[1]) * ms);
  }
  return toDate(value);
}

async function serper(query, { signal, maxResults }) {
  const key = process.env.SERPER_API_KEY;
  if (!key) throw new Error("SERPER_API_KEY is not set");

  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify({ q: query.slice(0, 380), num: maxResults })
  });
  if (!response.ok) throw new Error(`Serper HTTP ${response.status}`);

  const data = await response.json();
  return (data.organic || []).map(r => ({
    title: r.title || "",
    url: r.link,
    domain: normalizeDomain(r.link),
    snippet: String(r.snippet || "").slice(0, MAX_SNIPPET),
    published: serperDate(r.date)
  }));
}

async function tavily(query, { signal, maxResults }) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY is not set");

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      query: query.slice(0, 380),
      search_depth: "basic",
      max_results: maxResults,
      include_answer: false,
      include_raw_content: false
    })
  });
  if (!response.ok) throw new Error(`Tavily HTTP ${response.status}`);

  const data = await response.json();
  return (data.results || []).map(r => ({
    title: r.title || "",
    url: r.url,
    domain: normalizeDomain(r.url),
    snippet: String(r.content || "").slice(0, MAX_SNIPPET),
    published: toDate(r.published_date)
  }));
}

async function brave(query, { signal, maxResults }) {
  const key = process.env.BRAVE_API_KEY;
  if (!key) throw new Error("BRAVE_API_KEY is not set");

  const url = `https://api.search.brave.com/res/v1/web/search?count=${maxResults}&q=${encodeURIComponent(query.slice(0, 380))}`;
  const response = await fetch(url, {
    signal,
    headers: { accept: "application/json", "x-subscription-token": key }
  });
  if (!response.ok) throw new Error(`Brave HTTP ${response.status}`);

  const data = await response.json();
  return (data.web?.results || []).map(r => ({
    title: r.title || "",
    url: r.url,
    domain: normalizeDomain(r.url),
    snippet: [r.description, ...(r.extra_snippets || [])].join(" ").replace(/<[^>]+>/g, "").slice(0, MAX_SNIPPET),
    published: toDate(r.page_age)
  }));
}

const PROVIDERS = { serper, tavily, brave };

function searchProvider() {
  if (process.env.SEARCH_PROVIDER) return process.env.SEARCH_PROVIDER;
  if (process.env.SERPER_API_KEY) return "serper";
  if (process.env.TAVILY_API_KEY) return "tavily";
  if (process.env.BRAVE_API_KEY) return "brave";
  return "gemini-grounding";
}

async function searchWeb(query, { signal, maxResults = 8 } = {}) {
  const provider = PROVIDERS[searchProvider()];
  if (!provider) throw new Error(`Unknown SEARCH_PROVIDER "${searchProvider()}"`);
  const results = await provider(query, { signal, maxResults });
  // One result per domain keeps a single outlet from counting several times.
  const seen = new Set();
  return results.filter(r => r.domain && !seen.has(r.domain) && seen.add(r.domain));
}

module.exports = { searchWeb, searchProvider };
