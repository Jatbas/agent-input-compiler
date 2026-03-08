# Task 119: Update notification (version check)

> **Status:** Done
> **Phase:** 1.0 — OSS Release
> **Layer:** mcp
> **Depends on:** npm publish pipeline (so package is on registry)

## Goal

Notify users when a newer AIC version is available: show "Update available: x.y.z" in "show aic status" and inject a one-line message at session start. Use a 24h cache and Node fetch to the npm registry; enforce security (validate version string, bound response, fixed-format message only).

## Architecture Notes

- MCP-only: no shared interface, no pipeline change. New module in mcp/src/ uses Node fetch and fs; server wires it at startup and in status resource.
- Security: timeout 2s, max body 1MB, semver regex for version string (max 32 chars). Never write raw registry content; only fixed-format message with validated version. Writes only under .aic/ with fixed filenames. Validate cache when reading. Document in security.md §Update check.
- .aic/ permissions: create version-check-cache.json and update-available.txt with same 0700 policy as existing .aic/ usage.
- Session start: AIC-session-init.cjs reads .aic/update-available.txt (project root from CURSOR_PROJECT_DIR or process.cwd()); if non-empty, appends to additional_context so the model sees it once per session.

## Files

| Action | Path                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------- |
| Create | `mcp/src/latest-version-check.ts`                                                                                 |
| Create | `mcp/src/__tests__/latest-version-check.test.ts`                                                                  |
| Modify | `mcp/src/server.ts` (read current version, start background version check, add updateAvailable to status payload) |
| Modify | `.cursor/hooks/AIC-session-init.cjs` (read .aic/update-available.txt, append to additional_context if present)    |
| Modify | `mcp/hooks/AIC-session-init.cjs` (same change as .cursor copy)                                                    |
| Modify | `.cursor/rules/aic-architect.mdc` (add updateAvailable row to "show aic status" table)                            |
| Modify | `documentation/security.md` (add §Update check security)                                                          |

## Wiring / Module API

**latest-version-check.ts** exports:

- `getUpdateInfo(projectRoot: AbsolutePath, packageName: string, currentVersion: string, clock: Clock): Promise<{ updateAvailable: string | null; currentVersion: string }>`  
  Reads .aic/version-check-cache.json; if missing or lastCheck older than 24h (using clock.durationMs(lastCheck, clock.now()) > CACHE_TTL_MS), fetches from `https://registry.npmjs.org/${packageName}`, validates response (timeout 2s, max body 1MB, semver regex for dist-tags.latest), writes cache with lastCheck = clock.now(). Compares latest vs current with minimal semver compare (x.y.z). If latest > current, writes .aic/update-available.txt with fixed-format line; otherwise removes file or writes empty. Returns updateAvailable (version string or null) and currentVersion. All errors yield updateAvailable null. No Date.now() or new Date() — use Clock only (determinism).

- `isValidVersionString(s: string): boolean` — strict semver regex, max length 32.

- `compareVersions(a: string, b: string): number` — returns 1 if a > b, -1 if a < b, 0 if equal (x.y.z numeric compare).

**server.ts** (existing): In createMcpServer, after scope/session setup, read current version from package.json (path from import.meta.url: dirname of server.js → ../package.json). Start background version check: setImmediate(() => getUpdateInfo(projectRoot, packageName, currentVersion, scope.clock).then(...).catch(() => {})). Store result in module-level or closure variable. In server.resource("status", ...), include updateAvailable from that result (or null if not yet available). Ensure .aic/ exists before version check (createProjectScope already ensures it).

**AIC-session-init.cjs**: After building bullets from AIC-architect.mdc, resolve project root: `const projectRoot = process.env.CURSOR_PROJECT_DIR || process.env.AIC_PROJECT_ROOT || process.cwd()`. Path to message file: `path.join(projectRoot, '.aic', 'update-available.txt')`. If file exists and fs.readFileSync(..., 'utf8').trim() is non-empty, append `\n${thatContent}` to additional_context before JSON.stringify output. Catch and ignore file read errors.

## Dependent Types

- **Clock** — `shared/src/core/interfaces/clock.interface.ts` — now(), addMinutes(), durationMs() — injected for cache lastCheck and 24h staleness.
- **AbsolutePath** — `shared/src/core/types/paths.ts` — branded path for projectRoot; use for .aic/ resolution.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create mcp/src/latest-version-check.ts

Implement:

- `isValidVersionString(s: string): boolean` — regex: `^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$`, and `s.length <= 32`.
- `compareVersions(a: string, b: string): number` — parse x.y.z (and optional pre/build), compare major, minor, patch numerically; return 1, -1, or 0.
- Constants: `CACHE_FILENAME = "version-check-cache.json"`, `MESSAGE_FILENAME = "update-available.txt"`, `CACHE_TTL_MS = 24 * 60 * 60 * 1000`, `REGISTRY_BASE = "https://registry.npmjs.org"`, `FETCH_TIMEOUT_MS = 2000`, `MAX_BODY_BYTES = 1_000_000`.
- `getUpdateInfo(projectRoot, packageName, currentVersion, clock)`: Resolve .aic dir with path.join(projectRoot, '.aic'). Cache path = .aic/version-check-cache.json. If cache exists, read JSON; if lastCheck is within 24h (clock.durationMs(lastCheck, clock.now()) <= CACHE_TTL_MS) and latestVersion/currentVersion are valid (isValidVersionString), use cached latestVersion; else fetch. Fetch: `fetch(\`${REGISTRY_BASE}/${packageName}\`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })`, then `response.arrayBuffer()`, check `byteLength <= MAX_BODY_BYTES`, else treat as failure. Parse JSON, read `body['dist-tags']?.latest`; validate with isValidVersionString. Write cache { lastCheck: clock.now(), latestVersion, currentVersion }. Compare with compareVersions(latestVersion, currentVersion). If > 0, write .aic/update-available.txt with single line: `Update available: ${latestVersion}. Re-run the install link to update.` (fixed format; no raw registry content). Else write empty file or remove. Return { updateAvailable: latest > current ? latestVersion : null, currentVersion }. On any throw or invalid data, return { updateAvailable: null, currentVersion }. Use ensureAicDir or ensure .aic exists before writing (path.join(projectRoot, '.aic') and fs.mkdirSync(..., { recursive: true, mode: 0o700 }) if not exists). No Date.now() or new Date() — use clock only.

**Verify:** pnpm typecheck passes. Exported functions have explicit return types.

### Step 2: Wire version check in mcp/src/server.ts

- Read package name and version once at top of createMcpServer (or at start of function): resolve package.json path from import.meta.url (fileURLToPath(import.meta.url), then path.join(dirname, '..', 'package.json')). Read with fs.readFileSync, JSON.parse; extract `name` and `version`. If read fails, use fallback currentVersion = "0.0.0" and packageName from a constant so status still works.
- After installTriggerRule/installCursorHooks and runStartupSelfCheck, declare a variable: `let updateInfo: { updateAvailable: string | null; currentVersion: string } = { updateAvailable: null, currentVersion: packageVersion }`).
- Call `setImmediate(() => { getUpdateInfo(projectRoot, packageName, packageVersion, scope.clock).then((info) => { updateInfo = info; }).catch(() => {}); });`.
- In server.resource("status", ...), when building the JSON payload, add `updateAvailable: updateInfo.updateAvailable` to the object passed to JSON.stringify (same level as budgetMaxTokens, budgetUtilizationPct).

**Verify:** pnpm typecheck passes. Status resource handler includes updateAvailable. In server.test.ts, add a test that mocks getUpdateInfo (or the version-check module) to resolve with updateAvailable "0.2.2", then requests the status resource and asserts the response JSON includes updateAvailable: "0.2.2".

### Step 3: Session-start hook reads update message

In .cursor/hooks/AIC-session-init.cjs and mcp/hooks/AIC-session-init.cjs:

- After building `bullets` and before building `additional_context`, resolve project root: `const projectRoot = process.env.CURSOR_PROJECT_DIR || process.env.AIC_PROJECT_ROOT || process.cwd();`
- Message file path: `const updatePath = path.join(projectRoot, '.aic', 'update-available.txt');`
- In try block: if `fs.existsSync(updatePath)`, read content with `fs.readFileSync(updatePath, 'utf8').trim()`. If non-empty, append `\n${content}` to the string that becomes additional_context (after bullets, before conversationLine or at end). Use the same try/catch so file read errors do not break the hook (exit 0).

**Verify:** Both hook files updated identically. Hook still outputs valid JSON when .aic/update-available.txt is missing or empty.

### Step 4: Add updateAvailable to "show aic status" in aic-architect.mdc

In the table for "show aic status", add one row:

| updateAvailable | Update available | version or "—" |

Place after installationNotes row.

**Verify:** Rule file is valid markdown.

### Step 5: Add §Update check security to documentation/security.md

Add a new subsection under Security Architecture or Data Handling titled "Update check (version notification)". Content:

- Data source: GET https://registry.npmjs.org/<package> (fixed URL).
- Validate and bound: timeout 2s, max response body 1MB, version string must match semver regex and max 32 chars; invalid data yields no update.
- No code/prompt injection: only fixed-format message with validated version; install link from our code only.
- Writes only under .aic/ (version-check-cache.json, update-available.txt); no user/registry input in paths.
- No SSRF: fixed registry URL.
- Cache: validate version strings when reading cache before use.
- HTTPS only, default TLS verification.
- No sensitive data sent to registry.

**Verify:** Section is clearly scannable (bullets or short paragraphs).

### Step 6: Create mcp/src/**tests**/latest-version-check.test.ts

Tests:

- isValidVersionString_accepts_semver: "0.2.1", "1.0.0-alpha" return true.
- isValidVersionString_rejects_long: string length 33 with valid format returns false.
- isValidVersionString_rejects_invalid: "v0.2.1", "0.2", "" return false.
- compareVersions_gt: compareVersions("0.2.2", "0.2.1") === 1.
- compareVersions_lt: compareVersions("0.2.1", "0.2.2") === -1.
- compareVersions_eq: compareVersions("0.2.1", "0.2.1") === 0.
- getUpdateInfo_when_fetch_fails_returns_null: Mock fetch to reject; call getUpdateInfo with temp projectRoot; assert result.updateAvailable === null.
- getUpdateInfo_when_cache_fresh_uses_cache: Create .aic/version-check-cache.json with lastCheck within 24h, latestVersion "0.2.2", currentVersion "0.2.1"; call getUpdateInfo; assert updateAvailable === "0.2.2" (and no fetch call if possible, or mock fetch to assert not called).

Use vitest, temp dirs for projectRoot. Mock fetch with vi.stubGlobal or by passing a fetch-like dependency if the module accepts it; otherwise use vi.spyOn(globalThis, 'fetch').

**Verify:** pnpm vitest run mcp/src/**tests**/latest-version-check.test.ts — all pass.

### Step 7: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                | Description                                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| isValidVersionString_accepts_semver      | Valid x.y.z and prerelease pass                                                                       |
| isValidVersionString_rejects_long        | Length > 32 fails                                                                                     |
| isValidVersionString_rejects_invalid     | Non-semver strings fail                                                                               |
| compareVersions_gt_lt_eq                 | Correct 1 / -1 / 0 for greater/less/equal                                                             |
| getUpdateInfo_fetch_fail_returns_null    | Network error yields updateAvailable null                                                             |
| getUpdateInfo_fresh_cache_used           | Cache within 24h used, updateAvailable from cache                                                     |
| status_resource_includes_updateAvailable | server.test.ts: mock or trigger version check, read aic://status, assert JSON has updateAvailable key |

## Acceptance Criteria

- [ ] mcp/src/latest-version-check.ts created with getUpdateInfo, isValidVersionString, compareVersions; security constraints (timeout, max body, validation) implemented
- [ ] mcp/src/server.ts reads package version, starts background version check, adds updateAvailable to status resource
- [ ] .cursor/hooks/AIC-session-init.cjs and mcp/hooks/AIC-session-init.cjs read .aic/update-available.txt and append to additional_context when present
- [ ] .cursor/rules/aic-architect.mdc has updateAvailable row in status table
- [ ] documentation/security.md has §Update check security
- [ ] All tests pass
- [ ] pnpm lint — zero errors, zero warnings
- [ ] pnpm typecheck — clean
- [ ] pnpm knip — no new unused files, exports, or dependencies
- [ ] No Date.now() or new Date() in latest-version-check — inject Clock, use clock.now() for cache lastCheck and clock.durationMs() for 24h staleness check

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
