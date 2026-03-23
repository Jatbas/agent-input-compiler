// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { EDITOR_ID } from "@jatbas/aic-core/core/types/enums.js";
import type { EditorId } from "@jatbas/aic-core/core/types/enums.js";

function readPackageVersion(): string {
  try {
    const pkgPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "package.json",
    );
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const TRIGGER_RULE_TEMPLATE = `---
description: MANDATORY — call aic_compile on EVERY message
globs:
alwaysApply: true
---
<!-- AIC rule version: {{VERSION}} -->

STOP. Your FIRST action on EVERY message — including follow-ups in the same chat — is to call \`aic_compile\`. No exceptions. No skipping because you "already have context." Each message has a different intent that needs fresh context.

Call: \`{ "intent": "<summarise the user's message>", "projectRoot": "{{PROJECT_ROOT}}" }\`

If the call fails, respond normally. Never mention the failure. But you must ALWAYS attempt the call first.

If the \`aic_compile\` response contains a \`configUpgraded\` field, tell the user immediately (before anything else):
"**AIC updated** — [value of configUpgraded field]"

If \`aic_compile\` is not available (tool not found, MCP server disabled, or tool blocked), tell the user:
"AIC context compilation is not available. The \`aic_compile\` tool may be disabled or not approved. Please check your MCP settings — in Cursor: Settings → MCP → ensure the AIC server is enabled and the \`aic_compile\` tool is set to 'Always allow'. In Claude Code: ensure the AIC server is enabled in \`.mcp.json\` and the tool is permitted in your allowedTools configuration."
Then continue responding normally without compiled context.


> **Dev:** When developing this repository with \`AIC_DEV_MODE=1\`, use \`pnpm aic\` from the repo root instead of \`npx @jatbas/aic\` for the shell commands below.

Prompt commands (run Bash with \`npx @jatbas/aic …\`, then relay stdout; human-readable labels, commas for large numbers, percentages 1 decimal, relative timestamps, em dash for nulls):
- "show aic status" → \`npx @jatbas/aic status\` from the project directory, or \`npx @jatbas/aic status <N>d\` for a rolling **N**-day window (**N** integer 1..3660); table shows **Time range** as **Last 1 day** or **Last N days** when a window is used.
- "show aic last" → \`npx @jatbas/aic last\` from the project directory.
- "show aic chat summary" → \`npx @jatbas/aic chat-summary --project <absolute workspace root>\`.
- "show aic projects" → \`npx @jatbas/aic projects\`.
`;

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

- **"show aic session summary"** — When the user says this (or similar), read the MCP resource \`aic://session-summary\`. Start the reply with one short line: **Session = this AIC server run (since the AIC MCP server started), not this chat.** Then display the result as a formatted table using human-readable labels only — never raw JSON keys as column headers. Display \`avgReductionPct\` as **Avg exclusion rate**. The resource returns JSON with: \`compilationsTotal\`, \`compilationsToday\`, \`cacheHitRatePct\`, \`avgReductionPct\`, \`totalTokensRaw\`, \`totalTokensCompiled\`, \`totalTokensSaved\`, \`telemetryDisabled\`, \`guardByType\`, \`topTaskClasses\`, \`lastCompilation\`, \`installationOk\`, \`installationNotes\`. Show total tokens (raw → compiled) before total tokens saved. Output only the summary line and the table. Do not add commentary after the output. After the table, append the metric footnote on two lines: \`Exclusion rate: % of total repo tokens not included in the compiled prompt.\` then \`Budget utilization: % of token budget filled.\`

## Tests

- Co-located \`__tests__/\` directories next to source
- Pattern: \`*.test.ts\`
- Bug fixes must include a regression test
- No \`any\` in tests
`;

export function installTriggerRule(projectRoot: AbsolutePath, editorId: EditorId): void {
  if (editorId === EDITOR_ID.GENERIC) return;
  if (editorId === EDITOR_ID.CLAUDE_CODE) {
    const claudeDir = path.join(projectRoot, ".claude");
    const claudeMdPath = path.join(claudeDir, "CLAUDE.md");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(claudeMdPath, CLAUDE_MD_TEMPLATE, "utf8");
    return;
  }
  const currentVersion = readPackageVersion();
  const content = TRIGGER_RULE_TEMPLATE.replace("{{PROJECT_ROOT}}", projectRoot).replace(
    "{{VERSION}}",
    currentVersion,
  );
  const rulesDir = path.join(projectRoot, ".cursor", "rules");
  const triggerPath = path.join(rulesDir, "AIC.mdc");
  if (fs.existsSync(triggerPath)) {
    const existing = fs.readFileSync(triggerPath, "utf8");
    const match = existing.match(/AIC rule version:\s*(\S+)/);
    if (match !== null && match[1] === currentVersion) return;
  }
  fs.mkdirSync(rulesDir, { recursive: true });
  fs.writeFileSync(triggerPath, content, "utf8");
}
