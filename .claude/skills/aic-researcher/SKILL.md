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
3. **Dispatch a framing challenger BEFORE explorers, and gate on its verdict.** Use `.claude/skills/shared/prompts/framing-challenger.md`. The challenger runs first in Phase 2 (not in parallel with explorers). Its JSON verdict (`sound | mis-framed | partially-framed`) gates Phase 3 — on `mis-framed`, stop and present reframing options to the user before dispatching explorers. On `partially-framed`, update the investigation plan before dispatching. See `SKILL-phase-2-frame.md §2e`.
4. **Spawn a synthesis critic after the draft.** Use `prompts/synthesis-critic.md`. Address every HARD finding before finalising.
5. **No speculation.** If evidence does not exist, say so explicitly and stop.
6. **Double-blind critic pass.** The critic receives: the original question, the draft synthesis, the cited sources, and the framing challenger's verdict JSON. The critic does NOT receive: the §2 hypotheses, the investigation plan, the explorer assignments, or the raw explorer reports. The critic re-verifies each citation by reading the actual source, not by re-reading explorer summaries.
7. **Framing soundness is a routed decision.** The framing-challenger subagent MUST be dispatched with the strongest available model using `.claude/skills/shared/prompts/ask-stronger-model.md`. See `.claude/skills/shared/SKILL-routing.md`. Explorers run on `fast`; this rule applies to the framing challenger only.
8. **Before writing the synthesis,** read the canonical example at `examples/codebase-analysis-example.md` and imitate its structure — framing section, findings-ranked-by-contribution, disconfirmation outcomes, leverage-ordered recommendations, gaps.

## GUIDANCE

- Start with the broadest search and narrow as evidence accumulates.
- Prefer runtime evidence (`pnpm ...`, `sqlite3 ...`) over static reading when a question is about behaviour.
- Keep notes ≤ 300 lines; split into sub-notes when longer.

## Autonomous execution

Run phases continuously from classification through finalisation. The only stops are:

- **Framing challenger reports `mis-framed`** (Phase 2 §2e) → summarise the reframing options and ask the user to pick before dispatching explorers.
- **Critic reports HARD findings that require user input to resolve** (Phase 4 `SKILL-phase-4-synthesize.md §5b`) → present the finding and wait.
- **End-of-run presentation** (Phase 6 §6e) → after the document is saved, print the summary block and wait for the user's follow-up (e.g. "add to roadmap" / "plan tasks"). This is the natural end-of-skill handoff, not a mid-run pause.

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

| Phase                                            | File                           | Checkpoint               |
| ------------------------------------------------ | ------------------------------ | ------------------------ |
| 2. Frame + classify + framing-challenger gate    | `SKILL-phase-2-frame.md`       | `framed`                 |
| 3. Investigate (parallel explorers)              | `SKILL-phase-3-investigate.md` | `investigation-complete` |
| 4. Synthesize + adversarial review (critic pass) | `SKILL-phase-4-synthesize.md`  | `synthesis-finalised`    |
| 6. Finalize + document                           | `SKILL-phase-6-finalize.md`    | `research-finalised`     |
| — Protocols reference                            | `SKILL-protocols.md`           | —                        |

The framing challenger runs inside Phase 2 — before explorers — because its verdict gates Phase 3 dispatch. The critic pass runs inside Phase 4 — after the draft, dispatch `.claude/skills/aic-researcher/prompts/synthesis-critic.md` as an independent subagent (with the inputs defined in HARD RULE 6), apply every HARD finding, and only then checkpoint `synthesis-finalised`.

At every phase exit: emit checkpoint line + call `checkpoint-log.sh`.

## Subagent dispatch (canonical template usage)

For every subagent you spawn:

1. Open the prompt template (`.claude/skills/aic-researcher/prompts/explorer.md`, `.claude/skills/aic-researcher/prompts/synthesis-critic.md`, or `.claude/skills/shared/prompts/framing-challenger.md` — the framing challenger lives in the shared prompt set, not under this skill).
2. Substitute every `{{placeholder}}`. Record the substituted prompt under `.aic/runs/<run-id>/subagent-prompts/` (scratch, cleaned on finalisation). Never write rendered prompts under `documentation/`.
3. Verify no `{{` remains: `grep -q "{{" <rendered-prompt>` must be empty.
4. Dispatch.
5. Parse the subagent's `CHECKPOINT:` and `EVIDENCE:` header before reading the body. If the header is missing, re-dispatch — the subagent did not follow contract.

## Failure patterns

- Writing the synthesis before the critic pass lands.
- Accepting a finding without a citation.
- Letting the critic read explorer reports (breaks double-blind).
- Hedge words creeping into the final note (`ambiguity-scan` catches these).

## Output checklist

- [ ] Research note exists at `documentation/research/<slug>.md` (the only kept artifact).
- [ ] `evidence-scan.sh` passes.
- [ ] `ambiguity-scan.sh` passes.
- [ ] Four checkpoint lines in `.aic/skill-log.jsonl` (`framed`, `investigation-complete`, `synthesis-finalised`, `research-finalised`).
- [ ] Every explorer report, critic report, and rendered subagent prompt lived under `.aic/runs/<run-id>/` — never under `documentation/`.
- [ ] On run-complete: scratch at `.aic/runs/<run-id>/` is removed (auto under the runner, or `skill-run.cjs cleanup <run-id>`, or `rm -rf .aic/runs/<run-id>/`).

## Scratch & cleanup

- Keep the final synthesis (`documentation/research/<slug>.md`). Every explorer report, critic report, rendered subagent prompt, and intermediate draft MUST live under `.aic/runs/<run-id>/`.
- Under the runner, `advance` on the final phase auto-removes the scratch dir + state file. Pass `--keep-artifacts` to retain for debugging; run `skill-run.cjs cleanup <run-id>` when done.
- Inline (no runner): remove `.aic/runs/<run-id>/` once the research note is accepted.
