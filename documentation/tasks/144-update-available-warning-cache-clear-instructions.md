# Task 144: Update-available warning with cache-clear instructions

> **Status:** Pending
> **Phase:** AA — Reliable Version Updates
> **Layer:** mcp
> **Depends on:** —

## Goal

When `getUpdateInfo()` detects a newer version, show a single user-facing message (stderr, status resource, and aic_compile response) that includes cache-clear instructions so existing users on `npx -y @jatbas/aic` can update without reinstalling.

## Architecture Notes

- MCP layer only; no core/pipeline/storage changes. Single source of truth for message text in `latest-version-check.ts` via `UpdateInfo.updateMessage`.
- Key decision: add `updateMessage: string | null` to `UpdateInfo`; when `updateAvailable` is set, `updateMessage` holds the full instruction string; server and compile handler pass it through.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `mcp/src/latest-version-check.ts` (message constant, UpdateInfo.updateMessage, file content) |
| Modify | `mcp/src/server.ts` (stderr on update, getUpdateMessage, status resource updateMessage) |
| Modify | `mcp/src/handlers/compile-handler.ts` (getUpdateMessage param, response updateMessage) |
| Modify | `mcp/src/__tests__/latest-version-check.test.ts` (assert updateMessage when update available) |
| Modify | `mcp/src/__tests__/server.test.ts` (assert status updateMessage when update available) |

## Interface / Signature

**UpdateInfo (extended in `mcp/src/latest-version-check.ts`):**

```typescript
export interface UpdateInfo {
  readonly updateAvailable: string | null;
  readonly currentVersion: string;
  readonly updateMessage: string | null;
}
```

When `updateAvailable` is non-null, `updateMessage` is the full user-facing message; otherwise `updateMessage` is `null`.

**createCompileHandler (new parameter in `mcp/src/handlers/compile-handler.ts`):**

Add after `setLastConversationId`:

```typescript
getUpdateMessage: () => string | null,
```

Include `updateMessage: getUpdateMessage() ?? null` in the returned JSON (same level as `compiledPrompt`, `meta`, `conversationId`).

## Dependent Types

### Tier 0 — verbatim

`UpdateInfo` — extended in place in `mcp/src/latest-version-check.ts` with `readonly updateMessage: string | null`.

### Tier 1 / Tier 2

None — no other new types.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Message and UpdateInfo in latest-version-check.ts

In `mcp/src/latest-version-check.ts`:

- Define a constant or helper that returns the user-facing message for a given version string: `A newer AIC version (${version}) is available. Run \`rm -rf ~/.npm/_npx\` then reload Cursor to update.`
- Add `readonly updateMessage: string | null` to the `UpdateInfo` interface.
- In `getUpdateInfo`, when `hasUpdate` is true: set `updateMessage` to that message (with `latestVersion`); when `hasUpdate` is false or latest is null, set `updateMessage` to `null`.
- Change the content passed to `writeMessageFile` when an update is available from the current text to the same message string (so `.aic/update-available.txt` contains the new instructions).
- Return the new `updateMessage` field in every return path of `getUpdateInfo`.

**Verify:** `pnpm typecheck` passes. Grep for `updateMessage` in `mcp/src/latest-version-check.ts` shows the field in the interface and in all return objects.

### Step 2: Stderr, getUpdateMessage, and status resource in server.ts

In `mcp/src/server.ts`:

- In the `setImmediate` callback that calls `getUpdateInfo`, in the `.then((info) => { ... })` block: when `info.updateAvailable !== null`, call `process.stderr.write(\`[aic] ${info.updateMessage}\n\`)` (use `info.updateMessage` since it is the full message).
- Define a getter that returns the current update message: `() => updateInfoRef.current.updateMessage ?? null`.
- Add `getUpdateMessage` as the next parameter to `createCompileHandler(..., setLastConversationId, getUpdateMessage)`.
- In the status resource handler, add `updateMessage: updateInfoRef.current.updateMessage` to the object passed to `JSON.stringify` (alongside `updateAvailable`, `installScope`, etc.).

**Verify:** `pnpm typecheck` passes. Grep for `getUpdateMessage` and `updateMessage` in `mcp/src/server.ts` confirms the getter, the pass-through to createCompileHandler, and the status payload.

### Step 3: getUpdateMessage and response in compile-handler.ts

In `mcp/src/handlers/compile-handler.ts`:

- Add `getUpdateMessage: () => string | null` as the last parameter of `createCompileHandler`.
- In the successful return object (the `JSON.stringify` payload), add `updateMessage: getUpdateMessage() ?? null` so the aic_compile tool response includes the update message when present.

**Verify:** `pnpm typecheck` passes. The compile handler return type includes `updateMessage` in the serialized payload.

### Step 4: Tests

In `mcp/src/__tests__/latest-version-check.test.ts`:

- Add a test that mocks fetch to return latest 0.2.2 with current 0.2.1. Call `getUpdateInfo`. Assert `result.updateMessage` is the exact string containing the version and `rm -rf ~/.npm/_npx`. Assert the written `.aic/update-available.txt` content equals `result.updateMessage` when update is available.

In `mcp/src/__tests__/server.test.ts`:

- In or alongside the existing `status_resource_includes_updateAvailable` test: after parsing the status JSON, assert `parsed.updateMessage` equals the expected full message string for the mocked latest version. For that test the mocked latest is 99.0.0, so assert `parsed.updateMessage` equals `A newer AIC version (99.0.0) is available. Run \`rm -rf ~/.npm/_npx\` then reload Cursor to update.`.

**Verify:** `pnpm test mcp/src/__tests__/latest-version-check.test.ts mcp/src/__tests__/server.test.ts` passes.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| getUpdateMessage_returned_when_update_available | getUpdateInfo returns updateMessage with version and cache-clear instructions; update-available.txt content matches |
| status_resource_includes_updateMessage | aic://status JSON includes updateMessage with the full instruction string when update is available |

## Acceptance Criteria

- [ ] All files modified per Files table
- [ ] UpdateInfo includes updateMessage; createCompileHandler accepts getUpdateMessage and returns updateMessage in JSON
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` outside allowed files
- [ ] No `let` in production code (only `const`; control flags in imperative closures are the sole exception)
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
