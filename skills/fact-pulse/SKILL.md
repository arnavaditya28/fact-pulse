---
name: fact-pulse
description: Fact-check something the user heard, by voice. Use when the user asks whether a claim is true ("is it true that...", "I heard that...", "fact check..."), asks why a claim got its score, wants the sources, or asks what they checked before. Calls the Fact Pulse MCP server, which scores claims 0-100 with the Veridex reliability rules.
license: MIT
metadata:
  mcp-server: fact-pulse
  mcp-transport: streamable-http
  mcp-spec: "2025-11-25"
---

# Fact Pulse

Fact Pulse answers "is that true?" out loud. The MCP server finds sources for
the claim, labels each one (official, research document, news, blog/social),
judges whether it supports or contradicts the claim, and scores the claim
0-100 with the six Veridex rules. Every tool result has a `speech` field that is
already written for voice.

## Connect

Add the MCP server (Streamable HTTP):

```json
{ "mcpServers": { "fact-pulse": { "type": "http", "url": "https://<your-host>/mcp" } } }
```

Locally: `npm start` in the repo, then `http://localhost:3002/mcp`.

## Which tool, when

| The user says | Call | Notes |
|---|---|---|
| "Is it true that X?", "I heard X", "Fact check X" | `check_claim` with `claim` = their words | Pass their words as said; the server strips "Alexa", "is it true that", etc. |
| "Why that score?", "How did you get that?" | `explain_score` | No `check_id` needed: it uses the listener's latest check. |
| "What are the sources?", "Who says so?" | `list_sources` | |
| "Is it ready?" after a `pending` answer | `check_status` with the `check_id` | |
| "What did I check earlier?" | `recent_checks` | Works across sessions and days. |

Always pass the same `listener` for one person or household (for Alexa+, the
recognised person id). That is what lets follow-ups and history work.

## How to answer

1. Read `speech` aloud exactly. It is at most two sentences and leads with the score.
2. Do not read URLs, domains or rule codes. If there is a screen, show `result.sources` as a card.
3. Then offer one follow-up, such as "Want to know why?"
4. If `status` is `pending`, say the `speech` line ("still checking…"), then call `check_status` when the user asks again.
5. Opinions, predictions and vague claims come back with `checkable: false` and no score. Say the `speech` line; do not invent a score.
6. Never present the score as "true" or "false". It measures how strong the evidence is: 80 or more is very high, 65 or more high, 40 or more moderate, 20 or more low, and below that very low.

## Scoring in one breath (for "how does this work?")

Only sources that back the claim earn points: official +40, research +30, news +25,
blog/social +10. Mixing source types adds up to +20, and coverage from the last week
adds +10. A single source loses 10. An AI evidence check moves the total by
-30 to +20, and each contradicting source takes 15 off. With no official, research
or news source, the score is capped at 40.

## Examples

User: "Alexa, is it true that the Great Wall of China is visible from space?"
-> `check_claim({ claim: "is it true that the Great Wall of China is visible from space?", listener })`
-> speak: "0 out of 100, very low reliability. One official source and two news reports contradict it."

User: "Why that score?"
-> `explain_score({ listener })`

User: "Pineapple is the best pizza topping."
-> `check_claim(...)` returns `checkable: false`
-> speak: "That sounds like an opinion, so there's nothing to fact-check..."
