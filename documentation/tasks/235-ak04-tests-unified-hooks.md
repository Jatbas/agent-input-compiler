# Task 235: AK04 — Tests for unified Claude plugin hooks

> **Status:** Pending
> **Phase:** 1.5 — Phase AK (Claude hooks/plugin deduplication)
> **Layer:** mcp
> **Depends on:** AK03: Verify plugin manifest and require paths

## Goal

Extend Claude integration tests so `pnpm test` runs every existing `integrations/claude/__tests__` hook script suite, add export-shape smoke checks on each `plugin/scripts/*.cjs` re-export, and lock a regression test that loads `aic-prompt-compile` via the plugin path and proves `model` reaches `callAicCompile` as the sixth argument.

## Architecture Notes

- CJS integration tests only — no `shared/src` or branded types.
- `aic-compile-helper.cjs` is a library re-export: it exposes `callAicCompile`, not `run`. `plugin/hooks/hooks.json` never invokes it as a hook command. Smoke assertions must branch on the filename.
- Re-export invariants from Phase AK: each `integrations/claude/plugin/scripts/<name>.cjs` remains exactly `module.exports = require("../../hooks/<name>.cjs");`.

## Files

| Action | Path                                                                 |
| ------ | -------------------------------------------------------------------- |
| Modify | `integrations/claude/__tests__/plugin-scripts-reexport.test.cjs` (after each `require()` of a plugin script, assert `run` is a function for hook entry scripts; for `aic-compile-helper.cjs` assert `callAicCompile` is a function) |
| Create | `integrations/claude/__tests__/aic-prompt-compile-plugin-path.test.cjs` (regression: `require` plugin `aic-prompt-compile`, mock hooks `aic-compile-helper`, assert sixth `callAicCompile` argument equals hook `modelArg` after trim and allow-list validation) |
| Modify | `package.json` (append `&& node integrations/claude/__tests__/…` for every Claude `aic-*.test.cjs` and `install.test.cjs` not already in `scripts.test`, including the new plugin-path test file) |

## Module Exports (production modules under test)

`integrations/claude/hooks/aic-prompt-compile.cjs`:

```javascript
module.exports = { run(stdinStr) };
```

`run` returns `Promise<string | null>` (resolved string stdout payload or `null` for silent exit).

`integrations/claude/hooks/aic-compile-helper.cjs`:

```javascript
module.exports = {
  callAicCompile(intent, projectRoot, conversationId, timeoutMs, triggerSource, modelId),
};
```

`callAicCompile` returns `Promise<string | null>`.

`integrations/claude/plugin/scripts/aic-prompt-compile.cjs`:

```javascript
module.exports = require("../../hooks/aic-prompt-compile.cjs");
```

## Data Shapes

**UserPromptSubmit stdin JSON** (top-level or nested under `input`): `prompt` (string), `cwd` (string path), `model` (string, optional) — used by `aic-prompt-compile.cjs` to build `modelArg` passed as the sixth argument to `callAicCompile`.

## Config Changes

- **shared/package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Extend plugin script smoke assertions

In `integrations/claude/__tests__/plugin-scripts-reexport.test.cjs`, in the `for` loop that does `const loaded = require(path.join(scriptsDir, name));`:

1. Keep the existing `assert.ok(loaded !== null && typeof loaded === "object");`.
2. When `name === "aic-compile-helper.cjs"`, add `assert.strictEqual(typeof loaded.callAicCompile, "function");`.
3. For every other `name` in `PLUGIN_SCRIPT_NAMES`, add `assert.strictEqual(typeof loaded.run, "function");`.

**Verify:** `node integrations/claude/__tests__/plugin-scripts-reexport.test.cjs` prints `ok: plugin_scripts_reexport` and exits `0`.

### Step 2: Add plugin-path `modelArg` regression file

Create `integrations/claude/__tests__/aic-prompt-compile-plugin-path.test.cjs` with this exact content:

```javascript
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

"use strict";

const path = require("node:path");
const assert = require("node:assert");

const hooksDir = path.join(__dirname, "..", "hooks");
const pluginPromptPath = path.join(
  __dirname,
  "..",
  "plugin",
  "scripts",
  "aic-prompt-compile.cjs",
);

async function plugin_path_forwards_model_to_callAicCompile_sixth_param() {
  const resolvedHelper = require.resolve("./aic-compile-helper.cjs", {
    paths: [hooksDir],
  });
  let capturedArgs;
  require.cache[resolvedHelper] = {
    exports: {
      callAicCompile: (...args) => {
        capturedArgs = args;
        return Promise.resolve("ok");
      },
    },
    loaded: true,
    id: resolvedHelper,
  };
  delete require.cache[require.resolve(pluginPromptPath)];
  const { run } = require(pluginPromptPath);
  await run(
    JSON.stringify({
      prompt: "hello",
      cwd: "/tmp",
      model: "  claude-opus-4  ",
    }),
  );
  delete require.cache[resolvedHelper];
  delete require.cache[require.resolve(pluginPromptPath)];
  assert.ok(Array.isArray(capturedArgs));
  assert.strictEqual(capturedArgs.length, 6);
  assert.strictEqual(capturedArgs[5], "claude-opus-4");
  console.log("plugin_path_forwards_model_to_callAicCompile_sixth_param: pass");
}

(async () => {
  await plugin_path_forwards_model_to_callAicCompile_sixth_param();
  console.log("All tests passed.");
})();
```

**Verify:** `node integrations/claude/__tests__/aic-prompt-compile-plugin-path.test.cjs` prints both pass lines and exits `0`.

### Step 3: Wire Claude hook suites into `scripts.test`

In the root `package.json`, in the `scripts.test` string, immediately after the segment `node integrations/claude/__tests__/plugin-scripts-reexport.test.cjs`, insert this exact substring (including leading ` && `):

` && node integrations/claude/__tests__/aic-after-file-edit-tracker.test.cjs && node integrations/claude/__tests__/aic-block-no-verify.test.cjs && node integrations/claude/__tests__/aic-compile-helper.test.cjs && node integrations/claude/__tests__/aic-pre-compact.test.cjs && node integrations/claude/__tests__/aic-prompt-compile.test.cjs && node integrations/claude/__tests__/aic-prompt-compile-plugin-path.test.cjs && node integrations/claude/__tests__/aic-session-end.test.cjs && node integrations/claude/__tests__/aic-session-start.test.cjs && node integrations/claude/__tests__/aic-stop-quality-check.test.cjs && node integrations/claude/__tests__/aic-subagent-inject.test.cjs && node integrations/claude/__tests__/install.test.cjs`

**Verify:** The `test` script contains exactly one `plugin-scripts-reexport.test.cjs` segment and contains all eleven `node integrations/claude/__tests__/` paths listed in this step.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| plugin_scripts_reexport | Extended loop asserts `run` on hook entry re-exports and `callAicCompile` on compile-helper |
| plugin_path_forwards_model_to_callAicCompile_sixth_param | Plugin-path `require` of `aic-prompt-compile` forwards trimmed `model` as sixth argument to `callAicCompile` |
| pnpm_test_claude_suites | Root `pnpm test` executes all Claude `aic-*.test.cjs` and `install.test.cjs` |

## Acceptance Criteria

- [ ] `plugin-scripts-reexport.test.cjs` enforces export shape per filename rule in Step 1
- [ ] `aic-prompt-compile-plugin-path.test.cjs` exists and passes standalone `node` invocation
- [ ] Root `package.json` `scripts.test` includes every segment from Step 3
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries in any touched file
- [ ] Single-line `//` comments only in new code, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work, stop. List the adaptations, report to the user, and re-evaluate before continuing.
