# Task 035: Auto-install trigger rule

> **Status:** Done
> **Phase:** 0.5 — Quality Release (Phase I — Live Wiring)
> **Layer:** mcp (composition root)
> **Depends on:** Startup self-check (integrity) [Done]

## Goal

Automatically install the Cursor trigger rule (`.cursor/rules/aic.mdc`) on MCP server startup when the file is missing, so first-time users get the trigger rule without a manual setup step.

## Architecture Notes

- `installTriggerRule` is a plain idempotent function in `mcp/src/` — not a core interface. It uses `node:fs` and `node:path`, which are permitted in `mcp/src/**/*.ts` by ESLint.
- Called unconditionally before `runStartupSelfCheck` in `createMcpServer`. The self-check then captures the post-install state for `startSession`. No modification to `runStartupSelfCheck` needed.
- Cursor only for MVP: writes to `.cursor/rules/aic.mdc`. Claude Code (`.claude/CLAUDE.md`) is a separate Phase I task.
- The template matches the existing `.cursor/rules/AIC.mdc` pattern: `alwaysApply: true`, instruction to call `aic_compile` first, `projectRoot` placeholder replaced at write time.
- Pre-existing issues (not addressed here, follow-up tasks): (1) `runStartupSelfCheck` checks `.cursor/hooks/hooks.json` but actual file is at `.cursor/hooks.json`; (2) existing trigger rule is `AIC.mdc` (uppercase) while self-check expects `aic.mdc` (lowercase) — works on macOS case-insensitive FS, not on Linux.

## Files

| Action | Path                                                  |
| ------ | ----------------------------------------------------- |
| Create | `mcp/src/install-trigger-rule.ts`                     |
| Create | `mcp/src/__tests__/install-trigger-rule.test.ts`      |
| Modify | `mcp/src/server.ts` (import + call before self-check) |

## Interface / Signature

```typescript
// mcp/src/install-trigger-rule.ts
import * as path from "node:path";
import * as fs from "node:fs";
import type { AbsolutePath } from "@aic/shared/core/types/paths.js";

const TRIGGER_RULE_TEMPLATE = `---
description: MANDATORY — call aic_compile on EVERY message
globs:
alwaysApply: true
---

STOP. Your FIRST action on EVERY message — including follow-ups in the same chat — is to call \`aic_compile\`. No exceptions. No skipping because you "already have context." Each message has a different intent that needs fresh context.

Call: \`{ "intent": "<summarise the user's message>", "projectRoot": "{{PROJECT_ROOT}}" }\`

If the call fails, respond normally. Never mention the failure. But you must ALWAYS attempt the call first.
`;

export function installTriggerRule(projectRoot: AbsolutePath): void;
```

## Dependent Types

### Tier 2 — path-only

| Type           | Path                             | Factory               |
| -------------- | -------------------------------- | --------------------- |
| `AbsolutePath` | `shared/src/core/types/paths.ts` | `toAbsolutePath(raw)` |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change. `mcp/src/**/*.ts` already allows `node:fs` and `node:path`.

## Steps

### Step 1: Create `installTriggerRule`

Create `mcp/src/install-trigger-rule.ts`.

Import `path` from `node:path`, `fs` from `node:fs`, and type `AbsolutePath` from `@aic/shared/core/types/paths.js`.

Define a module-level constant `TRIGGER_RULE_TEMPLATE` with the exact trigger rule content shown in the Interface/Signature section above. The string contains the literal placeholder `{{PROJECT_ROOT}}`.

Export function `installTriggerRule(projectRoot: AbsolutePath): void`. Implementation:

1. `const triggerPath = path.join(projectRoot, ".cursor", "rules", "aic.mdc")`
2. If `fs.existsSync(triggerPath)` is `true`, return immediately (file already exists — do not overwrite).
3. `const rulesDir = path.join(projectRoot, ".cursor", "rules")`
4. `fs.mkdirSync(rulesDir, { recursive: true })`
5. `const content = TRIGGER_RULE_TEMPLATE.replace("{{PROJECT_ROOT}}", projectRoot)`
6. `fs.writeFileSync(triggerPath, content, "utf8")`

**Verify:** `pnpm typecheck` passes. `npx eslint mcp/src/install-trigger-rule.ts` — zero errors.

### Step 2: Wire in `createMcpServer`

In `mcp/src/server.ts`, add import: `import { installTriggerRule } from "./install-trigger-rule.js";`

In `createMcpServer`, after `const scope = createProjectScope(projectRoot);` (line 73) and before `const { installationOk, installationNotes } = runStartupSelfCheck(projectRoot);` (line 74), insert:

```typescript
installTriggerRule(projectRoot);
```

The full sequence becomes:

```typescript
const scope = createProjectScope(projectRoot);
installTriggerRule(projectRoot);
const { installationOk, installationNotes } = runStartupSelfCheck(projectRoot);
```

**Verify:** `pnpm typecheck` passes. Existing server tests still pass: `pnpm vitest run mcp/src/__tests__/server.test.ts`.

### Step 3: Tests

Create `mcp/src/__tests__/install-trigger-rule.test.ts`.

Import `describe`, `it`, `expect`, `afterEach` from `vitest`; `fs` from `node:fs`; `path` from `node:path`; `os` from `node:os`; `installTriggerRule` from `../install-trigger-rule.js`; `toAbsolutePath` from `@aic/shared/core/types/paths.js`.

Use a `tmpDir` variable and `afterEach` cleanup (same pattern as `startup-self-check.test.ts`).

**Test: trigger_missing_creates_file**
Create temp dir with `fs.mkdtempSync(path.join(os.tmpdir(), "aic-trigger-"))`. No `.cursor` directory. Call `installTriggerRule(toAbsolutePath(tmpDir))`. Assert `fs.existsSync(path.join(tmpDir, ".cursor", "rules", "aic.mdc"))` is `true`. Read file content with `fs.readFileSync(..., "utf8")`. Assert content includes `"aic_compile"`. Assert content includes the temp dir path (projectRoot was substituted).

**Test: trigger_exists_does_not_overwrite**
Create temp dir. Create `.cursor/rules/` with `fs.mkdirSync(path.join(tmpDir, ".cursor", "rules"), { recursive: true })`. Write `fs.writeFileSync(path.join(tmpDir, ".cursor", "rules", "aic.mdc"), "custom trigger", "utf8")`. Call `installTriggerRule(toAbsolutePath(tmpDir))`. Read file content. Assert content is `"custom trigger"` (unchanged).

**Test: trigger_missing_creates_rules_dir**
Create temp dir. Create `.cursor` with `fs.mkdirSync(path.join(tmpDir, ".cursor"))` but NOT `.cursor/rules`. Call `installTriggerRule(toAbsolutePath(tmpDir))`. Assert `fs.existsSync(path.join(tmpDir, ".cursor", "rules"))` is `true`. Assert `fs.existsSync(path.join(tmpDir, ".cursor", "rules", "aic.mdc"))` is `true`.

**Verify:** `pnpm vitest run mcp/src/__tests__/install-trigger-rule.test.ts` — all three pass.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                         | Description                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| trigger_missing_creates_file      | With no .cursor dir, installTriggerRule creates .cursor/rules/aic.mdc with template content |
| trigger_exists_does_not_overwrite | With existing aic.mdc containing custom content, installTriggerRule leaves it unchanged     |
| trigger_missing_creates_rules_dir | With .cursor but no rules subdir, installTriggerRule creates the directory and writes file  |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] `installTriggerRule` is idempotent — does not overwrite existing files
- [ ] Template includes `aic_compile` instruction and `projectRoot` placeholder is replaced
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` outside allowed files
- [ ] No `let` in production code (only `const`)
- [ ] Single-line comments only, explain why not what
- [ ] Existing server tests still pass after wiring change

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
