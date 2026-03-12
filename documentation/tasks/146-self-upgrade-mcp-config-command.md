# Task 146: Self-upgrade MCP config command

> **Status:** Pending
> **Phase:** AA (Reliable Version Updates)
> **Layer:** mcp
> **Depends on:** AA01 (Install link uses @latest tag)

## Goal

On startup, if the global `~/.cursor/mcp.json` `aic` entry uses `npx -y @jatbas/aic` (without `@latest`), automatically rewrite it to `npx -y @jatbas/aic@latest` so existing users get reliable updates without manual config edits. Only the `args` array in the aic entry is modified; all other config and keys are preserved. Log the migration to stderr. Skip when args already contain `@latest` or a pinned version, or when the command is not `npx`.

## Architecture Notes

- MCP layer may use Node.js APIs (node:fs, node:path); no new dependencies or ESLint changes.
- Only touch the global config file (`~/.cursor/mcp.json`). Never modify workspace `.cursor/mcp.json` at runtime (Cursor would kill the server).
- Build a new config object with spread when upgrading; do not mutate the parsed object in place (immutability).
- Matches existing MCP startup utilities (detect-install-scope, latest-version-check): sync, single responsibility, testable in isolation.

## Files

| Action | Path |
| ------ | ---- |
| Create | `mcp/src/upgrade-global-mcp-config-if-needed.ts` |
| Create | `mcp/src/__tests__/upgrade-global-mcp-config-if-needed.test.ts` |
| Modify | `mcp/src/server.ts` (call upgradeGlobalMcpConfigIfNeeded at startup) |

## Interface / Signature

This component does not implement a core interface. It exports a single function used at MCP startup.

Config shape read/written (parsed type):

```typescript
{ mcpServers?: Record<string, { command?: string; args?: string[] }> }
```

Exported function:

```typescript
export function upgradeGlobalMcpConfigIfNeeded(homeDir: string): void
```

Behavior: Read `path.join(homeDir, ".cursor", "mcp.json")`. If the file does not exist or is invalid JSON, return without writing. Otherwise parse the JSON and find the key in `mcpServers` whose name lower-cased is `"aic"`. If there is no such key, or the entry does not have `command === "npx"` and `args` that are exactly the two-element array `["-y", "@jatbas/aic"]`, return without writing. If any arg contains `@latest` or matches a pinned semver pattern (`@0.6.3`), return without writing. Otherwise build a new config object with spread: `updated = { ...parsed, mcpServers: { ...parsed.mcpServers, [aicKey]: { ...entry, args: ["-y", "@jatbas/aic@latest"] } } }`, write the file with `fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), "utf8")`, and write to stderr: `[aic] Updated ~/.cursor/mcp.json to use @jatbas/aic@latest. Reload Cursor to use the new version.\n`. Use `fs.readFileSync(configPath, "utf8")` and `fs.existsSync(configPath)`; guard `parsed.mcpServers` and `entry.command` / `entry.args` with optional chaining and explicit checks (Array.isArray, length, element values). Use sync APIs only.

## Dependent Types

No types from shared/core. The implementation uses only the JSON shape above and Node built-ins.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Implement upgradeGlobalMcpConfigIfNeeded

Create `mcp/src/upgrade-global-mcp-config-if-needed.ts`. Implement `upgradeGlobalMcpConfigIfNeeded(homeDir: string): void`. Use `path.join(homeDir, ".cursor", "mcp.json")` as the config path. If `!fs.existsSync(configPath)` return. Read with `fs.readFileSync(configPath, "utf8")`. In a try block, `JSON.parse(raw)`; on catch return (invalid JSON). If `parsed.mcpServers === undefined` return. Find the key in `Object.keys(parsed.mcpServers)` such that `key.toLowerCase() === "aic"`; if none, return. Let `entry = parsed.mcpServers[aicKey]`. If `entry?.command !== "npx"` return. If `!Array.isArray(entry.args) || entry.args.length !== 2 || entry.args[0] !== "-y" || entry.args[1] !== "@jatbas/aic"` return. If `entry.args.some((a: string) => a.includes("@latest"))` return. If `entry.args.some((a: string) => /@\d+\.\d+\.\d+/.test(a))` return (pinned version). Build `const updated = { ...parsed, mcpServers: { ...parsed.mcpServers, [aicKey]: { ...entry, args: ["-y", "@jatbas/aic@latest"] } } }`. Call `fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), "utf8")`. Call `process.stderr.write("[aic] Updated ~/.cursor/mcp.json to use @jatbas/aic@latest. Reload Cursor to use the new version.\n")`. Import `node:fs` and `node:path` only.

**Verify:** File exists; `pnpm typecheck` passes.

### Step 2: Call upgrade at startup in server.ts

In `mcp/src/server.ts`, inside `createMcpServer`, after the line that calls `detectInstallScope(os.homedir(), projectRoot)`, add a call to `upgradeGlobalMcpConfigIfNeeded(os.homedir())`. Add the import for `upgradeGlobalMcpConfigIfNeeded` from `./upgrade-global-mcp-config-if-needed.js`.

**Verify:** `pnpm typecheck` passes; no new lint errors.

### Step 3: Add tests

Create `mcp/src/__tests__/upgrade-global-mcp-config-if-needed.test.ts`. Use a temp directory as `homeDir` with `fs.mkdtempSync(path.join(os.tmpdir(), "aic-upgrade-"))`. Create `.cursor` subdir and `mcp.json` as needed. In tests that expect stderr output, capture stderr by wrapping `process.stderr.write` or by using a vitest spy. Implement:

- `rewrites_args_when_global_config_has_npx_aic_without_latest`: Write mcp.json with `mcpServers.aic` having `command: "npx"` and `args: ["-y", "@jatbas/aic"]`. Call `upgradeGlobalMcpConfigIfNeeded(homeDir)`. Assert the file content (after re-read and parse) has `mcpServers.aic.args` equal to `["-y", "@jatbas/aic@latest"]`. Assert stderr was written with the expected message substring.
- `skips_when_args_already_contain_latest`: Write mcp.json with `args: ["-y", "@jatbas/aic@latest"]`. Call the function. Assert args in file are unchanged.
- `skips_when_pinned_version`: Write mcp.json with `args: ["-y", "@jatbas/aic@0.6.3"]`. Call the function. Assert args unchanged.
- `skips_when_command_not_npx`: Write mcp.json with `command: "tsx"`, `args: ["mcp/src/server.ts"]`. Call the function. Assert file content unchanged (command and args).
- `skips_when_no_aic_entry`: Write mcp.json with `mcpServers: { other: {} }`. Call the function. Assert file unchanged.
- `skips_when_file_missing`: Call the function with a temp home that has no `.cursor` or no `mcp.json`. Assert no throw; no file created.
- `skips_when_invalid_json`: Write non-JSON content to mcp.json. Call the function. Assert no throw; file content unchanged (do not overwrite with valid JSON).

Clean up temp dirs in afterEach.

**Verify:** `pnpm test mcp/src/__tests__/upgrade-global-mcp-config-if-needed.test.ts` passes.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| rewrites_args_when_global_config_has_npx_aic_without_latest | After upgrade, file has args ["-y", "@jatbas/aic@latest"] and stderr message written |
| skips_when_args_already_contain_latest | Args already @latest; file unchanged |
| skips_when_pinned_version | Args contain @0.6.3; file unchanged |
| skips_when_command_not_npx | Command is tsx; file unchanged |
| skips_when_no_aic_entry | No aic key in mcpServers; file unchanged |
| skips_when_file_missing | No .cursor/mcp.json; no throw, no write |
| skips_when_invalid_json | mcp.json is not JSON; no throw, file not overwritten |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] upgradeGlobalMcpConfigIfNeeded implements the behavior above; server.ts calls it at startup
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] Config upgrade uses spread (no mutation of parsed object)
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
