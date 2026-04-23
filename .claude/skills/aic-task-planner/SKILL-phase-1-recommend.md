# Phase 1: Recommend the Best Next Task

## Pre-read all inputs in one parallel batch

- `documentation/tasks/progress/aic-progress.md` (read from main workspace — gitignored)
- `documentation/project-plan.md`
- `documentation/implementation-spec.md`
- `documentation/security.md`
- `.cursor/rules/aic-architect.mdc`
- `shared/package.json`
- `eslint.config.mjs`
- `SKILL-recipes.md` (this file's sibling — static reference)
- `SKILL-guardrails.md` (this file's sibling — static reference)
- Research document from `documentation/research/` (optional — include if §0b produced one, or if the user provided a path)

## Rank unblocked components

From `documentation/tasks/progress/aic-progress.md`, identify all components with status `Not started` whose dependencies are `Done`.

**Rank** unblocked components (priority order):

1. **Pattern-setter:** First of its kind in current phase → highest rank (establishes conventions for siblings).
2. **Implicit prerequisites:** Unblocks the most downstream work → higher rank.
3. **Phase table order:** Row order in progress file reflects intended sequence.

## Present the result

> **Recommended next:** [component name] — [one-line why it ranks first]
>
> **Alternatives** (ranked):
>
> 1. [component] — [one-line description]
> 2. [component] — [one-line description]
>    ...
>
> **"Go with the recommendation, pick an alternative, or tell me something else."**

Do NOT proceed until the user picks.

## User picks a non-optimal task

If the user picks a component — either from the alternatives list or by naming one directly (e.g. "plan task X") — and it does **not** rank first, warn before proceeding:

> **Heads up:** [picked component] ranks #N. The recommended task is **[top-ranked component]** because [one-line reason].
>
> Picking [picked component] first means [concrete consequence: e.g. "you'll establish the CLI pattern in a less central command" or "the compile command will have to be written without this foundation"].
>
> **Switch to the recommendation, or continue with your pick?**

Wait for confirmation. If the user confirms their pick, proceed to Pass 1 with that component.

---

## Emit the `task-picked` checkpoint

Run this exactly after the user has picked a component — substitute the picked component name (kebab-case, e.g. `quality-snapshot-store`):

```
echo "CHECKPOINT: aic-task-planner/task-picked — complete"
bash .claude/skills/shared/scripts/checkpoint-log.sh \
  aic-task-planner task-picked <component-name>
```

`checkpoint-log.sh` rejects this emission with exit 3 if fewer than 1 second has elapsed since the last `setup-complete`. Do not batch — emit `setup-complete` when §0 finishes, and emit `task-picked` only after the user has actually confirmed a pick.

**Phase complete.** Read `SKILL-phase-2-explore.md` and execute it immediately.
