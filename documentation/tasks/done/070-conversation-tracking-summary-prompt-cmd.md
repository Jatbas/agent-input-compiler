# Task 070: Conversation tracking — summary + prompt command

> **Status:** Done
> **Phase:** M (Reporting & Resources)
> **Layer:** shared (core, storage) + mcp
> **Depends on:** Conversation tracking: schema + plumbing (Done)

## Goal

Add per-conversation status aggregates and expose them via an MCP tool plus a prompt command so users can ask for "aic chat summary" and see compilation stats for the current conversation (KL-004 items 4–6).

## Architecture Notes

- KL-004: SqliteStatusStore gains getConversationSummary(conversationId) returning per-conversation aggregates; expose as MCP tool; wire "show aic chat summary" prompt command in AIC-architect.mdc.
- ADR-010: conversationId is ConversationId branded type.
- StatusStore is extended with one method; SqliteStatusStore implements it with SQL filtered by conversation_id (migration 007 already added the column).
- MCP tool aic_conversation_summary(conversationId) returns JSON; when no compilations exist for that conversation, return a payload with compilationsInConversation: 0 (or summary null) so the client gets a consistent shape.

## Files

| Action | Path                                                                                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modify | `shared/src/core/types/status-types.ts` (add ConversationSummary type)                                                                                                  |
| Modify | `shared/src/core/interfaces/status-store.interface.ts` (add getConversationSummary)                                                                                     |
| Modify | `shared/src/storage/sqlite-status-store.ts` (implement getConversationSummary)                                                                                          |
| Modify | `shared/src/storage/__tests__/sqlite-status-store.test.ts` (migrations 005/007 in setup, getConversationSummary tests, extend insertCompilationLog for conversation_id) |
| Create | `mcp/src/schemas/conversation-summary-request.ts` (Zod schema: conversationId)                                                                                          |
| Modify | `mcp/src/server.ts` (register tool aic_conversation_summary, instantiate StatusStore, call getConversationSummary, return JSON)                                         |
| Modify | `mcp/src/__tests__/server.test.ts` (tests for aic_conversation_summary tool)                                                                                            |
| Modify | `.cursor/rules/aic-architect.mdc` (add "show aic chat summary" prompt command)                                                                                          |

## Interface / Signature

```typescript
// status-store.interface.ts — add to existing StatusStore
import type { ConversationId } from "#core/types/identifiers.js";
import type { ConversationSummary } from "#core/types/status-types.js";

getConversationSummary(conversationId: ConversationId): ConversationSummary | null;
```

```typescript
// status-types.ts — new type (add to same file as StatusAggregates)
export interface ConversationSummary {
  readonly conversationId: string;
  readonly compilationsInConversation: number;
  readonly cacheHitRatePct: number | null;
  readonly avgReductionPct: number | null;
  readonly totalTokensRaw: number;
  readonly totalTokensCompiled: number;
  readonly totalTokensSaved: number | null;
  readonly lastCompilationInConversation: {
    readonly intent: string;
    readonly filesSelected: number;
    readonly filesTotal: number;
    readonly tokensCompiled: number;
    readonly tokenReductionPct: number;
    readonly created_at: string;
    readonly editorId: string;
    readonly modelId: string | null;
  } | null;
  readonly topTaskClasses: readonly {
    readonly taskClass: string;
    readonly count: number;
  }[];
}
```

```typescript
// SqliteStatusStore — add method
getConversationSummary(conversationId: ConversationId): ConversationSummary | null
```

## Dependent Types

### Tier 0 — verbatim

ConversationSummary is defined in status-types.ts (see Interface / Signature). StatusAggregates already in status-types.ts; lastCompilation shape is reused for lastCompilationInConversation.

### Tier 1 — signature + path

| Type           | Path                                 | Purpose                           |
| -------------- | ------------------------------------ | --------------------------------- |
| ConversationId | shared/src/core/types/identifiers.js | toConversationId(raw), param type |

### Tier 2 — path-only

| Type           | Path                                 | Factory               |
| -------------- | ------------------------------------ | --------------------- |
| ConversationId | shared/src/core/types/identifiers.js | toConversationId(raw) |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add ConversationSummary type and StatusStore method

In `shared/src/core/types/status-types.ts`, add interface ConversationSummary with fields: conversationId (string), compilationsInConversation (number), cacheHitRatePct (number | null), avgReductionPct (number | null), totalTokensRaw (number), totalTokensCompiled (number), totalTokensSaved (number | null), lastCompilationInConversation (object with intent, filesSelected, filesTotal, tokensCompiled, tokenReductionPct, created_at, editorId, modelId or null), topTaskClasses (readonly array of { taskClass, count }). In `shared/src/core/interfaces/status-store.interface.ts`, import ConversationId and ConversationSummary, and add method getConversationSummary(conversationId: ConversationId): ConversationSummary | null.

**Verify:** pnpm typecheck passes. Grep for ConversationSummary and getConversationSummary in status-types.ts and status-store.interface.ts.

### Step 2: Implement getConversationSummary in SqliteStatusStore

In `shared/src/storage/sqlite-status-store.ts`, implement getConversationSummary(conversationId): run SQL against compilation*log WHERE conversation_id = ?. Compute: COUNT(*), cache hit rate (SUM(cache*hit=1)\_100.0/NULLIF(COUNT(*),0)), AVG(token*reduction_pct), SUM(tokens_raw), SUM(tokens_compiled), SUM(tokens_raw - tokens_compiled) for tokens saved, last row ORDER BY created_at DESC LIMIT 1 (map to lastCompilationInConversation), task_class counts GROUP BY task_class ORDER BY count DESC LIMIT 3 for topTaskClasses. If COUNT(*) = 0, return null. Return object matching ConversationSummary with conversationId as the string value of the param.

**Verify:** pnpm typecheck passes. Implementation uses only db.prepare and bound params; no Date.now().

### Step 3: Tests for getConversationSummary

In `shared/src/storage/__tests__/sqlite-status-store.test.ts`: run migration005.up(db) and migration007.up(db) in setup() after migration004 so compilation_log has conversation_id. Extend insertCompilationLog to accept conversation_id in overrides and add conversation_id to the INSERT column list and values (use overrides.conversation_id ?? null). Add test getConversationSummary_returns_null_when_no_rows: setup(), call getConversationSummary(toConversationId("conv-unknown")), expect null. Add test getConversationSummary_returns_aggregates_when_rows_exist: setup(), insertCompilationLog twice with conversation_id "conv-1" in overrides, call getConversationSummary(toConversationId("conv-1")), expect compilationsInConversation 2, token sums consistent, lastCompilationInConversation and topTaskClasses set. Add test getConversationSummary_ignores_other_conversations: setup(), insertCompilationLog with conversation_id "conv-a", insertCompilationLog with conversation_id "conv-b", getConversationSummary(toConversationId("conv-a")) returns aggregates for one row only.

**Verify:** pnpm test shared/src/storage/**tests**/sqlite-status-store.test.ts passes.

### Step 4: MCP tool aic_conversation_summary

Create `mcp/src/schemas/conversation-summary-request.ts` with Zod schema: conversationId: z.string().min(1). Export the schema object. In `mcp/src/server.ts`, import the schema and toConversationId. Register server.tool("aic_conversation_summary", schema, handler). Handler: parse args, toConversationId(args.conversationId), create SqliteStatusStore(scope.db, scope.clock), call getConversationSummary(conversationId). If null, return JSON string with { conversationId: args.conversationId, compilationsInConversation: 0, cacheHitRatePct: null, avgReductionPct: null, totalTokensRaw: 0, totalTokensCompiled: 0, totalTokensSaved: null, lastCompilationInConversation: null, topTaskClasses: [] }. Otherwise return JSON string of the summary. Tool response shape: return CallToolResult with content: [{ type: "text", text: JSON.stringify(summaryOrZeroPayload) }] (same pattern as compile-handler).

**Verify:** pnpm typecheck in mcp passes. Grep for aic_conversation_summary in server.ts.

### Step 5: Tests for aic_conversation_summary tool

In `mcp/src/__tests__/server.test.ts`, add test aic_conversation_summary_tool_returns_json_when_compilations_exist: createMcpServer with temp dir, run aic_compile with conversationId in args to create at least one compilation log row (or insert via DB), then callTool aic_conversation_summary with conversationId, assert result.content has one item with type "text", JSON.parse(item.text) has compilationsInConversation >= 1. Add test aic_conversation_summary_tool_returns_zero_when_no_compilations: callTool aic_conversation_summary with a conversationId that has no rows, assert parsed JSON has compilationsInConversation 0 and lastCompilationInConversation null.

**Verify:** pnpm test mcp/src/**tests**/server.test.ts passes.

### Step 6: Prompt command in aic-architect.mdc

In `.cursor/rules/aic-architect.mdc`, under "## Prompt Commands", add a new bullet: **"show aic chat summary"** — When the user says "show aic chat summary" or asks for this conversation's AIC compilation stats, call the MCP tool aic_conversation_summary with the current conversation ID (from hook context or editor). When conversation ID is not available, explain that chat summary requires the editor to pass conversation ID. Start the reply with one short line: **Chat = this conversation's AIC compilations.** Then display the result as a formatted table: compilationsInConversation, totalTokensRaw, totalTokensCompiled, totalTokensSaved, cacheHitRatePct, avgReductionPct, lastCompilationInConversation (intent and created_at), topTaskClasses.

**Verify:** Grep for "show aic chat summary" in .cursor/rules/aic-architect.mdc shows the new bullet.

### Step 7: Final verification

Run: pnpm lint && pnpm typecheck && pnpm test && pnpm knip
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                                          | Description                                                                                          |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| getConversationSummary_returns_null_when_no_rows                   | No compilation_log rows for conversationId; returns null                                             |
| getConversationSummary_returns_aggregates_when_rows_exist          | Rows with same conversation_id; returns correct counts and aggregates                                |
| getConversationSummary_ignores_other_conversations                 | Rows with different conversation_id; only requested conversation aggregated                          |
| aic_conversation_summary_tool_returns_json_when_compilations_exist | MCP tool with conversationId that has compilations returns JSON with compilationsInConversation >= 1 |
| aic_conversation_summary_tool_returns_zero_when_no_compilations    | MCP tool with unknown conversationId returns JSON with compilationsInConversation 0                  |

## Acceptance Criteria

- [ ] ConversationSummary type and StatusStore.getConversationSummary added; SqliteStatusStore implements it
- [ ] All test cases pass
- [ ] MCP tool aic_conversation_summary registered and returns JSON
- [ ] Prompt command "show aic chat summary" documented in aic-architect.mdc
- [ ] pnpm lint — zero errors, zero warnings
- [ ] pnpm typecheck — clean
- [ ] pnpm knip — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No Date.now() or Math.random() in new code

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
