# Shared Investigation Protocols

Single source of truth for runtime verification and codebase investigation depth. All AIC skills reference this file instead of duplicating these protocols. When improving a check, update it here — every skill benefits automatically.

## How skills use this file

- **Planner** (§0b): reads and applies the Runtime Evidence Checklist during analysis-only requests and Pass 1 exploration.
- **Executor** (§2.5): reads and applies the Runtime Evidence Checklist to verify task assumptions before implementing.
- **Researcher** (§3a): reads both sections and includes them in explorer prompts when spawning runtime-evidence and codebase-investigation subagents.
- **Documentation-writer** (Phase 1a pre-read): reads both sections; injects Runtime Evidence Checklist into Explorer 1 and Critic 2 prompts for runtime behavior claims, and Codebase Investigation Depth into any explorer prompt that traces code paths.

When a skill spawns subagents, the parent agent reads this file and includes the relevant content in the subagent's prompt. Subagents do not need to read this file separately.

---

## Runtime Evidence Checklist

When investigating claims about runtime behavior, collect actual evidence for each applicable item. Do not assume state — verify it.

- **Database state:** Query `~/.aic/aic.sqlite` for relevant rows, counts, and column values. Show concrete data. Do not assume what the database contains.
- **Deployed files:** Read actual deployed copies (e.g., `.cursor/hooks/`, `.claude/hooks/`), not just source files in `integrations/`. Diff source vs deployed to catch stale deployment.
- **Bootstrap/lifecycle:** Trace the actual code path (e.g., `runEditorBootstrapIfNeeded`, `oninitialized`) and read the relevant functions. Do not assume bootstrap behavior from documentation alone.
- **Cache and file system state:** Read actual cache files (e.g., `.aic/.claude-session-model`) and check file system state (permissions, symlinks, directory structure).
- **Documentation cross-check:** Check `documentation/` for docs that describe the mechanism under investigation. Compare doc claims against code evidence. Report discrepancies.
- **External system behavior:** When depending on what an external system sends (Cursor stdin payload, MCP client capabilities, editor settings), inspect actual runtime data (database rows, cache files) rather than relying on documentation or assumptions.
- **External API/library shapes:** Read actual `.d.ts` files under `node_modules/`, not documentation or memory. Report exact method signatures.

**Precedence rule:** Runtime evidence (database rows, deployed files, actual code paths) takes precedence over documentation when they conflict. If documentation says "X happens" but the database or deployed files show otherwise, the runtime evidence wins.

---

## Codebase Investigation Depth

When investigating the AIC codebase, apply these depth requirements. These are read-only — read, query, and trace, but never modify files.

1. **Full code path tracing:** Do not stop at the first grep match. Trace from entry point (MCP handler, hook, CLI command) through every function call to the target behavior. Read each intermediate file. Report the full chain with file:line citations.
2. **Interface and type verbatim reads:** Read implemented interfaces and consumed types from `core/interfaces/` and `core/types/` verbatim. Do not paraphrase or summarize type signatures — cite exact definitions.
3. **Library API verification:** Read the actual installed `.d.ts` files under `node_modules/`, not documentation or memory. Report exact constructor and method signatures.
4. **Deployed vs source artifact diffing:** When the investigation involves files copied/installed at runtime (hooks, configs, templates), read BOTH the source file AND the deployed copy. Report any differences.
5. **Database evidence:** Query `~/.aic/aic.sqlite`. Show concrete rows, counts, and column values. Do not speculate about what the database contains.
6. **Sibling and consumer analysis:** Grep for all importers and string-literal references across the codebase. Report the component's full footprint — not just its own code.
7. **Stale marker scan:** In every file read during investigation, note `TODO`, `FIXME`, `HACK` markers and phase heading references (`Phase (?:[A-Z]{1,2}|[0-9]+(?:\.[0-9]+)?)\b` — documentation-writer Dimension 9). Cross-reference those references against `documentation/tasks/progress/aic-progress.md` (main workspace only — gitignored). Report actionable markers.
8. **Documentation cross-reference:** Check `documentation/` for docs describing the mechanism under investigation. Compare doc claims against code evidence. Report discrepancies.

These depth requirements do NOT activate for technology evaluations involving only external technologies (no AIC codebase code).
