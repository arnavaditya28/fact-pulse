# Product feedback and friction log

Notes taken while building, for the Devpost product-feedback answers and the
optional friction log. Add to this as you go; entries marked *(to fill)* need
your own experience.

## Tools used

| Tool | Used for |
|---|---|
| Model Context Protocol, TypeScript/JS SDK `@modelcontextprotocol/sdk` 1.32.1 | MCP server (spec 2025-11-25, Streamable HTTP, stateless), plus the SDK client in `scripts/mcp-smoke.js` |
| Agent Skills open format | `skills/fact-pulse/SKILL.md` |
| Alexa+ (simulated) | Web app simulating the device, as the rules allow |
| Google Gemini API | Claim classification and per-source stance |
| Serper.dev (Google results) | Web search for spoken claims |
| Web Speech API (browser) | Speech in and out in the simulator |

## What worked well

- **MCP SDK.** It went from `npm install` to a spec 2025-11-25 server that the official client accepted in one sitting. `registerTool` with zod schemas, `structuredContent` and tool annotations covered everything a voice tool needs. `LATEST_PROTOCOL_VERSION` in the SDK confirmed the spec version without guessing.
- **Stateless Streamable HTTP** (`sessionIdGenerator: undefined`, `enableJsonResponse: true`) makes a voice backend easy to host. A plain `fetch` from the browser works as an MCP client.

## What needs work

- **There is no documented path from a self-hosted MCP server to a real Alexa+ device.** The resources page gives two links (Agent Skills, Streamable HTTP) and says to simulate Alexa+ in a web app. A builder can't learn how Alexa+ would discover, authorise and call their server: no OAuth expectations, no listener or person id, no screen-card format. *Suggestion:* publish a one-page "Alexa+ MCP contract" listing the auth, the identity fields passed to tools, the response length and latency limits for voice, and how to return visual cards.
- **There is no guidance on voice latency.** We picked an 8-second budget, with a "still checking" holding line and `check_status`, but had no Alexa+ number to design against.
- **Stateless servers need boilerplate.** You create a new server and transport per request and hand-write 405 handlers for GET and DELETE. A `createStatelessHandler(serverFactory)` helper in the SDK would remove this.

## Onboarding (zero to hello world)

MCP server answering `tools/list` from the official client: about 1 hour, including reading the SDK exports. Alexa+ specifics: none available, so we went straight to the simulation path. *(to fill: your own experience, e.g. office hours, forum)*

## Would you build with these again?

*(to fill: Yes/No and why)*

---

## Friction log

### 1. Finding how Alexa+ connects to a self-hosted MCP server
- **Task:** Wire the Fact Pulse MCP server into Alexa+.
- **Steps:** Read the Devpost overview, resources and rules pages. Followed the MCP docs link (modelcontextprotocol.io).
- **Expected:** An Alexa+ page explaining how to register an MCP endpoint, the auth model, and the identity/context Alexa+ passes.
- **Actual:** The rules point to the generic MCP getting-started guide and allow a simulated Alexa+ experience. No Alexa+-specific integration docs.
- **Severity:** High (it decides the whole architecture).
- **Workaround:** Built the MCP server to the spec, plus a web simulator that calls it over JSON-RPC. Designed the tools for voice from first principles: `speech` field, a `listener` id, a time budget.
- **Suggestion:** Publish the Alexa+ MCP contract (auth, identity, latency, cards), even as a preview.

### 2. Gemini model retired mid-project
- **Task:** Reuse Veridex's Gemini evidence check (`gemini-2.5-flash`).
- **Actual:** HTTP 404, "no longer available to new users". The newer models returned 503 "high demand" on the free tier.
- **Severity:** Medium.
- **Workaround:** A model fallback chain (`GEMINI_MODELS`) that moves on after a 404, 429 or 503.
- **Suggestion (Gemini):** Give a deprecation window for existing keys.

### 3. Search grounding not on the free tier
- **Task:** Find sources with Gemini's Google Search grounding.
- **Actual:** HTTP 429 on every model with `tools: [{google_search: {}}]`. The free-tier quota for grounding is 0.
- **Severity:** Medium.
- **Workaround:** A separate search API (Serper; Tavily now asks for a card) with Gemini judging the results. This turned out better, because every cited source is a real search hit.

### 4. *(to fill: anything that breaks while recording the demo or deploying)*
