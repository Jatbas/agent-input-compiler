# Task 013: SqliteConfigStore

> **Status:** Done
> **Phase:** E (Storage)
> **Layer:** storage
> **Depends on:** Phase A (001-initial-schema), Phase B (ConfigStore)

## Goal

Implement ConfigStore using the config_history table so the latest config hash and snapshots can be read/written for compare and config tracking.

## Architecture Notes

- All SQL in shared/src/storage/ only. config_history has config_hash (TEXT PK), config_json, created_at. getLatestHash(): return the config_hash of the most recently written row (ORDER BY created_at DESC LIMIT 1). writeSnapshot(configHash, configJson): INSERT; use Clock for created_at (storage may inject Clock per aic-storage rules for timestamps). So constructor(db: ExecutableDb, clock: Clock).
- No Date.now()/new Date(); use clock.now() for created_at on write.

## Files

| Action | Path                                                       |
| ------ | ---------------------------------------------------------- |
| Create | `shared/src/storage/sqlite-config-store.ts`                |
| Create | `shared/src/storage/__tests__/sqlite-config-store.test.ts` |

## Interface / Signature

Implement the existing ConfigStore interface:

```typescript
// From shared/src/core/interfaces/config-store.interface.ts
export interface ConfigStore {
  getLatestHash(): string | null;
  writeSnapshot(configHash: string, configJson: string): void;
}
```

```typescript
// shared/src/storage/sqlite-config-store.ts
import type { ConfigStore } from "#core/interfaces/config-store.interface.js";
import type { ExecutableDb } from "#core/interfaces/executable-db.interface.js";
import type { Clock } from "#core/interfaces/clock.interface.js";

export class SqliteConfigStore implements ConfigStore {
  constructor(
    private readonly db: ExecutableDb,
    private readonly clock: Clock,
  ) {}
  getLatestHash(): string | null;
  writeSnapshot(configHash: string, configJson: string): void;
}
```

- getLatestHash(): SELECT config_hash FROM config_history ORDER BY created_at DESC LIMIT 1; return config_hash or null.
- writeSnapshot(configHash, configJson): INSERT OR REPLACE into config_history (config_hash, config_json, created_at) with clock.now() for created_at so the same config_hash overwrites the row.

## Config Changes

None.

## Dependent Types

- ConfigStore has no domain types beyond string (configHash, configJson). The implementation uses ExecutableDb (#core/interfaces/executable-db.interface.js) and Clock (#core/interfaces/clock.interface.js).

## Steps

### Step 1: Implement SqliteConfigStore

Create `shared/src/storage/sqlite-config-store.ts`. Inject db and Clock. Implement getLatestHash and writeSnapshot. Use clock.now() for created_at.

**Verify:** `pnpm typecheck` passes.

### Step 2: Unit tests

Create `shared/src/storage/__tests__/sqlite-config-store.test.ts`. Use in-memory DB and a mock Clock. Test: (1) getLatestHash empty returns null; (2) writeSnapshot then getLatestHash returns that hash; (3) write two snapshots, getLatestHash returns the second (most recent by created_at).

**Verify:** `pnpm test -- shared/src/storage/__tests__/sqlite-config-store.test.ts` passes.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test`. Expected: all pass.

## Tests

| Test case                | Description                             |
| ------------------------ | --------------------------------------- |
| getLatestHash empty      | Returns null                            |
| write then getLatestHash | Returns written hash                    |
| latest wins              | Two writes; getLatestHash is the second |

## Acceptance Criteria

- [ ] SqliteConfigStore implements ConfigStore; constructor(db, clock)
- [ ] All SQL in this file only
- [ ] All test cases pass
- [ ] `pnpm lint` and `pnpm typecheck` clean
- [ ] Timestamps via Clock only
- [ ] Single-line comments only

## Blocked?

If blocked, append `## Blocked` and stop.
