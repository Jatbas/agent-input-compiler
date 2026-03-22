# Contributor agent skills

This document is for developers working on AIC.

Procedures for repository development live under `.claude/skills/` as Agent Skill packages. Each skill package is a folder whose entry point is `SKILL.md`. The `shared/` folder is different: it holds `.claude/skills/shared/SKILL-investigation.md` for cross-skill rules and is not a standalone package with its own `SKILL.md`.

> Using those skills is optional.

## Glossary

| Term         | Definition                                                                                                                                                                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task file    | Planner output under `documentation/tasks/`. Separate from the end-user habit “one task, one session” in [Best practices](best-practices.md).                                                                                                                                                                    |
| Git worktree | An extra working tree created with `git worktree` (used by the executor skill). Unrelated to Claude Code hook events `WorktreeCreate` and `WorktreeRemove` in [Claude Code integration layer](technical/claude-code-integration-layer.md) (lifecycle hooks, currently out of scope for AIC — not Git worktrees). |

## Skill packages under `.claude/skills/`

Use each skill for its intended role (see the table below) to get the best output.

Some skills add files beside `SKILL.md`: the task planner includes `SKILL-recipes.md` and `SKILL-guardrails.md`; the documentation-writer includes `SKILL-dimensions.md`, `SKILL-standards.md`, and `SKILL-policies.md`; the researcher includes `SKILL-protocols.md`.

| Skill folder               | Type        | Role                                                                                                                                                                   |
| -------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aic-task-planner`         | Delegatable | Produces task files under `documentation/tasks/` with steps, tests, and acceptance criteria. Can be used for new features, bug fixes and questions about the codebase. |
| `aic-task-executor`        | Delegatable | Implements work from those task files, or ad-hoc requests, using **Git worktree** isolation and mechanical verification.                                               |
| `aic-researcher`           | Delegatable | Evidence-backed investigation; writes notes under `documentation/research/`.                                                                                           |
| `aic-documentation-writer` | Delegatable | Documentation pipeline: exploration, change specifications, adversarial review. It is able to research documentation and the codebase.                                 |
| `aic-update-mvp-progress`  | Internal    | Updates `documentation/tasks/progress/mvp-progress.md` after implementation work.                                                                                      |
| `aic-update-changelog`     | Internal    | Updates root `CHANGELOG.md` for user-facing releases and milestones.                                                                                                   |
| `aic-git-history-clean`    | Internal    | Squashes dev-noise commits in unpushed history with date preservation; rewrites published history on explicit request.                                                 |
| `aic-release`              | Internal    | Full release orchestration: codebase validation, documentation audit, history check, roadmap update, changelog, and publish.                                           |

Skills marked **Internal** are developer workflow tools — they require your judgment and must not be invoked autonomously by an agent. Skills marked **Delegatable** are safe to assign to agents as part of a planned task.

> Task files under `documentation/tasks/` are **gitignored** (local to your machine). They are not part of the published tree; the planner and executor skills define how to create and use them.

## Why use them

Agent-oriented skills define pre-reads, verification steps, and when to run parallel subagents via the Task or subagent mechanism instead of folding that work into one model response. Internal-only skills document human-driven workflows with explicit confirmations; invoke them directly rather than chaining them from other skills (see the table and each skill’s audience note).

> Ad-hoc work without these skills often omits Git worktree rules, doc and code parity checks, or multi-agent steps the repo authors rely on for consistent output.

## Typical flows

### Plan then execute

Run the task planner to produce a task file, then run the task executor on that file.

### Research then plan

Run the researcher when the question needs deep codebase or external evidence. Point the planner at the resulting file under `documentation/research/`, or follow the planner skill when it delegates to research.

### Documentation changes

For documentation-heavy tasks, the task planner documentation recipe delegates to the documentation-writer skill.

> The executor runs a second documentation-writer review pass after applying doc edits.

### Clean git history (optional)

Use before a release or a first public push when recent commits are noisy (for example `wip`, `fixup!`, or short throwaway subjects). Prefer unpushed-only cleanup unless you are intentionally rewriting published history. Full steps and safety gates are in `.claude/skills/aic-git-history-clean/SKILL.md`.

### Publish a release

When you are ready to publish a new version, follow `.claude/skills/aic-release/SKILL.md` from the repository root on `main` with a clean working tree. Do not run it from a Git worktree. When a step reports a blocker, resolve it and start the skill again from the top; some steps ask for confirmation instead of failing the run. For noisy commit history, prefer **Clean git history (optional)** above first; `aic-release` still reviews recent subjects and can pause for cleanup.

## See also

- [Installation & delivery](installation.md) — MCP server, hooks, development environment
- [Cursor integration layer](technical/cursor-integration-layer.md)
- [Claude Code integration layer](technical/claude-code-integration-layer.md)
- [CONTRIBUTING.md](../CONTRIBUTING.md) — clone, install, tests, PR expectations
- [Best practices](best-practices.md) — session habits for people using AIC as a product
- [MVP progress](tasks/progress/mvp-progress.md) — includes notes on relocating skills to `.claude/skills/`
