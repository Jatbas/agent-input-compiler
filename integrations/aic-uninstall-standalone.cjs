"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) =>
  function __require() {
    return (
      mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod),
      mod.exports
    );
  };

// integrations/clean-global-aic-dir.cjs
var require_clean_global_aic_dir = __commonJS({
  "integrations/clean-global-aic-dir.cjs"(exports2, module2) {
    var path = require("node:path");
    var fs = require("node:fs");
    var PRESERVE_DB_NAMES = /* @__PURE__ */ new Set([
      "aic.sqlite",
      "aic.sqlite-wal",
      "aic.sqlite-shm",
    ]);
    function resolveGlobalKeepAicDatabase(argv, env) {
      const envVal = String(env.AIC_UNINSTALL_KEEP_AIC_DATABASE || "").toLowerCase();
      if (envVal === "0" || envVal === "false") {
        return false;
      }
      if (envVal === "1" || envVal === "true") {
        return true;
      }
      if (argv.some((a) => /^--keep-aic-database=(0|false)$/i.test(a))) {
        return false;
      }
      if (
        argv.includes("--keep-aic-database") ||
        argv.some((a) => /^--keep-aic-database=(1|true)$/i.test(a))
      ) {
        return true;
      }
      return !argv.includes("--remove-database");
    }
    function tryCleanGlobalAicDir(homeDir, keepAicDatabase) {
      const aicDir = path.join(homeDir, ".aic");
      if (!fs.existsSync(aicDir)) {
        return { changed: false, message: null };
      }
      if (!keepAicDatabase) {
        try {
          fs.rmSync(aicDir, { recursive: true, force: true });
          return {
            changed: true,
            message: "Removed ~/.aic including the database.",
          };
        } catch {
          return { changed: false, message: null };
        }
      }
      let removedAny = false;
      try {
        const entries = fs.readdirSync(aicDir);
        for (const name of entries) {
          if (PRESERVE_DB_NAMES.has(name)) {
            continue;
          }
          const full = path.join(aicDir, name);
          try {
            fs.rmSync(full, { recursive: true, force: true });
            removedAny = true;
          } catch {}
        }
      } catch {
        return { changed: false, message: null };
      }
      if (!removedAny) {
        return { changed: false, message: null };
      }
      return {
        changed: true,
        message: "Cleaned ~/.aic (kept SQLite database files).",
      };
    }
    module2.exports = {
      resolveGlobalKeepAicDatabase,
      tryCleanGlobalAicDir,
    };
  },
});

// integrations/claude/aic-hook-scripts.json
var require_aic_hook_scripts = __commonJS({
  "integrations/claude/aic-hook-scripts.json"(exports2, module2) {
    module2.exports = {
      hookScriptNames: [
        "aic-compile-helper.cjs",
        "aic-session-start.cjs",
        "aic-prompt-compile.cjs",
        "aic-subagent-inject.cjs",
        "aic-subagent-stop.cjs",
        "aic-pre-compact.cjs",
        "aic-after-file-edit-tracker.cjs",
        "aic-stop-quality-check.cjs",
        "aic-pre-tool-gate.cjs",
        "aic-block-no-verify.cjs",
        "aic-inject-conversation-id.cjs",
        "aic-session-end.cjs",
      ],
    };
  },
});

// integrations/shared/uninstall-global-claude.cjs
var require_uninstall_global_claude = __commonJS({
  "integrations/shared/uninstall-global-claude.cjs"(exports2, module2) {
    var path = require("node:path");
    var fs = require("node:fs");
    var { hookScriptNames: AIC_SCRIPT_NAMES } = require_aic_hook_scripts();
    var AIC_HOOK_CMD = /aic-[a-z0-9-]+\.cjs/i;
    function commandReferencesAicHook(command) {
      return AIC_HOOK_CMD.test(String(command || ""));
    }
    function tryRemoveFromSettings(settingsPath) {
      try {
        if (!fs.existsSync(settingsPath)) return false;
        const data = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        const hooks = data.hooks;
        if (!hooks || typeof hooks !== "object") return false;
        let changed = false;
        const newHooks = {};
        for (const eventKey of Object.keys(hooks)) {
          const wrappers = hooks[eventKey] || [];
          const nextWrappers = [];
          for (const w of wrappers) {
            if (!Array.isArray(w.hooks)) {
              nextWrappers.push(w);
              continue;
            }
            const filtered = w.hooks.filter(
              (entry) => !commandReferencesAicHook(entry.command),
            );
            if (filtered.length !== w.hooks.length) {
              changed = true;
              if (filtered.length > 0) {
                nextWrappers.push({ ...w, hooks: filtered });
              }
            } else {
              nextWrappers.push(w);
            }
          }
          newHooks[eventKey] = nextWrappers;
        }
        if (!changed) return false;
        data.hooks = newHooks;
        fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2) + "\n", "utf8");
        return true;
      } catch {
        return false;
      }
    }
    function tryRemoveMcpServerFromSettings(settingsPath) {
      try {
        if (!fs.existsSync(settingsPath)) return false;
        const data = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        const servers = data.mcpServers;
        if (!servers || typeof servers !== "object") return false;
        const aicKey = Object.keys(servers).find((k) => k.toLowerCase() === "aic");
        if (aicKey === void 0) return false;
        const nextServers = { ...servers };
        delete nextServers[aicKey];
        data.mcpServers = nextServers;
        fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2) + "\n", "utf8");
        return true;
      } catch {
        return false;
      }
    }
    function tryRemoveHookFiles(globalHooksDir) {
      let removed = false;
      for (const name of AIC_SCRIPT_NAMES) {
        try {
          const p = path.join(globalHooksDir, name);
          if (fs.existsSync(p)) {
            fs.unlinkSync(p);
            removed = true;
          }
        } catch {}
      }
      const hookDirFiles = fs.existsSync(globalHooksDir)
        ? fs.readdirSync(globalHooksDir)
        : [];
      for (const name of hookDirFiles) {
        if (/^aic-[a-z0-9-]+\.cjs$/.test(name) && !AIC_SCRIPT_NAMES.includes(name)) {
          try {
            fs.unlinkSync(path.join(globalHooksDir, name));
            removed = true;
          } catch {}
        }
      }
      return removed;
    }
    function tryUninstallGlobalClaude(homeDir) {
      const globalClaudeDir = path.join(homeDir, ".claude");
      const globalHooksDir = path.join(globalClaudeDir, "hooks");
      const settingsPath = path.join(globalClaudeDir, "settings.json");
      const removedSettings = tryRemoveFromSettings(settingsPath);
      const removedMcp = tryRemoveMcpServerFromSettings(settingsPath);
      const removedFiles = tryRemoveHookFiles(globalHooksDir);
      const changed = removedSettings || removedMcp || removedFiles;
      const parts = [];
      if (removedSettings) {
        parts.push("Removed AIC hook entries from ~/.claude/settings.json.");
      }
      if (removedMcp) {
        parts.push("Removed AIC from mcpServers in ~/.claude/settings.json.");
      }
      if (removedFiles) {
        parts.push("Removed AIC scripts from ~/.claude/hooks/.");
      }
      return { changed, parts };
    }
    module2.exports = { tryUninstallGlobalClaude };
  },
});

// integrations/shared/strip-project-claude-md.cjs
var require_strip_project_claude_md = __commonJS({
  "integrations/shared/strip-project-claude-md.cjs"(exports2, module2) {
    var path = require("node:path");
    var fs = require("node:fs");
    var CLAUDE_MD_OPENING_LINE_RE = new RegExp(
      "^\\s*<!--\\s*BEGIN AIC MANAGED SECTION \u2014 do not edit between these markers\\s*-->\\s*$",
    );
    var CLAUDE_MD_CLOSING_LINE_RE = new RegExp(
      "^\\s*<!--\\s*END AIC MANAGED SECTION\\s*-->\\s*$",
    );
    function normalizeLf(text) {
      return String(text).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
    }
    function findValidManagedPairLines(lines) {
      const openIdx = lines.findIndex((line) => CLAUDE_MD_OPENING_LINE_RE.test(line));
      if (openIdx < 0) return { valid: false };
      const closeIdx = lines.findIndex(
        (line, idx) => idx > openIdx && CLAUDE_MD_CLOSING_LINE_RE.test(line),
      );
      if (closeIdx < 0) return { valid: false };
      return { valid: true, openIdx, closeIdx };
    }
    function tryRemoveEmptyClaudeDir(claudeDir) {
      try {
        if (!fs.existsSync(claudeDir)) return;
        if (fs.readdirSync(claudeDir).length === 0) {
          fs.rmSync(claudeDir, { recursive: false });
        }
      } catch {}
    }
    function tryStripProjectClaudeMd(claudeMdPath, canonicalBodyUtf8) {
      const parts = [];
      if (!fs.existsSync(claudeMdPath)) {
        return { changed: false, parts };
      }
      const raw = fs.readFileSync(claudeMdPath, "utf8");
      const normalizedFile = normalizeLf(raw);
      const canonicalNorm = normalizeLf(canonicalBodyUtf8);
      const lines = normalizedFile.split("\n");
      const pair = findValidManagedPairLines(lines);
      if (pair.valid) {
        const before = lines.slice(0, pair.openIdx).join("\n");
        const after = lines.slice(pair.closeIdx + 1).join("\n");
        const segs = [];
        if (before.length > 0) segs.push(before);
        if (after.length > 0) segs.push(after);
        const remainder = segs.join("\n").trim();
        if (remainder === "") {
          fs.unlinkSync(claudeMdPath);
          parts.push("Removed .claude/CLAUDE.md.");
          tryRemoveEmptyClaudeDir(path.dirname(claudeMdPath));
          return { changed: true, parts };
        }
        const remNorm = normalizeLf(remainder);
        if (remNorm.trim() === canonicalNorm.trim()) {
          fs.unlinkSync(claudeMdPath);
          parts.push("Removed .claude/CLAUDE.md.");
          tryRemoveEmptyClaudeDir(path.dirname(claudeMdPath));
          return { changed: true, parts };
        }
        const out =
          remainder.endsWith("\n") || remainder.length === 0
            ? remainder
            : `${remainder}
`;
        fs.writeFileSync(claudeMdPath, out, "utf8");
        parts.push("Removed AIC managed block from .claude/CLAUDE.md.");
        tryRemoveEmptyClaudeDir(path.dirname(claudeMdPath));
        return { changed: true, parts };
      }
      if (normalizedFile.trim() === canonicalNorm.trim()) {
        fs.unlinkSync(claudeMdPath);
        parts.push("Removed .claude/CLAUDE.md.");
        tryRemoveEmptyClaudeDir(path.dirname(claudeMdPath));
        return { changed: true, parts };
      }
      return { changed: false, parts };
    }
    module2.exports = { tryStripProjectClaudeMd };
  },
});

// integrations/shared/aic-ignore-entries.json
var require_aic_ignore_entries = __commonJS({
  "integrations/shared/aic-ignore-entries.json"(exports2, module2) {
    module2.exports = {
      lines: [".aic/", "aic.config.json", ".cursor/rules/AIC.mdc", ".cursor/hooks.json"],
    };
  },
});

// integrations/shared/claude-md-canonical-body.json
var require_claude_md_canonical_body = __commonJS({
  "integrations/shared/claude-md-canonical-body.json"(exports2, module2) {
    module2.exports = {
      body: '# AIC \u2014 Claude Code Rules\n\n> This file is the Claude Code equivalent of `.cursor/rules/AIC-architect.mdc`.\n> Claude Code reads it on every session. Keep it condensed and action-oriented.\n> **Cross-editor sync:** See `## Cross-Editor Sync` below for the canonical targets (`AIC-architect.mdc`, this file, both `CLAUDE_MD_TEMPLATE` sources, and `aic-claude-md-managed-section.mdc`).\n\n## AIC Context Compilation (hooks handle this automatically)\n\nAIC hooks in `.claude/hooks/` auto-compile intent-specific project context:\n\n- **SessionStart** \u2014 compiles broad context at session start (including post-compaction)\n- **UserPromptSubmit** \u2014 compiles fresh context using your actual prompt as intent (every message)\n- **SubagentStart** \u2014 compiles and injects context into every subagent\n- **Stop** \u2014 runs ESLint + typecheck on edited files before letting you stop\n- **SessionEnd** \u2014 logs session telemetry\n\nYou do **not** need to call `aic_compile` manually \u2014 hooks handle it. If you need context for a different intent than the user\'s message, you may call `aic_compile` directly via MCP.\n\n## Non-Negotiable Architectural Invariants\n\n- **First pass:** Write code that passes lint and conventions on the first version. Avoid rework.\n- **SOLID:** One public method per class; one class per file; one interface per `*.interface.ts` file. Constructor receives only interfaces \u2014 never concrete classes. No `public` constructor params in pipeline \u2014 use `private readonly`. No exported interfaces in pipeline files \u2014 extract to `core/interfaces/`. Max 60 lines per function in pipeline (enforced by ESLint). No exceptions in pipeline steps.\n- **Hexagonal:** `core/` and `pipeline/` have zero imports from `adapters/`, `storage/`, `mcp/`, Node.js APIs, or external packages. All I/O through interfaces only. Core interfaces must NOT expose infrastructure concepts (SQL syntax, HTTP verbs, file-system paths) \u2014 use domain terminology.\n- **Adapter wrapping:** Every external library has exactly ONE adapter or storage file that wraps it behind a core interface. No other file imports the library directly \u2014 enforced by ESLint `no-restricted-imports`. To swap a library, change one file.\n- **DIP:** No `new` for infrastructure/service classes outside the MCP composition boundary: `mcp/src/server.ts` is the primary wiring site; delegated `new` in other `mcp/src` modules follows `aic-mcp.mdc` (Composition Root Discipline). All dependencies via constructor injection. Storage classes receive the database instance \u2014 never construct it. Adapters inject `Clock` for time, never call `Date.now()` directly.\n- **OCP:** New capabilities via new classes implementing existing interfaces \u2014 never modify existing pipeline classes. The core pipeline is frozen once correct; all evolution happens at the edges.\n- **Dispatch pattern:** No if/else-if chains with 3+ branches \u2014 enforced by ESLint. Use `Record<Enum, Handler>` for enum dispatch, handler arrays for predicate dispatch. Extend by adding entries (OCP), not modifying branches.\n- **Errors:** Never throw bare `Error`. Use `AicError` subclasses with machine-readable `code` property. Pipeline steps never catch-and-ignore \u2014 errors propagate to composition root. MCP server never crashes on a single bad request.\n- **Determinism:** No `Date.now()`, `new Date()`, or `Math.random()` anywhere \u2014 enforced by ESLint globally. Only `system-clock.ts` is exempt. All other code injects time via `Clock` interface. No `date(\'now\')` or `datetime(\'now\')` in SQL \u2014 pass the current timestamp as a bound parameter from the `Clock` interface.\n- **Immutability:** No `.push()`, `.splice()`, `.sort()` (mutating), `.reverse()` (mutating). Use spread/reduce. Pipeline steps never mutate their inputs \u2014 return new objects. No `let` in production code \u2014 use `const` exclusively. Only exception: boolean control flags in imperative closures (`let found = false` in a `ts.forEachChild` visitor). Accumulators must use reduce or a helper that returns the collected result \u2014 never `let arr = []; ... arr = [...arr, item]`.\n- **Types:** No `any`. Explicit return types on all functions. Interfaces in `*.interface.ts` files (one interface per file). Max 5 methods per interface (ISP). Related type aliases live in `core/types/`, not in interface files.\n- **Named imports only (enforced by ESLint):** No `import * as X` for internal modules (relative or `#alias` paths). Use named imports: `import { A, B } from "./foo.js"`. Namespace imports allowed only for Node.js built-ins (`import * as path from "node:path"`) and established library APIs (`import * as ts from "typescript"`).\n- **Comments:** `//` style only \u2014 `/* */` and `/** */` are banned by ESLint; one line max enforced by ESLint. No JSDoc. **Delete-test:** mentally remove the comment and re-read the code \u2014 if the meaning is unchanged, the comment must be deleted. Only keep comments that explain a non-obvious _reason_: a cross-repo sync constraint, a non-obvious algorithmic choice, or a gotcha the code alone cannot express. Never describe what the code does (`// Get the user`, `// Return result`, `// Loop over items`).\n- **Branded types (ADR-010):** Use types from `shared/src/core/types/` \u2014 never raw `string`/`number` for domain values (paths, tokens, durations, scores, IDs, enums). `as const` objects for enums, not TypeScript `enum`. Null convention: `Type | null` = checked absent, `?: Type` = optional.\n- **Type safety (enforced by ESLint):** No `as string`, `as number`, `as boolean` \u2014 branded types are already their base type. No double-cast `as unknown as T` (only `open-database.ts` exempt). No `!` non-null assertions \u2014 use optional chaining or null guards. No `Partial<T>` in core/pipeline. No `{ x } as Type` object literal assertions \u2014 use type annotations. No `enum`, `for...in`, default exports, `Object.assign`, nested ternaries.\n- **Validation boundary (ADR-009):** Runtime validation at MCP handler and config loader only. Core/pipeline never imports the validation library. After validation, produce branded types via constructor functions (`toTokenCount()`, `toAbsolutePath()`, and other `to*` constructors in the validation boundary).\n- **Database:** All SQL lives exclusively in `shared/src/storage/`. Every schema change requires a migration in `shared/src/storage/migrations/` (`NNN-description.ts`). Schema change + migration = same commit. Never edit a merged migration. Never run raw DDL outside the `MigrationRunner`.\n- **Global DB:** The database is a single file at `~/.aic/aic.sqlite`. Per-project isolation is enforced via `project_id` in store queries (all per-project stores take `projectId: ProjectId` and use `WHERE project_id = ?`).\n- **IDs:** All entity PKs use UUIDv7 (`TEXT(36)` in SQLite). Never `INTEGER AUTOINCREMENT` for entities. Exception: `config_history` uses composite PK `(project_id, config_hash)` with SHA-256 `config_hash`. See Project Plan ADR-007.\n- **Timestamps:** Always `YYYY-MM-DDTHH:mm:ss.sssZ` (UTC, milliseconds, trailing `Z`). Use the `Clock` interface \u2014 never `new Date()` or `Date.now()` directly. Use the `ISOTimestamp` branded type. See Project Plan ADR-008.\n\n## Security Invariants\n\n- **Secrets:** Never hardcode API keys or tokens. Config references env var _names_ (`apiKeyEnv: "OPENAI_API_KEY"`), never values. All logging must sanitize secrets \u2014 replace with `***`.\n- **`.aic/` directory:** `0700` permissions (owner-only), auto-gitignored, no symlink traversal. Storage code must enforce these invariants.\n- **Telemetry:** Telemetry payloads must never contain file paths, file content, prompts, intents, project names, or PII. Only typed aggregates and enum values. See `security.md \xA7Anonymous Telemetry`.\n- **Context Guard:** Never-include patterns (`.env`, `*.pem`, and the remaining globs defined in the guard configuration) are non-overridable. Guard cannot be skipped or disabled.\n- **Prompt assembly:** Intent is opaque text in a template \u2014 never interpolated into system instructions. Context in delimited code blocks. Constraints after context.\n- **MCP error sanitization:** No stack traces, internal paths, or env details in error responses.\n\n## Dependencies\n\n- All versions pinned exact (`"9.39.3"`, never `"^9.0.0"`). No caret or tilde ranges.\n- Adding a runtime dependency requires justification: what it replaces, why no existing dep covers it, MIT/Apache-2.0 only.\n- One dependency per PR. Commit format: `chore(deps): update <package> to <version>`.\n\n## Documentation\n\n- `documentation/project-plan.md` is the architecture spec. `documentation/implementation-spec.md` is the implementation spec.\n- Read `documentation/` before proposing or changing code.\n- Do not create or modify any .md file (`documentation/`, `README.md`, `.claude/*.md`, `.cursor/rules/*.mdc`) unless the user explicitly asks you to.\n\n## File Naming\n\n- All `.ts` files use kebab-case (`intent-classifier.ts`). Interfaces: `*.interface.ts`. Tests: `*.test.ts`. Migrations: `NNN-description.ts`.\n- Documentation: kebab-case except conventional root files (`README.md`).\n\n## Commits\n\nFormat: `type(scope): description` \u2014 max 72 chars, target 50-60, imperative, no period. Subject line only \u2014 no body or footer. Never use `--no-verify`.\n\n## File Operations\n\n- Use targeted edits on the minimum necessary lines. Do not read a file and write a new file when an in-place edit suffices.\n- Read only the file sections you need for this change; avoid full-file reads when not needed.\n- Verify before implementing: For any request \u2014 ad-hoc or skill-driven \u2014 investigate first: query the actual database, read the actual deployed file, check the actual API response, trace the actual bootstrap code path. Never implement based on assumptions about external system behavior. This rule applies to ALL skills (planner, executor, researcher) \u2014 each skill has its own reinforcement: planner \xA70b Runtime Verification Checklist, executor \xA72.5 Verify External Assumptions, researcher \xA73a Runtime Evidence Mandate.\n- Evidence before claims: Never claim work is complete, tests pass, or a bug is fixed without fresh verification evidence from the current message. Run the command, read the output, THEN make the claim. Hedged wording (including "should" or "seems to") in those completion claims indicates missing evidence \u2014 run the verification instead.\n- Systematic debugging: When encountering any bug, test failure, or unexpected behavior, investigate root cause before proposing fixes. Reproduce consistently, form single hypotheses, create a failing test before fixing. If 3+ fix attempts fail, stop and question the architecture. Use the `aic-systematic-debugging` skill for the full process.\n- File size awareness: You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones. This reinforces SOLID and is a practical constraint of LLM context.\n\n## Source Structure\n\n```\nshared/src/core/         \u2190 interfaces and types (no implementations)\nshared/src/pipeline/     \u2190 pipeline steps (pure transformations)\nshared/src/adapters/     \u2190 external library wrappers\nshared/src/storage/      \u2190 SQLite access (only place for SQL)\nmcp/src/                 \u2190 MCP server (primary composition root; see `aic-mcp.mdc`)\n```\n\n## ESLint\n\nHexagonal boundaries are enforced by `no-restricted-imports` in `eslint.config.mjs`. Additional enforcement:\n\n- `Date.now()`, `new Date()`, `Math.random()` blocked globally (only `system-clock.ts` exempt)\n- Database constructor blocked in `storage/` (DIP \u2014 receive via constructor)\n- One interface per `*.interface.ts` file (ISP \u2014 sibling export detection)\n- Array mutations (`.push`, `.splice`, `.sort`, `.reverse`, `.pop`, `.shift`, `.unshift`) blocked\n- Storage cannot import from `pipeline/`, `adapters/`, `mcp/`\n- Adapters cannot import from `storage/`, `pipeline/`, `mcp/`\n\nPrefer `npx eslint` for targeted checks. Run `pnpm lint` before declaring work complete. Run `pnpm knip` to check for unused files, exports, and dependencies. Never add `eslint-disable`, `eslint-disable-next-line`, `@ts-ignore`, or `@ts-nocheck` comments \u2014 fix the code instead. If a rule genuinely does not apply, request a targeted override in `eslint.config.mjs`.\n\n## Prompt Commands\n\n> **Dev:** When `"devMode": true` is set in `aic.config.json` at the project root, substitute `pnpm aic` for `npx @jatbas/aic` in every command below (run from the repo root).\n\nFor CLI-based commands (status, last, chat-summary, quality, projects): run the Bash command and relay stdout byte-for-byte \u2014 no reformatting, no label substitution, no reordering. The CLI is the single source of truth for output format. **Never call `mcp__aic-dev__aic_status`, `mcp__aic-dev__aic_last`, `mcp__aic-dev__aic_projects`, `mcp__aic-dev__aic_chat_summary`, or `mcp__aic-dev__aic_quality_report` directly \u2014 always use the Bash CLI.**\n\n**Output discipline (mandatory \u2014 applies to every prompt command below):**\n\n1. **No preamble.** Go directly to the Bash tool call. Do not announce the command, the shell, the Node version, the PATH, or what you are about to do.\n2. **Stdout inside a fenced code block \u2014 mandatory.** Your response text must be **exactly** the stdout wrapped in a fenced code block (triple backticks on their own lines, no language tag) and nothing else \u2014 no text before the opening fence, no text after the closing fence. The fence is mandatory: the CLI output uses fixed-width columns and full-width `\u2500\u2500\u2026\u2500\u2500` separator rules that Markdown will otherwise collapse into horizontal rules and single spaces. The tool result block is separate from your response text \u2014 the rule requires the stdout to appear in your response text as well, fenced. Do not add explanations, troubleshooting tips, environment diagnostics, or follow-up suggestions \u2014 not even if you think they are helpful.\n3. **Failure contract.** If the command exits non-zero, paste stderr verbatim inside the same fenced code block, add a single line `exit code: N`, and stop. Do not diagnose Node versions, ABI mismatches, rebuild steps, alternate shells, or PATH fixes unless the user asks in a follow-up message.\n4. **One invocation per command.** Do not retry with a different Node binary, interpreter, or PATH on failure. The user decides whether to retry.\n\n---\n\n- **"show aic status"** \u2014 Run Bash with `npx @jatbas/aic status` (or `pnpm aic status` when `"devMode": true` is set in `aic.config.json`) from the project directory. For a rolling window, use `status <N>d` (**N** integer 1..3660). Relay stdout byte-for-byte, wrapped in a fenced code block (no language tag).\n\n- **"show aic chat summary"** \u2014 Run Bash with `npx @jatbas/aic chat-summary --project <absolute workspace root>` (or `pnpm aic chat-summary --project <absolute workspace root>` when `"devMode": true` is set in `aic.config.json`). Relay stdout byte-for-byte, wrapped in a fenced code block (no language tag).\n\n- **"show aic last"** \u2014 Run Bash with `npx @jatbas/aic last` (or `pnpm aic last` when `"devMode": true` is set in `aic.config.json`) from the project directory. Relay stdout byte-for-byte, wrapped in a fenced code block (no language tag).\n\n- **"show aic quality"** \u2014 Run Bash with `npx @jatbas/aic quality` (or `pnpm aic quality` when `"devMode": true` is set in `aic.config.json`) from the project directory. Use `quality --window <N>` for a rolling **N**-day window (**N** integer 1..365). Relay stdout byte-for-byte, wrapped in a fenced code block (no language tag).\n\n- **"show aic projects"** \u2014 Run Bash with `npx @jatbas/aic projects` (or `pnpm aic projects` when `"devMode": true` is set in `aic.config.json`). Relay stdout byte-for-byte, wrapped in a fenced code block (no language tag).\n\n- **"run aic model test"** \u2014 Call the `aic_model_test` MCP tool with `{ "projectRoot": "<absolute workspace root>" }`. The tool returns a `probeId`, three challenges, and instructions. Solve challenge 1 (arithmetic) and challenge 2 (string-reverse). Then call `aic_compile` with intent exactly equal to `"model-test-<answer1>-<answer2>"` (replace with your computed answers). Finally call `aic_model_test` again with `{ "projectRoot": "<absolute workspace root>", "probeId": "<probeId from step 1>", "answers": [<arithmetic answer>, "<reversed string>"] }`. Display the result as a table with columns: Test, Result (Pass/Fail), Notes. Start the reply with one short line: **Model test = agent capability probe.**\n\n## Tests\n\n- Co-located `__tests__/` directories next to source\n- Pattern: `*.test.ts`\n- Bug fixes must include a regression test\n- No `any` in tests\n- **Smoke tests:** When editing `integrations/**`, `mcp/scripts/bundle-*`, or `mcp/package.json` `files` field, verify `integrations/__tests__/pack-install-smoke.test.cjs` still passes and update its assertions if you changed the published artifact layout, install behavior, or uninstall behavior. Run: `node integrations/__tests__/pack-install-smoke.test.cjs`.\n\n## Cross-Editor Sync\n\nKeep shared rules aligned across these four code and documentation targets:\n\n- `.cursor/rules/AIC-architect.mdc`\n- `.claude/CLAUDE.md` (this file)\n- `integrations/claude/install.cjs` (`CLAUDE_MD_TEMPLATE`)\n- `mcp/src/install-trigger-rule.ts` (`CLAUDE_MD_TEMPLATE`)\n\nManaged-section boundaries and the no-banner inner body follow `.cursor/rules/aic-claude-md-managed-section.mdc`; the two `CLAUDE_MD_TEMPLATE` strings must remain byte-identical.\n\nArchitectural invariants, security rules, dependency rules, commit rules, ESLint rules, and test rules are **identical** across `AIC-architect.mdc` and this file \u2014 only editor-specific mechanics differ (hooks vs manual `aic_compile`, prompt command wording).\n',
    };
  },
});

// integrations/shared/uninstall-project-aic.cjs
var require_uninstall_project_aic = __commonJS({
  "integrations/shared/uninstall-project-aic.cjs"(exports2, module2) {
    var path = require("node:path");
    var fs = require("node:fs");
    var { tryStripProjectClaudeMd } = require_strip_project_claude_md();
    function loadIgnoreLineSet() {
      const { lines } = require_aic_ignore_entries();
      return new Set(lines);
    }
    function tryRemoveIgnoreLines(filePath, lineSet) {
      if (!fs.existsSync(filePath)) return false;
      const raw = fs.readFileSync(filePath, "utf8");
      const lines = raw.split("\n");
      const next = lines.filter((line) => !lineSet.has(line.trim()));
      if (next.length === lines.length) return false;
      const body = next.join("\n");
      const withNl =
        body.endsWith("\n") || body.length === 0
          ? body
          : `${body}
`;
      fs.writeFileSync(filePath, withNl, "utf8");
      return true;
    }
    function tryUninstallProjectAic(projectRoot, options) {
      if (options.keepProjectArtifacts) {
        return { changed: false, parts: [] };
      }
      const parts = [];
      let changed = false;
      const cfg = path.join(projectRoot, "aic.config.json");
      if (fs.existsSync(cfg)) {
        fs.unlinkSync(cfg);
        changed = true;
        parts.push("Removed aic.config.json from the project.");
      }
      const aicDir = path.join(projectRoot, ".aic");
      const homeDir = options.homeDir;
      const globalAicPath =
        homeDir !== void 0 && homeDir !== null && String(homeDir).length > 0
          ? path.join(String(homeDir), ".aic")
          : null;
      const projectAicIsGlobalHome =
        globalAicPath !== null && path.resolve(aicDir) === path.resolve(globalAicPath);
      if (fs.existsSync(aicDir) && !projectAicIsGlobalHome) {
        fs.rmSync(aicDir, { recursive: true, force: true });
        changed = true;
        parts.push("Removed project .aic/ directory.");
      }
      const lineSet = loadIgnoreLineSet();
      for (const name of [".gitignore", ".prettierignore", ".eslintignore"]) {
        const fp = path.join(projectRoot, name);
        if (tryRemoveIgnoreLines(fp, lineSet)) {
          changed = true;
          parts.push(`Removed AIC ignore entries from ${name}.`);
        }
      }
      const claudeMd = path.join(projectRoot, ".claude", "CLAUDE.md");
      const { body: canonicalBody } = require_claude_md_canonical_body();
      const strip = tryStripProjectClaudeMd(claudeMd, canonicalBody);
      if (strip.changed) {
        changed = true;
        parts.push(...strip.parts);
      }
      return { changed, parts };
    }
    module2.exports = { tryUninstallProjectAic };
  },
});

// integrations/shared/read-project-dev-mode.cjs
var require_read_project_dev_mode = __commonJS({
  "integrations/shared/read-project-dev-mode.cjs"(exports2, module2) {
    var path = require("node:path");
    var fs = require("node:fs");
    function isDevModeTrue(projectRoot) {
      const configPath = path.join(projectRoot, "aic.config.json");
      try {
        const raw = fs.readFileSync(configPath, "utf8");
        const parsed = JSON.parse(raw);
        return parsed.devMode === true;
      } catch {
        return false;
      }
    }
    function isCompileGateSkipped(projectRoot) {
      const configPath = path.join(projectRoot, "aic.config.json");
      try {
        const raw = fs.readFileSync(configPath, "utf8");
        const parsed = JSON.parse(raw);
        return parsed.devMode === true && parsed.skipCompileGate === true;
      } catch {
        return false;
      }
    }
    module2.exports = { isDevModeTrue, isCompileGateSkipped };
  },
});

// integrations/shared/resolve-project-root.cjs
var require_resolve_project_root = __commonJS({
  "integrations/shared/resolve-project-root.cjs"(exports2, module2) {
    var path = require("path");
    function resolveProjectRoot(parsed, options) {
      const opts = options ?? {};
      const env = opts.env ?? process.env;
      const toolInputOverride =
        opts.toolInputOverride != null ? String(opts.toolInputOverride).trim() : "";
      const useAicProjectRoot = opts.useAicProjectRoot === true;
      const isCursor =
        parsed == null || Object.prototype.hasOwnProperty.call(opts, "env");
      if (isCursor) {
        const cursorDir =
          env.CURSOR_PROJECT_DIR != null && String(env.CURSOR_PROJECT_DIR).trim() !== ""
            ? String(env.CURSOR_PROJECT_DIR).trim()
            : "";
        const aicRoot =
          useAicProjectRoot &&
          env.AIC_PROJECT_ROOT != null &&
          String(env.AIC_PROJECT_ROOT).trim() !== ""
            ? String(env.AIC_PROJECT_ROOT).trim()
            : "";
        const raw2 = toolInputOverride || cursorDir || aicRoot || process.cwd();
        return path.resolve(raw2);
      }
      const cwdRaw = (parsed?.cwd ?? parsed?.input?.cwd ?? "").trim();
      const fromParsed = (toolInputOverride || cwdRaw).trim();
      const claudeDir =
        env.CLAUDE_PROJECT_DIR != null && String(env.CLAUDE_PROJECT_DIR).trim() !== ""
          ? String(env.CLAUDE_PROJECT_DIR).trim()
          : "";
      const raw = fromParsed || claudeDir || process.cwd();
      return path.resolve(raw);
    }
    module2.exports = { resolveProjectRoot };
  },
});

// integrations/claude/uninstall.cjs
var require_uninstall = __commonJS({
  "integrations/claude/uninstall.cjs"(exports2, module2) {
    var path = require("node:path");
    var os = require("node:os");
    var { resolveGlobalKeepAicDatabase, tryCleanGlobalAicDir } =
      require_clean_global_aic_dir();
    var { tryUninstallGlobalClaude } = require_uninstall_global_claude();
    var { tryUninstallProjectAic } = require_uninstall_project_aic();
    var { isDevModeTrue } = require_read_project_dev_mode();
    var { resolveProjectRoot: resolveProjectRootShared } = require_resolve_project_root();
    function projectRootFromArgv() {
      const argv = process.argv;
      const idx = argv.findIndex(
        (a) => a === "--project-root" || a.startsWith("--project-root="),
      );
      if (idx === -1) return null;
      const arg = argv[idx];
      const eq = arg.indexOf("=");
      if (eq !== -1) return path.resolve(arg.slice(eq + 1));
      if (idx + 1 < argv.length) return path.resolve(argv[idx + 1]);
      return null;
    }
    function parseKeepProjectArtifacts(argv) {
      return argv.includes("--keep-project-artifacts");
    }
    function run() {
      const argv = process.argv;
      const home = os.homedir();
      const globalCleanup = argv.includes("--global");
      const force = argv.includes("--force");
      const removeDatabase = argv.includes("--remove-database");
      const envRoot =
        process.env.AIC_UNINSTALL_PROJECT_ROOT != null &&
        String(process.env.AIC_UNINSTALL_PROJECT_ROOT).trim() !== ""
          ? path.resolve(String(process.env.AIC_UNINSTALL_PROJECT_ROOT).trim())
          : null;
      const projectRoot =
        projectRootFromArgv() ??
        envRoot ??
        resolveProjectRootShared(null, { env: process.env, useAicProjectRoot: true });
      const devMode = isDevModeTrue(projectRoot);
      if (devMode && !force) {
        process.stdout.write(
          "This is an AIC development project (devMode: true in aic.config.json). Skipping uninstall.\n",
        );
        return "devmode-skip";
      }
      if (force && devMode) {
        process.stdout.write("Force-uninstalling AIC development project.\n");
      }
      if (removeDatabase && !globalCleanup) {
        process.stderr.write(
          "Warning: --remove-database only applies with --global. Ignored.\n",
        );
      }
      const keepProjectArtifacts = parseKeepProjectArtifacts(argv);
      const projectAic = tryUninstallProjectAic(projectRoot, {
        keepProjectArtifacts,
        homeDir: home,
      });
      let globalClaude = { changed: false, parts: [] };
      let globalAic = { changed: false, message: null };
      if (globalCleanup) {
        globalClaude = tryUninstallGlobalClaude(home);
        const keepDb = resolveGlobalKeepAicDatabase(argv, process.env);
        globalAic = tryCleanGlobalAicDir(home, keepDb);
      }
      const changed = globalClaude.changed || projectAic.changed || globalAic.changed;
      if (!changed) {
        process.stdout.write("Nothing to remove. No need to restart Claude Code.\n");
        return "unchanged";
      }
      const parts = [...globalClaude.parts, ...projectAic.parts];
      if (globalAic.message) {
        parts.push(globalAic.message);
      }
      parts.push("Restart Claude Code (or reload) to complete uninstall.");
      process.stdout.write(parts.join(" ") + "\n");
      return "changed";
    }
    module2.exports = { run };
    if (require.main === module2) {
      if (run() === "devmode-skip") process.exit(0);
    }
  },
});

// integrations/cursor/aic-hook-scripts.json
var require_aic_hook_scripts2 = __commonJS({
  "integrations/cursor/aic-hook-scripts.json"(exports2, module2) {
    module2.exports = {
      hookScriptNames: [
        "AIC-session-init.cjs",
        "AIC-compile-context.cjs",
        "AIC-require-aic-compile.cjs",
        "AIC-inject-conversation-id.cjs",
        "AIC-post-compile-context.cjs",
        "AIC-before-submit-prewarm.cjs",
        "AIC-block-no-verify.cjs",
        "AIC-after-file-edit-tracker.cjs",
        "AIC-session-end.cjs",
        "AIC-subagent-compile.cjs",
        "AIC-subagent-stop.cjs",
        "AIC-subagent-start-model-id.cjs",
        "AIC-stop-quality-check.cjs",
      ],
    };
  },
});

// integrations/cursor/uninstall.cjs
var require_uninstall2 = __commonJS({
  "integrations/cursor/uninstall.cjs"(exports2, module2) {
    var path = require("node:path");
    var fs = require("node:fs");
    var os = require("node:os");
    var { resolveGlobalKeepAicDatabase, tryCleanGlobalAicDir } =
      require_clean_global_aic_dir();
    var { tryUninstallGlobalClaude } = require_uninstall_global_claude();
    var { tryUninstallProjectAic } = require_uninstall_project_aic();
    var { isDevModeTrue } = require_read_project_dev_mode();
    var { resolveProjectRoot: resolveProjectRootShared } = require_resolve_project_root();
    var { hookScriptNames: AIC_SCRIPT_NAMES } = require_aic_hook_scripts2();
    function findAicMcpKey(servers) {
      if (servers === void 0 || typeof servers !== "object" || servers === null) {
        return void 0;
      }
      return Object.keys(servers).find((k) => k.toLowerCase() === "aic");
    }
    function tryStripMcp(mcpPath) {
      try {
        if (!fs.existsSync(mcpPath)) return false;
        const obj = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
        if (typeof obj !== "object" || obj === null) return false;
        let changed = false;
        const next = { ...obj };
        if (Object.prototype.hasOwnProperty.call(next, "aic")) {
          delete next.aic;
          changed = true;
        }
        const servers = next.mcpServers;
        if (servers && typeof servers === "object") {
          const aicKey = findAicMcpKey(servers);
          if (aicKey !== void 0) {
            const nextServers = { ...servers };
            delete nextServers[aicKey];
            next.mcpServers = nextServers;
            changed = true;
          }
        }
        if (!changed) return false;
        fs.mkdirSync(path.dirname(mcpPath), { recursive: true });
        fs.writeFileSync(mcpPath, JSON.stringify(next, null, 2) + "\n", "utf8");
        return true;
      } catch {
        return false;
      }
    }
    function isAicScriptEntry(entry) {
      return (entry.command ?? "").match(/AIC-[a-z0-9-]+\.cjs/) !== null;
    }
    function tryCleanProjectHooks(projectRoot) {
      const projectHooksDir = path.join(projectRoot, ".cursor", "hooks");
      const hooksJsonPath = path.join(projectRoot, ".cursor", "hooks.json");
      const triggerPath = path.join(projectRoot, ".cursor", "rules", "AIC.mdc");
      let removed = false;
      try {
        if (fs.existsSync(hooksJsonPath)) {
          try {
            const data = JSON.parse(fs.readFileSync(hooksJsonPath, "utf8"));
            const hooks = data.hooks || {};
            const nextHooks = {};
            const hooksChanged = Object.keys(hooks).reduce((acc, key) => {
              const arr = hooks[key];
              if (!Array.isArray(arr)) {
                nextHooks[key] = arr;
                return acc;
              }
              const filtered = arr.filter((e) => !isAicScriptEntry(e));
              nextHooks[key] = filtered;
              return acc || filtered.length !== arr.length;
            }, false);
            if (hooksChanged) {
              data.hooks = nextHooks;
              fs.writeFileSync(
                hooksJsonPath,
                JSON.stringify(data, null, 2) + "\n",
                "utf8",
              );
              removed = true;
            }
          } catch {}
        }
        for (const name of AIC_SCRIPT_NAMES) {
          try {
            const p = path.join(projectHooksDir, name);
            if (fs.existsSync(p)) {
              fs.unlinkSync(p);
              removed = true;
            }
          } catch {}
        }
        const hookDirFiles = fs.existsSync(projectHooksDir)
          ? fs.readdirSync(projectHooksDir)
          : [];
        for (const name of hookDirFiles) {
          if (/^AIC-[a-z0-9-]+\.cjs$/.test(name) && !AIC_SCRIPT_NAMES.includes(name)) {
            try {
              fs.unlinkSync(path.join(projectHooksDir, name));
              removed = true;
            } catch {}
          }
        }
        try {
          if (fs.existsSync(triggerPath)) {
            fs.unlinkSync(triggerPath);
            removed = true;
          }
        } catch {}
      } catch {}
      return removed;
    }
    function projectRootFromArgv() {
      const argv = process.argv;
      const idx = argv.findIndex(
        (a) => a === "--project-root" || a.startsWith("--project-root="),
      );
      if (idx === -1) return null;
      const arg = argv[idx];
      const eq = arg.indexOf("=");
      if (eq !== -1) return path.resolve(arg.slice(eq + 1));
      if (idx + 1 < argv.length) return path.resolve(argv[idx + 1]);
      return null;
    }
    function parseKeepProjectArtifacts(argv) {
      return argv.includes("--keep-project-artifacts");
    }
    function run(opts = {}) {
      const skipGlobalClaude = opts.skipGlobalClaude === true;
      const argv = process.argv;
      const home = os.homedir();
      const globalCleanup = argv.includes("--global");
      const force = argv.includes("--force");
      const removeDatabase = argv.includes("--remove-database");
      const envRoot =
        process.env.AIC_UNINSTALL_PROJECT_ROOT != null &&
        String(process.env.AIC_UNINSTALL_PROJECT_ROOT).trim() !== ""
          ? path.resolve(String(process.env.AIC_UNINSTALL_PROJECT_ROOT).trim())
          : null;
      const projectRoot =
        projectRootFromArgv() ??
        envRoot ??
        resolveProjectRootShared(null, { env: process.env, useAicProjectRoot: true });
      const devMode = isDevModeTrue(projectRoot);
      if (devMode && !force) {
        process.stdout.write(
          "This is an AIC development project (devMode: true in aic.config.json). Skipping uninstall.\n",
        );
        return "devmode-skip";
      }
      if (force && devMode) {
        process.stdout.write("Force-uninstalling AIC development project.\n");
      }
      if (removeDatabase && !globalCleanup) {
        process.stderr.write(
          "Warning: --remove-database only applies with --global. Ignored.\n",
        );
      }
      const keepProjectArtifacts = parseKeepProjectArtifacts(argv);
      const projectMcpPath = path.join(projectRoot, ".cursor", "mcp.json");
      const globalMcpPath = path.join(home, ".cursor", "mcp.json");
      const sameCursorMcpPath =
        path.resolve(projectMcpPath) === path.resolve(globalMcpPath);
      const removedProjectMcp =
        sameCursorMcpPath && globalCleanup ? false : tryStripMcp(projectMcpPath);
      const removedProjectHooks = tryCleanProjectHooks(projectRoot);
      const projectAic = tryUninstallProjectAic(projectRoot, {
        keepProjectArtifacts,
        homeDir: home,
      });
      let removedGlobalMcp = false;
      let globalClaude = { changed: false, parts: [] };
      let globalAic = { changed: false, message: null };
      if (globalCleanup) {
        removedGlobalMcp = tryStripMcp(globalMcpPath);
        if (!skipGlobalClaude) {
          globalClaude = tryUninstallGlobalClaude(home);
        }
        const keepDb = resolveGlobalKeepAicDatabase(argv, process.env);
        globalAic = tryCleanGlobalAicDir(home, keepDb);
      }
      const changed =
        removedGlobalMcp ||
        removedProjectMcp ||
        removedProjectHooks ||
        globalClaude.changed ||
        projectAic.changed ||
        globalAic.changed;
      if (!changed) {
        process.stdout.write("Nothing to remove. No need to restart Cursor.\n");
        return "unchanged";
      }
      const parts = [];
      if (removedGlobalMcp) {
        parts.push("Removed AIC from ~/.cursor/mcp.json.");
      }
      if (removedProjectMcp) {
        parts.push("Removed AIC from this project's Cursor MCP config.");
      }
      if (removedProjectHooks) {
        parts.push("Removed AIC hooks and trigger rule from this project.");
      }
      parts.push(...globalClaude.parts, ...projectAic.parts);
      if (globalAic.message) {
        parts.push(globalAic.message);
      }
      parts.push("Restart Cursor to complete uninstall.");
      process.stdout.write(parts.join(" ") + "\n");
      return "changed";
    }
    module2.exports = { run };
    if (require.main === module2) {
      if (run() === "devmode-skip") process.exit(0);
    }
  },
});

// integrations/standalone-uninstall-entry.cjs
var claudeFlag = process.argv.includes("--claude");
var cursorFlag = process.argv.includes("--cursor");
process.argv = process.argv.filter((a) => a !== "--claude" && a !== "--cursor");
if (claudeFlag && !cursorFlag) {
  const { run } = require_uninstall();
  if (run() === "devmode-skip") process.exit(0);
} else if (cursorFlag && !claudeFlag) {
  const { run } = require_uninstall2();
  if (run() === "devmode-skip") process.exit(0);
} else {
  const { run: runCursor } = require_uninstall2();
  const { run: runClaude } = require_uninstall();
  if (runCursor({ skipGlobalClaude: true }) === "devmode-skip") process.exit(0);
  runClaude();
}
