// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("node:path");
const fs = require("node:fs");

const AIC_SCRIPT_NAMES = [
  "aic-session-start.cjs",
  "aic-prompt-compile.cjs",
  "aic-subagent-inject.cjs",
  "aic-pre-compact.cjs",
  "aic-after-file-edit-tracker.cjs",
  "aic-stop-quality-check.cjs",
  "aic-block-no-verify.cjs",
  "aic-session-end.cjs",
];

const CLAUDE_MD_TEMPLATE = `# AIC — Claude Code Rules

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
- **IDs:** All entity PKs use UUIDv7 (\`TEXT(36)\` in SQLite). Never \`INTEGER AUTOINCREMENT\`. Exception: \`config_history\` uses SHA-256 content hash.
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

function replaceAllCommands(str, from, to) {
  return str.split(from).join(to);
}

function rewriteCommand(command, hooksDirAbs) {
  return replaceAllCommands(String(command), "$HOME/.claude/hooks", hooksDirAbs);
}

function rewriteHooksPayload(payload, hooksDirAbs) {
  const hooks = payload.hooks || {};
  const result = { hooks: {} };
  for (const eventKey of Object.keys(hooks)) {
    const wrappers = hooks[eventKey] || [];
    result.hooks[eventKey] = wrappers.map((wrapper) => {
      const inner = wrapper.hooks || [];
      return {
        ...wrapper,
        hooks: inner.map((hook) =>
          hook.command !== undefined
            ? { ...hook, command: rewriteCommand(hook.command, hooksDirAbs) }
            : hook,
        ),
      };
    });
  }
  return result;
}

function isAicCommand(command) {
  const m = String(command || "").match(/aic-[a-z0-9-]+\.cjs/);
  return m ? AIC_SCRIPT_NAMES.includes(m[0]) : false;
}

function filterStaleAic(existingArr) {
  return (existingArr || []).filter((entry) => {
    if (!isAicCommand(entry.command)) return true;
    const m = String(entry.command || "").match(/aic-[a-z0-9-]+\.cjs/);
    return m && AIC_SCRIPT_NAMES.includes(m[0]);
  });
}

function mergeHookArrays(existingArr, rewrittenArr) {
  const filtered = filterStaleAic(existingArr);
  const aicFromRewritten = (rewrittenArr || []).filter((entry) =>
    isAicCommand(entry.command),
  );
  const existingScripts = new Set(
    filtered
      .filter(isAicCommand)
      .map((e) => (String(e.command || "").match(/aic-[a-z0-9-]+\.cjs/) || [])[0]),
  );
  const toAppend = aicFromRewritten.filter((entry) => {
    const name = (String(entry.command || "").match(/aic-[a-z0-9-]+\.cjs/) || [])[0];
    return name && !existingScripts.has(name);
  });
  return toAppend.length > 0 ? [...filtered, ...toAppend] : filtered;
}

try {
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const claudeDir = path.join(projectRoot, ".claude");
  const hooksDirAbs = path.join(projectRoot, "integrations", "claude", "hooks");
  const templatePath = path.join(__dirname, "settings.json.template");
  const settingsLocalPath = path.join(claudeDir, "settings.local.json");
  const claudeMdPath = path.join(claudeDir, "CLAUDE.md");

  fs.mkdirSync(claudeDir, { recursive: true });

  const templateRaw = fs.readFileSync(templatePath, "utf8");
  const templateParsed = JSON.parse(templateRaw);
  const rewritten = rewriteHooksPayload(templateParsed, hooksDirAbs);

  let merged;
  if (fs.existsSync(settingsLocalPath)) {
    const existingRaw = fs.readFileSync(settingsLocalPath, "utf8");
    const existing = JSON.parse(existingRaw);
    merged = { ...existing, hooks: { ...(existing.hooks || {}) } };
    for (const eventKey of Object.keys(rewritten.hooks)) {
      const existingArr = existing.hooks?.[eventKey] ?? [];
      const rewrittenArr = rewritten.hooks[eventKey] ?? [];
      merged.hooks[eventKey] = mergeHookArrays(existingArr, rewrittenArr);
    }
  } else {
    merged = rewritten;
  }

  fs.writeFileSync(settingsLocalPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
  fs.writeFileSync(claudeMdPath, CLAUDE_MD_TEMPLATE, "utf8");
} catch (err) {
  process.stderr.write(String(err && err.message ? err.message : err) + "\n");
  process.exit(0);
}
