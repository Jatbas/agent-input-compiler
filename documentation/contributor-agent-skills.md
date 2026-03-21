# Contributor agent skills

This document is for developers working on AIC.

Procedures for repository development live under `.claude/skills/` as Agent Skill packages (one folder per skill, each with a `SKILL.md` entry point).

> Using those skills is optional.

## Glossary

| Term         | Definition                                                                                                                                                                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task file    | Planner output under `documentation/tasks/`. Separate from the end-user habit “one task, one session” in [Best practices](best-practices.md).                                                                                                                                                                    |
| Git worktree | An extra working tree created with `git worktree` (used by the executor skill). Unrelated to Claude Code hook events `WorktreeCreate` and `WorktreeRemove` in [Claude Code integration layer](technical/claude-code-integration-layer.md) (lifecycle hooks, currently out of scope for AIC — not Git worktrees). |

## Skill packages under `.claude/skills/`

Use each skill for its intended role (see the table below) to get the best output.

Some skills add files beside `SKILL.md`: the task planner includes `SKILL-recipes.md` and `SKILL-guardrails.md`; the documentation-writer includes `SKILL-dimensions.md`, `SKILL-standards.md`, and `SKILL-policies.md`; the researcher includes `SKILL-protocols.md`.

Shared investigation rules used by several skills are in `.claude/skills/shared/SKILL-investigation.md`.

| Skill folder               | Role                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aic-task-planner`         | Produces task files under `documentation/tasks/` with steps, tests, and acceptance criteria. Can be used for new features, bug fixes and questions about the codebase. |
| `aic-task-executor`        | Implements work from those task files, or ad-hoc requests, using **Git worktree** isolation and mechanical verification.                                               |
| `aic-researcher`           | Evidence-backed investigation; writes notes under `documentation/research/`.                                                                                           |
| `aic-documentation-writer` | Documentation pipeline: exploration, change specifications, adversarial review. It is able to research documentation and the codebase.                                 |
| `aic-update-mvp-progress`  | Updates `documentation/tasks/progress/mvp-progress.md` after implementation work.                                                                                      |
| `aic-update-changelog`     | Updates root `CHANGELOG.md` for user-facing releases and milestones.                                                                                                   |

> Task files under `documentation/tasks/` are **gitignored** (local to your machine). They are not part of the published tree; the planner and executor skills define how to create and use them.

## Why use them

Each `SKILL.md` defines pre-reads, verification steps, and when to run parallel subagents via the Task or subagent mechanism instead of folding that work into one model response.

> Ad-hoc work without these skills often omits Git worktree rules, doc and code parity checks, or multi-agent steps the repo authors rely on for consistent output.

## Typical flows

### Plan then execute

Run the task planner to produce a task file, then run the task executor on that file.

### Research then plan

Run the researcher when the question needs deep codebase or external evidence. Point the planner at the resulting file under `documentation/research/`, or follow the planner skill when it delegates to research.

### Documentation changes

For documentation-heavy tasks, the task planner documentation recipe delegates to the documentation-writer skill.

> The executor runs a second documentation-writer review pass after applying doc edits.

## See also

- [Installation & delivery](installation.md) — MCP server, hooks, development environment
- [Cursor integration layer](technical/cursor-integration-layer.md)
- [Claude Code integration layer](technical/claude-code-integration-layer.md)
- [CONTRIBUTING.md](../CONTRIBUTING.md) — clone, install, tests, PR expectations
- [Best practices](best-practices.md) — session habits for people using AIC as a product
- [MVP progress](documentation/tasks/progress/mvp-progress.md) — includes notes on relocating skills to `.claude/skills/`
