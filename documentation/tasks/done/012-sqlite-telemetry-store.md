# Task 012: SqliteTelemetryStore

> **Status:** Done
> **Phase:** E (Storage)
> **Layer:** storage
> **Depends on:** Phase A (001-initial-schema), Phase B (TelemetryStore, TelemetryEvent)

## Goal

Implement TelemetryStore by writing TelemetryEvent rows to the telemetry_events table so pipeline events can be persisted when telemetry is enabled.

## Architecture Notes

- All SQL in shared/src/storage/ only. Storage receives db via constructor (DIP). Table telemetry_events (see 001-initial-schema.ts): id, repo_id, task_class, tokens_raw, tokens_compiled, token_reduction_pct, duration_ms, cache_hit, model_id, editor_id, files_selected, files_total, guard_findings, guard_blocks, transform_savings, tiers_json, created_at. Column mapping: event.id → id, event.timestamp → created_at, event.repoId → repo_id, event.taskClass → task_class, event.tokensRaw → tokens_raw, event.tokensCompiled → tokens_compiled, token_reduction_pct = (tokensRaw - tokensCompiled) / tokensRaw \* 100 when tokensRaw > 0 else 0, event.durationMs → duration_ms, event.cacheHit → cache_hit (0/1), event.model → model_id, editor_id = 'generic', event.filesSelected → files_selected, event.filesTotal → files_total, event.guardFindingsCount → guard_findings, event.guardBlockedCount → guard_blocks, transform_savings = 0, event.summarisationTiers → tiers_json (JSON.stringify).
- No Date.now()/new Date(); use event.timestamp for created_at.

## Files

| Action | Path                                                          |
| ------ | ------------------------------------------------------------- |
| Create | `shared/src/storage/sqlite-telemetry-store.ts`                |
| Create | `shared/src/storage/__tests__/sqlite-telemetry-store.test.ts` |

## Interface / Signature

Implement the existing TelemetryStore interface:

```typescript
// From shared/src/core/interfaces/telemetry-store.interface.ts
import type { TelemetryEvent } from "#core/types/telemetry-types.js";

export interface TelemetryStore {
  write(event: TelemetryEvent): void;
}
```

```typescript
// shared/src/storage/sqlite-telemetry-store.ts
import type { TelemetryStore } from "#core/interfaces/telemetry-store.interface.js";
import type { TelemetryEvent } from "#core/types/telemetry-types.js";
import type { ExecutableDb } from "#core/interfaces/executable-db.interface.js";

export class SqliteTelemetryStore implements TelemetryStore {
  constructor(private readonly db: ExecutableDb) {}
  write(event: TelemetryEvent): void;
}
```

- write(event): INSERT into telemetry_events. Map: id <- event.id, repo_id <- event.repoId, task_class <- event.taskClass, tokens_raw <- event.tokensRaw, tokens_compiled <- event.tokensCompiled, token_reduction_pct <- computed (e.g. (tokensRaw - tokensCompiled) / tokensRaw \* 100 when tokensRaw > 0, else 0), duration_ms <- event.durationMs, cache_hit <- event.cacheHit ? 1 : 0, model_id <- event.model ?? null, editor_id <- 'generic', files_selected <- event.filesSelected, files_total <- event.filesTotal, guard_findings <- event.guardFindingsCount, guard_blocks <- event.guardBlockedCount, transform_savings <- 0, tiers_json <- JSON.stringify(event.summarisationTiers), created_at <- event.timestamp. Use prepare().run() with bound params.

## Config Changes

None.

## Dependent Types

```typescript
// TelemetryEvent (from #core/types/telemetry-types.js)
import type { UUIDv7, ISOTimestamp, RepoId } from "#core/types/identifiers.js";
import type { TokenCount, Milliseconds } from "#core/types/units.js";
import type { TaskClass, InclusionTier } from "#core/types/enums.js";

export interface TelemetryEvent {
  readonly id: UUIDv7;
  readonly timestamp: ISOTimestamp;
  readonly repoId: RepoId;
  readonly taskClass: TaskClass;
  readonly tokensRaw: TokenCount;
  readonly tokensCompiled: TokenCount;
  readonly filesSelected: number;
  readonly filesTotal: number;
  readonly summarisationTiers: Readonly<Record<InclusionTier, number>>;
  readonly guardBlockedCount: number;
  readonly guardFindingsCount: number;
  readonly cacheHit: boolean;
  readonly durationMs: Milliseconds;
  readonly model: string | null;
}
```

```typescript
// TaskClass, InclusionTier (from #core/types/enums.js)
export const TASK_CLASS = {
  REFACTOR: "refactor",
  BUGFIX: "bugfix",
  FEATURE: "feature",
  DOCS: "docs",
  TEST: "test",
  GENERAL: "general",
} as const;
export type TaskClass = (typeof TASK_CLASS)[keyof typeof TASK_CLASS];

export const INCLUSION_TIER = {
  L0: "L0",
  L1: "L1",
  L2: "L2",
  L3: "L3",
} as const;
export type InclusionTier = (typeof INCLUSION_TIER)[keyof typeof INCLUSION_TIER];
```

```typescript
// UUIDv7, ISOTimestamp, RepoId (from #core/types/identifiers.js)
export type ISOTimestamp = Brand<string, "ISOTimestamp">;
export type UUIDv7 = Brand<string, "UUIDv7">;
export type RepoId = Brand<string, "RepoId">;

export function toISOTimestamp(value: string): ISOTimestamp;
export function toUUIDv7(value: string): UUIDv7;
export function toRepoId(value: string): RepoId;
```

```typescript
// TokenCount, Milliseconds (from #core/types/units.js)
export type TokenCount = Brand<number, "TokenCount">;
export type Milliseconds = Brand<number, "Milliseconds">;

export function toTokenCount(value: number): TokenCount;
export function toMilliseconds(value: number): Milliseconds;
```

## Steps

### Step 1: Implement SqliteTelemetryStore

Create `shared/src/storage/sqlite-telemetry-store.ts`. Implement write(event) with the column mapping above. Use parameterized queries only.

**Verify:** `pnpm typecheck` passes.

### Step 2: Unit tests

Create `shared/src/storage/__tests__/sqlite-telemetry-store.test.ts`. Use in-memory DB. Run migration from 001-initial-schema before each test. Implement all test cases from the Tests table: write persists row; multiple writes; token_reduction_pct when tokensRaw > 0; token_reduction_pct when tokensRaw is 0 (expect 0, no division); duplicate id (write two events with same id, assert second write throws). Build minimal TelemetryEvent with toUUIDv7, toISOTimestamp, toTokenCount, toRepoId, TASK_CLASS, INCLUSION_TIER.

**Verify:** `pnpm test -- shared/src/storage/__tests__/sqlite-telemetry-store.test.ts` passes.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test`. Expected: all pass.

## Tests

| Test case                               | Description                                                    |
| --------------------------------------- | -------------------------------------------------------------- |
| write persists row                      | One event results in one row with correct data                 |
| multiple writes                         | Multiple events create multiple rows                           |
| token_reduction_pct                     | Computed correctly when tokensRaw > 0                          |
| token_reduction_pct when tokensRaw is 0 | token_reduction_pct is 0, no division by zero                  |
| duplicate id                            | Second write with same id throws (SQLite constraint violation) |

## Acceptance Criteria

- [ ] SqliteTelemetryStore implements TelemetryStore; constructor(db)
- [ ] All SQL in this file only
- [ ] All test cases pass
- [ ] `pnpm lint` and `pnpm typecheck` clean
- [ ] No Date.now()/new Date()
- [ ] Single-line comments only

## Blocked?

If blocked, append `## Blocked` and stop.
