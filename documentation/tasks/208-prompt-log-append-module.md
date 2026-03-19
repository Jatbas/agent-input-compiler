# Task 208: Extract shared prompt-log append module

> **Status:** Pending
> **Phase:** AG (Prompt Log Pipeline Simplification)
> **Layer:** integration (integrations/shared/)
> **Depends on:** AG02 (Design unified prompt-log schema)

## Goal

Create a shared CommonJS module that appends one JSON line per call to `{projectRoot}/.aic/prompt-log.jsonl` with schema validation, path construction, mkdir+append, and non-fatal error handling so AG04 can migrate all write sites to it.

## Architecture Notes

- Integration layer lives in `integrations/shared/`; hooks are CommonJS (`.cjs`). No core interface; standalone function.
- Reuse pattern from `session-model-cache.cjs`: `path.join(projectRoot, ".aic", filename)`, `fs.mkdirSync(dir, { recursive: true, mode: 0o700 })`, `fs.appendFileSync(..., "utf8")`, try/catch no throw.
- Validators from `cache-field-validators.cjs` for envelope (conversationId, editorId, timestamp); add three validators for prompt-log–specific fields and keep `shared/src/maintenance/cache-field-validators.ts` in sync per CJS header.
- `.aic/` directory must be created with mode `0o700` (security.md). appendPromptLog never throws; validation failure or I/O error results in return without writing.

## Files

| Action | Path |
| ------ | ---- |
| Create | `integrations/shared/prompt-log.cjs` |
| Create | `integrations/shared/__tests__/prompt-log.test.cjs` |
| Modify | `integrations/shared/cache-field-validators.cjs` (add isValidPromptLogTitle, isValidPromptLogReason, isValidGenerationId) |
| Modify | `shared/src/maintenance/cache-field-validators.ts` (add same three validators; keep in sync) |

## Interface / Signature

```javascript
// appendPromptLog(projectRoot: string, entry: object): void
// - projectRoot: absolute path to project (CURSOR_PROJECT_DIR or process.cwd())
// - entry: object matching unified schema (type, editorId, conversationId, timestamp + type-specific fields)
// - Side effect: appends one JSON line to {projectRoot}/.aic/prompt-log.jsonl. Creates .aic with 0o700 on first write. Never throws.
```

Entry shape (unified schema from documentation/prompt-log-schema.md):

- Required envelope: `type` ("prompt" | "session_end"), `editorId` (string), `conversationId` (string), `timestamp` (string, ISO 8601)
- When `type === "prompt"`: `generationId` (string), `title` (string, max 200 chars), `model` (string, empty string allowed)
- When `type === "session_end"`: `reason` (string)

## Dependent Types

No TypeScript types; schema is in documentation. Implementation validates via `cache-field-validators.cjs` and type discriminator.

## Config Changes

- **package.json:** No change
- **eslint.config.mjs:** No change

## Steps

### Step 1a: Add validators to integrations/shared/cache-field-validators.cjs

Add three functions and export them in `module.exports`:

- `isValidPromptLogTitle(s)` — `typeof s === "string"`, length ≤ 200, `/^[\x20-\x7E]+$/` (printable ASCII)
- `isValidPromptLogReason(s)` — `typeof s === "string"`, length ≤ 256, printable ASCII
- `isValidGenerationId(s)` — `typeof s === "string"`, length ≤ 128, printable ASCII

Reuse the existing `PRINTABLE_ASCII` constant. Add the new names to the existing `module.exports` object.

**Verify:** `node -e "const v = require('./integrations/shared/cache-field-validators.cjs'); console.log(v.isValidPromptLogTitle('a'.repeat(200)), v.isValidPromptLogTitle('a'.repeat(201)), v.isValidGenerationId('x'))"` prints `true false true`.

### Step 1b: Add same validators to shared/src/maintenance/cache-field-validators.ts

Add exported functions with the same names and logic as in Step 1a: `isValidPromptLogTitle(s: string): boolean`, `isValidPromptLogReason(s: string): boolean`, `isValidGenerationId(s: string): boolean`. Use the existing `PRINTABLE_ASCII` constant. Same length bounds: 200, 256, 128.

**Verify:** `pnpm typecheck` passes.

### Step 2: Create integrations/shared/prompt-log.cjs

Implement `appendPromptLog(projectRoot, entry)`:

1. Require `fs`, `path`, and `./cache-field-validators.cjs` (use `isValidEditorId`, `isValidConversationId`, `isValidTimestamp`, `isValidPromptLogTitle`, `isValidPromptLogReason`, `isValidGenerationId`; for `model` allow `""` or validate non-empty with `isValidModelId`).
2. Validate `entry.type` is `"prompt"` or `"session_end"`; if not, return.
3. Validate envelope: `isValidEditorId(entry.editorId)`, `isValidConversationId(entry.conversationId)`, `isValidTimestamp(entry.timestamp)`. If any fail, return.
4. If `entry.type === "prompt"`: validate `typeof entry.generationId === "string"` and `isValidGenerationId(entry.generationId)`, `isValidPromptLogTitle(entry.title)`, and `typeof entry.model === "string"` (allow `""` or `isValidModelId(entry.model)` for non-empty). If any fail, return.
5. If `entry.type === "session_end"`: validate `typeof entry.reason === "string"` and `isValidPromptLogReason(entry.reason)`. If fail, return.
6. Set `logPath = path.join(projectRoot, ".aic", "prompt-log.jsonl")`.
7. Inside try: `fs.mkdirSync(path.dirname(logPath), { recursive: true, mode: 0o700 })`; `fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8")`. Catch: no throw (ignore errors).

Export only `appendPromptLog`.

**Verify:** `node -e "const { appendPromptLog } = require('./integrations/shared/prompt-log.cjs'); const tmp = require('os').tmpdir() + '/aic-plan-test'; require('fs').mkdirSync(tmp, { recursive: true }); appendPromptLog(tmp, { type: 'prompt', editorId: 'cursor', conversationId: 'c1', timestamp: '2025-01-01T00:00:00.000Z', generationId: 'g1', title: 't', model: '' }); console.log(require('fs').readFileSync(tmp + '/.aic/prompt-log.jsonl', 'utf8').trim().split('\n').length)"` prints `1`.

### Step 3: Create integrations/shared/__tests__/prompt-log.test.cjs

Add tests using a temp directory per test (or one temp dir for the describe). Use `require("../prompt-log.cjs").appendPromptLog` and `fs.readFileSync` / `fs.statSync` to assert.

- **valid_prompt_type:** Append entry with `type: "prompt"`, full envelope (editorId, conversationId, timestamp) and generationId, title, model. Read the log file, parse the last line as JSON, assert type, editorId, conversationId, timestamp, generationId, title, model are present and match.
- **valid_session_end_type:** Append entry with `type: "session_end"`, envelope and reason. Parse last line, assert reason present.
- **invalid_envelope_rejected:** Append with invalid editorId (empty string). Assert file line count unchanged (either file not created or line count 0).
- **invalid_type_rejected:** Call with `entry.type === "other"`. Assert no line appended (line count 0 or unchanged).
- **mkdir_mode_0700:** Use a fresh temp project path, call appendPromptLog once, then `fs.statSync(projectRoot + "/.aic")`. Assert `(stat.mode & 0o777) === 0o700`.
- **backward_compat_legacy_shape:** Manually append a legacy-shaped line `{"conversationId":"c","timestamp":"2025-01-01T00:00:00.000Z"}` (no type or editorId) to the log file, then call appendPromptLog with a valid unified entry. Read file, split by newline, parse each line; assert at least one line has `timestamp` (prune-style reader can still use timestamp).

**Verify:** `node integrations/shared/__tests__/prompt-log.test.cjs` or `pnpm test` targeting this file passes.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| valid_prompt_type | type "prompt" with full envelope + generationId, title, model produces valid JSONL line with all fields |
| valid_session_end_type | type "session_end" with envelope + reason produces valid line with reason |
| invalid_envelope_rejected | invalid editorId causes no write; file unchanged or empty |
| invalid_type_rejected | type "other" causes no write |
| mkdir_mode_0700 | .aic directory created with mode 0o700 |
| backward_compat_legacy_shape | legacy line without type/editorId plus unified line; reader can parse timestamp from both |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] appendPromptLog signature and behavior match steps
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] .aic created with 0o700 when first writing
- [ ] Invalid entry causes return without writing; no throw

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
