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
- **Non-skippable steps:** Classify mode → Route → Explore (subagents) → Write Change Specification → Apply edits → Critic round (editorial + factual + cross-doc always; reader if user-facing/mixed) → Audit-completeness critic (audit mode only, double-blind) → Finalise.
- **Mechanical gates:**
  `bash .claude/skills/shared/scripts/ambiguity-scan.sh <doc>` per touched file.
  `bash .claude/skills/shared/scripts/evidence-scan.sh <doc>` on any doc that makes claims about code.
- **Checkpoint lines:** Emit at each phase boundary + `checkpoint-log.sh`.
- **Degraded mode:** If no subagent dispatch is available, run the same critic prompts sequentially as self-review. Apply each prompt in a separate pass — do not collapse them into one "general review".

## Severity vocabulary (only two tiers)

- **HARD RULE** — enforced by script or by explicit rules in §HARD RULES.
- **GUIDANCE** — best practice.

## HARD RULES

1. **Dispatch the critics.** Editorial + factual + cross-doc are always dispatched. Reader is conditional (see rule 1a). Audit completeness (`critic-audit.md`) is dispatched in **audit mode only** (see Phase 3 §3b Critic 5). Every critic has its own prompt template in `prompts/`.
   1a. **Reader critic is conditional.** Spawn `critic-reader.md` only for user-facing documents (installation guides, getting started docs, user-facing READMEs) and for mixed-audience documents where Explorer 3 flagged user-facing sections. Skip for pure developer references (implementation specs, project plans, architecture docs). See Phase 3 §3b Critic 4 for the exact scoping rule.
2. **Double-blind audit completeness.** In audit mode, `critic-audit.md` is dispatched without the explorer findings or other critics' reports — only the Structured Audit Report and the document. Keep it independent.
3. **Evidence for every factual claim.** `evidence-scan.sh` is the referee.
4. **No reference to internal task/phase IDs in non-planning docs.** `T123`, `AK02`, `Phase L` style codes must not appear in normal or prescriptive documents. **Exception — planning documents** (`documentation/project-plan.md` and any doc classified as planning in `SKILL-policies.md §Planning documents`): phase names and sequencing labels are structural content, not internal codes. The phase-name grep is skipped there; the task-ID grep still applies.
5. **No code changes.** This skill writes docs only. If a doc describes broken behaviour, flag it and hand off — do not fix the code.
6. **Deduplicate.** If a concept is already defined elsewhere, cross-reference; do not redefine.
7. **Never paraphrase a template.** Use `{{placeholder}}` substitution; verify no `{{` remains before dispatching a subagent.
8. **Factual-claim verdicts are routed.** The factual critic's per-claim verdict (`VERIFIED | NOT FOUND | CONTRADICTED | UNCERTAIN` — the four tokens used throughout Phase 3 §3b Critic 2 and §3e) MUST be produced by a subagent rendered from `.claude/skills/shared/prompts/ask-stronger-model.md` with the strongest available model. See `.claude/skills/shared/SKILL-routing.md`. **This overrides any `fast`-model hint in the Phase 3 Critic 2 template**: when the critic emits the per-claim verdict, that sub-step runs on the strongest available model. The surrounding exploration and inventory work (grep, table filling) MAY still run on `fast` inside the same subagent for latency.
9. **Before writing the Change Specification,** read the canonical example at `examples/target-text-edit-example.md` and imitate its structure — per-change blocks with current/required/rationale/evidence, cross-reference map, mechanical gates as shell commands.

## GUIDANCE

- Keep paragraphs ≤ 8 sentences; split longer.
- Prefer a table over prose for structured data.
- Lead every doc with who/what/when (the lede).

## Autonomous execution

Run phases continuously. Do not pause between phases to summarise; emit checkpoint lines and move on. The only points you stop and wait for the user are:

- **Prescriptive-document contradiction (HARD RULE 5).** Any critic (Critic 2 factual, Critic 3 cross-doc, double-blind reconciliation in §3e) finds a contradiction between a prescriptive document — `project-plan.md`, `implementation-spec.md`, architecture, security — and the code. Stop, report both locations, ask the user how to proceed. Never edit a prescriptive document autonomously to match code.
- **Unresolvable factual claim.** After the allowed revision loops (`SKILL-phase-3-review.md §3f`, max 2 loops), Critic 2 still reports `NOT FOUND` or `CONTRADICTED` for a claim and investigation cannot resolve it — escalate to `aic-researcher` and wait for its answer. `UNCERTAIN` claims that survive are moved to Open Questions, not a stop.
- **Scope ambiguity surfaced mid-run.** Phase 1 analysis or a critic reveals that the requested change touches documents outside the initial target set in a way that requires a user decision (e.g. sibling document is authoritative and wrong).
- **Finalize gate failure.** Phase 4 `ambiguity-scan.sh` / `evidence-scan.sh` / HARD RULE 4 grep fails and the failure cannot be fixed by a bounded edit on the touched documents.

Fully clean runs (all critics address their findings, mechanical gates pass, no prescriptive contradiction) proceed through Phase 4 finalize without asking. Present the final Change Specification + list of touched files at the end.

## When to use

- Writing new user-facing docs.
- Modifying existing docs (README, documentation/, .claude/_.md, .cursor/rules/_.mdc).
- Auditing docs for staleness or drift.

## When NOT to use

- Code comments (use short inline `//` comments in the code).
- Task files (use `aic-task-planner`).
- CHANGELOG (use `aic-update-changelog`).

## Process overview (phase dispatch)

| Phase                                                                                                                                          | File                       | Checkpoint          |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------- |
| 1. Analyze (classify mode + route + explore via subagents)                                                                                     | `SKILL-phase-1-analyze.md` | `analysis-complete` |
| 2. Write (Change Specification + apply edits)                                                                                                  | `SKILL-phase-2-write.md`   | `write-complete`    |
| 3. Review (editorial + factual + cross-doc always; reader if user-facing/mixed; audit-completeness if audit mode — all dispatched in parallel) | `SKILL-phase-3-review.md`  | `review-complete`   |
| 4. Verify (mechanical gates + finalise; direct-invocation only — planner/executor skip this phase and run their own gates)                     | `SKILL-phase-4-verify.md`  | `verify-complete`   |
| — Policies reference                                                                                                                           | `SKILL-policies.md`        | —                   |
| — Standards reference                                                                                                                          | `SKILL-standards.md`       | —                   |
| — Dimensions reference                                                                                                                         | `SKILL-dimensions.md`      | —                   |

## Subagent dispatch

Templates in `prompts/`:

- `explorer.md` — used 4× with `{{DIMENSION}}` in {accuracy, completeness, consistency, readability}. Dispatched in Phase 1.
- `critic-editorial.md`, `critic-factual.md`, `critic-crossdoc.md` — dispatched in parallel in Phase 3 (§3b Critics 1–3), always.
- `critic-reader.md` — dispatched in parallel in Phase 3 (§3b Critic 4) **only for user-facing or mixed-audience documents** (see HARD RULE 1a).
- `critic-audit.md` — dispatched in Phase 3 (§3b Critic 5) **audit mode only**, with the double-blind input scope defined in HARD RULE 2.

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
- [ ] Four checkpoint lines in `.aic/skill-log.jsonl` (`analysis-complete`, `write-complete`, `review-complete`, `verify-complete`).
- [ ] No internal task IDs (`T123`, `AK02`) in any touched file, and no phase-name codes in non-planning documents (HARD RULE 4 exception applies to planning docs).
- [ ] On run-complete: scratch at `.aic/runs/<run-id>/` is removed (auto under the runner; otherwise `node .claude/skills/shared/scripts/skill-run.cjs cleanup <run-id>` or `rm -rf .aic/runs/<run-id>/`).

## Scratch & cleanup

- Every intermediate artifact (Change Specification draft, per-critic reports, rendered subagent prompts) MUST live under `.aic/runs/<run-id>/`. Never write scratch to `documentation/`.
- Under the runner (`skill-run.cjs`), `advance` on the final phase auto-removes the scratch dir + state file. Pass `--keep-artifacts` to retain them for debugging, then `skill-run.cjs cleanup <run-id>` when done.
- Without the runner, treat the slug as `<run-id>` and remove the directory manually once the user accepts the edits.
