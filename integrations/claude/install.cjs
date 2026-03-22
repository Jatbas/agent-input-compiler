// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const { resolveProjectRoot } = require("../shared/resolve-project-root.cjs");

const AIC_SCRIPT_NAMES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "aic-hook-scripts.json"), "utf8"),
).hookScriptNames;

const CLAUDE_MD_TEMPLATE = `<!-- AIC rule version: {{VERSION}} -->
# AIC — Claude Code Rules

> This file is the Claude Code equivalent of \`.cursor/rules/AIC-architect.mdc\`.
> Claude Code reads it on every session. Keep it condensed and action-oriented.
> **Cross-editor sync:** This file and \`.cursor/rules/AIC-architect.mdc\` must stay in sync. When you change a rule in either file, apply the same change to the other. The architectural invariants are identical — only editor-specific mechanisms (hooks vs manual calls, prompt commands) differ.

## AIC Context Compilation (hooks handle this automatically)

AIC hooks in \`.claude/hooks/\` auto-compile intent-specific project context:

- **SessionStart** — compiles broad context at session start (including post-compaction)
- **UserPromptSubmit** — compiles fresh context using your actual prompt as intent (every message)
- **SubagentStart** — compiles and injects context into every subagent
- **Stop** — runs ESLint + typecheck on edited files before letting you stop
- **SessionEnd** — logs session telemetry

You do **not** need to call \`aic_compile\` manually — hooks handle it. If you need context for a different intent than the user's message, you may call \`aic_compile\` directly via MCP.

## Non-Negotiable Architectural Invariants

- **First pass:** Write code that passes lint and conventions on the first version. Avoid rework.
- **SOLID:** One public method per class; one class per file; one interface per \`*.interface.ts\` file. Constructor receives only interfaces — never concrete classes. No \`public\` constructor params in pipeline — use \`private readonly\`. No exported interfaces in pipeline files — extract to \`core/interfaces/\`. Max 60 lines per function in pipeline (enforced by ESLint). No exceptions in pipeline steps.
- **Hexagonal:** \`core/\` and \`pipeline/\` have zero imports from \`adapters/\`, \`storage/\`, \`mcp/\`, Node.js APIs, or external packages. All I/O through interfaces only. Core interfaces must NOT expose infrastructure concepts (SQL syntax, HTTP verbs, file-system paths) — use domain terminology.
- **Adapter wrapping:** Every external library has exactly ONE adapter or storage file that wraps it behind a core interface. No other file imports the library directly — enforced by ESLint \`no-restricted-imports\`. To swap a library, change one file.
- **DIP:** No \`new\` for infrastructure/service classes outside the composition root (\`mcp/src/server.ts\`). All dependencies via constructor injection. Storage classes receive the database instance — never construct it. Adapters inject \`Clock\` for time, never call \`Date.now()\` directly.
- **OCP:** New capabilities via new classes implementing existing interfaces — never modify existing pipeline classes. The core pipeline is frozen once correct; all evolution happens at the edges.
- **Dispatch pattern:** No if/else-if chains with 3+ branches — enforced by ESLint. Use \`Record<Enum, Handler>\` for enum dispatch, handler arrays for predicate dispatch. Extend by adding entries (OCP), not modifying branches.
- **Errors:** Never throw bare \`Error\`. Use \`AicError\` subclasses with machine-readable \`code\` property. Pipeline steps never catch-and-ignore — errors propagate to composition root. MCP server never crashes on a single bad request.
- **Determinism:** No \`Date.now()\`, \`new Date()\`, or \`Math.random()\` anywhere — enforced by ESLint globally. Only \`system-clock.ts\` is exempt. All other code injects time via \`Clock\` interface. No \`date('now')\` or \`datetime('now')\` in SQL — pass the current timestamp as a bound parameter from the \`Clock\` interface.
- **Immutability:** No \`.push()\`, \`.splice()\`, \`.sort()\` (mutating), \`.reverse()\` (mutating). Use spread/reduce. Pipeline steps never mutate their inputs — return new objects. No \`let\` in production code — use \`const\` exclusively. Only exception: boolean control flags in imperative closures (e.g. \`let found = false\` in a \`ts.forEachChild\` visitor). Accumulators must use reduce or a helper that returns the collected result — never \`let arr = []; ... arr = [...arr, item]\`.
- **Types:** No \`any\`. Explicit return types on all functions. Interfaces in \`*.interface.ts\` files (one interface per file). Max 5 methods per interface (ISP). Related type aliases live in \`core/types/\`, not in interface files.
- **Named imports only (enforced by ESLint):** No \`import * as X\` for internal modules (relative or \`#alias\` paths). Use named imports: \`import { A, B } from "./foo.js"\`. Namespace imports allowed only for Node.js built-ins (\`import * as path from "node:path"\`) and established library APIs (\`import * as ts from "typescript"\`).
- **Comments:** \`//\` style only — \`/* */\` and \`/** */\` block comments are banned by ESLint. One short line max, explain _why_ not _what_. No JSDoc. No narrating comments (\`// Get the user\`, \`// Return result\`).
- **Branded types (ADR-010):** Use types from \`shared/src/core/types/\` — never raw \`string\`/\`number\` for domain values (paths, tokens, durations, scores, IDs, enums). \`as const\` objects for enums, not TypeScript \`enum\`. Null convention: \`Type | null\` = checked absent, \`?: Type\` = optional.
- **Type safety (enforced by ESLint):** No \`as string\`, \`as number\`, \`as boolean\` — branded types are already their base type. No double-cast \`as unknown as T\` (only \`open-database.ts\` exempt). No \`!\` non-null assertions — use optional chaining or null guards. No \`Partial<T>\` in core/pipeline. No \`{ x } as Type\` object literal assertions — use type annotations. No \`enum\`, \`for...in\`, default exports, \`Object.assign\`, nested ternaries.
- **Validation boundary (ADR-009):** Runtime validation at MCP handler and config loader only. Core/pipeline never imports the validation library. After validation, produce branded types via constructor functions (\`toTokenCount()\`, \`toAbsolutePath()\`, etc.).
- **Database:** All SQL lives exclusively in \`shared/src/storage/\`. Every schema change requires a migration in \`shared/src/storage/migrations/\` (\`NNN-description.ts\`). Schema change + migration = same commit. Never edit a merged migration. Never run raw DDL outside the \`MigrationRunner\`.
- **Global DB:** The database is a single file at \`~/.aic/aic.sqlite\`. Per-project isolation is enforced via \`project_id\` in store queries (all per-project stores take \`projectId: ProjectId\` and use \`WHERE project_id = ?\`).
- **IDs:** All entity PKs use UUIDv7 (\`TEXT(36)\` in SQLite). Never \`INTEGER AUTOINCREMENT\` for entities. Exception: \`config_history\` uses composite PK \`(project_id, config_hash)\` with SHA-256 \`config_hash\`. See Project Plan ADR-007.
- **Timestamps:** Always \`YYYY-MM-DDTHH:mm:ss.sssZ\` (UTC, milliseconds, trailing \`Z\`). Use the \`Clock\` interface — never \`new Date()\` or \`Date.now()\` directly. Use the \`ISOTimestamp\` branded type. See Project Plan ADR-008.

## Security Invariants

- **Secrets:** Never hardcode API keys or tokens. Config references env var _names_ (\`apiKeyEnv: "OPENAI_API_KEY"\`), never values. All logging must sanitize secrets — replace with \`***\`.
- **\`.aic/\` directory:** \`0700\` permissions (owner-only), auto-gitignored, no symlink traversal. Storage code must enforce these invariants.
- **Telemetry:** Telemetry payloads must never contain file paths, file content, prompts, intents, project names, or PII. Only typed aggregates and enum values. See \`security.md §Anonymous Telemetry\`.
- **Context Guard:** Never-include patterns (\`.env\`, \`*.pem\`, etc.) are non-overridable. Guard cannot be skipped or disabled.
- **Prompt assembly:** Intent is opaque text in a template — never interpolated into system instructions. Context in delimited code blocks. Constraints after context.
- **MCP error sanitization:** No stack traces, internal paths, or env details in error responses.

## Dependencies

- All versions pinned exact (\`"9.39.3"\`, never \`"^9.0.0"\`). No caret or tilde ranges.
- Adding a runtime dependency requires justification: what it replaces, why no existing dep covers it, MIT/Apache-2.0 only.
- One dependency per PR. Commit format: \`chore(deps): update <package> to <version>\`.

## Documentation

- \`documentation/project-plan.md\` is the architecture spec. \`documentation/implementation-spec.md\` is the implementation spec.
- Read \`documentation/\` before proposing or changing code.
- Do not create or modify any .md file (documentation/, README, .claude/, etc.) unless the user explicitly asks you to.

## File Naming

- All \`.ts\` files use kebab-case (\`intent-classifier.ts\`). Interfaces: \`*.interface.ts\`. Tests: \`*.test.ts\`. Migrations: \`NNN-description.ts\`.
- Documentation: kebab-case except conventional root files (\`README.md\`).

## Commits

Format: \`type(scope): description\` — max 72 chars, target 50-60, imperative, no period. Subject line only — no body or footer. Never use \`--no-verify\`.

## File Operations

- Use targeted edits on the minimum necessary lines. Do not read a file and write a new file when an in-place edit suffices.
- Read only the file sections you need for this change; avoid full-file reads when not needed.
- Verify before implementing: For any request — ad-hoc or skill-driven — investigate first: query the actual database, read the actual deployed file, check the actual API response, trace the actual bootstrap code path. Never implement based on assumptions about external system behavior. This rule applies to ALL skills (planner, executor, researcher) — each skill has its own reinforcement: planner §0b Runtime Verification Checklist, executor §2.5 Verify External Assumptions, researcher §3a Runtime Evidence Mandate.

## Source Structure

\`\`\`
shared/src/core/         ← interfaces and types (no implementations)
shared/src/pipeline/     ← pipeline steps (pure transformations)
shared/src/adapters/     ← external library wrappers
shared/src/storage/      ← SQLite access (only place for SQL)
mcp/src/                 ← MCP server (sole composition root)
\`\`\`

## ESLint

Hexagonal boundaries are enforced by \`no-restricted-imports\` in \`eslint.config.mjs\`. Additional enforcement:

- \`Date.now()\`, \`new Date()\`, \`Math.random()\` blocked globally (only \`system-clock.ts\` exempt)
- Database constructor blocked in \`storage/\` (DIP — receive via constructor)
- One interface per \`*.interface.ts\` file (ISP — sibling export detection)
- Array mutations (\`.push\`, \`.splice\`, \`.sort\`, \`.reverse\`, \`.pop\`, \`.shift\`, \`.unshift\`) blocked
- Storage cannot import from \`pipeline/\`, \`adapters/\`, \`mcp/\`
- Adapters cannot import from \`storage/\`, \`pipeline/\`, \`mcp/\`

Prefer \`npx eslint\` for targeted checks. Run \`pnpm lint\` before declaring work complete. Run \`pnpm knip\` to check for unused files, exports, and dependencies. Never add \`eslint-disable\`, \`eslint-disable-next-line\`, \`@ts-ignore\`, or \`@ts-nocheck\` comments — fix the code instead. If a rule genuinely does not apply, request a targeted override in \`eslint.config.mjs\`.

## Prompt Commands

Use these rules for all four AIC prompt commands. Present data like a polished dashboard, not raw JSON.

**General formatting (all commands):**

- Use human-readable labels only — never show raw JSON keys as column headers or labels.
- Format large numbers with commas (e.g. 8,484,717).
- Percentages: exactly 1 decimal place and a % symbol (e.g. 78.2%).
- Timestamps: show as relative time (e.g. "2 min ago"); add ISO in parentheses only if helpful.
- Null or missing values: show as "—" (em dash), never "null".
- Keep the one-line summary at the top of each command as specified below.

---

- **"show aic status"** — Run Bash with \`npx @jatbas/aic status\` from the project directory, then relay stdout. Start the reply with one short line: **Status = project-level AIC status.** Then display a formatted table with labels: Compilations (total), Compilations (today), Tokens: raw → compiled, Tokens excluded, Budget limit, Budget utilization (%), Cache hit rate (%), Avg token reduction (%), Guard findings, Top task classes, Last compilation, Installation, Notes, Project (Enabled/Disabled), Update available.

- **"show aic chat summary"** — Run Bash with \`npx @jatbas/aic chat-summary --project <absolute workspace root>\`, then relay stdout. Start the reply with one short line: **Chat = this conversation's AIC compilations.** Then display a formatted table with labels: Project path, Compilations, Tokens (raw), Tokens (compiled), Tokens excluded, Cache hit rate (%), Avg token reduction (%), Last compilation, Top task classes.

- **"show aic last"** — Run Bash with \`npx @jatbas/aic last\` from the project directory, then relay stdout. Start the reply with one short line: **Last = most recent compilation.** Then display with labels: Intent, Files (N selected / M total), Tokens compiled, Token reduction (%), Compiled (relative time), Editor, Guard (Passed or N findings), Compiled prompt (Available N chars — ask to see it).

- **"show aic projects"** — Run Bash with \`npx @jatbas/aic projects\`, then relay stdout. Start the reply with one short line: **Projects = known AIC projects.** Display a formatted table with columns: Project ID, Path, Last seen, Compilation count.

## Tests

- Co-located \`__tests__/\` directories next to source
- Pattern: \`*.test.ts\`
- Bug fixes must include a regression test
- No \`any\` in tests

## Cross-Editor Sync

This file (\`.claude/CLAUDE.md\`) and \`.cursor/rules/AIC-architect.mdc\` are the two canonical rule files for the project. They must stay in sync:

- Architectural invariants, security rules, dependency rules, commit rules, ESLint rules, and test rules are **identical** across both files.
- Only editor-specific mechanics differ: Claude Code uses hooks for \`aic_compile\`; Cursor requires manual \`aic_compile\` calls. Prompt commands use the same shell diagnostics (\`npx @jatbas/aic …\`) but instructions differ slightly per editor.
- When changing any shared rule, update all three files in the same commit: (1) this file, (2) \`.cursor/rules/AIC-architect.mdc\`, and (3) the \`CLAUDE_MD_TEMPLATE\` in \`integrations/claude/install.cjs\`. If you only see one file in context, flag that the other two need the same change.
`;

function isAicCommand(command) {
  const m = String(command || "").match(/aic-[a-z0-9-]+\.cjs/);
  return m ? AIC_SCRIPT_NAMES.includes(m[0]) : false;
}

function filterStaleAic(existingArr) {
  const seen = new Set();
  return (existingArr || []).filter((entry) => {
    if (!isAicCommand(entry.command)) return true;
    const m = String(entry.command || "").match(/aic-[a-z0-9-]+\.cjs/);
    if (!m || !AIC_SCRIPT_NAMES.includes(m[0])) return false;
    // deduplicate: keep only the first occurrence of each AIC script
    if (seen.has(m[0])) return false;
    seen.add(m[0]);
    return true;
  });
}

function mergeHookArrays(existingArr, rewrittenArr) {
  const filtered = filterStaleAic(existingArr);
  const aicFromRewritten = (rewrittenArr || []).filter((entry) =>
    isAicCommand(entry.command),
  );
  const existingScripts = new Set(
    filtered
      .filter((e) => isAicCommand(e.command))
      .map((e) => (String(e.command || "").match(/aic-[a-z0-9-]+\.cjs/) || [])[0]),
  );
  const toAppend = aicFromRewritten.filter((entry) => {
    const name = (String(entry.command || "").match(/aic-[a-z0-9-]+\.cjs/) || [])[0];
    return name && !existingScripts.has(name);
  });
  return toAppend.length > 0 ? [...filtered, ...toAppend] : filtered;
}

function findAicMcpKey(servers) {
  if (servers === undefined || typeof servers !== "object" || servers === null) {
    return undefined;
  }
  return Object.keys(servers).find((k) => k.toLowerCase() === "aic");
}

function mergeMcpServers(existing, template) {
  const templateServers = template.mcpServers;
  if (!templateServers || typeof templateServers !== "object") return existing;
  const result = { ...existing };
  const existingServers = existing.mcpServers;
  if (existingServers && typeof existingServers === "object") {
    // do not overwrite a user-customised aic entry
    if (findAicMcpKey(existingServers) !== undefined) return result;
    result.mcpServers = { ...existingServers, ...templateServers };
  } else {
    result.mcpServers = { ...templateServers };
  }
  return result;
}

function mergeNestedHooksPayload(existing, template) {
  const result = { ...existing, hooks: { ...(existing.hooks || {}) } };
  const templateHooks = template.hooks || {};
  for (const eventKey of Object.keys(templateHooks)) {
    const existingWrappers = result.hooks[eventKey] ?? [];
    const templateWrappers = templateHooks[eventKey] ?? [];
    const existingArr = existingWrappers.flatMap((w) => w.hooks ?? []);
    const templateArr = templateWrappers.flatMap((w) => w.hooks ?? []);
    const mergedArr = mergeHookArrays(existingArr, templateArr);
    result.hooks[eventKey] = [{ hooks: mergedArr }];
  }
  return result;
}

try {
  const home = os.homedir();
  const globalClaudeDir = path.join(home, ".claude");
  const globalHooksDir = path.join(globalClaudeDir, "hooks");
  const hooksSourceDir = path.join(__dirname, "hooks");

  fs.mkdirSync(globalHooksDir, { recursive: true });

  const sharedDir = path.join(__dirname, "..", "shared");
  const sharedEntries = fs.readdirSync(sharedDir);
  const deployedSharedNames = new Set();
  for (const name of sharedEntries) {
    if (name.endsWith(".cjs")) {
      const src = path.join(sharedDir, name);
      if (fs.statSync(src).isFile()) {
        deployedSharedNames.add(name);
        fs.copyFileSync(src, path.join(globalHooksDir, name));
      }
    }
  }

  for (const name of AIC_SCRIPT_NAMES) {
    const srcPath = path.join(hooksSourceDir, name);
    const destPath = path.join(globalHooksDir, name);
    const sourceContent = fs.readFileSync(srcPath, "utf8");
    const installedContent = sourceContent.replace(
      /require\("\.\.\/\.\.\/shared\//g,
      'require("./',
    );
    let shouldWrite = true;
    try {
      const existing = fs.readFileSync(destPath, "utf8");
      if (existing === installedContent) shouldWrite = false;
    } catch {
      // dest missing
    }
    if (shouldWrite) {
      fs.writeFileSync(destPath, installedContent, "utf8");
    }
  }

  const hookNames = fs.readdirSync(globalHooksDir);
  for (const name of hookNames) {
    if (
      /^aic-[a-z0-9-]+\.cjs$/.test(name) &&
      !AIC_SCRIPT_NAMES.includes(name) &&
      !deployedSharedNames.has(name)
    ) {
      fs.unlinkSync(path.join(globalHooksDir, name));
    }
  }

  const templatePath = path.join(__dirname, "settings.json.template");
  const templateRaw = fs.readFileSync(templatePath, "utf8");
  const templateParsed = JSON.parse(templateRaw);

  const globalSettingsPath = path.join(globalClaudeDir, "settings.json");
  let merged;
  let existingRaw;
  const settingsExisted = fs.existsSync(globalSettingsPath);
  if (settingsExisted) {
    existingRaw = fs.readFileSync(globalSettingsPath, "utf8");
    const existing = JSON.parse(existingRaw);
    merged = mergeNestedHooksPayload(existing, templateParsed);
    merged = mergeMcpServers(merged, templateParsed);
  } else {
    merged = templateParsed;
  }

  const mergedContent = JSON.stringify(merged, null, 2) + "\n";
  if (settingsExisted) {
    if (mergedContent !== existingRaw) {
      fs.writeFileSync(globalSettingsPath, mergedContent, "utf8");
    }
  } else {
    fs.writeFileSync(globalSettingsPath, mergedContent, "utf8");
  }

  let version = "0.0.0";
  try {
    const pkgPath = path.join(__dirname, "..", "..", "package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    if (typeof pkg.version === "string") version = pkg.version;
  } catch {
    // keep 0.0.0
  }

  const triggerContent = CLAUDE_MD_TEMPLATE.replace("{{VERSION}}", version);
  const projectRoot = resolveProjectRoot({ cwd: "" }, { env: process.env });
  const projectClaudeDir = path.join(projectRoot, ".claude");

  let projectRootResolved;
  let homeResolved;
  try {
    projectRootResolved = fs.realpathSync(path.resolve(projectRoot));
    homeResolved = fs.realpathSync(path.resolve(home));
  } catch {
    projectRootResolved = path.resolve(projectRoot);
    homeResolved = path.resolve(home);
  }
  if (projectRootResolved !== homeResolved) {
    try {
      const projectHooksDir = path.join(projectClaudeDir, "hooks");
      if (fs.existsSync(projectHooksDir)) {
        const names = fs.readdirSync(projectHooksDir);
        for (const name of names) {
          if (/^aic-[a-z0-9-]+\.cjs$/.test(name)) {
            fs.unlinkSync(path.join(projectHooksDir, name));
          }
        }
        if (fs.readdirSync(projectHooksDir).length === 0) {
          fs.rmdirSync(projectHooksDir);
        }
      }
      // only remove the hooks section — preserve permissions and other Claude Code keys
      const settingsLocalPath = path.join(projectClaudeDir, "settings.local.json");
      if (fs.existsSync(settingsLocalPath)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(settingsLocalPath, "utf8"));
          delete parsed.hooks;
          const remaining = Object.keys(parsed);
          if (remaining.length === 0) {
            fs.unlinkSync(settingsLocalPath);
          } else {
            fs.writeFileSync(
              settingsLocalPath,
              JSON.stringify(parsed, null, 2) + "\n",
              "utf8",
            );
          }
        } catch {
          // if unparseable, delete it — it was likely AIC-only anyway
          fs.unlinkSync(settingsLocalPath);
        }
      }
    } catch {
      // optional cleanup: ignore errors
    }
  }

  const claudeMdPath = path.join(projectClaudeDir, "CLAUDE.md");
  let skipTriggerWrite = false;
  try {
    const existing = fs.readFileSync(claudeMdPath, "utf8");
    const match = existing.match(/AIC rule version:\s*(\S+)/);
    if (match !== null && match[1] === version) skipTriggerWrite = true;
  } catch {
    // file missing
  }
  if (!skipTriggerWrite) {
    try {
      fs.mkdirSync(projectClaudeDir, { recursive: true });
      fs.writeFileSync(claudeMdPath, triggerContent, "utf8");
    } catch {
      // optional: ignore if project dir not writable
    }
  }
} catch (err) {
  process.stderr.write(String(err && err.message ? err.message : err) + "\n");
  process.exit(0);
}
