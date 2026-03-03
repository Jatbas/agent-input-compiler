# Task 083: aic report (static HTML)

> **Status:** Done
> **Phase:** M (Reporting & Resources)
> **Layer:** cli
> **Depends on:** Status command, StatusStore, LoadConfigFromFile, ensureAicDir (all Done)

## Goal

Add a CLI command `aic report` that writes the same project-level summary as `aic status` to a static HTML file (default `.aic/report.html`), so users can open the report in a browser or share it.

## Architecture Notes

- CLI command only — no new core interface or storage. Reuse StatusRunner; report uses same data as status, formats as HTML, and writes to a file.
- ADR-009: validation at boundary; report uses ReportArgsSchema (BaseArgs + optional outputPath). Budget from LoadConfigFromFile like status.
- Default output path uses ensureAicDir(projectRoot) from shared so `.aic` exists with 0700; custom outputPath is written as-is (user responsibility for parent dir).
- HTML: no new dependency. Build with template literals; escape user-controlled strings (intent, installationNotes, paths) for XSS: & → &amp;, < → &lt;, > → &gt;, " → &quot;.

## Files

| Action | Path |
| ------ | ---- |
| Create | `cli/src/schemas/report-args.ts` |
| Create | `cli/src/commands/report.ts` |
| Create | `cli/src/commands/__tests__/report.test.ts` |
| Modify | `cli/src/main.ts` (register report command, wire StatusRunner) |

## Interface / Signature

No new interface. Report uses existing StatusRunner.

**Wiring specification:**

- main.ts instantiates: openDatabase(request.dbPath, new SystemClock()); SqliteStatusStore(db, new SystemClock()); runner = { status(request) { return Promise.resolve(store.getSummary()); } } — same pattern as status command.
- Exported function: `reportCommand(args: ReportArgs, runner: StatusRunner): Promise<void>`

```typescript
// report.ts — exported function
export async function reportCommand(
  args: ReportArgs,
  runner: StatusRunner,
): Promise<void>;
```

## Dependent Types

### Tier 0 — verbatim

StatusRequest and StatusAggregates (report builds request and consumes aggregates from runner.status). Full definitions in `shared/src/core/types/status-types.ts`: StatusRequest { projectRoot, configPath, dbPath }; StatusAggregates { compilationsTotal, compilationsToday, cacheHitRatePct, avgReductionPct, totalTokensRaw, totalTokensCompiled, totalTokensSaved, telemetryDisabled, guardByType, topTaskClasses, lastCompilation, installationOk, installationNotes }.

### Tier 1 — signature + path

| Type | Path | Members | Purpose |
| ---- | ---- | ------- | ------- |
| StatusRunner | shared/src/core/interfaces/status-runner.interface.js | status(StatusRequest): Promise<StatusAggregates> | Injected; report calls runner.status(request) |

### Tier 2 — path-only

| Type | Path | Factory |
| ---- | ---- | ------- |
| AbsolutePath | shared/src/core/types/paths.js | toAbsolutePath(raw) |
| FilePath | shared/src/core/types/paths.js | toFilePath(raw) |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: ReportArgs schema

Create `cli/src/schemas/report-args.ts`. Extend BaseArgsSchema with `outputPath: z.string().nullable().default(null)`. Export ReportArgsSchema and type ReportArgs = z.infer<typeof ReportArgsSchema>. Import BaseArgsSchema from ./base-args.js.

**Verify:** pnpm typecheck passes; ReportArgs has projectRoot, configPath, dbPath, outputPath.

### Step 2: formatStatusAsHtml and escape helper in report.ts

Create `cli/src/commands/report.ts`. Add function `escapeHtml(s: string): string` that replaces & → &amp;, < → &lt;, > → &gt;, " → &quot; (so user-controlled strings are safe in HTML). Add function `formatStatusAsHtml(request: StatusRequest, aggregates: StatusAggregates, budget: number): string` that returns a complete static HTML document (DOCTYPE, html, head with charset and title "AIC Status", body) with the same sections as status output (Compilations, Cache hit rate, Avg reduction, Total tokens, Total tokens saved, Budget utilization, Guard, Top task classes, Rules health, Config, Trigger rule, Installation, Database, Last compilation). Use escaped strings for intent, installationNotes, config line, trigger line, database line, and any other user-facing text. Use table or definition list markup; no script tags. formatStatusAsHtml may use fs and path to compute config line, trigger line, and database line (same as formatStatusOutput in status.ts).

**Verify:** pnpm typecheck passes.

### Step 3: reportCommand implementation

In `cli/src/commands/report.ts`: Import ReportArgsSchema, StatusRunner, StatusRequest, StatusAggregates, toAbsolutePath, toFilePath, LoadConfigFromFile, applyConfigResult not needed (only budget), ensureAicDir, handleCommandError, path, fs. Export async function reportCommand(args: ReportArgs, runner: StatusRunner): Promise<void>. In try: ReportArgsSchema.parse(args); projectRoot = toAbsolutePath(args.projectRoot); dbPath = args.dbPath !== null ? toFilePath(args.dbPath) : toFilePath(path.join(args.projectRoot, ".aic", "aic.sqlite")); if (!fs.existsSync(dbPath)) { process.stdout.write("No AIC database found. Run 'aic init' or use AIC via your editor first.\n"); return; } configPath = args.configPath !== null ? toFilePath(args.configPath) : null; request = { projectRoot, configPath, dbPath }; loadConfig = new LoadConfigFromFile(); result = loadConfig.load(projectRoot, configPath ?? null); budget = result.config.contextBudget.maxTokens; aggregates = await runner.status(request); if (aggregates.compilationsTotal === 0) { process.stdout.write("No compilations recorded yet. Run 'aic compile' or use AIC via your editor.\n"); return; } outputPath = args.outputPath !== null ? toFilePath(args.outputPath) : toFilePath(path.join(ensureAicDir(projectRoot), "report.html")); html = formatStatusAsHtml(request, aggregates, budget); fs.writeFileSync(outputPath, html, "utf8"); displayPath = path.relative(projectRoot, outputPath) || outputPath; process.stdout.write(`Report written to ${displayPath}\n`); catch: handleCommandError(err).

**Verify:** pnpm typecheck passes. Run `aic report` in a project with compilations; .aic/report.html exists and contains Compilations and last intent.

### Step 4: Register report command in main.ts

In `cli/src/main.ts`: Import reportCommand from ./commands/report.js; Import ReportArgsSchema from ./schemas/report-args.js; Import StatusRequest from @aic/shared/core/types/status-types.js. Add program.command("report").description("Write project status to a static HTML file").option("--root <path>", "project root directory", process.cwd()).option("--config <path>", "path to aic.config.json").option("--db <path>", "path to SQLite database").option("--output <path>", "output HTML file path (default: .aic/report.html)").action(async function (this: Command) { await runAction(async () => { const opts = this.opts(); const parsed = ReportArgsSchema.parse({ ...resolveBaseArgs(opts), outputPath: opts.output ?? null }); const reportRunner = { status(req: StatusRequest) { const db = openDatabase(req.dbPath, new SystemClock()); try { const store = new SqliteStatusStore(db, new SystemClock()); return Promise.resolve(store.getSummary()); } finally { closeDatabase(db); } } }; await reportCommand(parsed, reportRunner); }); });

**Verify:** pnpm typecheck passes. Commander shows `aic report` in help.

### Step 5: Tests

Create `cli/src/commands/__tests__/report.test.ts`. Use fixture StatusAggregates (same shape as status.test.ts). Stub StatusRunner. Tests: (1) report_writes_html_file: temp dir with .aic/aic.sqlite, stub runner returns fixture aggregates, reportCommand with outputPath to temp file; assert file exists, content includes "<!DOCTYPE html>" or "DOCTYPE", "Compilations", and fixture intent string (escaped). (2) report_no_database_exits_with_message: projectRoot with no .aic; reportCommand; assert stdout contains "No AIC database found"; output file not created when outputPath was set to a temp path. (3) report_no_compilations_exits_with_message: stub runner returns compilationsTotal: 0; reportCommand; assert stdout contains "No compilations recorded yet"; file not created. (4) report_uses_default_output_path: stub runner, args with outputPath null, projectRoot with existing .aic and aic.sqlite; reportCommand; assert file exists at path.join(projectRoot, ".aic", "report.html"). (5) report_escapes_html_in_intent: stub runner returns aggregates with lastCompilation.intent = "<script>"; reportCommand; read output file; assert content includes "&lt;script&gt;" and does not include unescaped "<script>". (6) report_runner_throws_propagates: stub runner throws new ConfigError("test"); expect(reportCommand(...)).rejects.toThrow(); assert stderr contains "test".

**Verify:** pnpm test cli/src/commands/__tests__/report.test.ts passes.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| report_writes_html_file | Stub runner, temp output path; file exists, contains DOCTYPE, Compilations, intent |
| report_no_database_exits_with_message | No .aic/aic.sqlite; stdout "No AIC database found", no file created |
| report_no_compilations_exits_with_message | compilationsTotal 0; stdout "No compilations recorded yet", no file created |
| report_uses_default_output_path | outputPath null; file at .aic/report.html |
| report_escapes_html_in_intent | intent "<script>"; output contains &lt;script&gt; |
| report_runner_throws_propagates | Runner throws ConfigError; rejects, stderr contains message |

## Acceptance Criteria

- [ ] ReportArgsSchema and reportCommand implemented; main.ts registers report command
- [ ] Default output path uses ensureAicDir(projectRoot) then report.html; custom --output written as-is
- [ ] HTML escapes user-controlled strings (intent, installationNotes, paths)
- [ ] All six test cases pass
- [ ] pnpm lint — zero errors, zero warnings
- [ ] pnpm typecheck — clean
- [ ] pnpm knip — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations, stop. List the adaptations, report to the user, and re-evaluate before continuing.
