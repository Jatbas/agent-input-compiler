# @jatbas/aic

**Agent Input Compiler** — a local-first MCP server that compiles intent-specific project context for AI coding agents.

AIC sits between your editor and the AI model. On every message, it scans your codebase, selects only the files relevant to the current intent, and compresses them into a token-efficient prompt — so the model sees the right context without blowing the budget.

## Install

### Cursor (one click)

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://jatbas.github.io/agent-input-compiler/install/cursor-install.html)

Or add manually to your global MCP config (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "aic": {
      "command": "npx",
      "args": ["-y", "@jatbas/aic@latest"]
    }
  }
}
```

### Claude Code (plugin — recommended)

```
/plugin marketplace add Jatbas/agent-input-compiler
/plugin install aic@aic-tools
```

The plugin auto-starts the MCP server and registers hooks so every project gets compiled context automatically. See [Installation — Claude Code](https://github.com/Jatbas/agent-input-compiler/blob/main/documentation/installation.md#claude-code) for prerequisites, direct installer, and troubleshooting.

## What it does

- Classifies intent from the user's message
- Selects and scores files by relevance
- Blocks secrets, excluded paths, and prompt injection strings
- Compresses content to fit a token budget
- Returns a bounded context package the model can reason over
- Caches results for fast recompilation

## Links

- [GitHub](https://github.com/Jatbas/agent-input-compiler)
- [Installation guide](https://github.com/Jatbas/agent-input-compiler/blob/main/documentation/installation.md)
- [Changelog](https://github.com/Jatbas/agent-input-compiler/blob/main/CHANGELOG.md)
- [Security](https://github.com/Jatbas/agent-input-compiler/blob/main/documentation/security.md)

## License

Apache-2.0
