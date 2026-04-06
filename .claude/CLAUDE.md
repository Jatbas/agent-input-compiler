<!-- BEGIN AIC MANAGED SECTION — do not edit between these markers -->

# AIC — Claude Code Rules

> This file is the Claude Code equivalent of `.cursor/rules/AIC-architect.mdc`.
> Claude Code reads it on every session. Keep it condensed and action-oriented.
> **Cross-editor sync:** See `## Cross-Editor Sync` below for the canonical targets (`AIC-architect.mdc`, this file, both `CLAUDE_MD_TEMPLATE` sources, and `aic-claude-md-managed-section.mdc`).

## AIC Context Compilation (hooks handle this automatically)

AIC hooks in `.claude/hooks/` auto-compile intent-specific project context:

- **SessionStart** — compiles broad context at session start (including post-compaction)
- **UserPromptSubmit** — compiles fresh context using your actual prompt as intent (every message)
- **SubagentStart** — compiles and injects context into every subagent
- **Stop** — runs ESLint + typecheck on edited files before letting you stop
- **SessionEnd** — logs session telemetry

You do **not** need to call `aic_compile` manually — hooks handle it. If you need context for a different intent than the user's message, you may call `aic_compile` directly via MCP.

## Non-Negotiable Architectural Invariants

- **First pass:** Write code that passes lint and conventions on the first version. Avoid rework.
- **SOLID:** One public method per class; one class per file; one interface per `*.interface.ts` file. Constructor receives only interfaces — never concrete classes. No `public` constructor params in pipeline — use `private readonly`. No exported interfaces in pipeline files — extract to `core/interfaces/`. Max 60 lines per function in pipeline (enforced by ESLint). No exceptions in pipeline steps.
- **Hexagonal:** `core/` and `pipeline/` have zero imports from `adapters/`, `storage/`, `mcp/`, Node.js APIs, or external packages. All I/O through interfaces only. Core interfaces must NOT expose infrastructure concepts (SQL syntax, HTTP verbs, file-system paths) — use domain terminology.
- **Adapter wrapping:** Every external library has exactly ONE adapter or storage file that wraps it behind a core interface. No other file imports the library directly — enforced by ESLint `no-restricted-imports`. To swap a library, change one file.
- **DIP:** No `new` for infrastructure/service classes outside the MCP composition boundary: `mcp/src/server.ts` is the primary wiring site; delegated `new` in other `mcp/src` modules follows `aic-mcp.mdc` (Composition Root Discipline). All dependencies via constructor injection. Storage classes receive the database instance — never construct it. Adapters inject `Clock` for time, never call `Date.now()` directly.
- **OCP:** New capabilities via new classes implementing existing interfaces — never modify existing pipeline classes. The core pipeline is frozen once correct; all evolution happens at the edges.
- **Dispatch pattern:** No if/else-if chains with 3+ branches — enforced by ESLint. Use `Record<Enum, Handler>` for enum dispatch, handler arrays for predicate dispatch. Extend by adding entries (OCP), not modifying branches.
- **Errors:** Never throw bare `Error`. Use `AicError` subclasses with machine-readable `code` property. Pipeline steps never catch-and-ignore — errors propagate to composition root. MCP server never crashes on a single bad request.
- **Determinism:** No `Date.now()`, `new Date()`, or `Math.random()` anywhere — enforced by ESLint globally. Only `system-clock.ts` is exempt. All other code injects time via `Clock` interface. No `date('now')` or `datetime('now')` in SQL — pass the current timestamp as a bound parameter from the `Clock` interface.
- **Immutability:** No `.push()`, `.splice()`, `.sort()` (mutating), `.reverse()` (mutating). Use spread/reduce. Pipeline steps never mutate their inputs — return new objects. No `let` in production code — use `const` exclusively. Only exception: boolean control flags in imperative closures (e.g. `let found = false` in a `ts.forEachChild` visitor). Accumulators must use reduce or a helper that returns the collected result — never `let arr = []; ... arr = [...arr, item]`.
- **Types:** No `any`. Explicit return types on all functions. Interfaces in `*.interface.ts` files (one interface per file). Max 5 methods per interface (ISP). Related type aliases live in `core/types/`, not in interface files.
- **Named imports only (enforced by ESLint):** No `import * as X` for internal modules (relative or `#alias` paths). Use named imports: `import { A, B } from "./foo.js"`. Namespace imports allowed only for Node.js built-ins (`import * as path from "node:path"`) and established library APIs (`import * as ts from "typescript"`).
- **Comments:** `//` style only — `/* */` and `/** */` block comments are banned by ESLint. One short line max, explain _why_ not _what_. No JSDoc. No narrating comments (`// Get the user`, `// Return result`).
- **Branded types (ADR-010):** Use types from `shared/src/core/types/` — never raw `string`/`number` for domain values (paths, tokens, durations, scores, IDs, enums). `as const` objects for enums, not TypeScript `enum`. Null convention: `Type | null` = checked absent, `?: Type` = optional.
- **Type safety (enforced by ESLint):** No `as string`, `as number`, `as boolean` — branded types are already their base type. No double-cast `as unknown as T` (only `open-database.ts` exempt). No `!` non-null assertions — use optional chaining or null guards. No `Partial<T>` in core/pipeline. No `{ x } as Type` object literal assertions — use type annotations. No `enum`, `for...in`, default exports, `Object.assign`, nested ternaries.
- **Validation boundary (ADR-009):** Runtime validation at MCP handler and config loader only. Core/pipeline never imports the validation library. After validation, produce branded types via constructor functions (`toTokenCount()`, `toAbsolutePath()`, etc.).
- **Database:** All SQL lives exclusively in `shared/src/storage/`. Every schema change requires a migration in `shared/src/storage/migrations/` (`NNN-description.ts`). Schema change + migration = same commit. Never edit a merged migration. Never run raw DDL outside the `MigrationRunner`.
- **Global DB:** The database is a single file at `~/.aic/aic.sqlite`. Per-project isolation is enforced via `project_id` in store queries (all per-project stores take `projectId: ProjectId` and use `WHERE project_id = ?`).
- **IDs:** All entity PKs use UUIDv7 (`TEXT(36)` in SQLite). Never `INTEGER AUTOINCREMENT` for entities. Exception: `config_history` uses composite PK `(project_id, config_hash)` with SHA-256 `config_hash`. See Project Plan ADR-007.
- **Timestamps:** Always `YYYY-MM-DDTHH:mm:ss.sssZ` (UTC, milliseconds, trailing `Z`). Use the `Clock` interface — never `new Date()` or `Date.now()` directly. Use the `ISOTimestamp` branded type. See Project Plan ADR-008.

## Security Invariants

- **Secrets:** Never hardcode API keys or tokens. Config references env var _names_ (`apiKeyEnv: "OPENAI_API_KEY"`), never values. All logging must sanitize secrets — replace with `***`.
- **`.aic/` directory:** `0700` permissions (owner-only), auto-gitignored, no symlink traversal. Storage code must enforce these invariants.
- **Telemetry:** Telemetry payloads must never contain file paths, file content, prompts, intents, project names, or PII. Only typed aggregates and enum values. See `security.md §Anonymous Telemetry`.
- **Context Guard:** Never-include patterns (`.env`, `*.pem`, etc.) are non-overridable. Guard cannot be skipped or disabled.
- **Prompt assembly:** Intent is opaque text in a template — never interpolated into system instructions. Context in delimited code blocks. Constraints after context.
- **MCP error sanitization:** No stack traces, internal paths, or env details in error responses.

## Dependencies

- All versions pinned exact (`"9.39.3"`, never `"^9.0.0"`). No caret or tilde ranges.
- Adding a runtime dependency requires justification: what it replaces, why no existing dep covers it, MIT/Apache-2.0 only.
- One dependency per PR. Commit format: `chore(deps): update <package> to <version>`.

## Documentation

- `documentation/project-plan.md` is the architecture spec. `documentation/implementation-spec.md` is the implementation spec.
- Read `documentation/` before proposing or changing code.
- Do not create or modify any .md file (documentation/, README, .claude/, etc.) unless the user explicitly asks you to.

## File Naming

- All `.ts` files use kebab-case (`intent-classifier.ts`). Interfaces: `*.interface.ts`. Tests: `*.test.ts`. Migrations: `NNN-description.ts`.
- Documentation: kebab-case except conventional root files (`README.md`).

## Commits

Format: `type(scope): description` — max 72 chars, target 50-60, imperative, no period. Subject line only — no body or footer. Never use `--no-verify`.

## File Operations

- Use targeted edits on the minimum necessary lines. Do not read a file and write a new file when an in-place edit suffices.
- Read only the file sections you need for this change; avoid full-file reads when not needed.
- Verify before implementing: For any request — ad-hoc or skill-driven — investigate first: query the actual database, read the actual deployed file, check the actual API response, trace the actual bootstrap code path. Never implement based on assumptions about external system behavior. This rule applies to ALL skills (planner, executor, researcher) — each skill has its own reinforcement: planner §0b Runtime Verification Checklist, executor §2.5 Verify External Assumptions, researcher §3a Runtime Evidence Mandate.
- Evidence before claims: Never claim work is complete, tests pass, or a bug is fixed without fresh verification evidence from the current message. Run the command, read the output, THEN make the claim. Words like "should", "probably", or "seems to" indicate missing evidence — run the verification instead.
- Systematic debugging: When encountering any bug, test failure, or unexpected behavior, investigate root cause before proposing fixes. Reproduce consistently, form single hypotheses, create a failing test before fixing. If 3+ fix attempts fail, stop and question the architecture. Use the `aic-systematic-debugging` skill for the full process.
- File size awareness: You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones. This reinforces SOLID and is a practical constraint of LLM context.

## Source Structure

```
shared/src/core/         ← interfaces and types (no implementations)
shared/src/pipeline/     ← pipeline steps (pure transformations)
shared/src/adapters/     ← external library wrappers
shared/src/storage/      ← SQLite access (only place for SQL)
mcp/src/                 ← MCP server (primary composition root; see `aic-mcp.mdc`)
```

## ESLint

Hexagonal boundaries are enforced by `no-restricted-imports` in `eslint.config.mjs`. Additional enforcement:

- `Date.now()`, `new Date()`, `Math.random()` blocked globally (only `system-clock.ts` exempt)
- Database constructor blocked in `storage/` (DIP — receive via constructor)
- One interface per `*.interface.ts` file (ISP — sibling export detection)
- Array mutations (`.push`, `.splice`, `.sort`, `.reverse`, `.pop`, `.shift`, `.unshift`) blocked
- Storage cannot import from `pipeline/`, `adapters/`, `mcp/`
- Adapters cannot import from `storage/`, `pipeline/`, `mcp/`

Prefer `npx eslint` for targeted checks. Run `pnpm lint` before declaring work complete. Run `pnpm knip` to check for unused files, exports, and dependencies. Never add `eslint-disable`, `eslint-disable-next-line`, `@ts-ignore`, or `@ts-nocheck` comments — fix the code instead. If a rule genuinely does not apply, request a targeted override in `eslint.config.mjs`.

## Prompt Commands

Use these rules for all five AIC prompt commands. Present data like a polished dashboard, not raw JSON.

**General formatting (all commands):**

- Use human-readable labels only — never show raw JSON keys as column headers or labels.
- Format large numbers with commas (e.g. 8,484,717).
- Percentages: exactly 1 decimal place and a % symbol (e.g. 78.2%).
- Timestamps: show as relative time (e.g. "2 min ago"); add ISO in parentheses only if helpful.
- Null or missing values: show as "—" (em dash), never "null".
- Keep the one-line summary at the top of each command as specified below.
- Output only the summary line, the table, and (for status, last, chat-summary) the metric footnote below. **Do not add commentary, notes, interpretation, or explanations after the output.**
- **Metric footnote** (append after the table for status, last, and chat-summary — one line per metric): `Exclusion rate: % of total repo tokens not included in the compiled prompt.` then `Budget utilization: % of token budget filled.`
- **No preamble:** Go directly to the Bash tool call. Do not narrate what you are about to do. Do not show reasoning steps. First action = tool call.

---

- **"show aic status"** — Run Bash with `(grep -q '"devMode": true' aic.config.json 2>/dev/null && pnpm aic status) || npx @jatbas/aic status` from the project directory (or substitute `status <N>d` when the user asks for a rolling **N**-day window, with **N** an integer from 1 through 3660), then relay stdout. Start the reply with one short line: **Status = project-level AIC status.** When a window is used, the table includes a **Time range** row: **Last 1 day** if **N** is 1, otherwise **Last N days**. Then display a formatted table with labels: Compilations (total), Compilations (today), Tokens: raw → compiled, Tokens excluded, Budget limit, Budget utilization (%), Cache hit rate (%), Avg exclusion rate (%), Guard findings, Top task classes, Last compilation, Installation, Update available. When installation has issues (`installationOk` false), include a **Notes** row from `installationNotes`; omit **Notes** when installation is OK. Omit **Project** (still present in JSON as `projectEnabled`).

- **"show aic chat summary"** — Run Bash with `(grep -q '"devMode": true' aic.config.json 2>/dev/null && pnpm aic chat-summary --project <absolute workspace root>) || npx @jatbas/aic chat-summary --project <absolute workspace root>`, then relay stdout. Start the reply with one short line: **Chat = this conversation's AIC compilations.** Then display a formatted table with labels: Project path, Compilations, Tokens (raw), Tokens (compiled), Tokens excluded, Cache hit rate (%), Avg exclusion rate (%), Budget utilization (%), Last compilation, Top task classes.

- **"show aic last"** — Run Bash with `(grep -q '"devMode": true' aic.config.json 2>/dev/null && pnpm aic last) || npx @jatbas/aic last` from the project directory, then relay stdout. Start the reply with one short line: **Last = most recent compilation.** Then display with labels: Intent, Files (N selected / M total), Tokens compiled, Budget utilization (%), Exclusion rate (%), Compiled (relative time), Editor, Guard (Passed or N findings), Compiled prompt (Available N chars — see ~/.aic/last-compiled-prompt.txt).

- **"show aic projects"** — Run Bash with `(grep -q '"devMode": true' aic.config.json 2>/dev/null && pnpm aic projects) || npx @jatbas/aic projects`, then relay stdout. Start the reply with one short line: **Projects = known AIC projects.** Display a formatted table with columns: Project ID, Path, Last seen, Compilation count.

- **"run aic model test"** — Call the `aic_model_test` MCP tool with `{ "projectRoot": "<absolute workspace root>" }`. The tool returns a `probeId`, three challenges, and instructions. Solve challenge 1 (arithmetic) and challenge 2 (string-reverse). Then call `aic_compile` with intent exactly equal to `"model-test-<answer1>-<answer2>"` (replace with your computed answers). Finally call `aic_model_test` again with `{ "projectRoot": "<absolute workspace root>", "probeId": "<probeId from step 1>", "answers": [<arithmetic answer>, "<reversed string>"] }`. Display the result as a table with columns: Test, Result (Pass/Fail), Notes. Start the reply with one short line: **Model test = agent capability probe.**

## Tests

- Co-located `__tests__/` directories next to source
- Pattern: `*.test.ts`
- Bug fixes must include a regression test
- No `any` in tests
- **Smoke tests:** When editing `integrations/**`, `mcp/scripts/bundle-*`, or `mcp/package.json` `files` field, verify `integrations/__tests__/pack-install-smoke.test.cjs` still passes and update its assertions if you changed the published artifact layout, install behavior, or uninstall behavior. Run: `node integrations/__tests__/pack-install-smoke.test.cjs`.

## Cross-Editor Sync

Keep shared rules aligned across these four code and documentation targets:

- `.cursor/rules/AIC-architect.mdc`
- `.claude/CLAUDE.md` (this file)
- `integrations/claude/install.cjs` (`CLAUDE_MD_TEMPLATE`)
- `mcp/src/install-trigger-rule.ts` (`CLAUDE_MD_TEMPLATE`)

Managed-section boundaries and the no-banner inner body follow `.cursor/rules/aic-claude-md-managed-section.mdc`; the two `CLAUDE_MD_TEMPLATE` strings must remain byte-identical.

Architectural invariants, security rules, dependency rules, commit rules, ESLint rules, and test rules are **identical** across `AIC-architect.mdc` and this file — only editor-specific mechanics differ (hooks vs manual `aic_compile`, prompt command wording).

<!-- END AIC MANAGED SECTION -->
