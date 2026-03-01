# Task 054: File-based model detection

> **Status:** In Progress
> **Phase:** Phase 1 (KL-006 completion)
> **Layer:** core, adapter, mcp
> **Depends on:** ModelDetector, ModelDetectorDispatch

## Goal

Populate `compilation_log.model_id` from editor config files when env vars are unset, by adding an EditorModelConfigReader and wiring it into the MCP composition root so ModelEnvHints include file-based values.

## Architecture Notes

- Hexagonal: EditorModelConfigReader interface in core; adapter in shared/adapters uses node:fs/node:path; MCP composition root builds ModelEnvHints from env then reader fallback.
- Design: homeDir injected into adapter for testability. Project plan §2.2: Cursor `~/.cursor/settings.json` key `model`, Claude Code `~/.claude/settings.json` key `model`.

## Files

| Action | Path                                                                 |
| ------ | -------------------------------------------------------------------- |
| Create | `shared/src/core/interfaces/editor-model-config-reader.interface.ts` |
| Create | `shared/src/adapters/editor-model-config-reader.ts`                  |
| Create | `shared/src/adapters/__tests__/editor-model-config-reader.test.ts`   |
| Modify | `mcp/src/server.ts` (create reader, build hints from env + reader)   |

## Interface / Signature

```typescript
// shared/src/core/interfaces/editor-model-config-reader.interface.ts
import type { EditorId } from "#core/types/enums.js";

export interface EditorModelConfigReader {
  read(editorId: EditorId): string | null;
}
```

```typescript
// shared/src/adapters/editor-model-config-reader.ts — class declaration
import type { EditorModelConfigReader } from "#core/interfaces/editor-model-config-reader.interface.js";
import type { EditorId } from "#core/types/enums.js";
import { EDITOR_ID } from "#core/types/enums.js";

export class EditorModelConfigReaderAdapter implements EditorModelConfigReader {
  constructor(private readonly homeDir: string) {}
  read(editorId: EditorId): string | null {
    // Step 2 implements: path.join, fs.existsSync, fs.readFileSync, JSON.parse, key "model"
  }
}
```

## Dependent Types

### Tier 0 — verbatim

EditorId and EDITOR_ID are from shared/src/core/types/enums.ts (existing). Adapter uses EditorId parameter only.

### Tier 2 — path-only

| Type     | Path                           | Note                             |
| -------- | ------------------------------ | -------------------------------- |
| EditorId | shared/src/core/types/enums.js | factory: not used in constructor |

## Config Changes

- **shared/package.json:** No change.
- **eslint.config.mjs:** No change. Adapters layer is not restricted from node:fs/node:path.

## Steps

### Step 1: Add EditorModelConfigReader interface

Create `shared/src/core/interfaces/editor-model-config-reader.interface.ts` with the interface block from the Interface / Signature section (import EditorId from #core/types/enums.js; export interface EditorModelConfigReader { read(editorId: EditorId): string | null; }).

**Verify:** File exists and exports EditorModelConfigReader.

### Step 2: Implement EditorModelConfigReaderAdapter

Create `shared/src/adapters/editor-model-config-reader.ts`. Implement EditorModelConfigReader. Constructor: `constructor(private readonly homeDir: string)`. Method read(editorId: EditorId): string | null — use sync API: for EDITOR_ID.CURSOR build path with `path.join(homeDir, ".cursor", "settings.json")`; for EDITOR_ID.CLAUDE_CODE use `path.join(homeDir, ".claude", "settings.json")`; for EDITOR_ID.GENERIC return null. For Cursor and Claude Code: if `fs.existsSync(fullPath)` is false return null; else `const content = fs.readFileSync(fullPath, "utf8")`; parse with JSON.parse; if parse throws return null; read `(parsed as { model?: string }).model`; if typeof value is string return it else return null. Use path.join and fs from node:path and node:fs.

**Verify:** File exists, implements EditorModelConfigReader, uses path.join, fs.existsSync, fs.readFileSync only.

### Step 3: Add tests for EditorModelConfigReaderAdapter

Create `shared/src/adapters/__tests__/editor-model-config-reader.test.ts`. Use a temp dir: mkdtempSync from node:fs and tmpdir from node:os as homeDir. Tests: editor_config_returns_model_for_cursor — write `.cursor/settings.json` with `{"model":"gpt-4o"}`, instantiate adapter with temp dir, expect read(EDITOR_ID.CURSOR) to be "gpt-4o". editor_config_returns_model_for_claude_code — write `.claude/settings.json` with `{"model":"claude-sonnet-4"}`, expect read(EDITOR_ID.CLAUDE_CODE) to be "claude-sonnet-4". editor_config_returns_null_for_generic — expect read(EDITOR_ID.GENERIC) to be null. missing_file_returns_null — no file at path, expect read(EDITOR_ID.CURSOR) null. malformed_json_returns_null — write invalid JSON to file, expect read returns null. missing_model_key_returns_null — write `{}` to file, expect read returns null. Clean up temp dir in afterEach or afterAll.

**Verify:** All six test cases exist and the test file runs with vitest.

### Step 4: MCP server wire reader into ModelEnvHints

In `mcp/src/server.ts` import os from node:os and EditorModelConfigReaderAdapter from shared adapter. Create editor config reader: `const editorConfigReader = new EditorModelConfigReaderAdapter(process.env["HOME"] ?? os.homedir())`. Build hints for ModelDetectorDispatch: `anthropicModel: process.env["ANTHROPIC_MODEL"] ?? editorConfigReader.read(EDITOR_ID.CLAUDE_CODE)`, `cursorModel: process.env["CURSOR_MODEL"] ?? editorConfigReader.read(EDITOR_ID.CURSOR)`. Pass these hints to the existing ModelDetectorDispatch constructor (replace the current plain env-only hints).

**Verify:** createMcpServer creates EditorModelConfigReaderAdapter with home dir; ModelDetectorDispatch receives hints that include reader output when env vars are unset.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                   | Description                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| editor_config_returns_model_for_cursor      | Temp dir with .cursor/settings.json {"model":"gpt-4o"}, read(CURSOR) returns "gpt-4o"                        |
| editor_config_returns_model_for_claude_code | Temp dir with .claude/settings.json {"model":"claude-sonnet-4"}, read(CLAUDE_CODE) returns "claude-sonnet-4" |
| editor_config_returns_null_for_generic      | read(GENERIC) returns null                                                                                   |
| missing_file_returns_null                   | No file at path, read returns null                                                                           |
| malformed_json_returns_null                 | Invalid JSON in file, read returns null                                                                      |
| missing_model_key_returns_null              | Valid JSON without model key, read returns null                                                              |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] Interface matches signature exactly
- [ ] All test cases pass
- [ ] pnpm lint — zero errors, zero warnings
- [ ] pnpm typecheck — clean
- [ ] pnpm knip — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No Date.now(), new Date(), Math.random() outside allowed files
- [ ] No let in production code (const only; control flags in imperative closures are the sole exception)
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. Stop immediately — do not guess or improvise
2. Append a ## Blocked section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
