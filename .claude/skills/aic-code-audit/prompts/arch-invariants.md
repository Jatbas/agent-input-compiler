# Code Audit — architecture & invariants subagent

You are scanning files for architectural violations, type-safety defects, and determinism/immutability bugs in the AIC codebase.

## Input

- Scope files: `{{SCOPE_FILES}}`
- Static analysis output (pre-read for context): `{{STATIC_OUTPUT_PATH}}`
- Output path: `{{OUTPUT_PATH}}`

## Before you start

1. Read the file at `{{STATIC_OUTPUT_PATH}}`. Every error listed there is a pre-confirmed finding candidate — carry it forward into your confirmed findings unless you can disprove it.
2. Read `.claude/skills/aic-pr-review/SKILL-checklist.md` dimensions A (architecture), T (type safety), D (determinism & immutability) in full. Run every check in those dimensions against the scope files. Do not re-derive the checks from memory.

## How to scan

Prioritize static-analysis hits, production files, boundary files, and high-risk directories before tests or leaf utilities. For each check below, grep and read the relevant code. Only report findings you can confirm with a direct `file:line` citation. If the scope is too large for the budget, list skipped partitions in the Pass list as "not inspected" rather than claiming they passed.

## Checks

### A — Architecture & Layering (A1–A12)

- `core/` and `pipeline/` import nothing from `adapters/`, `storage/`, `mcp/`, Node built-ins, or external packages
- Core interfaces use domain language — no SQL, HTTP, or filesystem concepts
- One public method per class; one class per file
- One interface per `*.interface.ts`; max 5 methods per interface (ISP)
- Pipeline constructors: `private readonly` only, no public params, no concrete classes
- No exported interfaces inside pipeline files
- Max 60 lines per function in pipeline
- No `new` for infrastructure outside composition root (`mcp/src/server.ts`)
- Each external library wrapped by exactly one adapter file
- No if/else-if chains with 3+ branches — must use dispatch pattern
- New capabilities via new classes, never modifying existing pipeline (OCP)

### T — Type Safety (T1–T12)

- No `any`
- Explicit return types on all functions
- Domain values use branded types from `core/types/` — never raw `string`/`number`
- `as const` objects for enums — no TypeScript `enum` keyword
- No `as string`, `as number`, `as boolean` on branded values
- No `as unknown as T` double-cast (only `open-database.ts` exempt)
- No `!` non-null assertions — use optional chaining or null guards
- No `Partial<T>` in core/pipeline
- No `{ x } as Type` object literal assertions
- No `for...in`, default exports, `Object.assign`, nested ternaries
- Named imports only for internal modules; `import *` only for Node built-ins and whitelisted libs
- Validation (Zod) only at MCP handler/config boundary — never in core/pipeline

### D — Determinism & Immutability (D1–D5)

- No `Date.now()`, `new Date()`, `Math.random()` outside `system-clock.ts`
- No `date('now')` or `datetime('now')` in SQL — timestamps bound from `Clock`
- No mutating array methods: `.push`, `.splice`, `.sort`, `.reverse`, `.pop`, `.shift`, `.unshift`
- No `let` in production code except boolean flags in imperative closures
- Pipeline steps return new objects — never mutate inputs

## Budget

Hard cap: {{BUDGET}}.

## Output

Write to `{{OUTPUT_PATH}}`:

```
CHECKPOINT: aic-code-audit/arch-invariants — complete
EVIDENCE: <N> citations | BUDGET: used/total

## Confirmed findings
- [<file:line>] <violation> — Dim: <A1/T3/D2/…> — <one-line description>

## Systemic patterns
- <same violation type> in N files: [list file names]

## Pass list
- <dimension or sub-check confirmed clean>

## Discarded candidates
- [<file:line>] <why this is not a real finding>
```
