# Task 200: Sanitise cache values before pipeline use

> **Status:** Pending
> **Phase:** AE (Cache File Security Validation)
> **Layer:** mcp
> **Depends on:** AE02 (Strict field validation on cache reads)

## Goal

On the server, pass cache-derived `modelId`, `conversationId`, and `editorId` through the same Zod constraints as in `compilation-request.ts` before using them in the compilation request, SQL (compilation_log), or tool response so that pipeline and DB never receive unsanitised values.

## Architecture Notes

- Validation boundary (ADR-009): Zod stays at MCP boundary; this task adds a second gate after resolve (args + cache + detector) so all three IDs match tool-arg constraints before request build.
- Single gate: Sanitise once after resolving; the resulting request is used for pipeline, `setLastConversationId`, `buildSuccessResponse`, and thus compilation_log and tool response.
- Defaults on parse failure: `modelId` null, `conversationId` null, `editorId` `EDITOR_ID.GENERIC` (no env or cache).

## Files

| Action | Path |
| ------ | ---- |
| Modify | `mcp/src/schemas/compilation-request.ts` (add and export `SanitisedCacheIdsSchema`) |
| Modify | `mcp/src/handlers/compile-handler.ts` (sanitise resolved IDs before building request) |
| Modify | `mcp/src/handlers/__tests__/compile-handler.test.ts` (three sanitise test cases) |

## Interface / Signature

No new interface. New schema and handler flow:

```typescript
// mcp/src/schemas/compilation-request.ts — add and export
export const SanitisedCacheIdsSchema = z.object({
  modelId: z
    .string()
    .max(256)
    .regex(/^[\x20-\x7E]+$/)
    .nullable()
    .default(null),
  conversationId: z
    .string()
    .max(128)
    .regex(/^[\x20-\x7E]+$/)
    .nullable()
    .optional(),
  editorId: z
    .enum(["cursor", "cursor-claude-code", "claude-code", "generic"])
    .default("generic"),
});
export type SanitisedCacheIds = z.infer<typeof SanitisedCacheIdsSchema>;
```

```typescript
// compile-handler: after resolvedModelId, resolvedConversationId, resolvedEditorId are set
const parsed = SanitisedCacheIdsSchema.safeParse({
  modelId: resolvedModelId,
  conversationId: resolvedConversationId,
  editorId: resolvedEditorId,
});
const safe =
  parsed.success === true
    ? parsed.data
    : {
        modelId: null as string | null,
        conversationId: null as string | null,
        editorId: EDITOR_ID.GENERIC as EditorId,
      };
// Build request and setLastConversationId from safe.*
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// CompilationRequest — build from safe IDs
interface CompilationRequest {
  readonly intent: string;
  readonly projectRoot: AbsolutePath;
  readonly modelId: string | null;
  readonly editorId: EditorId;
  readonly configPath: FilePath | null;
  readonly sessionId?: SessionId;
  readonly triggerSource?: TriggerSource;
  readonly conversationId?: ConversationId | null;
}
```

### Tier 1 — signature + path

| Type        | Path                                      | Members              | Purpose                    |
| ----------- | ----------------------------------------- | -------------------- | -------------------------- |
| `EditorId`  | `shared/src/core/types/enums.ts`           | EDITOR_ID.GENERIC    | Fallback when parse fails  |

### Tier 2 — path-only

| Type             | Path                              | Factory              |
| ---------------- | --------------------------------- | -------------------- |
| `ConversationId` | `shared/src/core/types/identifiers.js` | `toConversationId(raw)` |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add SanitisedCacheIdsSchema to compilation-request.ts

In `mcp/src/schemas/compilation-request.ts`, after the existing `compilationRequestShape` and before the `CompilationRequestSchema` export, add `SanitisedCacheIdsSchema` as a `z.object` with:

- `modelId`: `z.string().max(256).regex(/^[\x20-\x7E]+$/).nullable().default(null)`
- `conversationId`: `z.string().max(128).regex(/^[\x20-\x7E]+$/).nullable().optional()`
- `editorId`: `z.enum(["cursor", "cursor-claude-code", "claude-code", "generic"]).default("generic")`

Export the schema and `type SanitisedCacheIds = z.infer<typeof SanitisedCacheIdsSchema>`.

**Verify:** `pnpm typecheck` passes; no change to `CompilationRequestSchema` or its export.

### Step 2: Sanitise resolved IDs in compile-handler before building request

In `mcp/src/handlers/compile-handler.ts`, add a named import for `SanitisedCacheIdsSchema` from the compilation-request schema module. Import `EDITOR_ID` from `@jatbas/aic-core/core/types/enums.js`.

Immediately after the block that sets `resolvedModelId`, `resolvedConversationId`, and `resolvedEditorId`, call `SanitisedCacheIdsSchema.safeParse({ modelId: resolvedModelId, conversationId: resolvedConversationId, editorId: resolvedEditorId })`. If `result.success === true`, set `safe = result.data`. Otherwise set `safe = { modelId: null, conversationId: null, editorId: EDITOR_ID.GENERIC }` (typed so `editorId` is `EditorId`).

Build the `request` object using `safe.modelId`, `safe.editorId`, and for `conversationId`: when `safe.conversationId != null` and `safe.conversationId !== ""`, spread `{ conversationId: toConversationId(safe.conversationId) }`; otherwise do not add `conversationId`. Call `setLastConversationId(safe.conversationId ?? null)`.

**Verify:** Handler still compiles; request and setLastConversationId use only safe fields.

### Step 3: Add sanitise tests in compile-handler.test.ts

Add three test cases that exercise the sanitise step:

1. **sanitise_overlong_modelId:** Arrange so that the resolved modelId is a string longer than 256 characters (or contains a character outside `\x20-\x7E`). Use a scope/getRunner setup that allows the handler to run and build a request. Assert that the request object passed to the runner has `modelId: null`. Implement by seeding the session-model cache with an overlong modelId for the test project and conversation, then calling the handler so it reads from cache and sanitises; assert the resulting request has `modelId: null`.

2. **sanitise_invalid_editorId:** Arrange so that the resolved editorId is the string `"unknown"` (not one of the four enum values). Assert that the request object has `editorId` equal to `EDITOR_ID.GENERIC`.

3. **sanitise_valid_passthrough:** Supply valid resolved values (modelId non-null and within length, conversationId within length, editorId one of the enum values). Assert that the request’s `modelId`, `editorId`, and `conversationId` (if present) match the supplied values.

**Verify:** `pnpm test -- mcp/src/handlers/__tests__/compile-handler.test.ts` passes for the three new cases.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                  | Description                                                                 |
| -------------------------- | --------------------------------------------------------------------------- |
| sanitise_overlong_modelId  | Resolved modelId over 256 chars or invalid chars yields request.modelId null |
| sanitise_invalid_editorId  | Resolved editorId not in enum yields request.editorId EDITOR_ID.GENERIC     |
| sanitise_valid_passthrough | Valid resolved values appear unchanged in request                            |

## Acceptance Criteria

- [ ] All files modified per Files table
- [ ] SanitisedCacheIdsSchema exported from compilation-request.ts with editorId default "generic"
- [ ] Handler builds request and setLastConversationId only from sanitised (parsed or default) values
- [ ] All three test cases pass
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
