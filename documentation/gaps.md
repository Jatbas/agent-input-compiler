# AIC Documentation & Implementation Gaps

**Created:** 2026-02-27
**Updated:** 2026-03-04 (Phase 1.0 cross-reference)
**Purpose:** Track gaps between documentation, implementation reality, and opportunities.

---

## Architectural Framing

AIC's core pipeline is complete — it handles every compilation scenario (session start, per-prompt, per-subagent, pre-compaction) identically via the same `CompilationRequest → CompilationResult` interface. The pipeline doesn't know who called it. Any perceived limitation in what AIC "can do" is a limitation of the editor's hook system — whether the editor gives AIC the opportunity to run at a given moment.

This means all "limitations" live in the integration layer, not in AIC's core. Adding support for a new editor means writing thin hook scripts that call the same `aic_compile` tool. SOLID principles (DIP, OCP) ensure no core changes are needed.

## Critical Finding: Claude Code Hooks

Claude Code provides the most complete hook system for AIC — it covers all capabilities in the editor checklist:

| Capability                         | Cursor | Claude Code |
| ---------------------------------- | ------ | ----------- |
| Session start + context injection  | Yes    | Yes         |
| Per-prompt + context injection     | No     | **Yes**     |
| Pre-tool-use gating                | Yes    | Yes         |
| Subagent start + context injection | No     | **Yes**     |
| Session end                        | No     | **Yes**     |
| Pre-compaction                     | No     | **Yes**     |
| Trigger rule                       | Yes    | Yes         |

Claude Code solves the two capabilities that are structurally impossible in Cursor (per-prompt context, subagent context). These are available today via Claude Code's hook API.

---

## Gaps

### GAP-02: Claude Code integration layer not built

**Status:** Tracked — Phase P (hook-based delivery) + Phase Q (zero-install) in `mvp-progress.md`
**Impact:** High — Claude Code's hooks solve limitations we documented as fundamental

**What we have:** Working Cursor integration layer. Confirmed Claude Code hook capabilities (see table above). Basic Claude Code hooks exist in `.claude/hooks/` but lack full delivery and zero-install.

**What we need:**

1. `UserPromptSubmit` hook — compile per-prompt context with `additionalContext` injection
2. `SubagentStart` hook — compile and inject context for subagents
3. `PreCompaction` hook — re-compile context before compaction
4. `SessionEnd` hook — session lifecycle telemetry
5. Editor detection and auto-install for Claude Code artifacts

**Action:** Phase P + Phase Q in `mvp-progress.md`. Deprioritised — user does not currently use Claude Code.

---

### GAP-03: Real `aic_inspect` output in README

**Status:** Tracked — Phase R in `mvp-progress.md`
**Impact:** Medium — the README shows a synthetic example instead of real output

**What we have:** A working `aic_inspect` MCP tool and a real project to run it on.

**What we need:** Run `aic_inspect` on a real project, capture the output, and replace the synthetic example in the README.

**Action:** Phase R: Real `aic_inspect` output in README.

---

### GAP-06: Project plan describes unimplemented features in present tense

**Status:** Tracked — Phase R in `mvp-progress.md`
**Impact:** Low — a project plan is expected to describe future work, but some sections read as if features exist

**What we have:** Rules & Hooks Analyzer marked as "Planned." But other items like `EditorAdapterRegistry`, `ModelAdapterRegistry`, and `aic://rules-analysis` MCP resource are described in present tense without phase markers.

**What we need:** Audit the project plan for features described in present tense that are not yet implemented. Add phase markers where appropriate.

**Action:** Phase R: Present-tense audit of project plan.

---

### Research: conversation_id when editor_id is generic

**Context:** Some `compilation_log` rows have `editor_id = generic` and `conversation_id` null. This research summarises why and what we can do.

**Why editor_id becomes generic**

- The MCP server sets `editor_id` from (1) the client’s `initialize` handshake (`clientInfo.name`) and (2) the env fallback `CURSOR_AGENT === "1"` (see `mcp/src/detect-editor-id.ts`).
- If the client does not send a name containing `"cursor"` and the process does not have `CURSOR_AGENT=1`, we get `generic`.
- So `generic` means: an MCP connection that did not identify as Cursor (e.g. another IDE, test harness, or a Cursor subagent whose process does not set `CURSOR_AGENT` or whose client does not send a Cursor-like name).

**Why conversation_id is null for those rows**

- `conversation_id` is only set when the caller passes it in the tool arguments. Cursor’s preToolUse hook injects it only when Cursor provides `conversation_id` in the hook stdin. If the tool call is from a subagent or another process, either (a) the preToolUse hook does not run in that context, or (b) Cursor does not supply `conversation_id` in that hook invocation, so we have nothing to inject.

**What we already support**

- The compile handler **always** accepts `conversationId` in the tool args and persists it. So any caller (script, subagent) can pass `conversationId` and it will be stored.
- So we can get `conversation_id` even when `editor_id` is generic, as long as the caller sends it.

**Options**

1. **Cursor subagents**
   - We cannot change Cursor. We can only document expectations:
     - If Cursor sets `CURSOR_AGENT=1` in the subagent’s MCP process env, we will treat it as Cursor and `editor_id` will be `cursor`.
     - If Cursor includes `conversation_id` in the preToolUse hook input for subagent tool calls, our inject hook will add it to the aic_compile args and we will persist it (even if `editor_id` stays `generic`).
   - So remaining nulls for subagent-like flows depend on Cursor’s behaviour (client name and/or `CURSOR_AGENT`, and hook input for subagent tool calls).

2. **Other MCP clients**
   - Any client can send `conversationId` in the `aic_compile` arguments; we will store it. No AIC code change required.

**Conclusion**

- Rows with `editor_id = generic` and null `conversation_id` are expected for MCP callers that do not identify as Cursor and do not pass `conversationId`.
- To get `conversation_id` (and optionally `editor_id = cursor`) for Cursor subagents, behaviour would need to come from Cursor (env and/or hook input); we already consume and persist whatever is passed.

---

### GAP-09: Visual demo (GIF/recording) in README

**Status:** Tracked — Phase R in `mvp-progress.md`
**Impact:** High — OSS browsers expect a visual demo in the first scroll; without one, many leave immediately

**What we have:** A working `aic_inspect` MCP tool and real projects to run it on.

**What we need:** A screen recording showing AIC in action inside an editor — "show aic status" and "show aic last" prompt commands. Placed at the top of the README near the one-liner.

**Action:** Phase R: Visual demo (GIF/recording) in README.

---

### GAP-10: Comparative benchmarks — AIC vs. native editor context

**Status:** Tracked — Phase R in `mvp-progress.md`
**Impact:** High — team leads evaluating AIC need to see how it compares to Cursor's built-in context selection (@codebase, @file), not just raw-to-compiled reduction

**What we have:** AIC's own token reduction numbers (98%+). Phase K benchmarks complete on single repo. No data on what editors send natively.

**What we need:** Side-by-side comparison: for the same prompt on the same project, measure (a) what Cursor sends without AIC, (b) what AIC compiles. Show file selection quality, not just token count.

**Action:** Phase R: Comparative benchmarks vs. native editor context.

---

### GAP-11: Token reduction datapoints at multiple project scales

**Status:** Tracked — Phase R in `mvp-progress.md`
**Impact:** Medium — a single datapoint from one project doesn't answer "will this help a project my size?"

**What we have:** One real-world datapoint (this project: 420M+ raw → ~7M compiled, 98%+ reduction across 900+ compilations). Phase K single-repo benchmarks complete.

**What we need:** At least three datapoints at different scales (e.g. ~50 files, ~500 files, ~5000 files) showing reduction percentages, selected file counts, and summarisation tier distribution.

**Action:** Phase R: Multi-repo benchmark suite (multi-scale datapoints).

---

## Priority Order (Phase 1.0)

Open gaps, ordered by Phase 1.0 priority. Claude Code items deprioritised (user does not currently use Claude Code).

| Priority | Gap                                         | Phase R item                             | Effort                          | Impact                                          |
| -------- | ------------------------------------------- | ---------------------------------------- | ------------------------------- | ----------------------------------------------- |
| 1        | GAP-09: Visual demo in README               | Visual demo (GIF/recording) in README    | Small (terminal recording)      | High — first-impression impact for OSS browsers |
| 2        | GAP-03: Real inspect output in README       | Real `aic_inspect` output in README      | Small (run command + docs edit) | Medium — credibility                            |
| 3        | GAP-11: Multi-scale datapoints              | Multi-repo benchmark suite               | Medium (run on multiple repos)  | Medium — "will this work on my project?"        |
| 4        | GAP-10: Comparative benchmarks              | Comparative benchmarks vs. native editor | Medium (analysis + methodology) | High — team adoption requires comparison data   |
| 5        | GAP-06: Present-tense audit of project plan | Present-tense audit of project plan      | Small (docs edit)               | Low — polish                                    |
| 6        | GAP-02: Claude Code integration layer       | Phase P + Phase Q (deprioritised)        | Large (implementation)          | High — but not needed until user adopts CC      |

### Resolved

| Gap    | Resolution                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------- |
| GAP-01 | Phase K benchmarks complete (single repo). Multi-repo tracked in Phase R (GAP-11).                |
| GAP-04 | triggerSource (Phase I), conversation tracking (Phase M), telemetry docs in README/security.md.   |
| GAP-05 | Best practices now include technical reasoning (attention degradation, compaction loss, etc.).    |
| GAP-07 | Limitations reframed as editor capability gaps. README + project plan updated.                    |
| GAP-08 | triggerSource implemented in Phase I — enum, CompilationRequest field, migration 005, MCP schema. |
