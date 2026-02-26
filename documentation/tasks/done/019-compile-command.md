# Task 019: compile command

> **Status:** Done
> **Phase:** G (CLI)
> **Layer:** cli
> **Depends on:** Zod schemas (CLI)

## Goal

Implement the `aic compile` CLI command so that it parses intent and options, validates with the existing Zod schema, builds a CompilationRequest, calls a CompilationRunner (stub for this task), and writes the compiled prompt to stdout with correct exit codes.

## Architecture Notes

- Composition root: CLI command wires nothing beyond a stub CompilationRunner; no business logic in CLI (ADR-009 validation at boundary only).
- Exit codes: 0 success, 1 user error (validation, AicError with user-facing code), 2 internal error (per aic-cli.mdc).
- Stub runner lives inline in main.ts; no shared CompilationRunner implementation in this task.
- Output: write `result.compiledPrompt` to stdout; no OutputFormatter in this task.

## Files

| Action | Path                                         |
| ------ | -------------------------------------------- |
| Create | `cli/src/main.ts`                            |
| Create | `cli/src/commands/compile.ts`                |
| Create | `cli/src/commands/__tests__/compile.test.ts` |

## Wiring Specification

No new concrete pipeline classes are instantiated in this task. The command uses a stub object that implements `CompilationRunner`:

```typescript
const stubRunner: CompilationRunner = {
  async run(_request) {
    return {
      compiledPrompt: "Not implemented",
      meta: {
        /* stub CompilationMeta — same shape as mcp/src/server.ts stubRunner */
      },
    };
  },
};
```

Exported function signature:

```typescript
export async function compileCommand(
  args: CompilationArgs,
  runner: CompilationRunner,
): Promise<void>;
```

Commander (external library):

- Import: `import { program, type Command } from "commander";`
- Source: node_modules/.pnpm/commander@13.1.0/node_modules/commander/typings/index.d.ts
- `program.command("compile <intent>", opts?): Command` — defines subcommand with required positional `<intent>`.
- `command.option("--root <path>", description?, defaultValue?): this` — use defaultValue `process.cwd()` for --root.
- `command.action(fn: (...args: any[]) => void | Promise<void>): this` — async fn receives positional args then the command; get options via `command.opts()`.
- `program.parseAsync(argv?, parseOptions?): Promise<this>` — parse `process.argv`.

## Interface / Signature

CompilationRunner (consumed by command):

```typescript
import type { CompilationRequest } from "#core/types/compilation-types.js";
import type { CompilationMeta } from "#core/types/compilation-types.js";

export interface CompilationRunner {
  run(request: CompilationRequest): Promise<{
    compiledPrompt: string;
    meta: CompilationMeta;
  }>;
}
```

Source: shared/src/core/interfaces/compilation-runner.interface.ts

## Dependent Types

### Tier 0 — verbatim

CompilationRequest (built by command and passed to runner.run):

```typescript
export interface CompilationRequest {
  readonly intent: string;
  readonly projectRoot: AbsolutePath;
  readonly modelId: string | null;
  readonly editorId: EditorId;
  readonly configPath: FilePath | null;
  // session fields omitted for CLI single-shot
}
```

Source: shared/src/core/types/compilation-types.ts

CompilationArgs (Zod-inferred, input to compileCommand):

```typescript
export const CompilationArgsSchema = z.object({
  intent: z.string().min(1).max(10_000),
  projectRoot: z.string().min(1),
  configPath: z.string().nullable().default(null),
  dbPath: z.string().nullable().default(null),
});
export type CompilationArgs = z.infer<typeof CompilationArgsSchema>;
```

Source: cli/src/schemas/compilation-args.ts

### Tier 1 — signature + path

| Type                | Path                                                       | Members | Purpose      |
| ------------------- | ---------------------------------------------------------- | ------- | ------------ |
| `CompilationRunner` | shared/src/core/interfaces/compilation-runner.interface.ts | 1       | run(request) |

### Tier 2 — path-only

| Type           | Path                           | Factory                         |
| -------------- | ------------------------------ | ------------------------------- |
| `AbsolutePath` | shared/src/core/types/paths.js | `toAbsolutePath(raw)`           |
| `FilePath`     | shared/src/core/types/paths.js | `toFilePath(raw)`               |
| `EditorId`     | shared/src/core/types/enums.js | Use `EDITOR_ID.GENERIC` for CLI |

## Config Changes

- **package.json:** No change (commander, zod, @aic/shared already in cli/package.json).
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create CLI entry (main.ts)

Create `cli/src/main.ts`. Import `program` and type `Command` from `"commander"`. Set `program.name("aic")` and `program.version("0.0.1")`. Add subcommand: `program.command("compile <intent>").description("Compile intent into a raw prompt; output to stdout").option("--root <path>", "project root directory", process.cwd()).option("--config <path>", "path to aic.config.json").option("--db <path>", "path to SQLite database").action(async (intent: string, command: Command) => { ... })`. Inside the action: build object `{ intent, projectRoot: command.opts().root ?? process.cwd(), configPath: command.opts().config ?? null, dbPath: command.opts().db ?? null }`. Parse with `CompilationArgsSchema.parse(...)`; on ZodError write message to `process.stderr` and `process.exit(1)`. Create stub CompilationRunner (same shape as mcp/src/server.ts stubRunner: run returns `Promise.resolve({ compiledPrompt: "Not implemented", meta: stubMeta })` with stubMeta matching CompilationMeta). Import and call `compileCommand(parsed, stubRunner)`. Then `process.exit(0)`. Wrap the action body in try/catch: on ZodError (from parse) write message to stderr and process.exit(1); on thrown error from compileCommand write sanitized message to stderr and process.exit(2). Call `program.parseAsync(process.argv)` at the end. Use `path` from `node:path` only for resolving `--root` if needed (e.g. path.resolve for projectRoot).

**Verify:** File exists; `pnpm exec tsx cli/src/main.ts compile "fix bug"` runs and prints "Not implemented" to stdout.

### Step 2: Create compile command (compile.ts)

Create `cli/src/commands/compile.ts`. Export async function `compileCommand(args: CompilationArgs, runner: CompilationRunner): Promise<void>`. Import `CompilationArgsSchema` from `../schemas/compilation-args.js`; `CompilationRunner` from `@aic/shared`; `toAbsolutePath`, `toFilePath` from `@aic/shared/core/types/paths.js`; `EDITOR_ID` from `@aic/shared/core/types/enums.js`; `CompilationRequest` from `@aic/shared/core/types/compilation-types.js`; `AicError`, `sanitizeError` from `@aic/shared/core/errors`. At start of compileCommand: call `CompilationArgsSchema.parse(args)` (args are already parsed by commander; re-validate at boundary). On ZodError: write error message to `process.stderr` and rethrow so main can exit(1). Build request: `{ intent: args.intent, projectRoot: toAbsolutePath(args.projectRoot), modelId: null, editorId: EDITOR_ID.GENERIC, configPath: args.configPath !== null ? toFilePath(args.configPath) : null }`. Await `runner.run(request)`. Write `result.compiledPrompt` to stdout with `process.stdout.write(result.compiledPrompt)`. In a try/catch around the above: on `AicError` call `sanitizeError(err)`, write `sanitized.message` to `process.stderr`, rethrow; on unknown error write "Internal error" to stderr and rethrow. Do not call `process.exit` inside compileCommand; main handles exit codes.

**Verify:** compileCommand can be imported; calling it with valid args and stub runner writes stub output to stdout.

### Step 3: Tests (compile.test.ts)

Create `cli/src/commands/__tests__/compile.test.ts`. Import `compileCommand`, `CompilationArgsSchema`, and a stub runner that returns `{ compiledPrompt: "Not implemented", meta: stubMeta }`. Test: `valid_args_stdout_stub` — parse valid args with CompilationArgsSchema (intent "fix bug", projectRoot "/tmp/proj", configPath null, dbPath null), create stub runner, override process.stdout.write to capture output, call compileCommand(parsed, stubRunner), assert captured output includes "Not implemented". Test: `invalid_args_throws` — build invalid args (empty intent), call compileCommand with that invalid object; compileCommand calls parse and throws on ZodError after writing to stderr — expect compileCommand to throw. Test: `runner_throws_aic_error` — mock runner with run() that throws new ConfigError("test"), call compileCommand(validParsed, mockRunner), expect compileCommand to throw; assert stderr was written with sanitized message.

**Verify:** `pnpm test -- cli/src/commands/__tests__/compile.test.ts` passes.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case               | Description                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------- |
| valid_args_stdout_stub  | Valid parsed args and stub runner; stdout contains "Not implemented"                    |
| invalid_args_throws     | Invalid args (empty intent); compileCommand throws after parse fails                    |
| runner_throws_aic_error | Runner throws AicError; compileCommand throws after writing sanitized message to stderr |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] main.ts registers compile subcommand with &lt;intent&gt;, --root, --config, --db; action parses with Zod, calls compileCommand, exits 0/1/2
- [ ] compileCommand validates args, builds CompilationRequest with branded types, calls runner.run(), writes compiledPrompt to stdout; on error writes to stderr and rethrows
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

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
