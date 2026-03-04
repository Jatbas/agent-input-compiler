# Task 089: Session tracking storage (migration)

> **Status:** Pending
> **Phase:** O (Agentic Session Tracking)
> **Layer:** storage
> **Depends on:** —

## Goal

Implement AgenticSessionState in storage with a new migration (session_state table) and wire it in the MCP server so compilation requests with a session ID use persistent step history for deduplication and getPreviouslyShownFiles/getSteps.

## Architecture Notes

- Project plan §19: session_state table with session_id PK, steps_json, created_at, last_activity_at. One row per session; steps stored as JSON array.
- getPreviouslyShownFiles(sessionId, fileLastModified?) — optional second param so the store can compute modifiedSince without file I/O; run-pipeline-steps builds the map from repoMap.files and passes it. When omitted, return each previous file with modifiedSince: true.
- ADR-007: session_id is caller-supplied (no IdGenerator in store). ADR-008: timestamps from step.completedAt. Storage receives db only; no Clock.

## Files

| Action | Path                                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/storage/migrations/008-session-state.ts`                                                                 |
| Create | `shared/src/storage/sqlite-agentic-session-store.ts`                                                                 |
| Create | `shared/src/storage/__tests__/sqlite-agentic-session-store.test.ts`                                                  |
| Modify | `shared/src/core/interfaces/agentic-session-state.interface.ts` (add optional fileLastModified)                      |
| Modify | `shared/src/core/run-pipeline-steps.ts` (build fileLastModified from repoMap, pass to getPreviouslyShownFiles)       |
| Modify | `shared/src/storage/open-database.ts` (register migration 008)                                                       |
| Modify | `mcp/src/server.ts` (instantiate SqliteAgenticSessionStore(scope.db), pass to CompilationRunner)                     |
| Modify | `shared/src/pipeline/__tests__/compilation-runner.test.ts` (getPreviouslyShownFiles second param, getSteps in mocks) |

## Interface / Signature

```typescript
import type { SessionId, ISOTimestamp } from "#core/types/identifiers.js";
import type { PreviousFile } from "#core/types/session-dedup-types.js";
import type { SessionStep } from "#core/types/session-dedup-types.js";

export interface AgenticSessionState {
  getPreviouslyShownFiles(
    sessionId: SessionId,
    fileLastModified?: Readonly<Record<string, ISOTimestamp>>,
  ): readonly PreviousFile[];
  getSteps(sessionId: SessionId): readonly SessionStep[];
  recordStep(sessionId: SessionId, step: SessionStep): void;
}
```

```typescript
import type { ExecutableDb } from "#core/interfaces/executable-db.interface.js";
import type { AgenticSessionState } from "#core/interfaces/agentic-session-state.interface.js";
import type { SessionId } from "#core/types/identifiers.js";
import type { PreviousFile } from "#core/types/session-dedup-types.js";
import type { SessionStep } from "#core/types/session-dedup-types.js";

export class SqliteAgenticSessionStore implements AgenticSessionState {
  constructor(private readonly db: ExecutableDb) {}

  getPreviouslyShownFiles(
    sessionId: SessionId,
    fileLastModified?: Readonly<Record<string, ISOTimestamp>>,
  ): readonly PreviousFile[] {
    // Load steps; for each path compute latest step index and tier; set modifiedSince from fileLastModified or true.
  }

  getSteps(sessionId: SessionId): readonly SessionStep[] {
    // SELECT steps_json; parse; return in stepIndex order; empty array if no row.
  }

  recordStep(sessionId: SessionId, step: SessionStep): void {
    // INSERT new row or UPDATE steps_json and last_activity_at.
  }
}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
import type { RelativePath } from "#core/types/paths.js";
import type { TokenCount, StepIndex } from "#core/types/units.js";
import type { InclusionTier } from "#core/types/enums.js";
import type { ISOTimestamp } from "#core/types/identifiers.js";
import type { ToolOutput } from "#core/types/compilation-types.js";

export interface PreviousFile {
  readonly path: RelativePath;
  readonly lastTier: InclusionTier;
  readonly lastStepIndex: StepIndex;
  readonly modifiedSince: boolean;
}

export interface SessionStep {
  readonly stepIndex: StepIndex;
  readonly stepIntent: string | null;
  readonly filesSelected: readonly RelativePath[];
  readonly tiers: Readonly<Record<string, InclusionTier>>;
  readonly tokensCompiled: TokenCount;
  readonly toolOutputs: readonly ToolOutput[];
  readonly completedAt: ISOTimestamp;
}
```

```typescript
export interface ToolOutput {
  readonly type: ToolOutputType;
  readonly content: string;
  readonly relatedFiles?: readonly RelativePath[];
}
```

### Tier 2 — path-only

| Type           | Path                       | Factory             |
| -------------- | -------------------------- | ------------------- |
| SessionId      | #core/types/identifiers.js | toSessionId(s)      |
| ISOTimestamp   | #core/types/identifiers.js | toISOTimestamp(s)   |
| StepIndex      | #core/types/units.js       | toStepIndex(n)      |
| TokenCount     | #core/types/units.js       | toTokenCount(n)     |
| RelativePath   | #core/types/paths.js       | toRelativePath(s)   |
| InclusionTier  | #core/types/enums.js       | INCLUSION_TIER.\*   |
| ToolOutputType | #core/types/enums.js       | TOOL_OUTPUT_TYPE.\* |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Migration 008 session_state table

Create `shared/src/storage/migrations/008-session-state.ts`. Export `migration: Migration` with id `"008-session-state"`. In `up(db)`, run `db.exec` with:

```sql
CREATE TABLE IF NOT EXISTS session_state (
  session_id       TEXT PRIMARY KEY,
  task_intent      TEXT,
  steps_json       TEXT NOT NULL DEFAULT '[]',
  created_at       TEXT NOT NULL,
  last_activity_at TEXT NOT NULL
)
```

In `down(db)`, run `db.exec("DROP TABLE IF EXISTS session_state")`. Use type `Migration` from `#core/interfaces/migration.interface.js`.

**Verify:** `pnpm typecheck` passes.

### Step 2: Extend AgenticSessionState interface

In `shared/src/core/interfaces/agentic-session-state.interface.ts`, add optional second parameter to `getPreviouslyShownFiles`: `fileLastModified?: Readonly<Record<string, ISOTimestamp>>`. Add import for `ISOTimestamp` from `#core/types/identifiers.js`.

**Verify:** `pnpm typecheck` passes.

### Step 3: SqliteAgenticSessionStore getSteps and recordStep

Create `shared/src/storage/sqlite-agentic-session-store.ts`. Implement `AgenticSessionState` with constructor `(private readonly db: ExecutableDb)`. Implement `getSteps(sessionId)`: SELECT steps_json FROM session_state WHERE session_id = ?; parse JSON to SessionStep[] (use helper to deserialize step objects: stepIndex via toStepIndex, stepIntent, filesSelected as array mapped with toRelativePath, tiers as Record, tokensCompiled via toTokenCount, toolOutputs with type/content/relatedFiles?.map(toRelativePath) ?? [], completedAt via toISOTimestamp); return steps in stepIndex order; if no row return []. Implement `recordStep(sessionId, step)`: SELECT steps_json, created_at FROM session_state WHERE session_id = ?; if no row INSERT (session_id, task_intent, steps_json, created_at, last_activity_at) with task_intent = step.stepIntent, steps_json = JSON.stringify([serializeStep(step)]), created_at = step.completedAt, last_activity_at = step.completedAt; else parse steps_json, append serialized step, UPDATE session_state SET steps_json = ?, last_activity_at = ? WHERE session_id = ?. Serialize SessionStep to plain JSON-safe object (path as string, tier as string). Use immutable patterns; no mutation of parsed arrays. Max 60 lines per function; extract serializeStep/deserializeStep helpers if needed.

**Verify:** `pnpm typecheck` passes.

### Step 4: SqliteAgenticSessionStore getPreviouslyShownFiles

In `shared/src/storage/sqlite-agentic-session-store.ts`, implement `getPreviouslyShownFiles(sessionId, fileLastModified?)`: call getSteps(sessionId); for each path that appears in any step (from tiers or filesSelected) compute the latest step index and tier at that step (iterate steps in order, build map path -> { lastStepIndex, lastTier, completedAt }); build PreviousFile[] with path, lastTier, lastStepIndex, and modifiedSince: when fileLastModified is omitted use true for all; when provided use (path in fileLastModified ? fileLastModified[path] > step.completedAt : true) so missing path yields true. Return readonly PreviousFile[] using toRelativePath, INCLUSION_TIER, toStepIndex. Use reduce/spread; no mutation.

**Verify:** `pnpm typecheck` passes.

### Step 5: run-pipeline-steps pass fileLastModified to getPreviouslyShownFiles

In `shared/src/core/run-pipeline-steps.ts`, before calling `deps.agenticSessionState.getPreviouslyShownFiles(request.sessionId)`, build `fileLastModified`: from `repoMap.files` reduce to a Record<string, ISOTimestamp> keyed by path (use `f.path` as string), value `f.lastModified`. Pass as second argument: `getPreviouslyShownFiles(request.sessionId, fileLastModified)`. Add ISOTimestamp to imports from identifiers if not present.

**Verify:** `pnpm typecheck` passes.

### Step 6: Register migration 008 in open-database

In `shared/src/storage/open-database.ts`, import `migration as migration008` from `#storage/migrations/008-session-state.js` and add it to the array passed to `migrationRunner.run` (after migration007).

**Verify:** `pnpm typecheck` passes.

### Step 7: SqliteAgenticSessionStore tests

Create `shared/src/storage/__tests__/sqlite-agentic-session-store.test.ts`. Use in-memory DB; run migrations 001 through 008 in setup. Tests: recordStep_then_getSteps_returns_step — record one step (toSessionId, makeStep with stepIntent, filesSelected, tiers, tokensCompiled, toolOutputs, completedAt), getSteps(sessionId), assert one element with matching fields. getSteps_empty_when_no_session — getSteps(toSessionId("unknown-id")) returns []. getPreviouslyShownFiles_uses_fileLastModified — record two steps with same path at different completedAt; getPreviouslyShownFiles(sessionId, { [path]: timestampAfterSecondStep }) assert that path has modifiedSince true; with timestampBeforeSecondStep assert modifiedSince false. getPreviouslyShownFiles_omitted_param_returns_modifiedSince_true — record one step, getPreviouslyShownFiles(sessionId) with no second param, assert every returned PreviousFile has modifiedSince true. recordStep_append_second_step — recordStep twice for same sessionId, getSteps returns two steps in stepIndex order. idempotent_empty_steps_json — after first recordStep for new sessionId, SELECT steps_json and assert it is a JSON array with one element. Mock nothing; use real toStepIndex, toTokenCount, toRelativePath, toISOTimestamp, INCLUSION_TIER.

**Verify:** `pnpm test -- sqlite-agentic-session-store` passes.

### Step 8: Wire SqliteAgenticSessionStore in MCP server

In `mcp/src/server.ts`, import `SqliteAgenticSessionStore` from `@aic/shared/storage/sqlite-agentic-session-store.js`. Where `CompilationRunnerImpl` is constructed, replace the 10th argument (null) with `new SqliteAgenticSessionStore(scope.db)`.

**Verify:** `pnpm typecheck` passes.

### Step 9: Update compilation-runner test mocks

In `shared/src/pipeline/__tests__/compilation-runner.test.ts`, find every mock object that implements or satisfies `AgenticSessionState` (getPreviouslyShownFiles, recordStep, getSteps). Ensure getPreviouslyShownFiles accepts an optional second parameter (sessionId, fileLastModified?) so call sites that pass fileLastModified do not break. Ensure getSteps is present and returns [] where no session context is needed, or a non-empty array where a test asserts on session context. Add the second parameter to the method signature in mocks if the runner now passes it.

**Verify:** `pnpm test -- compilation-runner` passes.

### Step 10: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                                        | Description                                                                                  |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| recordStep_then_getSteps_returns_step                            | recordStep one step, getSteps returns one SessionStep with matching fields                   |
| getSteps_empty_when_no_session                                   | getSteps(unknown sessionId) returns []                                                       |
| getPreviouslyShownFiles_uses_fileLastModified                    | With fileLastModified map, modifiedSince true when mtime > step completedAt, false otherwise |
| getPreviouslyShownFiles_omitted_param_returns_modifiedSince_true | No second param yields all previous files with modifiedSince true                            |
| recordStep_append_second_step                                    | recordStep twice same sessionId, getSteps returns two steps in order                         |
| idempotent_empty_steps_json                                      | First recordStep for session writes steps_json as JSON array with one element                |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] Migration 008 creates session_state table; open-database runs it
- [ ] SqliteAgenticSessionStore implements AgenticSessionState (getPreviouslyShownFiles with optional fileLastModified, getSteps, recordStep)
- [ ] run-pipeline-steps passes fileLastModified from repoMap.files to getPreviouslyShownFiles
- [ ] MCP server passes SqliteAgenticSessionStore(scope.db) to CompilationRunner
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` in storage
- [ ] No `let` in production code; single-line comments only

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
