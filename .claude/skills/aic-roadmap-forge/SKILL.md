---
name: aic-roadmap-forge
description: Generates new phases and roadmap entries for the progress file by synthesizing documentation, codebase analysis, and external research through adversarial multi-agent review.
editors: all (Cursor Composer / Agent recommended for full fidelity)
---

# Roadmap Forge (SKILL.md)

## QUICK CARD

- **Purpose:** Propose the next phase(s) for `aic-progress.md`, backed by evidence and reviewed adversarially.
- **Inputs:** Progress file, project plan, implementation spec, optional external research target.
- **Outputs:** Approved phases merged into `documentation/tasks/progress/aic-progress.md` (the only kept deliverable). The proposal draft, explorer reports, and critic reports are scratch under `.aic/runs/<run-id>/` and removed on run-complete. Pass `--keep-artifacts` to retain for debugging.
- **Non-skippable steps:** Intake → Explore (3 mandatory explorers + optional Explorer 4 when Tier 3 is active or a Tier 2 document has a Roadmap Mapping section — see Phase 3) → Synthesise proposal → Critic round (feasibility + strategic-fit) → User gate → Finalise.
- **Mechanical gates:**
  `bash .claude/skills/shared/scripts/evidence-scan.sh <proposal>` — every claim cited.
  `bash .claude/skills/shared/scripts/ambiguity-scan.sh <proposal>` — no hedge words.
- **Checkpoint lines:** emit per phase; `checkpoint-log.sh`.
- **Degraded mode:** Run explorer prompts sequentially as the single agent. The critic prompts still run as independent passes — do not collapse them.

## Severity vocabulary (only two tiers)

- **HARD RULE** — enforced by script or explicitly listed below.
- **GUIDANCE** — best practice.

## HARD RULES

1. **Dispatch three explorers (plus Explorer 4 when applicable) and two critics.** Explorer 1 gap analyst, Explorer 2 optimization analyst, Explorer 3 ecosystem scout are always spawned in parallel. Explorer 4 (specific document deep-read) is spawned per Phase 3 spawn rule (Tier 3 always; Tier 2 if a document has a Roadmap Mapping section). Then Critic A feasibility + Critic B strategic-fit in parallel.
2. **Every proposal item cites evidence.** `doc:line`, `file:line`, telemetry query, or URL.
3. **Critics run on the draft proposal + raw explorer output tables — never on §4 synthesis prose.** The double-blind stance is against the synthesis author's reasoning, not the explorers' structured findings: critics re-score and challenge the proposal by comparing it back to the explorer tables (see Phase 5 §5 "Synthesis-vs-evidence check"). Never forward §4 reasoning narrative, §4i self-review output, or `{{proposal draft}}` prose-only summaries to critics.
4. **Feasibility HARD findings block inclusion.** A roadmap item flagged HARD must be reworked or cut.
5. **No new phase without a measurable success criterion.** A proposal item without a metric is HARD.

## GUIDANCE

- Prefer phases with 3-6 tasks; larger phases are hard to track.
- When two ideas conflict, propose both with the trade-off documented — let the user choose.
- Cross-reference existing phases by name, not by internal ID, to avoid drift.

## Autonomous execution

Run phases 0 → 3 → 4 → 5 continuously. Do not pause between phases to summarise — emit the checkpoint and move on. The only points you stop and wait for the user are:

- **Evidence-density gate failure (Phase 4 §4a).** Fewer than 1 citation per finding on average and the weakest explorer has already been re-spawned once. Stop, report which explorer underperformed and what was missed, and ask whether to proceed with degraded evidence or retry with a narrower scope.
- **Re-spawn cap hit (Phase 3).** An explorer has been re-spawned 3 times without meeting the citation / format floor — report the gap and ask whether to drop that explorer or accept degraded input.
- **Convergence unresolved (Phase 5 §5b).** Convergence is flagged, the targeted re-spawn ran, and the re-spawn still produced no unique findings _and_ the user asked for non-obvious candidates. Surface the convergence warning and ask whether to continue into §6 or switch input tier.
- **Zero strategic phase candidates survive adversarial review (Phase 4 §4e).** Announce and ask whether to proceed with Category A only, switch to Tier 2/3 input, or abort.
- **User approval gate (Phase 6 §6).** Always stop here. Present the proposal in the prescribed two-category format and wait for Approve / Approve specific / Request changes / Mixed / Reject.
- **Phase collision or freshness mismatch (Phase 6 §7 pre-write checks).** Another process changed `aic-progress.md` mid-run or a phase letter collides — stop and ask for resolution before writing.

On a clean run where none of the above triggers, Phase 6 §7 writes the approved phases to `aic-progress.md` immediately after the user approves — do not re-confirm after approval.

## When to use

- Before starting a major new initiative.
- When the progress file is near-complete and the next direction is unclear.
- Periodic roadmap review (e.g. quarterly).

## When NOT to use

- Fixing the current sprint (use `aic-task-planner`).
- Answering a single research question (use `aic-researcher`).

## Inputs

- `documentation/tasks/progress/aic-progress.md` (gitignored; fall back to user input if absent).
- `documentation/project-plan.md`.
- `documentation/implementation-spec.md`.
- Optional external source URLs.

## Process overview (phase dispatch)

| Phase                                                                                       | File                           | Checkpoint          |
| ------------------------------------------------------------------------------------------- | ------------------------------ | ------------------- |
| 0. Frame + intake                                                                           | `SKILL-phase-0-frame.md`       | `intake-complete`   |
| 3. Investigate (3 mandatory + 1 conditional parallel explorers)                             | `SKILL-phase-3-investigate.md` | `explore-complete`  |
| 4. Synthesize proposal (includes §4i self-review)                                           | `SKILL-phase-4-synthesize.md`  | `proposal-drafted`  |
| 5. Review (feasibility + strategic-fit critics in parallel, plus §5b convergence detection) | `SKILL-phase-5-review.md`      | `critique-complete` |
| 6. Present to user + §7 write into progress file                                            | `SKILL-phase-6-present.md`     | `roadmap-updated`   |
| — Scoring reference                                                                         | `SKILL-scoring.md`             | —                   |

Five phases, five checkpoints. Phase numbers 1 and 2 are intentionally unused — they are reserved for runner alignment and clarity (not "missing").

## Subagent dispatch

Templates in `prompts/`:

- `explorer-gap.md`, `explorer-optimization.md`, `explorer-ecosystem.md` — three parallel explorers (always).
- `explorer-deep-read.md` — conditional 4th explorer (deep-read); spawn rule defined in `SKILL-phase-3-investigate.md` §Explorer 4.
- `critic-feasibility.md`, `critic-strategic-fit.md` — two critics, always spawned in parallel after §4.

If a template filename differs from the above in `prompts/`, trust the file on disk but keep the role mapping here aligned.

## Failure patterns

- Skipping the ecosystem scout → roadmap drifts from industry state.
- Accepting a proposal item without a metric.
- Proposing phases larger than the planner can fit into 3-6 tasks.

## Output checklist

- [ ] Proposal draft written to `.aic/runs/<run-id>/proposal.md` during the run (canonical scratch location).
- [ ] Three (or four, if Explorer 4 spawned) explorer reports under `.aic/runs/<run-id>/explorers/`.
- [ ] Two critic reports under `.aic/runs/<run-id>/critics/`.
- [ ] `evidence-scan.sh` passes on the proposal.
- [ ] `ambiguity-scan.sh` passes on the proposal.
- [ ] `aic-progress.md` updated with the approved phases (after user gate).
- [ ] **Five** checkpoint lines in `.aic/skill-log.jsonl` (`intake-complete`, `explore-complete`, `proposal-drafted`, `critique-complete`, `roadmap-updated`).
- [ ] **Context-recovery save (conditional):** if Phase 6 triggered the context-recovery save (session > 8 tool calls AND proposal > 2,000 tokens), a copy also exists at `documentation/tasks/forge-draft-[YYYY-MM-DD].md`. This is a recovery artifact, not the canonical output — the scratch copy at `.aic/runs/<run-id>/proposal.md` remains authoritative until the user approves and §7 writes to `aic-progress.md`.
- [ ] On run-complete: scratch at `.aic/runs/<run-id>/` is removed (auto under the runner, or `skill-run.cjs cleanup <run-id>`).
