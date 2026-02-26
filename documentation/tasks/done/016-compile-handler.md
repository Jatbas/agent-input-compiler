# Task 016: Compile Handler (MCP)

> **Status:** Done
> **Phase:** F (MCP Server)
> **Layer:** mcp
> **Depends on:** Server composition root (Done)

## Goal

Implement the `aic_compile` MCP tool handler: validate request arguments with Zod, translate to `CompilationRequest`, call a `CompilationRunner`, and return MCP content (or MCP error -32602/-32603). Wire a stub runner so the server responds correctly until a later task implements the full pipeline.

## Architecture Notes

- ADR-009: Zod validates at MCP boundary only; core/pipeline never import Zod.
- MCP handler catches all errors at the boundary; server never crashes on a single bad request (Project Plan §11.1).
- CompilationRunner interface lives in shared so CLI and MCP can share the same contract; this task adds the interface and a stub implementation in the composition root.

## Files

| Action | Path                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------ |
| Create | `shared/src/core/interfaces/compilation-runner.interface.ts`                                     |
| Create | `mcp/src/schemas/compilation-request.ts`                                                         |
| Create | `mcp/src/handlers/compile-handler.ts`                                                            |
| Modify | `mcp/src/server.ts` (wire stub runner, register aic_compile with schema and handler)             |
| Modify | `mcp/src/__tests__/server.test.ts` (valid_args_returns_stub_content, invalid_args_returns_32602) |

## Interface / Signature

```typescript
// shared/src/core/interfaces/compilation-runner.interface.ts
import type { CompilationRequest } from "#core/types/compilation-types.js";
import type { CompilationMeta } from "#core/types/compilation-types.js";

export interface CompilationRunner {
  run(request: CompilationRequest): Promise<{
    compiledPrompt: string;
    meta: CompilationMeta;
  }>;
}
```

```typescript
// createCompileHandler: (runner: CompilationRunner) => (args: ParsedArgs, _extra: RequestHandlerExtra) => Promise<CallToolResult>
// SDK wraps CompilationRequestSchema (ZodRawShape) in z.object() internally and validates args before invoking callback.
// Invalid args yield MCP -32602 automatically from the SDK — handler never sees invalid args.
// Handler receives already-parsed args, translates to CompilationRequest using branded type factories,
// awaits runner.run(request), returns { content: [{ type: "text", text: JSON.stringify({ compiledPrompt, meta }) }] }.
// On AicError: sanitizeError(err), throw new McpError(ErrorCode.InternalError, sanitized.message).
// On unknown error: throw new McpError(ErrorCode.InternalError, "Internal error").
// Imports: McpError, ErrorCode from @modelcontextprotocol/sdk/types.js
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// Source: shared/src/core/types/compilation-types.ts
export interface CompilationRequest {
  readonly intent: string;
  readonly projectRoot: AbsolutePath;
  readonly modelId: string | null;
  readonly editorId: EditorId;
  readonly configPath: FilePath | null;
  readonly sessionId?: SessionId;
  readonly stepIndex?: StepIndex;
  readonly stepIntent?: string;
  readonly previousFiles?: readonly RelativePath[];
  readonly toolOutputs?: readonly ToolOutput[];
  readonly conversationTokens?: TokenCount;
}

export interface CompilationMeta {
  readonly intent: string;
  readonly taskClass: TaskClass;
  readonly filesSelected: number;
  readonly filesTotal: number;
  readonly tokensRaw: TokenCount;
  readonly tokensCompiled: TokenCount;
  readonly tokenReductionPct: Percentage;
  readonly cacheHit: boolean;
  readonly durationMs: Milliseconds;
  readonly modelId: string;
  readonly editorId: EditorId;
  readonly transformTokensSaved: TokenCount;
  readonly summarisationTiers: Readonly<Record<InclusionTier, number>>;
  readonly guard: GuardResult | null;
}
```

### Tier 1 — signature + path

| Type                | Path                                                         | Members | Purpose                               |
| ------------------- | ------------------------------------------------------------ | ------- | ------------------------------------- |
| `CompilationRunner` | `shared/src/core/interfaces/compilation-runner.interface.ts` | 1       | run(request) — handler calls run only |

### Tier 2 — path-only

| Type            | Path                                   | Factory                   |
| --------------- | -------------------------------------- | ------------------------- |
| `AbsolutePath`  | `shared/src/core/types/paths.js`       | `toAbsolutePath(raw)`     |
| `FilePath`      | `shared/src/core/types/paths.js`       | `toFilePath(raw)`         |
| `EditorId`      | `shared/src/core/types/enums.js`       | `EDITOR_ID` as const      |
| `SessionId`     | `shared/src/core/types/identifiers.js` | `toSessionId(raw)`        |
| `StepIndex`     | `shared/src/core/types/units.js`       | `toStepIndex(raw)`        |
| `TokenCount`    | `shared/src/core/types/units.js`       | `toTokenCount(raw)`       |
| `RelativePath`  | `shared/src/core/types/paths.js`       | `toRelativePath(raw)`     |
| `Percentage`    | `shared/src/core/types/scores.js`      | `toPercentage(raw)`       |
| `Milliseconds`  | `shared/src/core/types/units.js`       | `toMilliseconds(raw)`     |
| `TaskClass`     | `shared/src/core/types/enums.js`       | `TASK_CLASS` as const     |
| `InclusionTier` | `shared/src/core/types/enums.js`       | `INCLUSION_TIER` as const |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add CompilationRunner interface

Create `shared/src/core/interfaces/compilation-runner.interface.ts` with the interface from the Interface / Signature section. Import `CompilationRequest` and `CompilationMeta` from `#core/types/compilation-types.js`. Export the interface.

**Verify:** File exists; `pnpm typecheck` from repo root passes.

### Step 2: Add CompilationRequestSchema (Zod)

Create `mcp/src/schemas/compilation-request.ts`. Import `z` from `"zod"`. Define and export `CompilationRequestSchema` as a **raw shape object** (NOT wrapped in `z.object()` — the MCP SDK wraps it internally). The shape: `intent`: `z.string().min(1).max(10_000)`, `projectRoot`: `z.string().min(1)`, `modelId`: `z.string().nullable().default(null)`, `editorId`: `z.enum(["cursor", "claude-code", "generic"]).default("generic")`, `configPath`: `z.string().nullable().default(null)`.

**Verify:** File exists; `pnpm typecheck` from mcp passes.

### Step 3: Add compile handler

Create `mcp/src/handlers/compile-handler.ts`. Imports: `McpError` and `ErrorCode` from `@modelcontextprotocol/sdk/types.js`; `type CompilationRunner` from `@aic/shared/core/interfaces/compilation-runner.interface.js`; `AicError` from `@aic/shared/core/errors/aic-error.js`; `sanitizeError` from `@aic/shared/core/errors/sanitize-error.js`; `toAbsolutePath`, `toFilePath` from `@aic/shared/core/types/paths.js`; `type EditorId` from `@aic/shared/core/types/enums.js`. Export a function `createCompileHandler(runner: CompilationRunner)` that returns an async function `(args, _extra)` with explicit return type `Promise<CallToolResult>` (import `type CallToolResult` from `@modelcontextprotocol/sdk/types.js`). The SDK validates args against the raw shape before invoking the callback — the handler never sees invalid args. The returned function: (1) receives already-parsed args from the SDK. (2) Maps parsed args to `CompilationRequest`: projectRoot via `toAbsolutePath(args.projectRoot)`, configPath via `args.configPath !== null ? toFilePath(args.configPath) : null`, editorId via `args.editorId as EditorId` (Zod enum already validates it matches EditorId literals), modelId via `args.modelId`, intent via `args.intent`. (3) Awaits `runner.run(request)`. (4) Returns `{ content: [{ type: "text" as const, text: JSON.stringify({ compiledPrompt: result.compiledPrompt, meta: result.meta }) }] }`. (5) Wraps the body in try/catch: on `AicError`, call `sanitizeError(err)`, then `throw new McpError(ErrorCode.InternalError, sanitized.message)`; on unknown errors, `throw new McpError(ErrorCode.InternalError, "Internal error")`.

**Verify:** File exists; no lint errors; handler signature accepts `CompilationRunner` and returns a function compatible with the SDK `ToolCallback` type.

### Step 4: Wire stub runner and register aic_compile in server

In `mcp/src/server.ts`, inside `createMcpServer`, define a stub object that implements `CompilationRunner`: `run(_request)` returns `Promise.resolve({ compiledPrompt: "Not implemented", meta: stubMeta })` where `stubMeta` is a minimal `CompilationMeta`-shaped object: intent `""`, taskClass `TASK_CLASS.GENERAL`, filesSelected 0, filesTotal 0, tokensRaw/tokensCompiled/transformTokensSaved from `toTokenCount(0)`, tokenReductionPct from `toPercentage(0)`, cacheHit false, durationMs from `toMilliseconds(0)`, modelId `""`, editorId `EDITOR_ID.GENERIC`, summarisationTiers `{ [INCLUSION_TIER.L0]: 0, [INCLUSION_TIER.L1]: 0, [INCLUSION_TIER.L2]: 0, [INCLUSION_TIER.L3]: 0 }`, guard null. Import `toTokenCount`, `toMilliseconds`, `toPercentage` from shared types and `TASK_CLASS`, `EDITOR_ID`, `INCLUSION_TIER` from shared enums. Replace the existing `server.tool("aic_compile", async () => ({ content: [...] }))` with: import `CompilationRequestSchema` from `./schemas/compilation-request.js` and `createCompileHandler` from `./handlers/compile-handler.js`; create the stub runner; call `server.tool("aic_compile", CompilationRequestSchema, createCompileHandler(stubRunner))`. The SDK receives the raw shape, wraps it in `z.object()` internally, and validates args before invoking the callback.

**Verify:** `pnpm typecheck` and `pnpm build` in mcp pass; server still starts.

### Step 5: Update server tests

In `mcp/src/__tests__/server.test.ts`, replace the existing `stub_compile` test with two new tests. Keep existing `list_tools`, `idempotency`, and `permissions` tests unchanged. (1) **valid_args_returns_stub_content**: same in-process setup (createMcpServer, InMemoryTransport, client.connect). Call `await client.callTool({ name: "aic_compile", arguments: { intent: "fix bug", projectRoot: tmpDir } })`. Parse the JSON from the text content item. Assert `parsed.compiledPrompt` equals `"Not implemented"` and `parsed.meta` is defined. (2) **invalid_args_returns_32602**: call `client.callTool({ name: "aic_compile", arguments: {} })` (missing required fields). Assert the promise rejects (the SDK returns a protocol-level -32602 error for invalid params, which causes the client to throw).

**Verify:** `pnpm test` in mcp passes; valid_args_returns_stub_content and invalid_args_returns_32602 both pass.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass, zero warnings.

## Tests

| Test case                       | Description                                                                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| list_tools                      | Existing: createMcpServer + InMemoryTransport + Client; listTools(); assert tools include aic_compile and aic_inspect                          |
| valid_args_returns_stub_content | callTool aic_compile with { intent, projectRoot }; parse JSON text content; assert compiledPrompt equals "Not implemented" and meta is defined |
| invalid_args_returns_32602      | callTool aic_compile with {}; assert the promise rejects (SDK returns protocol-level -32602 for missing required fields)                       |
| idempotency                     | Existing: create project scope twice on same path; no crash                                                                                    |
| permissions                     | Existing: .aic created with 0700                                                                                                               |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] CompilationRunner interface matches run() signature exactly
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] No imports violating layer boundaries (MCP does not import from CLI; Zod only in mcp/schemas and mcp handler)
- [ ] No `new Date()`, `Date.now()`, `Math.random()` in new files
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance
