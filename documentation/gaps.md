# AIC Documentation & Implementation Gaps

**Created:** 2026-02-27
**Updated:** 2026-03-04 (Phase 1.0 cross-reference)
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

**Status:** Tracked — Phase S (hook-based delivery) + Phase T (zero-install) in `mvp-progress.md`
**Impact:** High — Claude Code's hooks solve limitations we documented as fundamental

**What we have:** Working Cursor integration layer. Confirmed Claude Code hook capabilities (see table above). Basic Claude Code hooks exist in `.claude/hooks/` but lack full delivery and zero-install.

**What we need:**

1. `UserPromptSubmit` hook — compile per-prompt context with `additionalContext` injection
2. `SubagentStart` hook — compile and inject context for subagents
3. `PreCompaction` hook — re-compile context before compaction
4. `SessionEnd` hook — session lifecycle telemetry
5. Editor detection and auto-install for Claude Code artifacts

**Action:** Phase S + Phase T in `mvp-progress.md`. Deprioritised — user does not currently use Claude Code.

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

### GAP-12: conversation_id null for some compilations

**Context:** Some `compilation_log` rows have `conversation_id` null. Editor_id is resolved (preToolUse hook + server fallback + session cache). This gap is about conversation_id only.

**Data flow (conversation_id)**

- `conversation_id` is set only when the **caller** includes `conversationId` in the tool arguments. The compile handler passes it through (after validation). So the only source is who injects or passes it:
  - **Model-triggered (main chat):** Cursor runs the preToolUse hook before the tool call. Our hook reads `conversation_id` from hook stdin and adds it to `updated_input` as `conversationId` for aic_compile. Cursor then uses that as the actual tool arguments.
  - **Session-start:** The session-start hook passes `sessionId` as `conversationId` when Cursor provides `session_id` in the sessionStart hook stdin.
  - **Any other caller:** Scripts, tests, or subagents can pass `conversationId` in the aic_compile args; we persist it.

**Why conversation_id is null**

- If the preToolUse hook does not run (e.g. subagent path), or Cursor does not supply `conversation_id` in that hook invocation, we have nothing to inject. We cannot tell "caller did not pass" from "Cursor did not supply to hook" from the row alone; both yield null.

**What we do (conversation_id)**

- We inject `conversationId` in the preToolUse hook whenever Cursor supplies `conversation_id` in the hook input. We do **not** cache `conversationId` (so multiple Cursor chats never get mixed). We cannot synthesise `conversation_id` on our side — we only persist what the caller sends.

**Downstream impact when conversation_id is null**

- `getConversationSummary(conversationId)` and the "show aic chat summary" flow only see rows with that `conversation_id`; null rows are excluded from per-conversation aggregates.
- Adaptive budget by session history (Task 090) uses conversation-level token usage; compilations with null `conversation_id` do not contribute to that conversation’s history. Nulls are acceptable for "unknown conversation" but mean those features have no data for that compilation.

**Conclusion**

- Null `conversation_id` is expected when the caller does not pass it (e.g. session-start when Cursor omits `session_id`, scripts, tests, or a Cursor path where the hook did not run or Cursor did not supply `conversation_id`). For Cursor subagents, getting `conversation_id` depends on Cursor including it in the preToolUse hook input; we already consume and persist whatever is passed.

---

## Priority Order (Phase 1.0)

Open gaps, ordered by Phase 1.0 priority. Claude Code items deprioritised (user does not currently use Claude Code).

| Priority | Gap                            | Current tracked item               | Effort                          | Impact                                          |
| -------- | ------------------------------ | ---------------------------------- | ------------------------------- | ----------------------------------------------- |
| 1        | GAP-09: Visual demo in README  | Phase V visual demo in README      | Small (terminal recording)      | High — first-impression impact for OSS browsers |
| 2        | GAP-11: Multi-scale datapoints | Phase V multi-repo benchmark suite | Medium (run on multiple repos)  | Medium — "will this work on my project?"        |
| 3        | GAP-10: Comparative benchmarks | Phase V native-context comparison  | Medium (analysis + methodology) | High — team adoption requires comparison data   |

| 5 | GAP-02: Claude Code integration layer | Phase T + Phase U (deprioritised) | Large (implementation) | High — but not needed until user adopts CC |
