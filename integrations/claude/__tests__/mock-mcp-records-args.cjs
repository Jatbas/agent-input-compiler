// Mock MCP server: reads stdin line by line, records tools/call args, writes response.
const fs = require("fs");
const readline = require("readline");

const outPath = process.env.AIC_MOCK_ARGS_FILE;
const rl = readline.createInterface({ input: process.stdin });

rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    if (msg.method === "tools/call" && msg.params && msg.params.arguments) {
      if (outPath) fs.writeFileSync(outPath, JSON.stringify({ stdin: line }), "utf8");
      process.stdout.write(
        '{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\\"compiledPrompt\\":\\"mock prompt\\"}"}]}}\n',
      );
    }
  } catch {
    // skip non-JSON lines
  }
});
