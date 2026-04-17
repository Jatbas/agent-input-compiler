# Canonical skill examples — index

Every skill has an `examples/` directory containing at least one approved canonical output. Before producing any output, the agent reads the matching example and imitates its structure. Examples are curated — do not edit without review.

## Contents

| Skill                      | Example                                                         | Status    |
| -------------------------- | --------------------------------------------------------------- | --------- |
| `aic-task-planner`         | `aic-task-planner/examples/adapter-task-example.md`             | canonical |
| `aic-task-planner`         | `aic-task-planner/examples/fix-patch-task-example.md`           | canonical |
| `aic-task-planner`         | `aic-task-planner/examples/storage-task-example.md`             | TODO      |
| `aic-researcher`           | `aic-researcher/examples/codebase-analysis-example.md`          | canonical |
| `aic-researcher`           | `aic-researcher/examples/technology-evaluation-example.md`      | TODO      |
| `aic-documentation-writer` | `aic-documentation-writer/examples/target-text-edit-example.md` | canonical |
| `aic-documentation-writer` | `aic-documentation-writer/examples/doc-audit-example.md`        | TODO      |
| `aic-task-executor`        | `aic-task-executor/examples/executor-run-example.md`            | TODO      |
| `aic-pr-review`            | `aic-pr-review/examples/review-summary-example.md`              | TODO      |
| `aic-release`              | `aic-release/examples/release-log-example.md`                   | TODO      |
| `aic-git-history-clean`    | `aic-git-history-clean/examples/clean-plan-example.tsv`         | TODO      |
| `aic-systematic-debugging` | `aic-systematic-debugging/examples/debug-log-example.md`        | TODO      |
| `aic-update-changelog`     | `aic-update-changelog/examples/changelog-entry-example.md`      | TODO      |
| `aic-update-progress`      | `aic-update-progress/examples/progress-update-example.md`       | TODO      |
| `aic-roadmap-forge`        | `aic-roadmap-forge/examples/roadmap-entry-example.md`           | TODO      |

## How examples are used

- **Before writing output:** the agent reads the matching example (HARD rule in every `SKILL.md`).
- **During review:** critics may cite the example as the reference structure — a defect is "deviates from `examples/X.md` without justification."
- **During eval:** `skill-eval.cjs` may diff generated output against the example's structural markers (headings, required sections, label vocabulary).

## Rules for authoring examples

1. Must be **realistic** — derived from a real approved artifact, not invented.
2. Must pass every mechanical gate the skill applies to real output — ambiguity-scan, evidence-scan, and any skill-specific validator such as `validate-task.sh` or `changelog-format-check.sh`.
3. Must include all mandatory sections — examples doubling as structural templates.
4. If the output varies by mode / recipe / classification, author one example per mode.
5. Keep comments out of the body — examples are read as the artifact, not annotated tutorials. Put explanatory notes in a single "Why this example" paragraph at the bottom.
6. Never include secrets, PII, or private file paths. When a real artifact contains such tokens, replace them with `<redacted>` before committing the example.
