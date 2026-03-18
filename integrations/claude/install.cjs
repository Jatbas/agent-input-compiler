// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const AIC_SCRIPT_NAMES = [
  "aic-compile-helper.cjs",
  "aic-session-start.cjs",
  "aic-prompt-compile.cjs",
  "aic-subagent-inject.cjs",
  "aic-pre-compact.cjs",
  "aic-after-file-edit-tracker.cjs",
  "aic-stop-quality-check.cjs",
  "aic-block-no-verify.cjs",
  "aic-inject-conversation-id.cjs",
  "aic-session-end.cjs",
];

const CLAUDE_MD_TEMPLATE = `<!-- AIC rule version: {{VERSION}} -->
# AIC — Claude Code Rules

> This file is the Claude Code equivalent of \`.cursor/rules/AIC-architect.mdc\`.
> Claude Code reads it on every session. Keep it condensed and action-oriented.

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
- **SOLID:** One public method per class; one class per file; one interface per \`*.interface.ts\` file. Constructor receives only interfaces — never concrete classes.
- **Hexagonal:** \`core/\` and \`pipeline/\` have zero imports from \`adapters/\`, \`storage/\`, \`mcp/\`, Node.js APIs, or external packages. All I/O through interfaces only. Core interfaces must NOT expose infrastructure concepts (SQL syntax, HTTP verbs, file-system paths) — use domain terminology.
- **Adapter wrapping:** Every external library has exactly ONE adapter or storage file that wraps it behind a core interface. No other file imports the library directly — enforced by ESLint \`no-restricted-imports\`. To swap a library, change one file.
- **DIP:** No \`new\` for infrastructure/service classes outside the composition root (\`mcp/src/server.ts\`). All dependencies via constructor injection. Storage classes receive the database instance — never construct it. Adapters inject \`Clock\` for time, never call \`Date.now()\` directly.
- **OCP:** New capabilities via new classes implementing existing interfaces — never modify existing pipeline classes.
- **Errors:** Never throw bare \`Error\`. Use \`AicError\` subclasses with machine-readable \`code\` property. Pipeline steps never catch-and-ignore. MCP server never crashes on a single bad request.
- **Determinism:** No \`Date.now()\`, \`new Date()\`, or \`Math.random()\` anywhere — enforced by ESLint globally. Only \`system-clock.ts\` is exempt. All other code injects time via \`Clock\` interface.
- **Immutability:** No \`.push()\`, \`.splice()\`, \`.sort()\` (mutating), \`.reverse()\` (mutating). Use spread/reduce. Pipeline steps never mutate inputs.
- **Types:** No \`any\`. Explicit return types on all functions. Interfaces in \`*.interface.ts\` files (one interface per file). Max 5 methods per interface (ISP). Related type aliases live in \`core/types/\`, not in interface files.
- **Comments:** \`//\` style only — \`/* */\` and \`/** */\` block comments are banned by ESLint. One short line max, explain _why_ not _what_. No JSDoc. No narrating comments.
- **Branded types (ADR-010):** Use types from \`shared/src/core/types/\` — never raw \`string\`/\`number\` for domain values. \`AbsolutePath\`, \`TokenCount\`, \`Milliseconds\`, \`Percentage\`, \`ISOTimestamp\`, \`TaskClass\`, \`EditorId\`, \`InclusionTier\`, etc. \`as const\` objects for enums, not TypeScript \`enum\`. Null convention: \`Type | null\` = checked absent, \`?: Type\` = optional.
- **Validation boundary (ADR-009):** Runtime validation at MCP handler and config loader only. Core/pipeline never imports the validation library. After validation, produce branded types via constructor functions (\`toTokenCount()\`, \`toAbsolutePath()\`, etc.).
- **IDs:** All entity PKs use UUIDv7 (\`TEXT(36)\` in SQLite). Never \`INTEGER AUTOINCREMENT\`. Exception: \`config_history\` uses composite PK (project_id, config_hash).
- **Timestamps:** Always \`YYYY-MM-DDTHH:mm:ss.sssZ\` (UTC, ms, \`Z\`). Use \`Clock\` interface and \`ISOTimestamp\` branded type. Never \`new Date()\` directly.
- **Database:** All SQL lives exclusively in \`shared/src/storage/\`. Every schema change requires a migration in \`shared/src/storage/migrations/\` (\`NNN-description.ts\`). Schema change + migration = same commit. Never edit a merged migration. Never run raw DDL outside the \`MigrationRunner\`.

## Security Invariants

- **Secrets:** Never hardcode API keys or tokens. Config references env var _names_, never values. All logging sanitizes secrets with \`***\`.
- **\`.aic/\` directory:** \`0700\` permissions, auto-gitignored, no symlink traversal.
- **Telemetry:** No file paths, content, prompts, intents, or PII in payloads. Typed schema enforcement only.
- **Context Guard:** Never-include patterns (\`.env\`, \`*.pem\`, etc.) are non-overridable. Guard cannot be skipped or disabled.
- **Prompt assembly:** Intent is opaque text in a template — never interpolated into system instructions. Context in delimited code blocks. Constraints after context.
- **MCP error sanitization:** No stack traces, internal paths, or env details in error responses.

## Dependencies

- All versions pinned exact (\`"9.39.3"\`, never \`"^9.0.0"\`). No caret or tilde ranges.
- Adding a runtime dependency requires justification: what it replaces, why no existing dep covers it, MIT/Apache-2.0 only.
- One dependency per PR. Commit format: \`chore(deps): update <package> to <version>\`.

## Documentation

- \`documentation/project-plan.md\` is the architecture spec.
- \`documentation/implementation-spec.md\` is the implementation spec.
- Read docs before proposing or changing code.

## File Naming

- All \`.ts\` files use kebab-case (\`intent-classifier.ts\`). Interfaces: \`*.interface.ts\`. Tests: \`*.test.ts\`. Migrations: \`NNN-description.ts\`.
- Documentation: kebab-case except conventional root files (\`README.md\`).

## Commits

Format: \`type(scope): description\` — max 72 chars, imperative, no period. Never \`--no-verify\`.

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

Run \`pnpm lint\` before declaring work complete. Never add \`eslint-disable\`, \`eslint-disable-next-line\`, \`@ts-ignore\`, or \`@ts-nocheck\` comments — fix the code instead.

## Prompt Commands

- **"show aic session summary"** — When the user says this (or similar), read the MCP resource \`aic://session-summary\`. Start the reply with one short line: **Session = this AIC server run (since the AIC MCP server started), not this chat.** Then display the result as a formatted table. The resource returns JSON with: \`compilationsTotal\`, \`compilationsToday\`, \`cacheHitRatePct\`, \`avgReductionPct\`, \`totalTokensRaw\`, \`totalTokensCompiled\`, \`totalTokensSaved\`, \`telemetryDisabled\`, \`guardByType\`, \`topTaskClasses\`, \`lastCompilation\`, \`installationOk\`, \`installationNotes\`. Show total tokens (raw → compiled) before total tokens saved.

## Tests

- Co-located \`__tests__/\` directories next to source
- Pattern: \`*.test.ts\`
- Bug fixes must include a regression test
- No \`any\` in tests
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

  for (const name of AIC_SCRIPT_NAMES) {
    const srcPath = path.join(hooksSourceDir, name);
    const destPath = path.join(globalHooksDir, name);
    const sourceContent = fs.readFileSync(srcPath, "utf8");
    let shouldWrite = true;
    try {
      const existing = fs.readFileSync(destPath, "utf8");
      if (existing === sourceContent) shouldWrite = false;
    } catch {
      // dest missing
    }
    if (shouldWrite) {
      fs.writeFileSync(destPath, sourceContent, "utf8");
    }
  }

  const hookNames = fs.readdirSync(globalHooksDir);
  for (const name of hookNames) {
    if (/^aic-[a-z0-9-]+\.cjs$/.test(name) && !AIC_SCRIPT_NAMES.includes(name)) {
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
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
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
