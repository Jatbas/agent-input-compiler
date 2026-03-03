# Task 082: Budget utilization in status

> **Status:** Pending
> **Phase:** M (Reporting & Resources)
> **Layer:** cli
> **Depends on:** Status command, StatusStore, LoadConfigFromFile (all Done)

## Goal

Add a "Budget utilization" line to `aic status` output showing what fraction of the context budget was used by the last compilation (tokens compiled vs budget), so users can see how much of their configured budget is consumed.

## Architecture Notes

- CLI command only — no new interface, storage, or pipeline. Modify existing `statusCommand` and `formatStatusOutput` in `cli/src/commands/status.ts`.
- Budget is resolved at status run time via `LoadConfigFromFile.load(projectRoot, configPath)`; default 8000 when no config (same as compile). No schema change, no persistence of budget per compilation.
- ADR-009: validation at boundary; status command already uses StatusArgsSchema. Budget comes from shared config loader.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `cli/src/commands/status.ts` (resolve budget, add Budget utilization line to formatter) |
| Modify | `cli/src/commands/__tests__/status.test.ts` (three new test cases) |

## Interface / Signature

No new interface. Existing functions change as follows.

```typescript
// formatStatusOutput gains third parameter and outputs one additional line
function formatStatusOutput(
  request: StatusRequest,
  aggregates: StatusAggregates,
  budget: number,
): string;

// statusCommand resolves budget before calling runner and passes it to formatStatusOutput
export async function statusCommand(
  args: StatusArgs,
  runner: StatusRunner,
): Promise<void>;
```

## Dependent Types

### Tier 2 — path-only

| Type | Path | Purpose |
| ---- | ---- | ------- |
| `StatusRequest` | shared/src/core/types/status-types.js | request.projectRoot, request.configPath |
| `StatusAggregates` | shared/src/core/types/status-types.js | aggregates.lastCompilation.tokensCompiled |
| `ResolvedConfig` | shared/src/core/types/resolved-config.js | config.contextBudget.maxTokens |
| `LoadConfigResult` | shared/src/config/load-config-from-file.js | result.config |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Resolve budget in statusCommand and add budget parameter to formatStatusOutput

In `cli/src/commands/status.ts`: Import `LoadConfigFromFile` from `@aic/shared/config/load-config-from-file.js`. After building `StatusRequest` (projectRoot, configPath, dbPath) and before calling `runner.status(request)`, instantiate `LoadConfigFromFile`, call `load(projectRoot, configPath ?? null)`, and set `const budget = result.config.contextBudget.maxTokens` (TokenCount is number at runtime). When config file is missing, `load()` returns `defaultResolvedConfig()` so budget is 8000.

Add a third parameter `budget: number` to `formatStatusOutput(request, aggregates, budget)`. At the call site, after `const aggregates = await runner.status(request)`, pass `budget` as the third argument to `formatStatusOutput(request, aggregates, budget)`.

**Verify:** `pnpm typecheck` passes. Status command still runs without error (manual or existing test).

### Step 2: Add Budget utilization line in formatStatusOutput

In `formatStatusOutput`, after the "Total tokens saved" line and before the "Guard" line, add one line. When `aggregates.lastCompilation !== null`: compute `pct = Math.round(aggregates.lastCompilation.tokensCompiled / budget * 100)`, and set the line to `Budget utilization: ${pct}% (last: ${aggregates.lastCompilation.tokensCompiled.toLocaleString()}/${budget.toLocaleString()})`. When `aggregates.lastCompilation === null`, set the line to `Budget utilization: —`. Insert this line into the array that is joined with `\n` for the return value, so the output order is: ... Total tokens saved, Budget utilization, Guard, ...

**Verify:** Run `aic status` in a project with at least one compilation; output contains "Budget utilization" with percentage and numbers. Run in a project with zero compilations; status exits before formatStatusOutput (no change to that path).

### Step 3: Tests for budget utilization

In `cli/src/commands/__tests__/status.test.ts`:

1. **budget_utilization_shown_with_default_budget:** Use the existing `fixtureAggregates` (which has `lastCompilation` with `tokensCompiled: 7200`). Call `statusCommand` with `configPath: null` so config loader returns default (budget 8000). Assert the combined stdout contains "Budget utilization", "90%", and either "7,200/8,000" or "7200/8000" (both formats valid depending on toLocaleString locale).

2. **budget_utilization_dash_when_no_last_compilation:** Create a stub runner that returns aggregates with `compilationsTotal: 1`, `lastCompilation: null`, and other fields from fixture. Call `statusCommand` with a valid project root and db that exists. Assert stdout contains "Budget utilization: —".

3. **budget_utilization_uses_config_when_present:** Create a temp directory with `aic.config.json` containing `{"contextBudget":{"maxTokens":10000}}`. Use that directory as projectRoot and set configPath to `path.join(projectRoot, "aic.config.json")`. Use a stub runner that returns aggregates with `lastCompilation: { ...fixtureAggregates.lastCompilation, tokensCompiled: 7200 }`. Call `statusCommand`. Assert stdout contains "72%" and either "7,200/10,000" or "7200/10000".

**Verify:** `pnpm test cli/src/commands/__tests__/status.test.ts` passes.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| budget_utilization_shown_with_default_budget | Last compilation present, no config → 90%, 7,200/8,000 |
| budget_utilization_dash_when_no_last_compilation | lastCompilation null → "Budget utilization: —" |
| budget_utilization_uses_config_when_present | Config maxTokens 10000, last 7200 → 72%, 7,200/10,000 |

## Acceptance Criteria

- [ ] status.ts resolves budget via LoadConfigFromFile and passes it to formatStatusOutput
- [ ] formatStatusOutput outputs "Budget utilization: X% (last: A/B)" when lastCompilation is non-null, "Budget utilization: —" when null
- [ ] Line is placed after "Total tokens saved" and before "Guard"
- [ ] All three new test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations, stop. List the adaptations, report to the user, and re-evaluate before continuing.
