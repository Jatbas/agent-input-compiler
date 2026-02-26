# Task 023: init command

> **Status:** Done
> **Phase:** G (CLI)
> **Layer:** cli
> **Depends on:** compile command, inspect command, status command, Zod schemas (CLI)

## Goal

Implement the `aic init` and `aic init --upgrade` CLI commands that scaffold `aic.config.json` with defaults, create `.aic/` with 0700 permissions, add `.aic/` to `.gitignore`, and support config schema upgrade with backup.

## Architecture Notes

- CLI composition root: `new` and node:fs/node:path allowed only in cli/src/commands (aic-cli.mdc). No InitRunner; init does file I/O in the command.
- ADR-009: Zod validates at boundary; InitArgsSchema in cli/src/schemas. Init uses projectRoot and upgrade from parsed args.
- security.md: `.aic/` created with 0700; auto-gitignored. Init creates .aic/ with fs.mkdirSync(..., { recursive: true, mode: 0o700 }).
- Design: InitArgsSchema extends BaseArgsSchema so init receives projectRoot (--root). Default config: { version: 1, contextBudget: { maxTokens: 8000 } }. Upgrade: read → backup to .bak → apply in-memory upgrade (v1→v1 identity) → write.

## Files

| Action | Path                                                                           |
| ------ | ------------------------------------------------------------------------------ |
| Create | `cli/src/commands/init.ts`                                                     |
| Create | `cli/src/commands/__tests__/init.test.ts`                                      |
| Modify | `cli/src/schemas/init-args.ts` (extend BaseArgsSchema)                         |
| Modify | `cli/src/main.ts` (add init subcommand)                                        |
| Modify | `cli/src/schemas/__tests__/init-args.test.ts` (add projectRoot to parse calls) |

## Interface / Signature

Composition root: no interface to implement. Exported function only.

```typescript
// cli/src/commands/init.ts
export async function initCommand(args: InitArgs): Promise<void>;
```

```typescript
// InitArgs from cli/src/schemas/init-args.ts after Step 1
// InitArgsSchema = BaseArgsSchema.extend({ upgrade: z.boolean().optional().default(false) })
// So InitArgs = { projectRoot: string; configPath: string | null; dbPath: string | null; upgrade: boolean }
```

## Dependent Types

### Tier 0 — verbatim

None. Init uses only Node fs/path and InitArgs.

### Tier 1 — signature + path

None.

### Tier 2 — path-only

| Type       | Path                           | Factory                                                              |
| ---------- | ------------------------------ | -------------------------------------------------------------------- |
| `InitArgs` | `cli/src/schemas/init-args.ts` | `InitArgsSchema.parse({ projectRoot, configPath, dbPath, upgrade })` |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Extend InitArgsSchema with BaseArgsSchema

In `cli/src/schemas/init-args.ts`: import `BaseArgsSchema` from `./base-args.js`. Replace the current schema with `BaseArgsSchema.extend({ upgrade: z.boolean().optional().default(false) })`. Export the result as `InitArgsSchema` and export type `InitArgs` as `z.infer<typeof InitArgsSchema>`.

**Verify:** Run `pnpm typecheck` from repo root. InitArgs has projectRoot, configPath, dbPath, upgrade.

### Step 2: Implement initCommand in init.ts

Create `cli/src/commands/init.ts`. Import `InitArgsSchema` and type `InitArgs` from `@aic/cli/schemas/init-args.js`, `handleCommandError` from `@aic/cli/utils/handle-command-error.js`, and `node:fs` and `node:path`.

Define constant `CURRENT_CONFIG_SCHEMA_VERSION = 1`. Define default config object `DEFAULT_CONFIG = { version: 1, contextBudget: { maxTokens: 8000 } }`.

Implement `initCommand(args: InitArgs): Promise<void>`:

- At start: `InitArgsSchema.parse(args)` (re-validate). Resolve config path: `configPath = path.join(args.projectRoot, 'aic.config.json')`, `aicDir = path.join(args.projectRoot, '.aic')`, `gitignorePath = path.join(args.projectRoot, '.gitignore')`.
- If `args.upgrade === true`: If `!fs.existsSync(configPath)` throw (or exit with message that config not found). Read `content = fs.readFileSync(configPath, 'utf8')`. Parse JSON to get `version` (old). Write backup: `fs.writeFileSync(configPath + '.bak', content, 'utf8')`. Apply upgrade: MVP v1 only so upgraded = parsed object (identity). Write `fs.writeFileSync(configPath, JSON.stringify(upgraded, null, 2), 'utf8')`. Write to stdout: `Config upgraded from schema v${old} to v${CURRENT_CONFIG_SCHEMA_VERSION}. Backup saved to aic.config.json.bak.\n`. Return.
- If `args.upgrade === false`: If `fs.existsSync(configPath)`, write to stderr `Config already exists. Use 'aic init --upgrade' to migrate to the current schema version.\n` and call `handleCommandError` with an error so the process exits 1. Else: (1) `fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 })`, (2) `fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8')`, (3) if `!fs.existsSync(gitignorePath)` then `fs.writeFileSync(gitignorePath, '.aic/\n', 'utf8')`, else read gitignore, if content does not already contain a line `.aic/` or `.aic` then append `\n.aic/\n`, (4) write to stdout `Created aic.config.json. Edit to customise, or run 'aic compile' to use defaults.\n`. Return.

Wrap body in try/catch and call `handleCommandError(err)` in catch.

**Verify:** Run `pnpm typecheck`. File exists and exports `initCommand`.

### Step 3: Wire init subcommand in main.ts

In `cli/src/main.ts`: import `InitArgsSchema` from `./schemas/init-args.js`, `initCommand` from `./commands/init.js`, and `resolveBaseArgs` and `runAction` from `./utils/run-action.js` (and type `CliOpts`). Add subcommand: `program.command('init').description('Scaffold aic.config.json and add .aic/ to .gitignore').option('--root <path>', 'project root directory', process.cwd()).option('--upgrade', 'migrate config to current schema and back up original').action(async function (this: Command) { await runAction(async () => { const parsed = InitArgsSchema.parse({ ...resolveBaseArgs(this.opts() as CliOpts), upgrade: this.opts().upgrade === true }); await initCommand(parsed); }); });`.

**Verify:** Run `pnpm typecheck`. `aic init --help` shows init subcommand (manual or via node cli entry).

### Step 4: Add initCommand tests

Create `cli/src/commands/__tests__/init.test.ts`. Use vitest, node:fs, node:path, node:os (tmpdir). Import `initCommand` from `../init.js`, `InitArgsSchema` from `../../schemas/init-args.js`.

- **config_created_and_aic_dir_0700:** Create temp dir with `fs.mkdtempSync(path.join(tmpdir(), 'aic-init-'))`. Parse args with `InitArgsSchema.parse({ projectRoot: tempDir, configPath: null, dbPath: null, upgrade: false })`. Stub stdout.write to capture. Call `await initCommand(parsed)`. Assert `fs.existsSync(path.join(tempDir, 'aic.config.json'))`. Read JSON into a variable; assert that object has `version === 1` and `contextBudget.maxTokens === 8000`. Assert `fs.existsSync(path.join(tempDir, '.aic'))`. Assert `(fs.statSync(path.join(tempDir, '.aic')).mode & 0o777) === 0o700`. Assert captured stdout includes "Created aic.config.json". Clean up temp dir.
- **gitignore_created_or_appended:** (a) Temp dir, no .gitignore. Run initCommand. Assert .gitignore exists and content includes ".aic/". (b) Temp dir, .gitignore with one line "node_modules/". Run initCommand. Assert .gitignore contains "node_modules/" and ".aic/". (c) Temp dir, .gitignore already contains ".aic/". Run initCommand. Assert ".aic/" appears only once. Clean up.
- **config_already_exists_exits_with_message:** Temp dir, create aic.config.json with `fs.writeFileSync(path.join(tempDir, 'aic.config.json'), '{}', 'utf8')`. Stub stderr.write. Call initCommand(parsed with upgrade: false). Expect initCommand to throw (handleCommandError throws). Assert stderr contains "Config already exists". Clean up.
- **upgrade_backs_up_and_rewrites:** Temp dir, create aic.config.json with content `{"version":1}`. Parse args with upgrade: true. Stub stdout. Call await initCommand(parsed). Assert aic.config.json.bak exists and readFileSync equals original content. Assert aic.config.json exists and has version 1. Assert stdout contains "Config upgraded" and "Backup saved". Clean up.

**Verify:** Run `pnpm test -- cli/src/commands/__tests__/init.test.ts`. All four test cases pass.

### Step 5: Update init-args schema tests for projectRoot

In `cli/src/schemas/__tests__/init-args.test.ts`: After extending InitArgsSchema with BaseArgsSchema, parse({}) will fail (missing projectRoot). Update both tests to include `projectRoot: '/tmp/proj'` (or a non-empty string) in the object passed to `InitArgsSchema.parse`. Keep assertions on `upgrade`. Add one test: parse with projectRoot missing or empty fails (safeParse).success === false.

**Verify:** Run `pnpm test -- cli/src/schemas/__tests__/init-args.test.ts`. All tests pass.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                | Description                                                                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| config_created_and_aic_dir_0700          | initCommand creates aic.config.json with version 1 and maxTokens 8000, creates .aic/ with mode 0700, stdout contains "Created aic.config.json" |
| gitignore_created_or_appended            | No .gitignore → created with .aic/; existing .gitignore → .aic/ appended; already has .aic/ → no duplicate                                     |
| config_already_exists_exits_with_message | When aic.config.json exists and upgrade false, stderr has "Config already exists" and command throws                                           |
| upgrade_backs_up_and_rewrites            | With upgrade true, backup written to .bak, config rewritten, stdout contains "Config upgraded" and "Backup saved"                              |
| init-args projectRoot required           | InitArgsSchema.parse requires projectRoot; missing or empty projectRoot fails                                                                  |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] initCommand signature matches: (args: InitArgs) => Promise<void>
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries (CLI does not import from mcp)
- [ ] No `new Date()`, `Date.now()`, `Math.random()` in init.ts
- [ ] No `let` in production code (const only)
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
