# Task 020: inspect command

> **Status:** Done
> **Phase:** G (CLI)
> **Layer:** cli
> **Depends on:** Zod schemas (CLI), InspectRunner (shared), inspect handler (MCP)

## Goal

Implement the `aic inspect` CLI command so that it parses intent and options, validates with the existing InspectArgsSchema, builds an InspectRequest, calls an InspectRunner (stub for this task), and writes the pipeline trace as JSON to stdout with correct exit codes.

## Architecture Notes

- Composition root: CLI command receives InspectRunner by injection; main.ts wires a stub. Same pattern as the existing compile command.
- Exit codes: 0 success, 1 user error (Zod validation), 2 internal error (AicError or other). Per aic-cli.mdc.
- Output: write `JSON.stringify({ trace: result })` to stdout for parity with MCP aic_inspect response.
- dbPath default when args.dbPath is null: `path.join(projectRoot, ".aic", "aic.sqlite")` then toFilePath, matching mcp/src/handlers/inspect-handler.ts.

## Files

| Action | Path                                                                   |
| ------ | ---------------------------------------------------------------------- |
| Create | `cli/src/commands/inspect.ts`                                          |
| Create | `cli/src/commands/__tests__/inspect.test.ts`                           |
| Modify | `cli/src/main.ts` (add inspect subcommand, stub InspectRunner, action) |

## Interface / Signature

InspectRunner (consumed by command):

```typescript
import type { InspectRequest } from "#core/types/inspect-types.js";
import type { PipelineTrace } from "#core/types/inspect-types.js";

export interface InspectRunner {
  inspect(request: InspectRequest): Promise<PipelineTrace>;
}
```

Source: shared/src/core/interfaces/inspect-runner.interface.ts

Exported function:

```typescript
export async function inspectCommand(
  args: InspectArgs,
  runner: InspectRunner,
): Promise<void>;
```

Stub in main.ts: object implementing InspectRunner with inspect(\_request) returning Promise.resolve(stubTrace). stubTrace is a minimal valid PipelineTrace (intent "", taskClass { taskClass: TASK_CLASS.GENERAL, confidence: toConfidence(0), matchedKeywords: [] }, rulePacks [], budget toTokenCount(0), selectedFiles [], guard null, transforms [], summarisationTiers { [INCLUSION_TIER.L0]: 0, [INCLUSION_TIER.L1]: 0, [INCLUSION_TIER.L2]: 0, [INCLUSION_TIER.L3]: 0 }, constraints [], tokenSummary with raw/selected/afterGuard/afterTransforms/afterLadder/promptTotal all toTokenCount(0) and reductionPct toPercentage(0), compiledAt toISOTimestamp("1970-01-01T00:00:00.000Z")).

## Dependent Types

### Tier 0 — verbatim

InspectRequest (built by command and passed to runner.inspect):

```typescript
export interface InspectRequest {
  readonly intent: string;
  readonly projectRoot: AbsolutePath;
  readonly configPath: FilePath | null;
  readonly dbPath: FilePath;
}
```

Source: shared/src/core/types/inspect-types.ts

PipelineTrace (returned by runner.inspect; stub must match shape):

```typescript
export interface PipelineTrace {
  readonly intent: string;
  readonly taskClass: TaskClassification;
  readonly rulePacks: readonly string[];
  readonly budget: TokenCount;
  readonly selectedFiles: readonly SelectedFile[];
  readonly guard: GuardResult | null;
  readonly transforms: readonly TransformMetadata[];
  readonly summarisationTiers: Readonly<Record<InclusionTier, number>>;
  readonly constraints: readonly string[];
  readonly tokenSummary: {
    readonly raw: TokenCount;
    readonly selected: TokenCount;
    readonly afterGuard: TokenCount;
    readonly afterTransforms: TokenCount;
    readonly afterLadder: TokenCount;
    readonly promptTotal: TokenCount;
    readonly reductionPct: Percentage;
  };
  readonly compiledAt: ISOTimestamp;
}
```

Source: shared/src/core/types/inspect-types.ts

InspectArgs (Zod-inferred, input to inspectCommand):

```typescript
export const InspectArgsSchema = z.object({
  intent: z.string().min(1).max(10_000),
  projectRoot: z.string().min(1),
  configPath: z.string().nullable().default(null),
  dbPath: z.string().nullable().default(null),
});
export type InspectArgs = z.infer<typeof InspectArgsSchema>;
```

Source: cli/src/schemas/inspect-args.ts

### Tier 1 — signature + path

| Type          | Path                                                   | Members | Purpose          |
| ------------- | ------------------------------------------------------ | ------- | ---------------- |
| InspectRunner | shared/src/core/interfaces/inspect-runner.interface.ts | 1       | inspect(request) |

### Tier 2 — path-only

| Type         | Path                           | Factory             |
| ------------ | ------------------------------ | ------------------- |
| AbsolutePath | shared/src/core/types/paths.js | toAbsolutePath(raw) |
| FilePath     | shared/src/core/types/paths.js | toFilePath(raw)     |

## Config Changes

- **cli/package.json:** No change (commander, zod, @aic/shared already present).
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create inspect command (inspect.ts)

Create `cli/src/commands/inspect.ts`. Export async function `inspectCommand(args: InspectArgs, runner: InspectRunner): Promise<void>`. Import InspectArgsSchema and type InspectArgs from `@aic/cli/schemas/inspect-args.js`, type InspectRunner from `@aic/shared/core/interfaces/inspect-runner.interface.js`, toAbsolutePath and toFilePath from `@aic/shared/core/types/paths.js`, AicError and sanitizeError from `@aic/shared/core/errors`, path from `node:path`, and z from `zod`. At start of inspectCommand call `InspectArgsSchema.parse(args)`. On ZodError write error message to process.stderr and rethrow so main can exit(1). Build projectRoot = toAbsolutePath(args.projectRoot). Build configPath = args.configPath !== null ? toFilePath(args.configPath) : null. Build dbPath = args.dbPath !== null ? toFilePath(args.dbPath) : toFilePath(path.join(projectRoot as string, ".aic", "aic.sqlite")). Build request: { intent: args.intent, projectRoot, configPath, dbPath }. Await runner.inspect(request). Write to stdout: process.stdout.write(JSON.stringify({ trace: result })). In a try/catch: on AicError call sanitizeError(err), write sanitized.message to process.stderr, rethrow; on unknown error write "Internal error" to stderr and rethrow. Do not call process.exit inside inspectCommand; main handles exit codes.

**Verify:** inspectCommand can be imported; calling it with valid args and a stub runner that returns a stub PipelineTrace writes JSON containing a "trace" key to stdout.

### Step 2: Register inspect subcommand in main.ts

In `cli/src/main.ts`: Import InspectArgsSchema from `./schemas/inspect-args.js` (main.ts is in cli/src), inspectCommand from `./commands/inspect.js`, type InspectRunner from `@aic/shared/core/interfaces/inspect-runner.interface.js`, type PipelineTrace from `@aic/shared/core/types/inspect-types.js`, and the following from `@aic/shared/core/types`: toTokenCount (units.js), toPercentage (scores.js), toConfidence (scores.js), toISOTimestamp (identifiers.js), TASK_CLASS and INCLUSION_TIER (enums.js). Build a stub PipelineTrace object with intent "", taskClass { taskClass: TASK_CLASS.GENERAL, confidence: toConfidence(0), matchedKeywords: [] }, rulePacks [], budget toTokenCount(0), selectedFiles [], guard null, transforms [], summarisationTiers { [INCLUSION_TIER.L0]: 0, [INCLUSION_TIER.L1]: 0, [INCLUSION_TIER.L2]: 0, [INCLUSION_TIER.L3]: 0 }, constraints [], tokenSummary { raw: toTokenCount(0), selected: toTokenCount(0), afterGuard: toTokenCount(0), afterTransforms: toTokenCount(0), afterLadder: toTokenCount(0), promptTotal: toTokenCount(0), reductionPct: toPercentage(0) }, compiledAt: toISOTimestamp("1970-01-01T00:00:00.000Z"). Build stubRunner: InspectRunner with inspect(\_request) returning Promise.resolve(stubTrace). Add program.command("inspect <intent>").description("Show pipeline trace without executing model; output JSON to stdout").option("--root <path>", "project root directory", process.cwd()).option("--config <path>", "path to aic.config.json").option("--db <path>", "path to SQLite database").action(async function (this: Command, intent: string) { try { const opts = this.opts() as { root?: string; config?: string; db?: string }; const rootOpt = opts.root ?? process.cwd(); const parsed = InspectArgsSchema.parse({ intent, projectRoot: path.resolve(rootOpt), configPath: opts.config ?? null, dbPath: opts.db ?? null }); await inspectCommand(parsed, stubRunner); process.exit(0); } catch (err) { if (err instanceof z.ZodError) { process.stderr.write(String(err.message)); process.exit(1); } process.stderr.write(sanitizeError(err).message); process.exit(2); } }). Use path from node:path for path.resolve(rootOpt). Ensure program.parseAsync(process.argv) remains at the end.

**Verify:** `pnpm exec tsx cli/src/main.ts inspect "fix bug"` runs and prints JSON with a "trace" key to stdout.

### Step 3: Tests (inspect.test.ts)

Create `cli/src/commands/__tests__/inspect.test.ts`. Import inspectCommand, InspectArgsSchema, type InspectRunner and type PipelineTrace, and from @aic/shared/core/types: toTokenCount, toPercentage, toConfidence, toISOTimestamp, TASK_CLASS, INCLUSION_TIER. Build stubTrace (same shape as in Step 2). Build stubRunner: InspectRunner with inspect() returning Promise.resolve(stubTrace). Test valid_args_stdout_stub: parse valid args with InspectArgsSchema (intent "fix bug", projectRoot "/tmp/proj", configPath null, dbPath null), override process.stdout.write to capture output, call inspectCommand(parsed, stubRunner), parse captured output as JSON, assert parsed has property "trace" and trace has intent "", taskClass.taskClass equal to TASK_CLASS.GENERAL. Test invalid_args_throws: build invalid args (empty intent), call inspectCommand(invalidArgs, stubRunner), expect inspectCommand to throw. Test runner_throws_aic_error: mock runner with inspect() that throws new ConfigError("test"), call inspectCommand(validParsed, mockRunner) with validParsed from InspectArgsSchema.parse({ intent: "fix bug", projectRoot: "/tmp/proj", configPath: null, dbPath: null }), expect inspectCommand to throw, assert the captured stderr string includes "test". Import ConfigError from @aic/shared/core/errors.

**Verify:** `pnpm test -- cli/src/commands/__tests__/inspect.test.ts` passes.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case               | Description                                                                     |
| ----------------------- | ------------------------------------------------------------------------------- |
| valid_args_stdout_stub  | Valid parsed args and stub runner; stdout JSON has "trace" with stub shape      |
| invalid_args_throws     | Invalid args (empty intent); inspectCommand throws after parse fails            |
| runner_throws_aic_error | Runner throws AicError; inspectCommand throws after writing sanitized to stderr |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] main.ts registers inspect subcommand with <intent>, --root, --config, --db; action parses with InspectArgsSchema, calls inspectCommand, exits 0/1/2
- [ ] inspectCommand validates args, builds InspectRequest with branded types (dbPath default path.join(projectRoot, ".aic", "aic.sqlite") when null), calls runner.inspect(), writes JSON.stringify({ trace: result }) to stdout; on error writes to stderr and rethrows
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports from @aic/mcp or mcp/
- [ ] No `new Date()`, `Date.now()`, `Math.random()` in CLI code
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is wrong. List the adaptations, report to the user, and re-evaluate before continuing.
