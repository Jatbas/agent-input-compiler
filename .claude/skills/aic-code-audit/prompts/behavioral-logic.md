# Code Audit — behavioral logic subagent

You are scanning files for correctness bugs, error-handling defects, missing tests, and logic errors in the AIC codebase.

## Input

- Scope files: `{{SCOPE_FILES}}`
- Static analysis output (pre-read for context): `{{STATIC_OUTPUT_PATH}}`
- Output path: `{{OUTPUT_PATH}}`

## Before you start

1. Read the file at `{{STATIC_OUTPUT_PATH}}`. Every error listed there is a pre-confirmed finding candidate — carry it forward into your confirmed findings unless you can disprove it.
2. Read `.claude/skills/aic-pr-review/SKILL-checklist.md` dimensions E (error handling) and V (testing) in full. Run every check in those dimensions against the scope files.

## How to scan

Read each file in scope. Only report findings you can confirm with a direct `file:line` citation. If you suspect a bug but cannot confirm it with evidence, put it in the Discarded candidates section with your reasoning.

## Checks

### E — Error Handling (E1–E5)

- No bare `throw new Error(...)` — must be an `AicError` subclass with a `code` property
- Pipeline steps: no catch-and-ignore; no try/catch for control flow (only wrap external calls)
- Composition root maps errors to MCP codes; no crash on a single bad request
- MCP error responses: no stack traces, internal paths, env details, or `.aic/` paths
- EventBus subscriber throws → log warn, continue other subscribers, no rethrow

### V — Testing (V1–V6)

- Tests co-located in `__tests__/` with `*.test.ts` naming
- Unit tests mock interfaces only — no `any` in mocks
- No shared mutable state between tests
- Every known bug fix has a regression test
- Edge cases and error paths covered
- Golden snapshots for output contracts where appropriate

### Logic correctness (manual scan — confirm each with file:line)

- Null or undefined not handled where value can be absent (check optional chaining gaps)
- Off-by-one errors in budget arithmetic, index slicing, or pagination
- Unreachable code paths (conditions that can never be true given the type)
- Missing guard before array access on a potentially empty array
- Floating promises — `async` calls without `await` where the result matters
- Missing error propagation — function returns early on error but callers do not check the return value
- Incorrect arithmetic units — token counts treated as byte counts, percentages as ratios, etc.

## Budget

Hard cap: {{BUDGET}}.

## Output

Write to `{{OUTPUT_PATH}}`:

```
CHECKPOINT: aic-code-audit/behavioral-logic — complete
EVIDENCE: <N> citations | BUDGET: used/total

## Confirmed findings
- [<file:line>] <bug or gap> — Dim: <E1/V4/logic/…> — <one-line description>

## Systemic patterns
- <same pattern> in N locations: [list]

## Pass list
- <dimension or sub-check confirmed clean>

## Discarded candidates
- [<file:line>] <why this is not a confirmed finding>
```
