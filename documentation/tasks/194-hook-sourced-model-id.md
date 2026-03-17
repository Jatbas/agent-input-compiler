# Task 194: Hook-sourced model_id for compilation_log

> **Status:** Pending  
> **Phase:** Integrations  
> **Layer:** integrations (Cursor + Claude Code)  
> **Depends on:** MCP `aic_compile` accepts `modelId`; `compilation_log.model_id` column exists

## Goal

Populate `compilation_log.model_id` by passing the editor-reported model from Cursor hooks and Claude Code SessionStart into `aic_compile`, with a small on-disk cache so Claude Code hooks that lack `model` in their documented input still forward the last SessionStart model.

## Architecture Notes

- Hexagonal: integration scripts only; no new imports from `shared/` or `mcp/src/` into core.
- `modelId` must satisfy MCP Zod: string length 1–256, every character in ASCII space through tilde (`\x20`–`\x7E`). Reject otherwise; do not pass invalid values to the server.
- `.aic/` directory uses `0o700`; cache file name `.claude-session-model` (single line, model id string only). Not a secret; documents stale-if-model-switched-without-SessionStart.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `integrations/claude/hooks/aic-compile-helper.cjs` |
| Modify | `integrations/claude/plugin/scripts/aic-compile-helper.cjs` |
| Modify | `integrations/claude/hooks/aic-session-start.cjs` |
| Modify | `integrations/claude/plugin/scripts/aic-session-start.cjs` |
| Modify | `integrations/cursor/hooks/AIC-compile-context.cjs` |
| Modify | `integrations/cursor/hooks/AIC-inject-conversation-id.cjs` |
| Create | `integrations/cursor/__tests__/AIC-inject-conversation-id.test.cjs` |
| Modify | `integrations/claude/__tests__/aic-compile-helper.test.cjs` |
| Modify | `documentation/cursor-integration-layer.md` |
| Modify | `documentation/claude-code-integration-layer.md` |

## Interface / Signature

```typescript
// MCP tool arguments (excerpt) — source mcp/src/schemas/compilation-request.ts
modelId: z
  .string()
  .max(256)
  .regex(/^[\x20-\x7E]+$/)
  .nullable()
  .default(null),
```

```javascript
// integrations/claude/hooks/aic-compile-helper.cjs
// callAicCompile(intent, projectRoot, conversationId, timeoutMs, triggerSource, modelId)
// modelId: string with content, or null, or undefined
// undefined: resolve from sixth param first; if empty, read projectRoot/.aic/.claude-session-model
// non-empty sixth param after validation: include in arguments; write same line to .aic/.claude-session-model
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// mcp/src/schemas/compilation-request.ts — modelId field only
modelId: z
  .string()
  .max(256)
  .regex(/^[\x20-\x7E]+$/)
  .nullable()
  .default(null),
```

### Tier 1 — signature + path

| Type | Path | Members | Purpose |
| ---- | ---- | ------- | ------- |
| `CompilationRequestSchema` | `mcp/src/schemas/compilation-request.ts` | full shape | boundary validation for `aic_compile` |

### Tier 2 — path-only

None.

## Config Changes

- **shared/package.json:** no change  
- **eslint.config.mjs:** no change  

## Steps

### Step 1: Claude `callAicCompile` model resolution

In `integrations/claude/hooks/aic-compile-helper.cjs` and the identical `integrations/claude/plugin/scripts/aic-compile-helper.cjs`:

- Add sixth parameter `modelId` (accept `undefined`, `null`, or string).
- Define `const modelCachePath = path.join(projectRoot, ".aic", ".claude-session-model")`.
- Define helper `function isValidModelId(s)` returning true only when `typeof s === "string"`, trimmed length 1–256, and `/^[\x20-\x7E]+$/`.test(trimmed).
- Let `resolved` be: if `isValidModelId(modelId)` then trimmed sixth param; else read `modelCachePath` with try/catch; if file exists and `isValidModelId(content)` use trimmed file content; else no resolved model.
- If sixth param was valid after trim, `fs.mkdirSync(path.join(projectRoot, ".aic"), { recursive: true, mode: 0o700 })` then `writeFileSync(modelCachePath, trimmed, "utf8")` in try/catch.
- When `resolved` is set, add `modelId: resolved` to the `arguments` object inside `tools/call`. When unset, omit `modelId` so the server applies env-based detection.

**Verify:** Grep both helper files for `.claude-session-model` and `modelId`.

### Step 2: Claude SessionStart passes `model`

In `integrations/claude/hooks/aic-session-start.cjs` and `integrations/claude/plugin/scripts/aic-session-start.cjs`:

- After parsing stdin JSON into `parsed`, set `const rawModel = parsed.model != null ? parsed.model : parsed.input != null ? parsed.input.model : null`.
- If `typeof rawModel === "string"`, trim; pass trimmed string as sixth argument only when it satisfies the same `isValidModelId` rules as Step 1; otherwise pass `undefined` so the helper reads the cache file only.

**Verify:** Both files call `callAicCompile` with six arguments on the session-start compile line.

### Step 3: Cursor sessionStart compile args

In `integrations/cursor/hooks/AIC-compile-context.cjs`:

- After building `compileArgs`, if `typeof hookInput.model === "string"`, trim; if trimmed passes `isValidModelId` from Step 1 logic (inline duplicate is acceptable), set `compileArgs.modelId = trimmed`.

**Verify:** `compileArgs` assignment block includes conditional `modelId`.

### Step 4: Cursor preToolUse inject

In `integrations/cursor/hooks/AIC-inject-conversation-id.cjs`:

- Refactor the tail so `isAicCompile` builds `updated = { ...toolInput, editorId: "cursor" }`.
- If `idStr` is non-null, set `updated.conversationId = idStr`.
- If `typeof input.model === "string"`, trim; if valid per Step 1 rules, set `updated.modelId = trimmed`.
- If `updated` has `conversationId` or `modelId`, respond `{ permission: "allow", updated_input: updated }`; otherwise respond `{ permission: "allow" }`.
- For `isAicChatSummary`, keep prior behavior: require `idStr`; merge `conversationId` only.

**Verify:** Manual node one-liner or Step 6 tests cover inject output.

### Step 5: Tests

**Claude** — append to `integrations/claude/__tests__/aic-compile-helper.test.cjs`:

- `modelId_sixth_param_forwarded`: mock server records args; call `callAicCompile("i", tmpDir, null, 10000, null, "claude-sonnet-4-6")`; assert `args.modelId === "claude-sonnet-4-6"`.
- `modelId_from_cache_when_sixth_absent`: write `.aic/.claude-session-model` with `haiku-model\n`; call with five args; assert `args.modelId === "haiku-model"`.
- `modelId_omitted_when_cache_invalid`: write file with 257 ASCII `x` characters (exceeds 256 max); call five args; assert `args.modelId === undefined`.

**Cursor** — create `integrations/cursor/__tests__/AIC-inject-conversation-id.test.cjs` using `spawnSync` like `AIC-require-aic-compile.test.cjs`:

- `inject_modelId_when_model_present`: stdin JSON with `tool_name` containing `aic_compile`, `tool_input` with intent and projectRoot, `conversation_id`, `model` valid string; stdout JSON has `updated_input.modelId` equal that model.
- `inject_allow_when_no_conversation_but_model`: no `conversation_id`; valid `model` and aic_compile-shaped `tool_input`; stdout includes `updated_input` with `modelId` and `editorId` `"cursor"`.

**Verify:** Run `node integrations/claude/__tests__/aic-compile-helper.test.cjs` and `node integrations/cursor/__tests__/AIC-inject-conversation-id.test.cjs`; both print all pass lines.

### Step 6: Documentation

- `documentation/cursor-integration-layer.md` § input field mapping: add row that `input.model` maps to `modelId` on `aic_compile` for sessionStart and preToolUse inject.
- `documentation/claude-code-integration-layer.md` § SessionStart: state `model` is passed as `modelId` to `aic_compile`; other hooks use cached value from `.aic/.claude-session-model` written on SessionStart.

**Verify:** Both files mention `modelId` and the cache file name in the integration sections.

### Step 7: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| modelId_sixth_param_forwarded | Claude helper passes sixth param through to MCP args |
| modelId_from_cache_when_sixth_absent | Claude helper reads `.aic/.claude-session-model` |
| modelId_omitted_when_cache_invalid | Long or invalid cache line omits modelId |
| inject_modelId_when_model_present | Cursor inject adds modelId when model in stdin |
| inject_allow_when_no_conversation_but_model | Cursor inject adds modelId without conversation_id |

## Acceptance Criteria

- [ ] All files in the Files table updated
- [ ] Hook copies under `integrations/claude/plugin/scripts/` match `integrations/claude/hooks/` for the two modified helpers
- [ ] `node integrations/claude/__tests__/aic-compile-helper.test.cjs` exits 0
- [ ] `node integrations/cursor/__tests__/AIC-inject-conversation-id.test.cjs` exits 0
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise  
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need  
3. Report to the user and wait for guidance  

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work, stop. List the adaptations, report to the user, and re-evaluate before continuing.
