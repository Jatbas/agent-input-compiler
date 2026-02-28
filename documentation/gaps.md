# AIC Documentation & Implementation Gaps

**Created:** 2026-02-27
**Updated:** 2026-02-27
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

### GAP-01: No benchmarked token reduction numbers

**Status:** Blocked (needs Phase K implementation)
**Impact:** High — the project's core value proposition is token reduction, and we have no published, reproducible numbers

**What we have:** One live test data point (303,855 raw tokens to ~8,000 compiled tokens on this project). Daily log entry from 2026-02-27.

**What we need:** Phase K benchmark suite running on multiple real-world repos across all 10 canonical tasks, with reproducible results tracked in CI.

**Action:** Complete Phase K (selection quality benchmarks + token reduction benchmarks). Until then, documentation uses "significant reduction" and "measurable reduction" without hard percentages.

---

### GAP-02: Claude Code integration layer not built

**Status:** Actionable — hook API is documented, capabilities confirmed
**Impact:** High — Claude Code's hooks solve limitations we documented as fundamental

**What we have:** Working Cursor integration layer. Confirmed Claude Code hook capabilities (see table above).

**What we need:**

1. `SessionStart` hook — compile context at session start (same as Cursor)
2. `UserPromptSubmit` hook — compile per-prompt context with `additionalContext` injection
3. `PreToolUse` hook — gate tool calls until `aic_compile` has run
4. `SubagentStart` hook — compile and inject context for subagents
5. `SessionEnd` hook — log session end for telemetry
6. `PreCompact` hook — re-compile context before compaction to preserve quality

**Action:** Build Claude Code integration layer. This is the single highest-impact item because it solves two documented limitations (per-prompt context, subagent context) that are impossible in Cursor.

---

### GAP-03: Real `aic inspect` output in README

**Status:** Actionable now
**Impact:** Medium — the README shows a synthetic example instead of real output

**What we have:** A working `aic inspect` command and a real project to run it on.

**What we need:** Run `aic inspect` on a real project, capture the output, and replace the synthetic example in the README.

**Action:** Run `aic inspect "refactor auth module"` on a benchmark repo. Replace the synthetic output in the README with real output.

---

### GAP-04: Telemetry story incomplete

**Status:** Partially resolved

**What we have:** Compilation telemetry (token counts, duration, cache hits). Prompt logging via hooks. Session-level grouping via `compilation_log.session_id` (migration 004). Cursor hooks log `conversation_id` to `.aic/prompt-log.jsonl`.

**What we need:**

1. **Telemetry source tracking** — distinguish hook-triggered compilations from model-triggered ones (Phase I: `triggerSource` field)
2. ~~**Telemetry conversation tracking** — link compilations to conversation IDs~~ **Deferred to Phase 1+.** MCP tool calls do not carry editor conversation IDs; the AI model has no mechanism to pass its conversation ID when calling `aic_compile`. Session-level grouping via `session_id` is sufficient for Phase 0.5. True conversation-level grouping requires the agentic session layer (Project Plan §2.7) or MCP protocol extensions. See KL-004 in `mvp-progress.md`.
3. Documentation explaining what these will enable (per-session cost analysis, adoption metrics)

**Action:** Item 1 is in `mvp-progress.md` Phase I. Item 2 deferred (KL-004).

---

### GAP-05: "How to Use AIC" best practices lack supporting evidence

**Status:** Can improve now with reasoning, hard data requires research
**Impact:** Low-medium — the advice is sound but unsupported

**What we have:** Common-sense AI coding best practices in the README.

**What we need:** Brief explanations of _why_ each practice works (context window mechanics, attention degradation, compaction behavior). Not academic citations, but technical reasoning.

**Action:** Add one-sentence technical justifications to each best practice in the README. These can reference known LLM behaviors (attention degradation with long contexts, compaction summarization loss, etc.).

---

### GAP-06: Project plan describes unimplemented features in present tense

**Status:** Actionable now
**Impact:** Low — a project plan is expected to describe future work, but some sections read as if features exist

**What we have:** Rules & Hooks Analyzer marked as "Planned." But other items like `EditorAdapterRegistry`, `ModelAdapterRegistry`, and `aic://rules-analysis` MCP resource are described in present tense without phase markers.

**What we need:** Audit the project plan for features described in present tense that are not yet implemented. Add phase markers where appropriate.

**Action:** Review §2.3 (Model Adapter), §8.2 (ModelClient), and §8.3 (OutputFormatter) for items that are specced but not built. These are design specifications and belong in the plan, but should be clearly distinguished from what exists today.

---

### GAP-07: Documentation inconsistency — README limitations vs Claude Code reality

**Status:** Done
**Impact:** High — the README said "no mechanism to inject context into subagent conversations" but Claude Code supports exactly this

**Resolution:** Limitations reframed as editor-specific integration gaps, not AIC limitations. README and project plan updated with editor capability comparison tables. Core pipeline described as complete, with the integration layer as the only variable.

---

### GAP-08: `triggerSource` field on CompilationRequest

**Status:** Actionable (small implementation)
**Impact:** Medium — enables telemetry to distinguish how compilations are triggered

**What we have:** `CompilationRequest` has `editorId` but no indication of what triggered the compilation.

**What we need:** An optional `triggerSource` field on `CompilationRequest` with values like `"session_start"`, `"prompt_submit"`, `"tool_gate"`, `"subagent_start"`, `"cli"`, `"model_initiated"`. This field is metadata — the pipeline ignores it, telemetry records it.

**Implementation:**

1. Add `TRIGGER_SOURCE` enum to `shared/src/core/types/enums.ts`
2. Add optional `triggerSource?: TriggerSource` to `CompilationRequest`
3. Add `triggerSource` column to telemetry event (nullable for backward compat)
4. Hook scripts pass the appropriate source when calling `aic_compile`
5. MCP schema gains optional `triggerSource` field

No core pipeline changes. Pipeline steps ignore the field. Only the telemetry logger reads it.

---

## Priority Order

| Priority | Gap                                           | Effort                          | Impact                                           |
| -------- | --------------------------------------------- | ------------------------------- | ------------------------------------------------ |
| 1        | GAP-02: Build Claude Code integration layer   | Large (implementation)          | High — enables per-prompt + subagent compilation |
| 2        | GAP-01: Benchmark token reduction numbers     | Large (Phase K)                 | High — core value proposition                    |
| 3        | GAP-08: `triggerSource` on CompilationRequest | Small (implementation)          | Medium — telemetry quality                       |
| 4        | GAP-04: Telemetry story                       | Medium (implementation + docs)  | Medium — completeness                            |
| 5        | GAP-03: Real inspect output                   | Small (run command + docs edit) | Medium — credibility                             |
| 6        | GAP-06: Present-tense audit of project plan   | Small (docs edit)               | Low — polish                                     |

### Resolved

| Gap    | Resolution                                                                                    |
| ------ | --------------------------------------------------------------------------------------------- |
| GAP-05 | Best practices now include technical reasoning (attention degradation, compaction loss, etc.) |
| GAP-07 | Limitations reframed as editor capability gaps. README + project plan updated.                |
