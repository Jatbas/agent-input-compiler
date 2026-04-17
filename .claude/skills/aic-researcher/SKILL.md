---
name: aic-researcher
description: Evidence-backed research via multi-agent protocols; writes documentation/research/ for standalone answers or task-planner input.
editors: all (Cursor Composer / Agent recommended for full fidelity)
---

# Researcher (SKILL.md)

## QUICK CARD

- **Purpose:** Answer a question with citations. Never guess. Always dispatch parallel explorers.
- **Inputs:** A user question, the project root, and (optionally) a task the research will feed.
- **Outputs:** A research note in `documentation/research/<slug>.md` with inline citations. When the research precedes a task, the note is passed to `aic-task-planner`.
- **Non-skippable steps:** Classify → Dispatch explorers + framing challenger → Synthesise → Critic pass → Finalise.
- **Mechanical gates:**
  `bash .claude/skills/shared/scripts/evidence-scan.sh <research-note>` — every finding must cite a source.
  `bash .claude/skills/shared/scripts/ambiguity-scan.sh <research-note>` — remove hedge words before finalising.
- **Checkpoint lines:** After each phase, `CHECKPOINT: aic-researcher/<phase> — complete` + `checkpoint-log.sh`.
- **Degraded mode (no subagent API):** If the executing environment cannot spawn subagents, run the same explorer prompts (`prompts/explorer.md`) sequentially as the single agent, writing each explorer report to a separate file. The synthesis and critic steps still run, but you must pay extra attention to disconfirmation since you authored the findings.

## Severity vocabulary (only two tiers)

- **HARD RULE** — enforced by a script or by the reply contract (missing citation, missing disconfirmation, missing checkpoint).
- **GUIDANCE** — best practice.

## HARD RULES

1. **Every finding has a citation.** `file:line`, `rg` output, DB query, or URL. The `evidence-scan.sh` script is the referee.
2. **Dispatch 2-4 parallel explorers.** Use `prompts/explorer.md`. Substitute every `{{placeholder}}` before dispatch.
3. **Dispatch a framing challenger.** Use `shared/prompts/framing-challenger.md`. Its output gates the rest of the skill — if framing is mis-framed, re-scope before continuing.
4. **Spawn a synthesis critic after the draft.** Use `prompts/synthesis-critic.md`. Address every HARD finding before finalising.
5. **No speculation.** If evidence does not exist, say so explicitly and stop.
6. **Double-blind critic pass.** The critic must not read explorer reports during the critique — only the draft and its cited sources.
7. **Framing soundness is a routed decision.** The framing-challenger subagent MUST be dispatched with the strongest available model using `../shared/prompts/ask-stronger-model.md`. Its JSON verdict (`sound | mis-framed | partially-framed`) gates the investigation phase. See `../shared/SKILL-routing.md`.
8. **Before writing the synthesis,** read the canonical example at `examples/codebase-analysis-example.md` and imitate its structure — framing section, findings-ranked-by-contribution, disconfirmation outcomes, leverage-ordered recommendations, gaps.

## GUIDANCE

- Start with the broadest search and narrow as evidence accumulates.
- Prefer runtime evidence (`pnpm ...`, `sqlite3 ...`) over static reading when a question is about behaviour.
- Keep notes ≤ 300 lines; split into sub-notes when longer.

## Autonomous execution

Run phases continuously from classification through finalisation. The only stop is:

- Framing challenger reports "mis-framed" → summarise the reframing options and ask the user to pick.
- A critic reports HARD findings that require user input to resolve.

## When to use

- Standalone research questions.
- Pre-planning research that will feed `aic-task-planner`.
- Validating a hypothesis before coding.

## When NOT to use

- Single-file reads (just read the file).
- Questions that can be answered by one grep (just grep).
- PR review (use `aic-pr-review`).

## Inputs

- User question.
- `{{PROJECT_ROOT}}`.
- `documentation/` and `shared/src/` as read surface.

## Process overview (phase dispatch)

| Phase                               | File                           | Checkpoint               |
| ----------------------------------- | ------------------------------ | ------------------------ |
| 2. Frame + classify                 | `SKILL-phase-2-frame.md`       | `framed`                 |
| 3. Investigate (parallel subagents) | `SKILL-phase-3-investigate.md` | `investigation-complete` |
| 4. Synthesize (synth + critic pass) | `SKILL-phase-4-synthesize.md`  | `synthesis-finalised`    |
| 6. Finalize                         | `SKILL-phase-6-finalize.md`    | `research-finalised`     |
| — Protocols reference               | `SKILL-protocols.md`           | —                        |

The critic pass runs inside Phase 4 — after the draft, dispatch `prompts/synthesis-critic.md` as an independent subagent, apply every HARD finding, and only then checkpoint `synthesis-finalised`.

At every phase exit: emit checkpoint line + call `checkpoint-log.sh`.

## Subagent dispatch (canonical template usage)

For every subagent you spawn:

1. Open the prompt template (`prompts/explorer.md`, `prompts/synthesis-critic.md`, or `shared/prompts/framing-challenger.md`).
2. Substitute every `{{placeholder}}`. Record the substituted prompt in your notes under `documentation/research/<slug>/subagent-prompts/`.
3. Verify no `{{` remains: `grep -q "{{" <rendered-prompt>` must be empty.
4. Dispatch.
5. Parse the subagent's `CHECKPOINT:` and `EVIDENCE:` header before reading the body. If the header is missing, re-dispatch — the subagent did not follow contract.

## Failure patterns

- Writing the synthesis before the critic pass lands.
- Accepting a finding without a citation.
- Letting the critic read explorer reports (breaks double-blind).
- Hedge words creeping into the final note (`ambiguity-scan` catches these).

## Output checklist

- [ ] Research note exists at `documentation/research/<slug>.md`.
- [ ] `evidence-scan.sh` passes.
- [ ] `ambiguity-scan.sh` passes.
- [ ] Six checkpoint lines in `.aic/skill-log.jsonl`.
- [ ] Every explorer and critic report archived under `documentation/research/<slug>/`.
