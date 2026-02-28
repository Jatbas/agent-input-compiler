# Task 015: MCP Server Composition Root

> **Status:** Done
> **Phase:** F (MCP Server)
> **Layer:** mcp
> **Depends on:** Phase E storage (SqliteCacheStore, SqliteTelemetryStore, SqliteConfigStore, SqliteGuardStore), Phase C pipeline, Phase D adapters

## Goal

Create the MCP server composition root in `mcp/src/server.ts` that opens the project database, runs migrations, wires all pipeline steps and stores, and exposes an MCP server over stdio with stub tool and resource handlers so the server starts and responds to tools/list. Tests use the MCP SDK Client with InMemoryTransport (in-process), not process spawn.

## Architecture Notes

- ADR-001: MCP is the primary interface; composition root is the only place that instantiates concrete classes and calls `new Database()`.
- DIP: All dependencies injected via constructors; server.ts is the single composition root for the MCP process.
- RulePackProvider, FileContentReader, and BudgetConfig have no implementations in shared; this task implements them locally in server.ts using node:fs and node:path so the pipeline can be fully wired.
- Tool handlers for aic_compile and aic_inspect return stub responses in this task; full handler implementation is a later task.
- .aic/ directory created with 0700 (security.md).
- Export createMcpServer(projectRoot) returning the McpServer (not connected) so tests can connect it to InMemoryTransport.

## Files

| Action | Path                                |
| ------ | ----------------------------------- |
| Create | `mcp/src/server.ts`                 |
| Create | `mcp/src/__tests__/server.test.ts`  |
| Modify | `mcp/package.json` (add dependency) |

## Wiring Specification

**Concrete classes instantiated (constructor signatures from source):**

```typescript
// better-sqlite3 — only place in codebase that may call new Database
import Database from "better-sqlite3";
const db = new Database(dbPath: string);

// shared adapters
SystemClock: constructor()
UuidV7Generator: constructor(private readonly clock: Clock)
TiktokenAdapter: constructor()
FastGlobAdapter: constructor()
IgnoreAdapter: constructor()
TypeScriptProvider: constructor()
GenericProvider: constructor()

// shared storage
SqliteMigrationRunner: constructor(private readonly clock: Clock)
SqliteCacheStore: constructor(private readonly db: ExecutableDb, private readonly cacheDir: AbsolutePath)
SqliteTelemetryStore: constructor(private readonly db: ExecutableDb)
SqliteConfigStore: constructor(private readonly db: ExecutableDb, private readonly clock: Clock)
SqliteGuardStore: constructor(private readonly db: ExecutableDb, private readonly idGenerator: IdGenerator, private readonly clock: Clock)

// shared pipeline
IntentClassifier: constructor()
RulePackResolver: constructor(private readonly rulePackProvider: RulePackProvider)
BudgetAllocator: constructor(private readonly config: BudgetConfig)
HeuristicSelector: constructor(private readonly languageProviders: readonly LanguageProvider[], private readonly config: HeuristicSelectorConfig)
ExclusionScanner: constructor()
SecretScanner: constructor()
PromptInjectionScanner: constructor()
ContextGuard: constructor(private readonly scanners: readonly GuardScanner[], private readonly fileContentReader: FileContentReader, private readonly allowPatterns: readonly GlobPattern[])
WhitespaceNormalizer: constructor()
CommentStripper: constructor()
JsonCompactor: constructor()
LockFileSkipper: constructor()
ContentTransformerPipeline: constructor(private readonly transformers: readonly ContentTransformer[], private readonly fileContentReader: FileContentReader, private readonly tokenCounter: (text: string) => TokenCount)
SummarisationLadder: constructor(private readonly languageProviders: readonly LanguageProvider[], private readonly tokenCounter: (text: string) => TokenCount, private readonly fileContentReader: FileContentReader)
PromptAssembler: constructor(private readonly fileContentReader: FileContentReader)
```

**Exported functions:**

```typescript
ensureAicDir(projectRoot: AbsolutePath): AbsolutePath
createFileContentReader(projectRoot: AbsolutePath): FileContentReader
createRulePackProvider(projectRoot: AbsolutePath): RulePackProvider
createDefaultBudgetConfig(): BudgetConfig
createProjectScope(projectRoot: AbsolutePath): { db: ExecutableDb; clock: Clock; idGenerator: IdGenerator; cacheStore: SqliteCacheStore; telemetryStore: SqliteTelemetryStore; configStore: SqliteConfigStore; guardStore: SqliteGuardStore; projectRoot: AbsolutePath }
createMcpServer(projectRoot: AbsolutePath): McpServer
main(): Promise<void>
```

**MCP SDK (from @modelcontextprotocol/sdk):**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

// McpServer: new McpServer(serverInfo: { name: string; version: string }, options?)
//   connect(transport: Transport): Promise<void>
//   tool(name: string, cb: ToolCallback): RegisteredTool
//   resource(name: string, uri: string, readCallback: ReadResourceCallback): RegisteredResource

// StdioServerTransport: new StdioServerTransport(_stdin?: Readable, _stdout?: Writable)

// InMemoryTransport.createLinkedPair(): [InMemoryTransport, InMemoryTransport]
// Client: new Client(clientInfo: { name: string; version: string }, options?)
//   connect(transport: Transport, options?): Promise<void>
//   listTools(params?, options?): Promise<{ tools: ... }>
//   callTool(params: { name: string; arguments?: ... }, resultSchema?, options?): Promise<...>
```

## Dependent Types

### Tier 0 — verbatim

Interfaces and types the composition root implements or builds inline:

**ExecutableDb** — shared/src/core/interfaces/executable-db.interface.ts

```typescript
export interface ExecutableDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...args: unknown[]): void;
    all(...args: unknown[]): unknown[];
  };
}
```

**RulePack** — shared/src/core/types/rule-pack.ts (shape used by createRulePackProvider / createDefaultBudgetConfig)

```typescript
import type { GlobPattern } from "#core/types/paths.js";
import type { TokenCount } from "#core/types/units.js";
export interface RulePack {
  readonly name?: string;
  readonly version?: number;
  readonly description?: string;
  readonly constraints: readonly string[];
  readonly includePatterns: readonly GlobPattern[];
  readonly excludePatterns: readonly GlobPattern[];
  readonly budgetOverride?: TokenCount;
  readonly heuristic?: {
    readonly boostPatterns: readonly GlobPattern[];
    readonly penalizePatterns: readonly GlobPattern[];
  };
}
```

**RulePackProvider** — shared/src/core/interfaces/rule-pack-provider.interface.ts (implemented in server)

```typescript
getBuiltInPack(name: string): RulePack;
getProjectPack(projectRoot: AbsolutePath, taskClass: TaskClass): RulePack | null;
```

**FileContentReader** — shared/src/core/interfaces/file-content-reader.interface.ts (implemented in server)

```typescript
getContent(path: RelativePath): string;
```

**BudgetConfig** — shared/src/core/interfaces/budget-config.interface.ts (implemented in server)

```typescript
getMaxTokens(): TokenCount;
getBudgetForTaskClass(taskClass: TaskClass): TokenCount | null;
```

### Tier 1 — signature + path

| Type                      | Path                                                        | Methods | Purpose                                                                                              |
| ------------------------- | ----------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `Clock`                   | shared/src/core/interfaces/clock.interface.ts               | 1       | now(): ISOTimestamp                                                                                  |
| `IdGenerator`             | shared/src/core/interfaces/id-generator.interface.ts        | 1       | generate(): UUIDv7                                                                                   |
| `LanguageProvider`        | shared/src/core/interfaces/language-provider.interface.ts   | 4       | parseImports, extractSignaturesWithDocs, extractSignaturesOnly, extractNames + props: id, extensions |
| `GuardScanner`            | shared/src/core/interfaces/guard-scanner.interface.ts       | 1       | scan + prop: name                                                                                    |
| `ContentTransformer`      | shared/src/core/interfaces/content-transformer.interface.ts | 1       | transform + props: id, fileExtensions                                                                |
| `HeuristicSelectorConfig` | shared/src/pipeline/heuristic-selector.ts                   | —       | maxFiles, weights?                                                                                   |

### Tier 2 — path-only

| Type           | Path                           | Factory             |
| -------------- | ------------------------------ | ------------------- |
| `AbsolutePath` | shared/src/core/types/paths.ts | toAbsolutePath(raw) |
| `RelativePath` | shared/src/core/types/paths.ts | toRelativePath(raw) |
| `TokenCount`   | shared/src/core/types/units.ts | toTokenCount(n)     |
| `GlobPattern`  | shared/src/core/types/paths.ts | toGlobPattern(raw)  |
| `TaskClass`    | shared/src/core/types/enums.ts | TASK_CLASS          |

## Config Changes

- **mcp/package.json:** Add to dependencies: `"better-sqlite3": "11.9.1"` (exact version, same as shared).
- **eslint.config.mjs:** No change. MCP layer does not restrict better-sqlite3; only composition roots may call `new Database()` (existing global rule).

## Steps

### Step 1: Add better-sqlite3 to mcp dependencies

In `mcp/package.json`, add to `dependencies`: `"better-sqlite3": "11.9.1"`. Run `pnpm install` at repo root.

**Verify:** From repo root run `pnpm install` then `pnpm why better-sqlite3`; output shows better-sqlite3 resolved for @aic/mcp.

### Step 2: Create ensureAicDir and createFileContentReader in server.ts

Create `mcp/src/server.ts`. Implement:

- `ensureAicDir(projectRoot: AbsolutePath): AbsolutePath` — resolve `path.join(projectRoot, ".aic")`, create directory with `fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 })` (idempotent — succeeds whether directory exists or not), return the path as AbsolutePath. Use `node:fs` and `node:path`. Import `toAbsolutePath` from shared. Export `ensureAicDir`.
- `createFileContentReader(projectRoot: AbsolutePath): FileContentReader` — return an object that implements `FileContentReader`: `getContent(path: RelativePath): string` by reading `path.join(projectRoot, path)` with `fs.readFileSync(..., "utf8")`. On missing file throw so the pipeline fails fast. Export `createFileContentReader`.

**Verify:** `pnpm typecheck` from repo root passes for mcp package.

### Step 3: Create createRulePackProvider and createDefaultBudgetConfig in server.ts

In `mcp/src/server.ts` add:

- `createRulePackProvider(projectRoot: AbsolutePath): RulePackProvider` — return an object implementing `RulePackProvider`. `getBuiltInPack(name: string)`: return a default RulePack (constraints: [], includePatterns: [], excludePatterns: []). `getProjectPack(projectRoot, taskClass)`: resolve `path.join(projectRoot, "aic-rules", `${taskClass}.json`)`, if file exists read with fs.readFileSync, parse JSON, validate shape (constraints array, includePatterns, excludePatterns), return as RulePack; otherwise return null. Use `node:fs` and `node:path`. Export `createRulePackProvider`.
- `createDefaultBudgetConfig(): BudgetConfig` — return an object with `getMaxTokens(): TokenCount` returning `toTokenCount(8000)` from shared, `getBudgetForTaskClass(_taskClass): TokenCount | null` returning null. Export `createDefaultBudgetConfig`.

**Verify:** `pnpm typecheck` passes.

### Step 4: Wire database, migrations, clock, idGenerator, and stores in server.ts

In `mcp/src/server.ts`:

- Import `Database` from `"better-sqlite3"`.
- Import from shared: `SqliteMigrationRunner`, `SqliteCacheStore`, `SqliteTelemetryStore`, `SqliteConfigStore`, `SqliteGuardStore`, `SystemClock`, `UuidV7Generator`, and the migration as `migration001` from `@aic/shared/storage/migrations/001-initial-schema.js`.
- Define `createProjectScope(projectRoot: AbsolutePath)` that: (1) calls `ensureAicDir(projectRoot)` and gets aicDir, (2) sets `dbPath = path.join(aicDir, "aic.sqlite")`, (3) creates `const db = new Database(dbPath)`, (4) creates `clock = new SystemClock()`, `idGenerator = new UuidV7Generator(clock)`, `migrationRunner = new SqliteMigrationRunner(clock)`, (5) runs `migrationRunner.run(db, [migration001])`, (6) sets `cacheDir = toAbsolutePath(path.join(aicDir, "cache"))` and ensures that directory exists with fs.mkdirSync, (7) creates `cacheStore`, `telemetryStore`, `configStore`, `guardStore` per Wiring Specification. Return an object holding `db`, `clock`, `idGenerator`, `cacheStore`, `telemetryStore`, `configStore`, `guardStore`, and `projectRoot`. Export `createProjectScope`.

**Verify:** `pnpm typecheck` passes.

### Step 5: Implement createMcpServer — wire adapters, pipeline, McpServer, and stub tools

In `mcp/src/server.ts` define `createMcpServer(projectRoot: AbsolutePath)`. It calls `createProjectScope(projectRoot)`, then builds: adapters (TiktokenAdapter, FastGlobAdapter, IgnoreAdapter, TypeScriptProvider, GenericProvider), `languageProviders = [typeScriptProvider, genericProvider]`, `tokenCounter = (text: string) => tiktokenAdapter.countTokens(text)`, `fileContentReader = createFileContentReader(projectRoot)`, `rulePackProvider = createRulePackProvider(projectRoot)`, `budgetConfig = createDefaultBudgetConfig()`, then pipeline steps IntentClassifier, RulePackResolver, BudgetAllocator, HeuristicSelector with `{ maxFiles: 20 }`, scanners array (ExclusionScanner, SecretScanner, PromptInjectionScanner), ContextGuard with scanners, fileContentReader, [], transformers (WhitespaceNormalizer, CommentStripper, JsonCompactor, LockFileSkipper), ContentTransformerPipeline, SummarisationLadder, PromptAssembler. Import concrete classes from @aic/shared: SystemClock from `@aic/shared/adapters/system-clock.js`, UuidV7Generator from `@aic/shared/adapters/uuid-v7-generator.js`, TiktokenAdapter, FastGlobAdapter, IgnoreAdapter, TypeScriptProvider, GenericProvider from their adapter paths; SqliteMigrationRunner, SqliteCacheStore, SqliteTelemetryStore, SqliteConfigStore, SqliteGuardStore from their storage paths; IntentClassifier, RulePackResolver, BudgetAllocator, HeuristicSelector, ExclusionScanner, SecretScanner, PromptInjectionScanner, ContextGuard, WhitespaceNormalizer, CommentStripper, JsonCompactor, LockFileSkipper, ContentTransformerPipeline, SummarisationLadder, PromptAssembler from their pipeline paths; migration from `@aic/shared/storage/migrations/001-initial-schema.js`. Then create `const server = new McpServer({ name: "aic", version: "0.1.0" })`, register tool `aic_compile` with callback returning `{ content: [{ type: "text", text: "Not implemented" }] }`, register tool `aic_inspect` the same way, register resource `last-compilation` at `aic://last-compilation` with callback returning `{ contents: [] }`. Return the server. Export `createMcpServer`.

**Verify:** `pnpm typecheck` passes.

### Step 6: Add main() and connect StdioServerTransport

In `mcp/src/server.ts`:

- Import `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js` (McpServer is already used in createMcpServer).
- Define `async function main(): Promise<void>`. In main: set projectRoot to `toAbsolutePath(process.cwd())`, call `const server = createMcpServer(projectRoot)`, create `const transport = new StdioServerTransport()`, then `await server.connect(transport)`.
- At the bottom of the file, invoke main: `main().catch((err) => { process.stderr.write(String(err)); process.exit(1); })`.

**Verify:** From repo root, `pnpm exec tsx mcp/src/server.ts` starts without immediate exit; process listens on stdin.

### Step 7a: Add server tests — list_tools and stub_compile with Client and InMemoryTransport

Create `mcp/src/__tests__/server.test.ts`. Use the MCP SDK Client with InMemoryTransport so protocol communication is in-process (no spawn, no wire-format framing).

- **list_tools:** Create a temp directory with `fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "aic-mcp-"))`. Call `createMcpServer(toAbsolutePath(tmpDir))` to get the server. Call `InMemoryTransport.createLinkedPair()` to get `[transportServer, transportClient]`. Call `await server.connect(transportServer)`. Create `const client = new Client({ name: "test", version: "1.0" })` and `await client.connect(transportClient)`. Call `const result = await client.listTools()`. Assert that `result.tools` exists and that the list of tool names includes `aic_compile` and `aic_inspect`. Clean up temp dir in afterEach.
- **stub_compile:** Same setup (createMcpServer, createLinkedPair, server.connect(transportServer), client.connect(transportClient)). Call `await client.callTool({ name: "aic_compile", arguments: {} })`. Assert the result has content that includes the text "Not implemented".

Use `import { createMcpServer } from "../server.js"`, `import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"`, `import { Client } from "@modelcontextprotocol/sdk/client/index.js"`, `import * as fs from "node:fs"`, `import * as path from "node:path"`, `import * as os from "node:os"`, and `toAbsolutePath` from shared.

**Verify:** `pnpm test` runs the new test file; list_tools and stub_compile pass.

### Step 7b: Add server tests — idempotency and permissions

In `mcp/src/__tests__/server.test.ts` add:

- **idempotency:** Create a temp directory. Call `createProjectScope(toAbsolutePath(tmpDir))` twice. Assert no throw. Clean up temp dir in afterEach.
- **permissions:** Create a temp directory. Call `ensureAicDir(toAbsolutePath(tmpDir))`. Assert `fs.statSync(path.join(tmpDir, ".aic")).mode & 0o777 === 0o700`. Clean up in afterEach.

Import `createProjectScope` and `ensureAicDir` from `../server.js`.

**Verify:** `pnpm test` runs all four tests (list_tools, stub_compile, idempotency, permissions) and all pass.

### Step 8: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test`

Expected: all pass, zero warnings.

## Tests

| Test case    | Description                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| list_tools   | createMcpServer + InMemoryTransport + Client; listTools(); assert tools include aic_compile and aic_inspect |
| stub_compile | Same setup; callTool aic_compile with empty arguments; assert response content contains "Not implemented"   |
| idempotency  | createProjectScope twice on same path; assert no throw                                                      |
| permissions  | ensureAicDir then stat .aic; assert mode is 0700                                                            |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] Wiring matches Wiring Specification (every constructor call matches source)
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] No imports violating layer boundaries (mcp may import shared and @modelcontextprotocol/sdk and node:fs/node:path)
- [ ] No `new Date()` or `Date.now()` in server.ts (use injected Clock from shared)
- [ ] Single-line comments only, explain why not what
- [ ] .aic directory created with 0700 when ensureAicDir runs

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

---

## Post-completion: Conditional dependency loading refactor

`createMcpServer` was refactored to accept `additionalProviders?: readonly LanguageProvider[]` instead of hardcoding all language providers internally. It is now **sync** again. Async provider initialization (e.g. `PythonProvider.create()` for WASM) moved to `main()`, which scans the project for relevant file extensions and only creates providers that are needed. `createFullPipelineDeps` likewise accepts `additionalProviders` and stays sync. This ensures startup cost scales with what the project actually uses.
