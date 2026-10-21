# Demo video: script and recording steps

Target length: **2:40** (the limit is 3:00, and judges may stop watching after that).
Lead with the voice exchange, because that is the product.

## Before recording

1. Start the server:

   ```bash
   npm start
   ```

2. Open **Chrome or Edge** at `http://localhost:3002/?demo`, full screen (F11), with the zoom at 110–125% so the text is readable on YouTube.
   Do one practice run with **▶ Start demo**, then reload the page. This also fills the cache for 6 hours, so the recorded run answers instantly. To show real latency (about 4 s) instead, skip the practice run.
3. Turn your system volume up. The answers are spoken by the browser and must be in the recording.
4. Have a terminal ready in the `fact-pulse` folder, with a large font.

## Record (Windows)

- **Xbox Game Bar:** `Win + Alt + R` starts and stops recording of the active window, system audio included. The file goes to `Videos\Captures`.
- Or **Snipping Tool → Record** (Windows 11), with "System audio" switched on.
- Optional: talk over it with your microphone, or record the voice-over afterwards. **No copyrighted music.**

## Script

| Time | On screen | You say (voice-over) |
|---|---|---|
| 0:00–0:12 | `docs/gallery/01-cover.png` | "You hear a claim at dinner, in a WhatsApp forward, on the news. Is it true? Fact Pulse lets you just ask Alexa+." |
| 0:12–1:35 | `localhost:3002/?demo`, click **▶ Start demo** | Stay quiet for the first answer, then add short lines between turns: |
| | Great Wall → score 0 | "It searched the web, read each source, and scored the claim with the Veridex reliability rules: NASA and two research papers say it's false." |
| | "Why that score?" | "Follow-ups work without repeating yourself. It remembers the last check." |
| | Eiffel Tower → 100 | "A true but surprising one: the tower really does grow in summer heat." |
| | "What are the sources?" | "Every source is a real search result, labelled official, research, news or social." |
| | Pineapple → declined | "Opinions aren't scored. It says so instead of inventing a number." |
| | "What did I check earlier?" | "History is kept per listener, across sessions." |
| 1:35–1:55 | Point at the **Under the hood** panel and open one "request / response" | "Every turn is a real MCP tools/call to our self-hosted server, spec 2025-11-25 over Streamable HTTP." |
| 1:55–2:15 | Terminal: `npm run test:mcp` | "Here's the official MCP SDK client connecting: protocol 2025-11-25, five tools. Any Alexa+ agent or MCP host can call it." Then briefly show `skills/fact-pulse/SKILL.md`: "…and an Agent Skill tells the agent when to use each tool and how to speak the answer." |
| 2:15–2:35 | `docs/gallery/06-how-it-works.png` | "Veridex already scored claims from sources people attached. New in this hackathon: it finds the sources itself, judges each one, and answers in two spoken sentences, in about four seconds." |
| 2:35–2:45 | Back to the app, or the repo page | "Fact Pulse. Open source on GitHub. Ask before you share." |

## Upload

1. Go to [YouTube Studio](https://studio.youtube.com) and choose **Create → Upload video**.
2. Title: `Fact Pulse: ask Alexa+ if what you heard is true (Build, Ship, Shape, Alexa+ track)`.
3. Set visibility to **Public**. The rules require public, so Unlisted is not enough.
4. Paste the link into Devpost under **Video demo link**.

## Devpost image gallery (3:2, under 5 MB each)

Upload them in this order from `docs/gallery/`:

1. `01-cover.png`
2. `02-supported-claim.png`
3. `03-myth-why-that-score.png`
4. `04-mcp-trace.png`
5. `05-opinion-declined.png`
6. `06-how-it-works.png`
7. `07-history-across-sessions.png`
