# Skill Eval — golden-test harness

`skill-eval.cjs` is an agent-in-the-loop test runner. You can't make it invoke an LLM — that's the agent's job — but you can use it to:

1. Stage a test case so the agent has a well-defined input.
2. Verify the agent's produced output against a rubric of deterministic checks.
3. Record pass/fail in a reproducible, diffable format.

Everything runs locally; no network.

## Files

| File                                       | Purpose                                               |
| ------------------------------------------ | ----------------------------------------------------- |
| `shared/scripts/skill-eval.cjs`            | CLI.                                                  |
| `<skill>/test-cases/<case-id>/input.md`    | The user request (what would be pasted into chat).    |
| `<skill>/test-cases/<case-id>/expected.md` | The approved canonical output (for diff and context). |
| `<skill>/test-cases/<case-id>/rubric.md`   | HARD and SOFT checks as shell commands.               |
| `<skill>/test-cases/<case-id>/context/`    | Optional fixture files the agent needs to read.       |
| `.aic/evals/<eval-id>/`                    | Per-run staging area (input + rubric copies).         |
| `.aic/evals/<eval-id>.json`                | Run state and final report.                           |

## Workflow

1. Operator runs `skill-eval prepare <skill> <case-id>`. The CLI prints an `eval-id` and the staged paths.
2. Operator (or orchestrator) instructs the agent: _"Execute `<skill>` against `.aic/evals/<eval-id>/input.md`. Write the output to `<chosen-path>`."_ Agent runs under the runner or inline.
3. Operator runs `skill-eval verify <eval-id> --output <chosen-path>`. The CLI executes every HARD-check and every SOFT-check command in the rubric, writes the report, exits 0 on HARD-all-pass else 1.

No hidden network calls; the CLI is deterministic.

## Rubric format

Rubrics are Markdown files with two HTML-comment-delimited fenced blocks that the CLI extracts:

````md
# Rubric for <case>

## HARD checks

<!-- hard-checks -->

```bash
grep -q "## Acceptance criteria" "$OUTPUT"
! grep -qiE "\bmight\b|\bprobably\b" "$OUTPUT"
bash .claude/skills/shared/scripts/ambiguity-scan.sh "$OUTPUT"
```

## SOFT checks

<!-- soft-checks -->

```bash
diff -q "$EXPECTED" "$OUTPUT" || true
```
````

Substituted variables inside each block:

- `$OUTPUT` — absolute path of the produced output.
- `$EXPECTED` — absolute path of `expected.md`.
- `$STAGE` — absolute path of the per-run staging directory.
- `$PROJECT_ROOT` — absolute path to the project root.

Every line is a separate shell command. A command that exits non-zero counts as a failed check.

## What makes a good test case

- **Small, decisive input.** One request that exercises the most common path for the skill.
- **Realistic expected.md.** Written from a real approved artifact, not invented.
- **Mechanically checkable HARD rubric.** Every check is a shell command that exits deterministically. Avoid tautological checks such as `grep -q .` that always pass on any non-empty file.
- **Rubric covers the failure modes.** If the skill's common failure is "forgets to cite evidence", the rubric must explicitly test for citations.

## What NOT to do

- Don't put semantic judgement in HARD checks (`grep "good"`). Put those in SOFT as a hint to reviewers.
- Don't assume the agent wrote to an exact path; require `--output` as a parameter.
- Don't compare byte-for-byte against `expected.md` in HARD. Output will vary; structure should not.

## Commands

| Command                                       | Effect                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| `skill-eval list <skill>`                     | Print case IDs.                                                            |
| `skill-eval cases <skill>`                    | Print case directories.                                                    |
| `skill-eval prepare <skill> <case-id>`        | Stage input + rubric under `.aic/evals/<eval-id>/` and print instructions. |
| `skill-eval verify <eval-id> --output <path>` | Run checks and write a report. Exit 0 if all HARD pass.                    |
| `skill-eval rubrics <skill>`                  | Print every HARD-check block across cases (useful for review).             |

## Composing with the runner

A single eval run can drive the runner:

```
node skill-eval.cjs prepare aic-researcher 001-cold-start-latency
# agent executes aic-researcher phase by phase via skill-run.cjs
# agent writes synthesis.md to .aic/evals/<eval-id>/synthesis.md
node skill-eval.cjs verify <eval-id> --output .aic/evals/<eval-id>/synthesis.md
```

This gives you: (a) the runner ensures every phase ran, (b) the eval harness scores the final artifact. Together they are a reproducible regression gate.
