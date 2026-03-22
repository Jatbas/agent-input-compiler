# Edited-files flow

## Purpose

This page is the entry point for how AIC tracks **edited files** in each editor: which hooks fire, how the tracker accumulates paths, what runs on **stop**, and how temporary artifacts are cleaned up. The MCP server does not drive this lifecycle; editor hooks do.

## Cursor

**Cursor:** Session-start and other hooks install the integration layer under `.cursor/hooks/`. Edited paths are recorded via `afterFileEdit`; quality checks and cleanup run on `stop`. Full sequence, file list, and edge cases live in [Cursor integration layer](technical/cursor-integration-layer.md).

## Claude Code

**Claude Code:** The plugin or direct installer deploys hooks that mirror the same pattern (tracker → stop → cleanup) with Claude’s hook names and payload shapes. See [Claude Code integration layer](technical/claude-code-integration-layer.md).

## Generic MCP editors

**Generic MCP:** There is no hook surface — there is no edited-files tracker. Compilation is driven only by the trigger rule or manual `aic_compile` calls.

## Related references

- [Installation](installation.md) — bootstrap, hooks vs MCP server paths
- [Integrations shared modules](technical/integrations-shared-modules.md) — shared hook utilities
- [AIC JSONL caches under `.aic/`](technical/aic-jsonl-caches.md) — on-disk logs next to the tracker
