// Mock MCP server: writes single JSON-RPC response line to stdout.
process.stdout.write(
  '{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\\"compiledPrompt\\":\\"mock prompt\\"}"}]}}\n',
);
