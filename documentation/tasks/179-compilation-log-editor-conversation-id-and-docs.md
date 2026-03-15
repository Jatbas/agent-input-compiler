# Task 179: compilation_log editor_id and conversation_id fixes + doc alignment

> **Status:** Pending
> **Phase:** Post-MVP (maintenance)
> **Layer:** mcp + documentation
> **Depends on:** Task 175 (editor env-first detection), inject hook fallback chain (already applied)
> **Research:** documentation/research/2026-03-16-compilation-log-editor-and-conversation-id.md

## Goal

Reduce compilation_log rows with wrong editor_id (such as "claude-code" when using Cursor) and align documentation with actual behavior: the Cursor preToolUse hook injects only conversationId; editor ID is determined by the MCP server from client name and environment. Add a server-side editor fallback when client name is "claude-code" and CURSOR_PROJECT_DIR is set (Cursor+Opus case).

## Architecture Notes

- Extend existing EditorEnvHints and detectEditorId; no new interfaces or files (Simplicity Principle).
- No server-side conversation_id fallback when args.conversationId is null — multi-chat safe.
- Editor detection order: CURSOR_AGENT → CLAUDE_PROJECT_DIR → (new) CURSOR_PROJECT_DIR + client "claude-code" → CURSOR → client name pattern → GENERIC.
- Documentation: factual accuracy — hook table and any inject-hook description must state conversationId only; editor from MCP server.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `mcp/src/detect-editor-id.ts` (add cursorProjectDir to interface and Cursor+Opus rescue branch) |
| Modify | `mcp/src/editor-integration-dispatch.ts` (add cursorProjectDir to getEditorEnvHints) |
| Modify | `mcp/src/__tests__/detect-editor-id.test.ts` (add two tests for cursorProjectDir + claude-code) |
| Modify | `documentation/installation.md` (fix hook table row for AIC-inject-conversation-id.cjs) |
| Modify | `documentation/mvp-progress.md` (only if any claim that inject hook injects editorId — verify and fix) |

## Interface / Signature

```typescript
// EditorEnvHints — add one optional field (mcp/src/detect-editor-id.ts)
export interface EditorEnvHints {
  readonly cursorAgent?: boolean;
  readonly claudeCodeProjectDir?: boolean;
  readonly cursorProjectDir?: boolean;
}
```

```typescript
// detectEditorId(clientName, envHints?) — add one branch after claudeCodeProjectDir check, before client name pattern:
// if (envHints?.cursorProjectDir === true && clientName !== undefined && clientName.toLowerCase().includes("claude-code")) return EDITOR_ID.CURSOR;
```

## Config Changes

- **package.json:** No change
- **eslint.config.mjs:** No change

## Change Specification (documentation)

### Change 1: installation.md — Hook table row for AIC-inject-conversation-id.cjs

**Current text:**

> | `AIC-inject-conversation-id.cjs`  | `preToolUse`           | Injects `conversationId` and `editorId` into `aic_compile` args      |

**Required change:** The hook injects only conversationId; editor ID is determined by the MCP server. Fix the description for accuracy.

**Target text:**

> | `AIC-inject-conversation-id.cjs`  | `preToolUse`           | Injects `conversationId` into `aic_compile` and `aic_chat_summary` args. Editor ID is determined by the MCP server from client and environment. |

### Change 2: mvp-progress.md — Verify inject hook description

**Required change:** Grep for any phrase that states the inject hook injects editorId. If found, replace with conversationId-only wording and state that editor is from MCP server. If not found, no edit.

## Steps

### Step 1: Add cursorProjectDir to EditorEnvHints and getEditorEnvHints

In `mcp/src/detect-editor-id.ts`, add `readonly cursorProjectDir?: boolean;` to the `EditorEnvHints` interface.

In `mcp/src/editor-integration-dispatch.ts`, in `getEditorEnvHints()`: compute `cursorProjectDir` as true when `process.env["CURSOR_PROJECT_DIR"]` is defined and non-empty (same pattern as `claudeCodeProjectDir`). Add `cursorProjectDir` to the returned object.

**Verify:** TypeScript compiles; no lint errors.

### Step 2: Add Cursor+Opus rescue branch in detectEditorId

In `mcp/src/detect-editor-id.ts`, in `detectEditorId`, after the `claudeCodeProjectDir` check and before the `if (clientName !== undefined)` block: add a condition that returns `EDITOR_ID.CURSOR` when `envHints?.cursorProjectDir === true` and `clientName` is defined and `clientName.toLowerCase().includes("claude-code")`.

**Verify:** Existing tests still pass; new behavior covered in Step 3.

### Step 3: Add tests for cursorProjectDir + claude-code client

In `mcp/src/__tests__/detect-editor-id.test.ts`, add two tests: (1) `detectEditorId("claude-code", { cursorProjectDir: true })` returns `EDITOR_ID.CURSOR`; (2) `detectEditorId("claude-code", { cursorProjectDir: false })` returns `EDITOR_ID.CLAUDE_CODE`.

**Verify:** `pnpm test mcp/src/__tests__/detect-editor-id.test.ts` passes.

### Step 4: Fix installation.md hook table row

Apply Change 1 from the Change Specification: replace the current text for the AIC-inject-conversation-id.cjs row with the target text.

**Verify:** Grep the file for "editorId" in the hook table — the inject row must not claim the hook injects editorId.

### Step 5: Verify and fix mvp-progress.md inject hook description

Grep `documentation/mvp-progress.md` for "inject" and "editorId" (and "AIC-inject-conversation-id") in context. If any sentence states that the inject hook injects editorId, change it to state that the hook injects conversationId only and that editor ID is determined by the MCP server. If no such sentence exists, leave the file unchanged.

**Verify:** No remaining claim that the inject hook injects editorId.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| cursorProjectDir_true_claude_code_returns_cursor | When client name is "claude-code" and cursorProjectDir is true, detectEditorId returns CURSOR (Cursor+Opus rescue) |
| cursorProjectDir_false_claude_code_returns_claude_code | When client name is "claude-code" and cursorProjectDir is false, detectEditorId returns CLAUDE_CODE (unchanged) |

## Acceptance Criteria

- [ ] EditorEnvHints includes cursorProjectDir; getEditorEnvHints sets it from CURSOR_PROJECT_DIR
- [ ] detectEditorId returns CURSOR when cursorProjectDir true and client name includes "claude-code"
- [ ] Two new test cases pass
- [ ] installation.md hook table row for AIC-inject-conversation-id.cjs states conversationId only and editor from MCP server
- [ ] mvp-progress.md has no claim that the inject hook injects editorId (or is updated if found)
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
