# AIC Documentation & Implementation Gaps

**Created:** 2026-02-27
**Updated:** 2026-03-13 (GAP-02 in progress; GAP-12 resolved and removed)
**Purpose:** Track gaps between documentation, implementation reality, and opportunities.

---

## Architectural Framing

AIC's core pipeline is complete — it handles every compilation scenario (session start, per-prompt, per-subagent, pre-compaction) identically via the same `CompilationRequest → CompilationResult` interface. The pipeline doesn't know who called it. Any perceived limitation in what AIC "can do" is a limitation of the editor's hook system — whether the editor gives AIC the opportunity to run at a given moment.

This means all "limitations" live in the integration layer, not in AIC's core. Adding support for a new editor means writing thin hook scripts that call the same `aic_compile` tool. SOLID principles (DIP, OCP) ensure no core changes are needed.

## Integration Layer Capabilities

Different editors provide varying hook capabilities. The table below outlines the supported hooks for both Cursor and Claude Code:

| Capability                         | Cursor                               | Claude Code |
| ---------------------------------- | ------------------------------------ | ----------- |
| Session start + context injection  | Yes                                  | Yes         |
| Per-prompt + context injection     | No                                   | Yes         |
| Pre-tool-use gating                | Yes                                  | Yes         |
| Subagent start + context injection | No                                   | Yes         |
| Session end                        | Yes (sessionEnd; AIC Task 110)       | Yes         |
| Pre-compaction                     | Yes (preCompact, observational only) | Yes         |
| Trigger rule                       | Yes                                  | Yes         |

Cursor exposes sessionEnd and preCompact; AIC integrates sessionEnd (Task 110). Pre-compaction in Cursor is observational only. Claude Code's hook system exposes additional context injection points, such as per-prompt context and subagent context injection.

---

## Gaps

### GAP-02: Claude Code integration layer not built

**Status:** In progress — Phase T + Phase U in `mvp-progress.md`. See
`documentation/claude-code-integration-layer.md` for the full implementation spec.
**Impact:** High — Claude Code's hooks solve limitations that are structurally impossible in Cursor

**What we have:** A complete implementation spec in `claude-code-integration-layer.md`.
The existing `.claude/hooks/` scripts are being rebuilt from scratch per the spec.

**Remaining work (per GAP-02 closure checklist in the spec):**

1. **Rebuild all hook scripts** — output format is event-specific: plain text for
   `UserPromptSubmit`/`PreCompact`; `hookSpecificOutput` JSON for `SessionStart`/`SubagentStart`.
2. **`conversationId` propagation** — `aic-compile-helper.cjs` must forward `session_id`
   as `conversationId` so `compilation_log` rows are attributed correctly.
3. **Dual-path injection** — `SessionStart` does not fire for new CLI sessions
   ([issue #10373](https://github.com/anthropics/claude-code/issues/10373), still open). Add
   session-marker fallback in `aic-prompt-compile.cjs`.
4. **Quality-gate hooks** — create `aic-after-file-edit-tracker.cjs`, `aic-stop-quality-check.cjs`,
   `aic-block-no-verify.cjs`, `aic-pre-compact.cjs`.
5. **Phase U zero-install** — `.claude/install.cjs` writes `settings.local.json` (standalone
   script in the integration layer — not wired into MCP server startup).
6. **Integration tests** — stdin → stdout round-trip for each hook event.

**Action:** Phase T + Phase U in `mvp-progress.md`.

---

### GAP-09: Visual demo (GIF/recording) in README

**Status:** Tracked — Phase V in `mvp-progress.md`
**Impact:** High — OSS browsers expect a visual demo in the first scroll; without one, many leave immediately

**What we have:** A working `aic_inspect` MCP tool and real projects to run it on.

**What we need:** A screen recording showing AIC in action inside an editor — "show aic status" and "show aic last" prompt commands. Placed at the top of the README near the one-liner.

**Action:** Phase V: Visual demo (GIF/recording) in README.

---

### GAP-10: Comparative benchmarks — AIC vs. native editor context

**Status:** Tracked — Phase V in `mvp-progress.md`
**Impact:** High — team leads evaluating AIC need to see how it compares to Cursor's built-in context selection (@codebase, @file), not just raw-to-compiled reduction

**What we have:** AIC's own token reduction numbers (98%+). Phase K benchmarks complete on single repo. No data on what editors send natively.

**What we need:** Side-by-side comparison: for the same prompt on the same project, measure (a) what Cursor sends without AIC, (b) what AIC compiles. Show file selection quality, not just token count.

**Action:** Phase V: Comparative benchmarks vs. native editor context.

---

### GAP-11: Token reduction datapoints at multiple project scales

**Status:** Tracked — Phase V in `mvp-progress.md`
**Impact:** Medium — a single datapoint from one project doesn't answer "will this help a project my size?"

**What we have:** One real-world datapoint (this project: 420M+ raw → ~7M compiled, 98%+ reduction across 900+ compilations). Phase K single-repo benchmarks complete.

**What we need:** At least three datapoints at different scales (e.g. ~50 files, ~500 files, ~5000 files) showing reduction percentages, selected file counts, and summarisation tier distribution.

**Action:** Phase V: Multi-repo benchmark suite (multi-scale datapoints).

---

## Priority Order (Phase 1.0)

Open gaps, ordered by current priority.

| Priority | Gap                                   | Current tracked item               | Effort                                 | Impact                                          |
| -------- | ------------------------------------- | ---------------------------------- | -------------------------------------- | ----------------------------------------------- |
| 1        | GAP-02: Claude Code integration layer | Phase T + Phase U (in progress)    | Medium — rebuild from scratch per spec | High — unblocks Claude Code usage               |
| 2        | GAP-09: Visual demo in README         | Phase V visual demo in README      | Small (terminal recording)             | High — first-impression impact for OSS browsers |
| 3        | GAP-11: Multi-scale datapoints        | Phase V multi-repo benchmark suite | Medium (run on multiple repos)         | Medium — "will this work on my project?"        |
| 4        | GAP-10: Comparative benchmarks        | Phase V native-context comparison  | Medium (analysis + methodology)        | High — team adoption requires comparison data   |
