# @jatbas/aic

**Agent Input Compiler** — a local-first MCP server that compiles intent-specific project context for AI coding agents.

AIC sits between your editor and the AI model. On every message, it scans your codebase, selects only the files relevant to the current intent, and compresses them into a token-efficient prompt — so the model sees the right context without blowing the budget.

## Install

### Cursor (one click)

[![Install in Cursor](https://img.shields.io/badge/Install_in-Cursor-blue?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEyIDJMMiAxMmwxMCAxMCAxMC0xMEwxMiAyeiIgZmlsbD0id2hpdGUiLz48L3N2Zz4=)](https://jatbas.github.io/agent-input-compiler/install/cursor-install.html)

Or add manually to your global MCP config (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "aic": {
      "command": "npx",
      "args": ["-y", "@jatbas/aic"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add aic -- npx -y @jatbas/aic
```

## What it does

- Classifies intent from the user's message
- Discovers and scores files by relevance
- Compresses content (strip comments, minify types, summarize)
- Assembles a token-budgeted prompt with structural context
- Caches results for fast recompilation

## Links

- [GitHub](https://github.com/Jatbas/agent-input-compiler)
- [Changelog](https://github.com/Jatbas/agent-input-compiler/blob/main/CHANGELOG.md)

## License

Apache-2.0
