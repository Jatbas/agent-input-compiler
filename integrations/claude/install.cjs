// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const { resolveProjectRoot } = require("../shared/resolve-project-root.cjs");

const AIC_SCRIPT_NAMES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "aic-hook-scripts.json"), "utf8"),
).hookScriptNames;

const CLAUDE_MD_TEMPLATE = `# AIC — Claude Code Rules

> This file is the Claude Code equivalent of \`.cursor/rules/AIC-architect.mdc\`.
> Claude Code reads it on every session. Keep it condensed and action-oriented.
> **Cross-editor sync:** See \`## Cross-Editor Sync\` below for the canonical targets (\`AIC-architect.mdc\`, this file, both \`CLAUDE_MD_TEMPLATE\` sources, and \`aic-claude-md-managed-section.mdc\`).

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
- **DIP:** No \`new\` for infrastructure/service classes outside the MCP composition boundary: \`mcp/src/server.ts\` is the primary wiring site; delegated \`new\` in other \`mcp/src\` modules follows \`aic-mcp.mdc\` (Composition Root Discipline). All dependencies via constructor injection. Storage classes receive the database instance — never construct it. Adapters inject \`Clock\` for time, never call \`Date.now()\` directly.
- **OCP:** New capabilities via new classes implementing existing interfaces — never modify existing pipeline classes. The core pipeline is frozen once correct; all evolution happens at the edges.
- **Dispatch pattern:** No if/else-if chains with 3+ branches — enforced by ESLint. Use \`Record<Enum, Handler>\` for enum dispatch, handler arrays for predicate dispatch. Extend by adding entries (OCP), not modifying branches.
- **Errors:** Never throw bare \`Error\`. Use \`AicError\` subclasses with machine-readable \`code\` property. Pipeline steps never catch-and-ignore — errors propagate to composition root. MCP server never crashes on a single bad request.
- **Determinism:** No \`Date.now()\`, \`new Date()\`, or \`Math.random()\` anywhere — enforced by ESLint globally. Only \`system-clock.ts\` is exempt. All other code injects time via \`Clock\` interface. No \`date('now')\` or \`datetime('now')\` in SQL — pass the current timestamp as a bound parameter from the \`Clock\` interface.
- **Immutability:** No \`.push()\`, \`.splice()\`, \`.sort()\` (mutating), \`.reverse()\` (mutating). Use spread/reduce. Pipeline steps never mutate their inputs — return new objects. No \`let\` in production code — use \`const\` exclusively. Only exception: boolean control flags in imperative closures (e.g. \`let found = false\` in a \`ts.forEachChild\` visitor). Accumulators must use reduce or a helper that returns the collected result — never \`let arr = []; ... arr = [...arr, item]\`.
- **Types:** No \`any\`. Explicit return types on all functions. Interfaces in \`*.interface.ts\` files (one interface per file). Max 5 methods per interface (ISP). Related type aliases live in \`core/types/\`, not in interface files.
- **Named imports only (enforced by ESLint):** No \`import * as X\` for internal modules (relative or \`#alias\` paths). Use named imports: \`import { A, B } from "./foo.js"\`. Namespace imports allowed only for Node.js built-ins (\`import * as path from "node:path"\`) and established library APIs (\`import * as ts from "typescript"\`).
- **Comments:** \`//\` style only — \`/* */\` and \`/** */\` are banned by ESLint; one line max enforced by ESLint. No JSDoc. **Delete-test:** mentally remove the comment and re-read the code — if the meaning is unchanged, the comment must be deleted. Only keep comments that explain a non-obvious _reason_: a cross-repo sync constraint, a non-obvious algorithmic choice, or a gotcha the code alone cannot express. Never describe what the code does (\`// Get the user\`, \`// Return result\`, \`// Loop over items\`).
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
- Evidence before claims: Never claim work is complete, tests pass, or a bug is fixed without fresh verification evidence from the current message. Run the command, read the output, THEN make the claim. Words like "should", "probably", or "seems to" indicate missing evidence — run the verification instead.
- Systematic debugging: When encountering any bug, test failure, or unexpected behavior, investigate root cause before proposing fixes. Reproduce consistently, form single hypotheses, create a failing test before fixing. If 3+ fix attempts fail, stop and question the architecture. Use the \`aic-systematic-debugging\` skill for the full process.
- File size awareness: You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones. This reinforces SOLID and is a practical constraint of LLM context.

## Source Structure

\`\`\`
shared/src/core/         ← interfaces and types (no implementations)
shared/src/pipeline/     ← pipeline steps (pure transformations)
shared/src/adapters/     ← external library wrappers
shared/src/storage/      ← SQLite access (only place for SQL)
mcp/src/                 ← MCP server (primary composition root; see \`aic-mcp.mdc\`)
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

> **Dev:** When \`"devMode": true\` is set in \`aic.config.json\` at the project root, substitute \`pnpm aic\` for \`npx @jatbas/aic\` in every command below (run from the repo root).

Use these rules for all five AIC prompt commands. Present data like a polished dashboard, not raw JSON.

**General formatting (all commands):**

- Use human-readable labels only — never show raw JSON keys as column headers or labels.
- Format large numbers with commas (e.g. 8,484,717).
- Percentages: exactly 1 decimal place and a % symbol (e.g. 78.2%).
- Timestamps: show as relative time (e.g. "2 min ago"); add ISO in parentheses only if helpful.
- Null or missing values: show as "—" (em dash), never "null".
- Keep the one-line summary at the top of each command as specified below.
- Output only the summary line, the table, and (for status, last, chat-summary) the metric footnote below. **Do not add commentary, notes, interpretation, or explanations after the output.**
- **Metric footnote** (append after the table for status, last, and chat-summary — one line per metric): \`Exclusion rate: % of total repo tokens not included in the compiled prompt.\` then \`Budget utilization: % of token budget filled.\`

---

- **"show aic status"** — Run Bash with \`npx @jatbas/aic status\` (or \`pnpm aic status\` when \`"devMode": true\` is set in \`aic.config.json\`) from the project directory (or the \`<N>d\` variant when the user asks for a rolling **N**-day window, with **N** an integer from 1 through 3660), then relay stdout. Start the reply with one short line: **Status = project-level AIC status.** When a window is used, the table includes a **Time range** row: **Last 1 day** if **N** is 1, otherwise **Last N days**. Then display a formatted table with labels: Compilations (total), Compilations (today), Tokens: raw → compiled, Tokens excluded, Budget limit, Budget utilization (%), Cache hit rate (%), Avg exclusion rate (%), Guard findings, Top task classes, Last compilation, Installation, Update available. When installation has issues (\`installationOk\` false), include a **Notes** row from \`installationNotes\`; omit **Notes** when installation is OK. Omit **Project** (still present in JSON as \`projectEnabled\`).

- **"show aic chat summary"** — Run Bash with \`npx @jatbas/aic chat-summary --project <absolute workspace root>\` (or \`pnpm aic chat-summary --project <absolute workspace root>\` when \`"devMode": true\` is set in \`aic.config.json\`), then relay stdout. Start the reply with one short line: **Chat = this conversation's AIC compilations.** Then display a formatted table with labels: Project path, Compilations, Tokens (raw), Tokens (compiled), Tokens excluded, Cache hit rate (%), Avg exclusion rate (%), Budget utilization (%), Last compilation, Top task classes.

- **"show aic last"** — Run Bash with \`npx @jatbas/aic last\` (or \`pnpm aic last\` when \`"devMode": true\` is set in \`aic.config.json\`) from the project directory, then relay stdout. Start the reply with one short line: **Last = most recent compilation.** Then display with labels: Intent, Files (N selected / M total), Tokens compiled, Budget utilization (%), Exclusion rate (%), Compiled (relative time), Editor, Guard (Passed or N findings), Compiled prompt (Available N chars — see ~/.aic/last-compiled-prompt.txt).

- **"show aic projects"** — Run Bash with \`npx @jatbas/aic projects\` (or \`pnpm aic projects\` when \`"devMode": true\` is set in \`aic.config.json\`), then relay stdout. Start the reply with one short line: **Projects = known AIC projects.** Display a formatted table with columns: Project ID, Path, Last seen, Compilation count.

- **"run aic model test"** — Call the \`aic_model_test\` MCP tool with \`{ "projectRoot": "<absolute workspace root>" }\`. The tool returns a \`probeId\`, three challenges, and instructions. Solve challenge 1 (arithmetic) and challenge 2 (string-reverse). Then call \`aic_compile\` with intent exactly equal to \`"model-test-<answer1>-<answer2>"\` (replace with your computed answers). Finally call \`aic_model_test\` again with \`{ "projectRoot": "<absolute workspace root>", "probeId": "<probeId from step 1>", "answers": [<arithmetic answer>, "<reversed string>"] }\`. Display the result as a table with columns: Test, Result (Pass/Fail), Notes. Start the reply with one short line: **Model test = agent capability probe.**

## Tests

- Co-located \`__tests__/\` directories next to source
- Pattern: \`*.test.ts\`
- Bug fixes must include a regression test
- No \`any\` in tests
- **Smoke tests:** When editing \`integrations/**\`, \`mcp/scripts/bundle-*\`, or \`mcp/package.json\` \`files\` field, verify \`integrations/__tests__/pack-install-smoke.test.cjs\` still passes and update its assertions if you changed the published artifact layout, install behavior, or uninstall behavior. Run: \`node integrations/__tests__/pack-install-smoke.test.cjs\`.

## Cross-Editor Sync

Keep shared rules aligned across these four code and documentation targets:

- \`.cursor/rules/AIC-architect.mdc\`
- \`.claude/CLAUDE.md\` (this file)
- \`integrations/claude/install.cjs\` (\`CLAUDE_MD_TEMPLATE\`)
- \`mcp/src/install-trigger-rule.ts\` (\`CLAUDE_MD_TEMPLATE\`)

Managed-section boundaries and the no-banner inner body follow \`.cursor/rules/aic-claude-md-managed-section.mdc\`; the two \`CLAUDE_MD_TEMPLATE\` strings must remain byte-identical.

Architectural invariants, security rules, dependency rules, commit rules, ESLint rules, and test rules are **identical** across \`AIC-architect.mdc\` and this file — only editor-specific mechanics differ (hooks vs manual \`aic_compile\`, prompt command wording).
`;

const CLAUDE_MD_OPENING_LINE =
  "<!-- BEGIN AIC MANAGED SECTION — do not edit between these markers -->";
const CLAUDE_MD_CLOSING_LINE = "<!-- END AIC MANAGED SECTION -->";
const CLAUDE_MD_OPENING_LINE_RE = new RegExp(
  "^\\s*<!--\\s*BEGIN AIC MANAGED SECTION — do not edit between these markers\\s*-->\\s*$",
);
const CLAUDE_MD_CLOSING_LINE_RE = new RegExp(
  "^\\s*<!--\\s*END AIC MANAGED SECTION\\s*-->\\s*$",
);

function normalizeClaudeMdNewlines(text) {
  return String(text).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function isAicManagedFile(filePath) {
  try {
    const head = fs.readFileSync(filePath, "utf8").slice(0, 512);
    return head.includes("@aic-managed") || head.includes("AIC Contributors");
  } catch {
    return false;
  }
}

function buildClaudeMdManagedFileContent() {
  let inner = CLAUDE_MD_TEMPLATE;
  if (!inner.endsWith("\n")) inner += "\n";
  return `${CLAUDE_MD_OPENING_LINE}\n\n${inner}\n${CLAUDE_MD_CLOSING_LINE}\n`;
}

function findValidManagedPairLines(lines) {
  let openIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (CLAUDE_MD_OPENING_LINE_RE.test(lines[i])) {
      openIdx = i;
      break;
    }
  }
  if (openIdx < 0) return { valid: false };
  let closeIdx = -1;
  for (let j = openIdx + 1; j < lines.length; j += 1) {
    if (CLAUDE_MD_CLOSING_LINE_RE.test(lines[j])) {
      closeIdx = j;
      break;
    }
  }
  if (closeIdx < 0) return { valid: false };
  return { valid: true, openIdx, closeIdx };
}

function charOffsetForLineIndex(lines, lineIndex) {
  let offset = 0;
  for (let k = 0; k < lineIndex; k += 1) offset += lines[k].length + 1;
  return offset;
}

function planProjectClaudeMdWrite(existingNormalized) {
  const managed = buildClaudeMdManagedFileContent();
  if (existingNormalized === null) {
    return { skipWrite: false, nextContent: managed };
  }
  if (/^[\t \n]*$/.test(existingNormalized)) {
    return { skipWrite: false, nextContent: managed };
  }
  const lines = existingNormalized.split("\n");
  const pair = findValidManagedPairLines(lines);
  if (!pair.valid) {
    const base = existingNormalized.replace(/\n+$/, "");
    return { skipWrite: false, nextContent: `${base}\n\n${managed}` };
  }
  const openLineStart = charOffsetForLineIndex(lines, pair.openIdx);
  const afterOpenLine = openLineStart + lines[pair.openIdx].length + 1;
  const closeLineStart = charOffsetForLineIndex(lines, pair.closeIdx);
  let afterCloseLine = closeLineStart + lines[pair.closeIdx].length;
  if (
    afterCloseLine < existingNormalized.length &&
    existingNormalized[afterCloseLine] === "\n"
  ) {
    afterCloseLine += 1;
  }
  const interior = existingNormalized.slice(afterOpenLine, closeLineStart);
  const normInterior = normalizeClaudeMdNewlines(interior).trim();
  const normTemplate = normalizeClaudeMdNewlines(CLAUDE_MD_TEMPLATE).trim();
  if (normInterior === normTemplate) {
    return { skipWrite: true, nextContent: null };
  }
  const prefix = existingNormalized.slice(0, openLineStart);
  const suffix = existingNormalized.slice(afterCloseLine);
  return { skipWrite: false, nextContent: `${prefix}${managed}${suffix}` };
}

const AIC_HOOK_CMD_RE = /aic-[a-z0-9-]+\.cjs/i;

function isAicHookEntry(entry) {
  return AIC_HOOK_CMD_RE.test(String(entry.command || ""));
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
    // Preserve user wrappers; drop wrappers that only contained AIC hooks
    const userWrappers = existingWrappers.reduce((acc, w) => {
      if (!Array.isArray(w.hooks)) {
        acc.push(w);
        return acc;
      }
      const nonAic = w.hooks.filter((entry) => !isAicHookEntry(entry));
      if (nonAic.length > 0) {
        acc.push({ ...w, hooks: nonAic });
      }
      return acc;
    }, []);
    // Append fresh template wrappers, preserving their matchers and structure
    result.hooks[eventKey] = [...userWrappers, ...templateWrappers];
  }
  return result;
}

try {
  const home = os.homedir();
  const globalClaudeDir = path.join(home, ".claude");
  const globalHooksDir = path.join(globalClaudeDir, "hooks");
  const hooksSourceDir = path.join(__dirname, "hooks");

  fs.mkdirSync(globalHooksDir, { recursive: true });

  function sharedDeployedName(name) {
    return name.startsWith("aic-") ? name : "aic-" + name;
  }

  const sharedDir = path.join(__dirname, "..", "shared");
  const sharedEntries = fs.readdirSync(sharedDir);
  const deployedSharedNames = new Set();
  const sharedSourceNamesSet = new Set();
  for (const name of sharedEntries) {
    if (name.endsWith(".cjs")) {
      const src = path.join(sharedDir, name);
      if (fs.statSync(src).isFile()) {
        const deployedName = sharedDeployedName(name);
        sharedSourceNamesSet.add(name);
        deployedSharedNames.add(deployedName);
        fs.copyFileSync(src, path.join(globalHooksDir, deployedName));
      }
    }
  }

  for (const deployedName of deployedSharedNames) {
    const filePath = path.join(globalHooksDir, deployedName);
    const content = fs.readFileSync(filePath, "utf8");
    const rewritten = content.replace(
      /require\("\.\/([^"]+\.cjs)"\)/g,
      (match, basename) =>
        sharedSourceNamesSet.has(basename)
          ? `require("./${sharedDeployedName(basename)}")`
          : match,
    );
    if (rewritten !== content) {
      fs.writeFileSync(filePath, rewritten, "utf8");
    }
  }

  for (const name of AIC_SCRIPT_NAMES) {
    const srcPath = path.join(hooksSourceDir, name);
    const destPath = path.join(globalHooksDir, name);
    const sourceContent = fs.readFileSync(srcPath, "utf8");
    const installedContent = sourceContent.replace(
      /require\("\.\.\/\.\.\/shared\/([^"]+)"\)/g,
      (_, basename) => `require("./${sharedDeployedName(basename)}")`,
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
      const filePath = path.join(globalHooksDir, name);
      if (isAicManagedFile(filePath)) {
        fs.unlinkSync(filePath);
      }
    } else if (sharedSourceNamesSet.has(name) && !deployedSharedNames.has(name)) {
      // migrate: remove old-style shared file deployed without aic- prefix
      const filePath = path.join(globalHooksDir, name);
      if (isAicManagedFile(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {}
      }
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
  let existingClaudeMd = null;
  try {
    existingClaudeMd = fs.readFileSync(claudeMdPath, "utf8");
  } catch {
    // file missing or unreadable
  }
  const existingNorm =
    existingClaudeMd === null ? null : normalizeClaudeMdNewlines(existingClaudeMd);
  const claudeMdPlan = planProjectClaudeMdWrite(existingNorm);
  if (!claudeMdPlan.skipWrite) {
    try {
      if (claudeMdPlan.nextContent !== existingNorm) {
        fs.mkdirSync(projectClaudeDir, { recursive: true });
        fs.writeFileSync(claudeMdPath, claudeMdPlan.nextContent, "utf8");
      }
    } catch {
      // optional: ignore if project dir not writable
    }
  }
} catch (err) {
  process.stderr.write(String(err && err.message ? err.message : err) + "\n");
  process.exit(0);
}
