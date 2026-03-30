# PR Review Checklist

Reference checklist for the `aic-pr-review` skill. Each dimension maps to a rule file in `.cursor/rules/`. Reviewers should cite the dimension code (e.g. **A3**, **T2**) when reporting findings.

## A — Architecture & Layering

| ID  | Check                                                                                                           | Rule           |
| --- | --------------------------------------------------------------------------------------------------------------- | -------------- |
| A1  | `core/` and `pipeline/` have zero imports from `adapters/`, `storage/`, `mcp/`, Node APIs, or external packages | AIC-pipeline   |
| A2  | Core interfaces use domain language — no SQL, HTTP, or file-system concepts                                     | AIC-interfaces |
| A3  | One public method per class; one class per file                                                                 | AIC-architect  |
| A4  | One interface per `*.interface.ts` file; max 5 methods per interface (ISP)                                      | AIC-interfaces |
| A5  | Pipeline constructors receive only interfaces via `private readonly` — no concrete classes, no `public` params  | AIC-pipeline   |
| A6  | No exported interfaces inside pipeline files — extract to `core/interfaces/`                                    | AIC-pipeline   |
| A7  | Max 60 lines per function in pipeline                                                                           | AIC-pipeline   |
| A8  | No `new` for infrastructure outside composition root (`mcp/src/server.ts`)                                      | AIC-architect  |
| A9  | Each external library wrapped by exactly one adapter/storage file                                               | AIC-architect  |
| A10 | No if/else-if with 3+ branches — use dispatch pattern (`Record<Enum, Handler>`)                                 | AIC-architect  |
| A11 | New capabilities via new classes, never modifying existing pipeline classes (OCP)                               | AIC-architect  |
| A12 | Events via `PipelineEventBus` — no direct `TelemetryLogger` calls from steps                                    | AIC-pipeline   |

## T — Type Safety

| ID  | Check                                                                                             | Rule            |
| --- | ------------------------------------------------------------------------------------------------- | --------------- |
| T1  | No `any` anywhere                                                                                 | AIC-type-safety |
| T2  | Explicit return types on all functions                                                            | AIC-type-safety |
| T3  | Domain values use branded types from `core/types/` — never raw `string`/`number`                  | AIC-type-safety |
| T4  | `as const` objects for enums — no TypeScript `enum` keyword                                       | AIC-type-safety |
| T5  | No `as string`, `as number`, `as boolean` on branded values                                       | AIC-type-safety |
| T6  | No `as unknown as T` double-cast (only `open-database.ts` exempt)                                 | AIC-type-safety |
| T7  | No `!` non-null assertions — use optional chaining or null guards                                 | AIC-type-safety |
| T8  | No `Partial<T>` in core/pipeline production code                                                  | AIC-type-safety |
| T9  | No `{ x } as Type` — use type annotations instead                                                 | AIC-type-safety |
| T10 | No `for...in`, default exports, `Object.assign`, nested ternaries                                 | AIC-type-safety |
| T11 | Named imports only for internal modules — `import *` only for Node built-ins and whitelisted libs | AIC-architect   |
| T12 | Validation (Zod) only at MCP handler / config boundary — never in core/pipeline                   | AIC-type-safety |

## E — Error Handling

| ID  | Check                                                                                   | Rule       |
| --- | --------------------------------------------------------------------------------------- | ---------- |
| E1  | No bare `throw new Error(...)` — use `AicError` subclasses with `code` property         | AIC-errors |
| E2  | Pipeline: no catch-and-ignore; no try/catch for control flow (only wrap external calls) | AIC-errors |
| E3  | Composition root catches and maps to MCP codes; no crash on bad request                 | AIC-errors |
| E4  | MCP error responses: no stack traces, internal paths, env details, or `.aic/` paths     | AIC-errors |
| E5  | EventBus subscriber throws → log warn, continue other subscribers, no rethrow           | AIC-errors |

## D — Determinism & Immutability

| ID  | Check                                                                                             | Rule          |
| --- | ------------------------------------------------------------------------------------------------- | ------------- |
| D1  | No `Date.now()`, `new Date()`, `Math.random()` (only `system-clock.ts` exempt)                    | AIC-architect |
| D2  | No `date('now')` or `datetime('now')` in SQL — bind time from `Clock`                             | AIC-storage   |
| D3  | No mutating array methods (`.push`, `.splice`, `.sort`, `.reverse`, `.pop`, `.shift`, `.unshift`) | AIC-architect |
| D4  | `const` only — no `let` except boolean flags in imperative closures                               | AIC-architect |
| D5  | Pipeline steps return new objects — never mutate inputs                                           | AIC-pipeline  |

## S — Storage & SQL

| ID  | Check                                                                              | Rule          |
| --- | ---------------------------------------------------------------------------------- | ------------- |
| S1  | All SQL exclusively in `shared/src/storage/`                                       | AIC-storage   |
| S2  | Schema changes have a migration in `shared/src/storage/migrations/`                | AIC-storage   |
| S3  | No raw DDL outside `MigrationRunner`; never edit merged migrations                 | AIC-storage   |
| S4  | DB opened only in composition roots; storage receives DB via constructor injection | AIC-storage   |
| S5  | Entity PKs use UUIDv7 `TEXT(36)` — never `INTEGER AUTOINCREMENT`                   | AIC-architect |
| S6  | Timestamps: `YYYY-MM-DDTHH:mm:ss.sssZ` via `Clock` / `ISOTimestamp`                | AIC-architect |
| S7  | Per-project data scoped with `project_id` in queries                               | AIC-storage   |

## X — Security & Privacy

| ID  | Check                                                                 | Rule          |
| --- | --------------------------------------------------------------------- | ------------- |
| X1  | No hardcoded API keys, tokens, or credentials                         | AIC-architect |
| X2  | Config uses env var names (`apiKeyEnv`), never values                 | AIC-architect |
| X3  | Logs redact secrets with `***`                                        | AIC-architect |
| X4  | Telemetry: no paths, content, prompts, intents, project names, or PII | AIC-architect |
| X5  | `.aic/` directory: 0700, gitignored, no symlink traversal             | AIC-architect |
| X6  | Context Guard never-include patterns intact and non-overridable       | AIC-pipeline  |
| X7  | No secrets in SQLite/cache data                                       | AIC-storage   |

## V — Testing

| ID  | Check                                                    | Rule      |
| --- | -------------------------------------------------------- | --------- |
| V1  | Tests co-located in `__tests__/` with `*.test.ts` naming | AIC-tests |
| V2  | Unit tests mock interfaces only — no `any` in mocks      | AIC-tests |
| V3  | No shared mutable state between tests                    | AIC-tests |
| V4  | Bug fixes include a regression test                      | AIC-tests |
| V5  | Coverage of edge cases and error paths                   | AIC-tests |
| V6  | Golden snapshots for output contracts where appropriate  | AIC-tests |

## C — Conventions & Style

| ID  | Check                                                                              | Rule          |
| --- | ---------------------------------------------------------------------------------- | ------------- |
| C1  | `//` comments only — no `/* */` or `/** */`                                        | AIC-architect |
| C2  | Comments explain _why_, not _what_ — no narrating comments                         | AIC-architect |
| C3  | All `.ts` files use kebab-case naming                                              | AIC-architect |
| C4  | Interfaces: `*.interface.ts`; tests: `*.test.ts`; migrations: `NNN-description.ts` | AIC-architect |
| C5  | No `eslint-disable`, `@ts-ignore`, or `@ts-nocheck`                                | AIC-architect |
| C6  | Commit format: `type(scope): description` — max 72 chars, imperative, no period    | AIC-architect |
| C7  | Dependencies pinned exact — no `^` or `~`                                          | AIC-architect |
| C8  | One runtime dependency per PR with justification                                   | AIC-architect |

## P — Process & Contribution (from CONTRIBUTING.md)

| ID  | Check                                                                                                                                                            | Source                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| P1  | Branch name follows `(kind) name/short-slug` — kinds: `feature`, `fix`, `chore`, `docs`, `refactor`, `test`                                                      | CONTRIBUTING.md §Branches     |
| P2  | `RFC.md` on the branch when change affects architecture, pipeline behavior, rule enforcement, guardrails/security, editor integration, or public config/workflow | CONTRIBUTING.md §RFC          |
| P3  | Changes are narrowly scoped — no unrelated changes bundled                                                                                                       | CONTRIBUTING.md §Expectations |
| P4  | Deterministic behavior preserved — no weakening of local-first guarantees, guardrails, or logging boundaries without discussion                                  | CONTRIBUTING.md §Expectations |
| P5  | No editor-specific assumptions introduced into the core pipeline                                                                                                 | CONTRIBUTING.md §Checklist    |
| P6  | PR description explains motivation and scope clearly                                                                                                             | CONTRIBUTING.md §Checklist    |
| P7  | Documentation updated when changing commands, config, workflow, or other user-visible behavior                                                                   | CONTRIBUTING.md §Expectations |
| P8  | New behavior is covered by tests                                                                                                                                 | CONTRIBUTING.md §Checklist    |
| P9  | `pnpm lint`, `pnpm test`, and `pnpm knip` (if relevant) all pass                                                                                                 | CONTRIBUTING.md §Checklist    |
