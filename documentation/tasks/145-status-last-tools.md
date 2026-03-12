# Task 145: Add aic_status and aic_last MCP Tools

> **Status:** Pending
> **Phase:** Phase W — Global Server & Per-Project Isolation
> **Layer:** mcp
> **Depends on:** W12 (commands scoped by project) — Done

## Goal

Expose `aic_status` and `aic_last` as MCP tools so the AI can call them directly without needing editor-specific server identifiers. The existing `aic://status` and `aic://last` resources remain for programmatic MCP client access.

## Architecture Notes

- MCP resources are application-controlled — the AI cannot invoke them directly. Only tools are model-controlled. The current `aic://status` and `aic://last` are resources, which means the AI relies on editor-specific mechanisms (`FetchMcpResource` in Cursor with a hardcoded server identifier) to access them. This is not portable across editors or projects.
- Two of the four prompt commands already use tools: `aic_chat_summary` and `aic_projects`. This task makes all four consistent.
- The resource handlers already contain the complete logic. The new tools reuse the same `SqliteStatusStore` queries — no new storage code needed.
- Resources are kept for backward compatibility and for non-AI MCP clients that consume them programmatically.
- The trigger rule template (`install-trigger-rule.ts`) gains prompt command instructions so production users can use "show aic status", "show aic last", "show aic chat summary", and "show aic projects".
- The dev rule file (`aic-architect.mdc`) switches from `FetchMcpResource` to tool calls.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `mcp/src/server.ts` (add `aic_status` and `aic_last` tool registrations) |
| Modify | `mcp/src/__tests__/server.test.ts` (add tests for new tools) |
| Modify | `mcp/src/install-trigger-rule.ts` (add prompt command instructions to trigger rule template) |
| Modify | `.cursor/rules/aic-architect.mdc` (replace `FetchMcpResource` with tool calls) |
| Modify | `documentation/installation.md` (document the new tools) |

## Interface / Signature

No new interfaces or classes. The tools are registered inline in `createMcpServer`, following the same pattern as `aic_projects`:

```typescript
// aic_status tool — returns same JSON as aic://status resource
const aicStatusParams: z.ZodRawShape = {};
server.tool(
  "aic_status",
  "Project-level AIC status: compilations, token savings, budget utilization, guard findings, top task classes.",
  aicStatusParams,
  () => {
    // reuse existing aic://status resource logic
  },
);

// aic_last tool — returns same JSON as aic://last resource
const aicLastParams: z.ZodRawShape = {};
server.tool(
  "aic_last",
  "Most recent AIC compilation: intent, files selected, tokens compiled, reduction percentage, guard status.",
  aicLastParams,
  () => {
    // reuse existing aic://last resource logic
  },
);
```

## Dependent Types

### Tier 1 — signature + path

| Type | Path | Members | Purpose |
| ---- | ---- | ------- | ------- |
| `SqliteStatusStore` | `shared/src/storage/sqlite-status-store.ts` | 7 | `getSummary`, `getGlobalSummary`, `getProjectIdForConversation`, `getProjectRoot`, `listProjects`, `getConversationSummary`, `getInstallationInfo` |

### Tier 2 — path-only

| Type | Path | Factory |
| ---- | ---- | ------- |
| `ProjectId` | `shared/src/core/types/identifiers.ts` | `toProjectId(raw)` |
| `ConversationId` | `shared/src/core/types/identifiers.ts` | `toConversationId(raw)` |

## Config Changes

- **package.json:** no change
- **eslint.config.mjs:** no change

## Steps

### Step 1: Add aic_status tool to server.ts

Register `aic_status` as an MCP tool in `createMcpServer`, immediately after the `aic_projects` tool registration. Extract the logic from the existing `aic://status` resource handler body into the tool handler. The tool returns the same JSON payload wrapped in `{ content: [{ type: "text", text: JSON.stringify(payload) }] }` (tool response format) instead of `{ contents: [{ uri, mimeType, text }] }` (resource response format).

The `aic://status` resource handler remains unchanged.

**Verify:** `pnpm typecheck` passes in `mcp/`.

### Step 2: Add aic_last tool to server.ts

Register `aic_last` as an MCP tool in `createMcpServer`, immediately after `aic_status`. Extract the logic from the existing `aic://last` resource handler body into the tool handler. Same response format translation as Step 1.

The `aic://last` resource handler remains unchanged.

**Verify:** `pnpm typecheck` passes in `mcp/`.

### Step 3: Add tests for aic_status and aic_last tools

Add test cases to `mcp/src/__tests__/server.test.ts` following the pattern of the existing `aic_projects` tool test. Each test calls the tool and verifies the response contains the expected JSON structure.

**Verify:** `pnpm test` passes.

### Step 4: Update trigger rule template with prompt commands

In `mcp/src/install-trigger-rule.ts`, add prompt command instructions to `TRIGGER_RULE_TEMPLATE` after the existing `aic_compile` instructions. The instructions tell the AI how to handle "show aic status", "show aic last", "show aic chat summary", and "show aic projects" by calling the corresponding tools (`aic_status`, `aic_last`, `aic_chat_summary`, `aic_projects`). Include formatting guidelines (human-readable labels, commas for numbers, percentages with 1 decimal, relative timestamps).

**Verify:** Read the updated template and confirm the instructions reference tool names, not resource URIs or server identifiers.

### Step 5: Update aic-architect.mdc

In `.cursor/rules/aic-architect.mdc`, replace the two `FetchMcpResource` instructions:

- "show aic status" — change from `read the MCP resource aic://status from the project-0-AIC-aic-dev server using FetchMcpResource` to `call the aic_status MCP tool (no arguments)`
- "show aic last" — change from `read the MCP resource aic://last from the project-0-AIC-aic-dev server` to `call the aic_last MCP tool (no arguments)`

**Verify:** Grep the file for `FetchMcpResource` and `project-0-` — zero matches for status/last commands.

### Step 6: Update installation.md

Add the new tools to the documentation. Mention that all four prompt commands (`aic_status`, `aic_last`, `aic_chat_summary`, `aic_projects`) are MCP tools that work in any editor without server-identifier dependencies.

**Verify:** Read the updated section.

### Step 7: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| `aic_status returns project summary` | Call `aic_status` tool, verify response contains `compilationsTotal`, `budgetMaxTokens`, `projectEnabled` fields |
| `aic_last returns last compilation` | Call `aic_last` tool, verify response contains `compilationCount`, `lastCompilation` fields |
| `aic_status with no compilations` | Call `aic_status` on empty DB, verify response has zero counts and null last compilation |

## Acceptance Criteria

- [ ] `aic_status` tool registered and returns same JSON as `aic://status` resource
- [ ] `aic_last` tool registered and returns same JSON as `aic://last` resource
- [ ] `aic://status` and `aic://last` resources still work (not removed)
- [ ] All test cases pass
- [ ] Trigger rule template includes prompt command instructions using tool names
- [ ] `aic-architect.mdc` no longer references `FetchMcpResource` or server identifiers for status/last
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
