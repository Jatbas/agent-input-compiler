# Task 099: Exclude internal_test from status queries

> **Status:** Done
> **Phase:** P (Context Quality, Token Efficiency & Compilation Performance)
> **Layer:** storage
> **Depends on:** —

## Goal

Exclude rows with `trigger_source = 'internal_test'` from all `compilation_log` queries in SqliteStatusStore so that "show aic status", "show aic last", and "show aic chat summary" (aic://status, aic://last, aic_chat_summary) do not include compilations triggered by internal tests.

## Architecture Notes

- ADR: no schema change; use existing `trigger_source` column (migration 005).
- Single source of truth: use `TRIGGER_SOURCE.INTERNAL_TEST` from `#core/types/enums.js` as the bound parameter so the literal is not duplicated.
- Predicate: `(trigger_source IS NULL OR trigger_source != ?)` so legacy or unspecified (NULL) rows remain included.

## Files

| Action | Path                                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------- |
| Modify | `shared/src/storage/sqlite-status-store.ts` (add exclusion to all compilation_log queries)                 |
| Modify | `shared/src/storage/__tests__/sqlite-status-store.test.ts` (trigger_source in helper; two exclusion tests) |

## Interface / Signature

No change. StatusStore interface and SqliteStatusStore class signatures remain the same; only the SQL predicates change.

```typescript
// StatusStore interface unchanged
export interface StatusStore {
  getSummary(): StatusAggregates;
  getConversationSummary(conversationId: ConversationId): ConversationSummary | null;
}
```

```typescript
// SqliteStatusStore: same constructor and method signatures; queries add exclusion predicate
export class SqliteStatusStore implements StatusStore {
  constructor(
    private readonly db: ExecutableDb,
    private readonly clock: Clock,
  ) {}
  getConversationSummary(conversationId: ConversationId): ConversationSummary | null;
  getSummary(): StatusAggregates;
}
```

## Dependent Types

No new types. Existing: StatusAggregates, ConversationSummary, ConversationId, ExecutableDb, Clock (unchanged).

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add exclusion predicate to all compilation_log queries

In `shared/src/storage/sqlite-status-store.ts`: add `import { TRIGGER_SOURCE } from "#core/types/enums.js";`. For every query that reads from `compilation_log`:

- Queries that already have a WHERE clause: append ` AND (trigger_source IS NULL OR trigger_source != ?)` and pass the existing bound param(s) plus `TRIGGER_SOURCE.INTERNAL_TEST` as the last argument to `.all(...)`.
- Queries with no WHERE: add ` WHERE (trigger_source IS NULL OR trigger_source != ?)` and pass `TRIGGER_SOURCE.INTERNAL_TEST` as the only argument to `.all(...)`.

Affected queries:

1. getConversationSummary: COUNT (WHERE conversation_id = ?) → add AND (trigger_source IS NULL OR trigger_source != ?); .all(conversationId, TRIGGER_SOURCE.INTERNAL_TEST).
2. getConversationSummary: cache rate SELECT — same.
3. getConversationSummary: COALESCE(SUM...) agg — same.
4. getConversationSummary: task_class GROUP BY — same.
5. getConversationSummary: last row SELECT — same.
6. getSummary: SELECT COUNT(\*) FROM compilation_log — add WHERE (trigger_source IS NULL OR trigger_source != ?); .all(TRIGGER_SOURCE.INTERNAL_TEST).
7. getSummary: SELECT COUNT(\*) ... WHERE date(created_at) = date(?) — add AND (trigger_source IS NULL OR trigger_source != ?); .all(todayDate, TRIGGER_SOURCE.INTERNAL_TEST).
8. getSummary: cache rate SELECT — add WHERE (trigger_source IS NULL OR trigger_source != ?); .all(TRIGGER_SOURCE.INTERNAL_TEST).
9. getSummary: COALESCE(SUM...) token sums — same.
10. getSummary: task_class GROUP BY — same.
11. getSummary: last row SELECT — same.

**Verify:** `pnpm typecheck` and `pnpm lint` pass. Grep for `FROM compilation_log` in sqlite-status-store.ts: every occurrence has the exclusion predicate.

### Step 2: Extend test helper and add exclusion tests

In `shared/src/storage/__tests__/sqlite-status-store.test.ts`:

- In `insertCompilationLog`: add `trigger_source: null as string | null` to the defaults object (before `...overrides` so tests can pass trigger_source in overrides). Add `trigger_source` to the INSERT column list, add one `?` to the VALUES list, and in `.run()` append `defaults.trigger_source ?? null`. Migration 005 adds the column so it exists in the test DB.
- Add test **getSummary_excludes_internal_test**: insert two rows with distinct ids, one with `trigger_source: null`, one with `trigger_source: "internal_test"`. Call getSummary(). Assert compilationsTotal is 1 and lastCompilation matches the row with null trigger_source.
- Add test **getConversationSummary_excludes_internal_test**: insert two rows with same conversation_id, one trigger_source null, one "internal_test". Call getConversationSummary(that conversation_id). Assert compilationsInConversation is 1 and lastCompilationInConversation matches the null-trigger_source row.

**Verify:** `pnpm test shared/src/storage/__tests__/sqlite-status-store.test.ts` passes.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                     | Description                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| getSummary_excludes_internal_test             | getSummary counts and lastCompilation ignore trigger_source=internal_test rows. |
| getConversationSummary_excludes_internal_test | getConversationSummary ignores internal_test rows for that conversation.        |

## Acceptance Criteria

- [ ] All compilation_log queries in SqliteStatusStore exclude trigger_source = 'internal_test'
- [ ] TRIGGER_SOURCE.INTERNAL_TEST used as bound param (no hardcoded 'internal_test' in storage)
- [ ] Both new test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] Existing status-store tests still pass

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work, stop. List the adaptations, report to the user, and re-evaluate before continuing.
