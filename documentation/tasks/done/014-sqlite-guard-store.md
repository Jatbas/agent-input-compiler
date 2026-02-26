# Task 014: SqliteGuardStore

> **Status:** Done
> **Phase:** E (Storage)
> **Layer:** storage
> **Depends on:** Phase A (initial schema), Phase B (GuardStore, GuardFinding)

## Goal

Implement GuardStore by writing and querying the guard_findings table so compilation guard results can be persisted and retrieved by compilation_id.

## Architecture Notes

- All SQL in shared/src/storage/ only. guard_findings table: id (TEXT PK), compilation_id (TEXT FK), type, severity, file, line, message, pattern, created_at. Storage receives db, IdGenerator (for id per finding), and Clock (for created_at). Constructor: (db: ExecutableDb, idGenerator: IdGenerator, clock: Clock). ADR-007: UUIDv7 for entity PKs.
- write(compilationId, findings): for each finding, generate id via idGenerator.generate(), created_at via clock.now(), INSERT row. queryByCompilation(compilationId): SELECT \* WHERE compilation_id = ? ORDER BY created_at; map rows to GuardFinding[] (severity, type, file, line, message, pattern).
- No Date.now()/new Date(); use Clock and IdGenerator only. Error paths (e.g. DB failure) are out of scope for this task.

## Files

| Action | Path                                                      |
| ------ | --------------------------------------------------------- |
| Create | `shared/src/storage/sqlite-guard-store.ts`                |
| Create | `shared/src/storage/__tests__/sqlite-guard-store.test.ts` |

## Interface / Signature

Implement the existing GuardStore interface:

```typescript
// From shared/src/core/interfaces/guard-store.interface.ts
import type { UUIDv7 } from "#core/types/identifiers.js";
import type { GuardFinding } from "#core/types/guard-types.js";

export interface GuardStore {
  write(compilationId: UUIDv7, findings: readonly GuardFinding[]): void;
  queryByCompilation(compilationId: UUIDv7): readonly GuardFinding[];
}
```

```typescript
// shared/src/storage/sqlite-guard-store.ts
import type { GuardStore } from "#core/interfaces/guard-store.interface.js";
import type { UUIDv7 } from "#core/types/identifiers.js";
import type { GuardFinding } from "#core/types/guard-types.js";
import type { ExecutableDb } from "#core/interfaces/executable-db.interface.js";
import type { IdGenerator } from "#core/interfaces/id-generator.interface.js";
import type { Clock } from "#core/interfaces/clock.interface.js";

export class SqliteGuardStore implements GuardStore {
  constructor(
    private readonly db: ExecutableDb,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}
  write(compilationId: UUIDv7, findings: readonly GuardFinding[]): void;
  queryByCompilation(compilationId: UUIDv7): readonly GuardFinding[];
}
```

- write: On write, replace existing findings for that compilation_id: run DELETE FROM guard_findings WHERE compilation_id = ?; then INSERT one row per finding with id (from idGenerator.generate()), compilation_id, type, severity, file, line, message, pattern, created_at (from clock.now()). One compilation_id has exactly one set of findings (replace semantics).
- queryByCompilation: SELECT and map to GuardFinding (severity, type, file, line, message, pattern). Return readonly array.

## Config Changes

None.

## Dependent Types

```typescript
// GuardFinding (from #core/types/guard-types.js)
import type { GuardSeverity, GuardFindingType } from "#core/types/enums.js";
import type { RelativePath } from "#core/types/paths.js";
import type { LineNumber } from "#core/types/units.js";

export interface GuardFinding {
  readonly severity: GuardSeverity;
  readonly type: GuardFindingType;
  readonly file: RelativePath;
  readonly line?: LineNumber;
  readonly message: string;
  readonly pattern?: string;
}
```

- UUIDv7 from #core/types/identifiers.js. IdGenerator and Clock from #core/interfaces.

## Steps

### Step 1: Implement SqliteGuardStore

Create `shared/src/storage/sqlite-guard-store.ts`. Inject db, idGenerator, clock. Implement write: DELETE WHERE compilation_id = ? then INSERT each finding with generated id and clock.now() for created_at. Implement queryByCompilation: SELECT WHERE compilation_id = ? ORDER BY created_at and map rows to GuardFinding[].

**Verify:** `pnpm typecheck` passes.

### Step 2: Unit tests

Create `shared/src/storage/__tests__/sqlite-guard-store.test.ts`. Use in-memory DB and mocks for IdGenerator and Clock. Test: (1) write then queryByCompilation returns same findings; (2) queryByCompilation for unknown id returns []; (3) write twice for same compilation_id replaces first set; query returns the second set only; (4) write with empty findings array then queryByCompilation returns [].

**Verify:** `pnpm test -- shared/src/storage/__tests__/sqlite-guard-store.test.ts` passes.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test`. Expected: all pass.

## Tests

| Test case                      | Description                                                |
| ------------------------------ | ---------------------------------------------------------- |
| write then query               | Persisted findings returned                                |
| query unknown                  | Returns []                                                 |
| replace on same compilation_id | Second write replaces first; query returns second set only |
| empty findings                 | write with [] then queryByCompilation returns []           |

## Acceptance Criteria

- [ ] SqliteGuardStore implements GuardStore; constructor(db, idGenerator, clock)
- [ ] All SQL in this file only
- [ ] All test cases pass
- [ ] `pnpm lint` and `pnpm typecheck` clean
- [ ] UUIDv7 and timestamps via injected IdGenerator and Clock only
- [ ] Single-line comments only

## Blocked?

If blocked, append `## Blocked` and stop.
