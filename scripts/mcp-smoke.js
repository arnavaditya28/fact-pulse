/**
 * MCP smoke test with the official SDK client over Streamable HTTP.
 *   node scripts/mcp-smoke.js [serverUrl] [claim]
 * Default server: http://localhost:3002/mcp
 */
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

const url = process.argv[2] || "http://localhost:3002/mcp";
const claim = process.argv[3] || "The Great Wall of China is visible from space with the naked eye";

(async () => {
  const client = new Client({ name: "fact-pulse-smoke", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));

  const version = client.transport.protocolVersion;
  console.log(`connected to ${client.getServerVersion().name} ${client.getServerVersion().version}, protocol ${version}`);

  const { tools } = await client.listTools();
  console.log("tools:", tools.map(t => t.name).join(", "));

  const speak = async (name, args) => {
    const t = Date.now();
    const result = await client.callTool({ name, arguments: args });
    console.log(`\n> ${name} (${Date.now() - t} ms)\n  ${result.structuredContent.speech}`);
    return result.structuredContent;
  };

  const listener = "smoke-test";
  const checked = await speak("check_claim", { claim, listener });
  if (checked.status === "pending") {
    await new Promise(r => setTimeout(r, 12000));
    await speak("check_status", { check_id: checked.check_id });
  }
  await speak("explain_score", { listener });
  await speak("list_sources", { listener });
  await speak("check_claim", { claim: "Pineapple is the best pizza topping", listener });
  await speak("recent_checks", { listener });

  await client.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
