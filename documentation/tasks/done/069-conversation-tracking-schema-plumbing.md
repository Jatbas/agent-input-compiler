# Task 069: Conversation tracking — schema + plumbing

> **Status:** Done
> **Phase:** M (Reporting & Resources)
> **Layer:** shared (core, storage, pipeline) + mcp + cli
> **Depends on:** aic://last-compilation resource (Done), Telemetry triggerSource field (Done)

## Goal

Add nullable `conversation_id` to the compilation log and thread optional `conversationId` from MCP/CLI through the pipeline so compilations can be grouped by editor conversation (KL-004). This task covers schema and plumbing only; `getConversationSummary` and the conversation-summary resource are a follow-up task.

## Architecture Notes

- KL-004: migration adding nullable `conversation_id TEXT` to `compilation_log`, add `conversationId` to `CompilationLogEntry` and `CompilationRequest`, MCP handler + CLI pass the value through from hooks/args.
- ADR-010: use branded type `ConversationId` for the domain value (consistent with `SessionId`).
- Validation boundary (ADR-009): MCP and CLI validate at handler/command; core types trust branded values.
- Same structural pattern as task 037 (triggerSource): optional request/entry field, migration via `safeAddColumn`, store INSERT extended, pipeline pass-through, MCP schema + handler, CLI schema + command.

## Files

| Action | Path                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------ |
| Create | `shared/src/storage/migrations/007-conversation-id.ts`                                                                   |
| Modify | `shared/src/core/types/identifiers.ts` (add ConversationId, toConversationId)                                            |
| Modify | `shared/src/core/types/index.ts` (export ConversationId, toConversationId)                                               |
| Modify | `shared/src/core/types/compilation-types.ts` (add conversationId to CompilationRequest)                                  |
| Modify | `shared/src/core/types/compilation-log-entry.ts` (add conversationId to CompilationLogEntry)                             |
| Modify | `shared/src/storage/open-database.ts` (register migration 007)                                                           |
| Modify | `shared/src/storage/sqlite-compilation-log-store.ts` (INSERT conversation_id)                                            |
| Modify | `shared/src/pipeline/compilation-runner.ts` (buildLogEntry, recordCompilationAndFindings, run paths pass conversationId) |
| Modify | `mcp/src/schemas/compilation-request.ts` (add conversationId to schema)                                                  |
| Modify | `mcp/src/handlers/compile-handler.ts` (pass conversationId into request)                                                 |
| Modify | `cli/src/schemas/compilation-args.ts` (add conversationId optional)                                                      |
| Modify | `cli/src/commands/compile.ts` (pass conversationId into request)                                                         |
| Modify | `shared/src/storage/__tests__/sqlite-compilation-log-store.test.ts` (conversationId in entries, assert column)           |
| Modify | `shared/src/pipeline/__tests__/compilation-runner.test.ts` (conversationId in request/entries)                           |
| Modify | `mcp/src/handlers/__tests__/compile-handler.test.ts` (conversationId in args, assert on request)                         |
| Modify | `cli/src/commands/__tests__/compile.test.ts` (conversationId in args if applicable)                                      |

## Interface / Signature

No new interface. Extended types:

**CompilationRequest** (add one optional property):

```typescript
// In compilation-types.ts — add to existing interface
readonly conversationId?: ConversationId | null;
```

**CompilationLogEntry** (add one required nullable property):

```typescript
// In compilation-log-entry.ts — add to existing interface
readonly conversationId: ConversationId | null;
```

**identifiers.ts** (add type and factory):

```typescript
export type ConversationId = Brand<string, "ConversationId">;
export function toConversationId(value: string): ConversationId {
  return value as ConversationId;
}
```

## Dependent Types

### Tier 0 — verbatim

`ConversationId` and `toConversationId` are defined in `shared/src/core/types/identifiers.ts` (see Interface / Signature). Used at MCP/CLI boundary and in `CompilationRequest` / `CompilationLogEntry`.

### Tier 1 — signature + path

| Type                  | Path                                             | Purpose                        |
| --------------------- | ------------------------------------------------ | ------------------------------ |
| `CompilationRequest`  | `shared/src/core/types/compilation-types.js`     | request shape, .conversationId |
| `CompilationLogEntry` | `shared/src/core/types/compilation-log-entry.js` | entry shape, .conversationId   |

### Tier 2 — path-only

| Type        | Path                                   | Factory            |
| ----------- | -------------------------------------- | ------------------ |
| `SessionId` | `shared/src/core/types/identifiers.js` | `toSessionId(raw)` |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add ConversationId branded type and export

In `shared/src/core/types/identifiers.ts`, add `ConversationId` type and `toConversationId(value: string): ConversationId` (same pattern as `SessionId` / `toSessionId`). In `shared/src/core/types/index.ts`, add `ConversationId` and `toConversationId` to the export block from `"./identifiers.js"`.

**Verify:** `pnpm typecheck` passes. Grep for `ConversationId` in identifiers.ts and index.ts shows the new type and export.

### Step 2: Add migration 007 for conversation_id column

Create `shared/src/storage/migrations/007-conversation-id.ts`. Export `migration: Migration` with `id: "007-conversation-id"`. In `up(db)`, call `safeAddColumn(db, "compilation_log", "conversation_id", "TEXT")`. Import `safeAddColumn` from `"./migration-utils.js"`. Implement `down(_db)` as best-effort (no-op for MVP).

**Verify:** `pnpm typecheck` passes. Migration file exists and matches the pattern of `005-trigger-source.ts`.

### Step 3: Register migration 007 in open-database

In `shared/src/storage/open-database.ts`, import `migration as migration007` from the 007 migration file and add `migration007` to the migrations array passed to the runner.

**Verify:** `pnpm typecheck` passes. Grep for `migration007` in open-database.ts shows import and array entry.

### Step 4: Extend CompilationRequest and CompilationLogEntry with conversationId

In `shared/src/core/types/compilation-types.ts`, add optional `readonly conversationId?: ConversationId | null` to `CompilationRequest` and import `ConversationId` from identifiers. In `shared/src/core/types/compilation-log-entry.ts`, add `readonly conversationId: ConversationId | null` to `CompilationLogEntry` and import `ConversationId` from identifiers.

**Verify:** `pnpm typecheck` passes. Both interfaces declare conversationId.

### Step 5: Pipeline and store pass and persist conversationId

In `shared/src/pipeline/compilation-runner.ts`: add parameter `conversationId: ConversationId | null` to `buildLogEntry` and include `conversationId` in the returned entry object. Add parameter `conversationId: ConversationId | null` to `recordCompilationAndFindings` and pass it into `buildLogEntry`. In `runCacheHitPath` and `runFreshPath`, pass `request.conversationId ?? null` as the conversationId argument to `recordCompilationAndFindings`. In `shared/src/storage/sqlite-compilation-log-store.ts`, add `conversation_id` to the INSERT column list and bind `entry.conversationId ?? null` in the corresponding position.

**Verify:** `pnpm typecheck` passes. Grep for `conversationId` and `conversation_id` in compilation-runner.ts and sqlite-compilation-log-store.ts confirms pass-through and INSERT.

### Step 6: MCP schema and handler pass conversationId

In `mcp/src/schemas/compilation-request.ts`, add `conversationId: z.string().min(1).nullable().optional()` to the schema (same object as existing fields). In `mcp/src/handlers/compile-handler.ts`, import `toConversationId` from shared identifiers. When building `request: CompilationRequest`, set `conversationId: args.conversationId != null && args.conversationId !== "" ? toConversationId(args.conversationId) : undefined` so that omitted or empty string yields undefined; non-empty string yields branded ConversationId.

**Verify:** `pnpm typecheck` passes. Handler builds request with conversationId from args when provided.

### Step 7: CLI schema and compile command pass conversationId

In `cli/src/schemas/compilation-args.ts`, add `conversationId: z.string().min(1).optional()` to the schema object extended from BaseArgsSchema. In `cli/src/commands/compile.ts`, import `toConversationId` from shared. When building `request: CompilationRequest`, set `conversationId: args.conversationId != null && args.conversationId !== "" ? toConversationId(args.conversationId) : undefined`.

**Verify:** `pnpm typecheck` passes. compile command builds request with conversationId when provided.

### Step 8: Update tests for conversationId

In `shared/src/storage/__tests__/sqlite-compilation-log-store.test.ts`: run migration 007 in setup (import and run `migration007.up(db)` after the last existing migration). Add `conversationId: null` to every existing `CompilationLogEntry` literal. Add one test that records an entry with a non-null `conversationId` (use `toConversationId("conv-123")`) and assert the selected row has `conversation_id` equal to that string. In `shared/src/pipeline/__tests__/compilation-runner.test.ts`: add `conversationId: null` to every `CompilationLogEntry` literal. Add one test that passes a request with `conversationId: toConversationId("runner-conv")` and assert the captured log entry passed to the store has `conversationId` equal to that value. In `mcp/src/handlers/__tests__/compile-handler.test.ts`: add a test that calls the handler with `conversationId: "test-conv-id"` in args and asserts the captured `CompilationRequest` has `conversationId` equal to the branded value for that string. In `cli/src/commands/__tests__/compile.test.ts`: add one test that passes `conversationId` in args, use a mock runner that captures the CompilationRequest, and assert the captured request has `conversationId` equal to the branded value for that string. Ensure every existing test that builds a `CompilationLogEntry` includes `conversationId: null`.

**Verify:** `pnpm test` for shared storage, pipeline, mcp handler, and cli compile passes.

### Step 9: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                    | Description                                                                                        |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| sqlite_compilation_log_store_conversation_id | Record entry with non-null conversationId; assert SELECT returns conversation_id                   |
| compile_handler_passes_conversation_id       | MCP handler called with conversationId in args; captured request has conversationId                |
| compilation_runner_passes_conversation_id    | Request with conversationId produces log entry with conversationId; assert via captured store call |
| All existing store/runner/handler/CLI tests  | Entries and requests updated with conversationId null or asserted; tests still pass                |

## Acceptance Criteria

- [ ] Migration 007 adds nullable `conversation_id` to `compilation_log`
- [ ] `CompilationRequest` has optional `conversationId?: ConversationId | null`
- [ ] `CompilationLogEntry` has `conversationId: ConversationId | null`
- [ ] `SqliteCompilationLogStore.record` persists `conversation_id`
- [ ] Pipeline passes `request.conversationId ?? null` into log entry and store
- [ ] MCP schema accepts optional conversationId; handler passes it into request
- [ ] CLI schema accepts optional conversationId; compile command passes it into request
- [ ] All test cases pass; existing tests updated for new field
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
