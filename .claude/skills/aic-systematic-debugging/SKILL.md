---
name: aic-systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior — before proposing fixes.
editors: all
---

# Systematic Debugging (SKILL.md)

## QUICK CARD

- **Purpose:** Find and fix bugs without guessing. Investigate root cause before proposing changes.
- **Inputs:** A bug report, a failing test, or an unexpected behaviour.
- **Outputs:** A failing regression test + a minimal fix + a post-mortem note in the PR or commit body.
- **Non-skippable steps:** Investigate → Reproduce consistently → Hypothesise + test → Write failing test → Fix → Verify.
- **Mechanical gates:**
  A red test is produced **before** the fix. Evidence: test output showing failure.
  All three gates (`pnpm typecheck && pnpm lint && pnpm test`) pass after the fix.
- **Checkpoint lines:** emit per phase; `checkpoint-log.sh`.
- **Degraded mode:** This skill is sequential and does not use subagents. Degraded mode = same skill, slower.

## Severity vocabulary (only two tiers)

- **HARD RULE** — non-negotiable; every violation means the skill was not followed.
- **GUIDANCE** — best practice.

## HARD RULES

1. **No fix without root-cause investigation.** Never propose a change before you can state the root cause in one sentence with evidence.
2. **Reproduce before fixing.** A bug you cannot reproduce deterministically is not yet understood.
3. **Write a failing test before the fix.** The test must fail without the fix and pass with it.
4. **One hypothesis at a time.** If three attempts fail, stop and question the architecture — the pattern may be wrong.
5. **Never disable a test to "make it pass".** If a test is wrong, fix the test with evidence; if a test is right, fix the code.
6. **Never add `eslint-disable` / `@ts-ignore` / `@ts-nocheck`.**
7. **Evidence before claims.** Every "fixed" / "passes" statement is backed by fresh output from this run.

## GUIDANCE

- Bisect when the bug is recent.
- Prefer a minimal repro over a full-stack repro.
- Keep the fix as close to the root cause as possible.

## Autonomous execution

Run continuously from investigation through verification. Stop only when:

- Three hypothesis-fix iterations fail → escalate (question the architecture, ask the user, or open a `documentation/research/` note).
- Root cause lies outside the repo (upstream library bug) → document the workaround, file an issue upstream.

## When to use

- Any bug report.
- Any failing test (yours or pre-existing).
- Any unexpected CI / runtime behaviour.

## When NOT to use

- Adding a new feature (use `aic-task-planner`).
- Refactoring without a bug (use `aic-task-planner`).

## Process overview (inline phases)

1. **Investigate root cause** — read the failing test output or bug report in full. Follow the stack trace to the originating call. Read the failing function and the callers. State the _presumed_ root cause in one sentence but do not fix yet. Checkpoint: `root-cause-identified`.
2. **Reproduce consistently** — build the smallest command that triggers the failure deterministically (`pnpm test <path> -t "<name>"` / `node -e "..."` / `sqlite3 ~/.aic/aic.sqlite "<query>"`). Run it three times; all three must fail the same way. If intermittent, keep investigating — it has a cause. Checkpoint: `repro-deterministic`.
3. **Hypothesise + test** — form ONE hypothesis. Design a probe that distinguishes "hypothesis true" from "hypothesis false" (add a log, run a specific query, read an intermediate value). Run the probe. Record the result. If the hypothesis fails, go back to step 1 — do not form a second hypothesis and test them in parallel. Checkpoint: `hypothesis-tested`.
4. **Write failing test** — write a test that would pass if the bug were fixed. Run it against the broken code. It must fail. Commit the test (without the fix). Checkpoint: `red-test-written`.
5. **Fix + verify** — apply the minimal change. Re-run the new test — it must pass. Run `pnpm typecheck && pnpm lint && pnpm test` — all must pass. Write a one-sentence root-cause note in the commit body. Checkpoint: `fix-verified`.

## Failure patterns

- "Fixing" a symptom by catching-and-ignoring the error.
- Modifying the test to match current (broken) behaviour.
- Accepting "intermittent" as a property of the bug — it has a cause; find it.

## Output checklist

- [ ] Root cause stated in one sentence in the commit body / PR description.
- [ ] Failing test committed alongside the fix.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass.
- [ ] Five checkpoint lines in `.aic/skill-log.jsonl`.
