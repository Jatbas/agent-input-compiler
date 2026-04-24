# aic-code-audit Phase BUGS Example

## Header Block Update

Append this sentence to the existing header paragraph before the `---` separator:

`**Audit 2026-04-24:** Found 3 defects (1 Critical, 1 High, 1 Medium) in shared/src/storage — see Phase BUGS.`

## Findings

- `shared/src/pipeline/compilation-runner.ts:42` — Critical null dereference in the budget fallback path; blast radius includes `shared/src/core/run-pipeline-steps.ts`, `shared/src/pipeline/__tests__/compilation-runner.test.ts`, and `mcp/src/compile-handler.ts`.
- `shared/src/adapters/foo-adapter.ts:12` — High deterministic-time invariant violation from direct `Date.now()` use; chain covers three adapter/storage call sites.
- `shared/src/storage/compilation-log-store.ts:88` — Medium missing `project_id` predicate on a per-project query; blast radius includes the store and its regression test.

## Phase BUGS — Discovered Defects

| Bug                | Severity | Blast Radius                                                       | Evidence                                         | Status     | Next Skill                 | Description                                                                            |
| ------------------ | -------- | ------------------------------------------------------------------ | ------------------------------------------------ | ---------- | -------------------------- | -------------------------------------------------------------------------------------- |
| BUGS-01            | Critical | 4 files: `compilation-runner.ts`, `run-pipeline-steps.ts`, 2 tests | `shared/src/pipeline/compilation-runner.ts:42`   | Discovered | `aic-systematic-debugging` | Null dereference when budget returns 0 — caller chain unguarded                        |
| BUGS-02 (chain: 3) | High     | 9 files in `adapters/` and `storage/`                              | `shared/src/adapters/foo-adapter.ts:12`          | Discovered | `aic-task-planner`         | `Date.now()` called directly — Clock not injected; BUGS-02a–BUGS-02c are the sub-sites |
| BUGS-03            | Medium   | 2 files: `compilation-log-store.ts`, its test                      | `shared/src/storage/compilation-log-store.ts:88` | Discovered | `aic-task-planner`         | Missing `project_id` scope in `compilation_log` query                                  |

## Discarded Candidates

- `shared/src/storage/sqlite-status-store.ts:101` — Not registered: query is global summary scope, so the missing per-project predicate is intentional and documented by the caller contract.
