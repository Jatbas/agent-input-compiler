// Mock MCP server: reads stdin sync, finds tools/call line, writes params.arguments to AIC_MOCK_ARGS_FILE.
const fs = require("fs");
const stdin = fs.readFileSync(0, "utf8");
const outPath = process.env.AIC_MOCK_ARGS_FILE;
const lines = stdin.split("\n").filter((l) => l.trim());
for (const line of lines) {
  try {
    const msg = JSON.parse(line);
    if (msg.method === "tools/call" && msg.params && msg.params.arguments) {
      if (outPath)
        fs.writeFileSync(outPath, JSON.stringify(msg.params.arguments), "utf8");
      break;
    }
  } catch {
    // skip
  }
}
