---
name: aic-documentation-writer
description: Multi-agent documentation pipeline—exploration, Change Specifications, adversarial review, and double-blind factual checks.
editors: all (Cursor Composer / Agent recommended for full fidelity)
---

# Documentation Writer (SKILL.md)

## QUICK CARD

- **Purpose:** Produce or modify documentation with evidence-backed claims, structural integrity, and cross-doc consistency.
- **Inputs:** One or more documentation targets in `documentation/` or `README.md`; user intent (write, modify, or audit).
- **Outputs:** Updated doc files (the only user-facing deliverable). The change specification and critic reports are scratch artifacts written to `.aic/runs/<run-id>/` and deleted on run-complete. Use `--keep-artifacts` if you need to inspect them after finalisation.
- **Non-skippable steps:** Classify mode → Route → Explore (subagents) → Write Change Specification → Apply edits → Critic round (editorial / factual / cross-doc / reader) → Audit pass (double-blind) → Finalise.
- **Mechanical gates:**
  `bash .claude/skills/shared/scripts/ambiguity-scan.sh <doc>` per touched file.
  `bash .claude/skills/shared/scripts/evidence-scan.sh <doc>` on any doc that makes claims about code.
- **Checkpoint lines:** Emit at each phase boundary + `checkpoint-log.sh`.
- **Degraded mode:** If no subagent dispatch is available, run the same critic prompts sequentially as self-review. Apply each prompt in a separate pass — do not collapse them into one "general review".

## Severity vocabulary (only two tiers)

- **HARD RULE** — enforced by script or by explicit rules in §HARD RULES.
- **GUIDANCE** — best practice.

## HARD RULES

1. **Dispatch the critics.** Editorial + factual + cross-doc + reader + audit — each with its own prompt template in `prompts/`.
2. **Double-blind audit.** The audit critic does NOT read other critic reports. Dispatch it independently.
3. **Evidence for every factual claim.** `evidence-scan.sh` is the referee.
4. **No reference to internal task/phase IDs in docs.** Docs are user-facing; `T123`, `Phase L`, `AK02` must not appear.
5. **No code changes.** This skill writes docs only. If a doc describes broken behaviour, flag it and hand off — do not fix the code.
6. **Deduplicate.** If a concept is already defined elsewhere, cross-reference; do not redefine.
7. **Never paraphrase a template.** Use `{{placeholder}}` substitution; verify no `{{` remains before dispatching a subagent.
8. **Factual-claim verdicts are routed.** The factual critic's per-claim verdict (`confirmed | contradicted | unverifiable`) MUST be produced by a subagent rendered from `../shared/prompts/ask-stronger-model.md` with the strongest available model. See `../shared/SKILL-routing.md`.
9. **Before writing the Change Specification,** read the canonical example at `examples/target-text-edit-example.md` and imitate its structure — per-change blocks with current/required/rationale/evidence, cross-reference map, mechanical gates as shell commands.

## GUIDANCE

- Keep paragraphs ≤ 8 sentences; split longer.
- Prefer a table over prose for structured data.
- Lead every doc with who/what/when (the lede).

## Autonomous execution

Run phases continuously. Stop only when:

- Critic reports HARD findings that require user input (scope decision, contradiction between sources).
- Exploration reveals the doc depends on a factual question — escalate to `aic-researcher` and wait.

## When to use

- Writing new user-facing docs.
- Modifying existing docs (README, documentation/, .claude/_.md, .cursor/rules/_.mdc).
- Auditing docs for staleness or drift.

## When NOT to use

- Code comments (use short inline `//` comments in the code).
- Task files (use `aic-task-planner`).
- CHANGELOG (use `aic-update-changelog`).

## Process overview (phase dispatch)

| Phase                                                                    | File                       | Checkpoint          |
| ------------------------------------------------------------------------ | -------------------------- | ------------------- |
| 1. Analyze (classify mode + route + explore via subagents)               | `SKILL-phase-1-analyze.md` | `analysis-complete` |
| 2. Write (Change Specification + apply edits)                            | `SKILL-phase-2-write.md`   | `write-complete`    |
| 3. Review (editorial / factual / cross-doc / reader critics in parallel) | `SKILL-phase-3-review.md`  | `review-complete`   |
| 4. Verify (double-blind audit + finalise)                                | `SKILL-phase-4-verify.md`  | `verify-complete`   |
| — Policies reference                                                     | `SKILL-policies.md`        | —                   |
| — Standards reference                                                    | `SKILL-standards.md`       | —                   |
| — Dimensions reference                                                   | `SKILL-dimensions.md`      | —                   |

## Subagent dispatch

Templates in `prompts/`:

- `explorer.md` — used 4× with `{{DIMENSION}}` in {accuracy, completeness, consistency, readability}.
- `critic-editorial.md`, `critic-factual.md`, `critic-crossdoc.md`, `critic-reader.md` — dispatched in parallel after edits are applied.
- `critic-audit.md` — dispatched alone, double-blind.

Substitute every `{{placeholder}}` before dispatch. Verify with `grep -q "{{" <rendered>` = empty.

## Failure patterns

- Writing before exploring (the Change Specification has no evidence).
- Letting the audit critic read other critics' reports (breaks double-blind).
- Applying edits before critic findings are addressed.
- Slipping `Phase X` / `Task N` codes into user-facing docs.

## Output checklist

- [ ] All critic reports written to `.aic/runs/<run-id>/critics/` while running; none under `documentation/`.
- [ ] `ambiguity-scan.sh` passes for each touched doc.
- [ ] `evidence-scan.sh` passes for any doc making code-related claims.
- [ ] Eight checkpoint lines in `.aic/skill-log.jsonl`.
- [ ] No internal codes (`T123`, `Phase L`) in any touched file.
- [ ] On run-complete: scratch at `.aic/runs/<run-id>/` is removed (auto under the runner; otherwise `node .claude/skills/shared/scripts/skill-run.cjs cleanup <run-id>` or `rm -rf .aic/runs/<run-id>/`).

## Scratch & cleanup

- Every intermediate artifact (Change Specification draft, per-critic reports, rendered subagent prompts) MUST live under `.aic/runs/<run-id>/`. Never write scratch to `documentation/`.
- Under the runner (`skill-run.cjs`), `advance` on the final phase auto-removes the scratch dir + state file. Pass `--keep-artifacts` to retain them for debugging, then `skill-run.cjs cleanup <run-id>` when done.
- Without the runner, treat the slug as `<run-id>` and remove the directory manually once the user accepts the edits.
