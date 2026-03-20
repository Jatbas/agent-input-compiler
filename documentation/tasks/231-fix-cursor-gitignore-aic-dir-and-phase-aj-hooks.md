# Task 231: Fix Cursor gitignore for aic-dir and commit Phase AJ hooks

> **Status:** Pending
> **Phase:** AJ (integrations)
> **Layer:** integrations
> **Depends on:** Phase AJ shared utilities deployed to `integrations/shared/`

## Goal

Stop `.cursor/hooks/aic-dir.cjs` from being treated as ignored on macOS when `core.ignorecase=true`, sync tracked `.cursor/hooks/` copies from `integrations/shared/`, align `ensureAicDir` ignore entries with the same negation for consumer project roots, add regression tests, and land one commit with the hook deploy plus `.gitignore` fix.

## Architecture Notes

- Root cause: `.cursor/hooks/AIC-*.cjs` in `.gitignore` matches `aic-dir.cjs` when Git compares patterns case-insensitively; `!.cursor/hooks/aic-dir.cjs` after that pattern restores trackability.
- `integrations/cursor/install.cjs` copies every `integrations/shared/*.cjs` into `.cursor/hooks/` with no `require("../../shared/` rewrite; tracked hook files under `.cursor/hooks/` must match those sources byte-for-byte for shared utilities.
- `AIC_IGNORE_ENTRIES` in `shared/src/storage/ensure-aic-dir.ts` drives `.gitignore`, `.prettierignore`, and `.eslintignore`; append `!.cursor/hooks/aic-dir.cjs` immediately after `.cursor/hooks/AIC-*.cjs` in that array so `aic init` fixes the same macOS hazard in downstream projects.
- One-line comment in `ensure-aic-dir.ts` next to the new entry: state that Git ignorecase can match `aic-dir.cjs` to the `AIC-*.cjs` glob.

## Before / After Behavior

- **Before:** `git check-ignore -q .cursor/hooks/aic-dir.cjs` exits 0 in the AIC repo on macOS with default `core.ignorecase`; `aic-dir.cjs` cannot be added to the index. Consumer projects that received only `.cursor/hooks/AIC-*.cjs` from `ensureAicDir` hit the same issue.
- **After:** `git check-ignore -q .cursor/hooks/aic-dir.cjs` exits 1 from the repository root. Fresh temp dirs after `ensureAicDir` include both `.cursor/hooks/AIC-*.cjs` and `!.cursor/hooks/aic-dir.cjs` in `.gitignore` when entries are appended.

## Files

| Action | Path                                                                                       |
| ------ | ------------------------------------------------------------------------------------------ |
| Modify | `.gitignore` (insert `!.cursor/hooks/aic-dir.cjs` on the line immediately after `.cursor/hooks/AIC-*.cjs`) |
| Modify | `.cursor/hooks/prompt-log.cjs` (overwrite from `integrations/shared/prompt-log.cjs`)     |
| Modify | `.cursor/hooks/session-log.cjs` (overwrite from `integrations/shared/session-log.cjs`)     |
| Modify | `.cursor/hooks/session-model-cache.cjs` (overwrite from `integrations/shared/session-model-cache.cjs`) |
| Modify | `shared/src/storage/ensure-aic-dir.ts` (extend `AIC_IGNORE_ENTRIES` with negation line after AIC glob; short `//` comment why) |
| Modify | `shared/src/storage/__tests__/ensure-aic-dir.test.ts` (add regression test: existing `.gitignore` contains `.cursor/hooks/AIC-*.cjs` but not the negation — after `ensureAicDir`, negation is present and appears after the AIC glob line) |
| Create | `.cursor/hooks/conversation-id.cjs` (copy from `integrations/shared/conversation-id.cjs`)  |
| Create | `.cursor/hooks/resolve-project-root.cjs` (copy from `integrations/shared/resolve-project-root.cjs`) |
| Create | `.cursor/hooks/aic-dir.cjs` (copy from `integrations/shared/aic-dir.cjs`)                  |
| Create | `integrations/cursor/__tests__/gitignore-aic-dir-tracked.test.cjs`                       |
| Modify | `package.json` (append `node integrations/cursor/__tests__/gitignore-aic-dir-tracked.test.cjs` to the `test` script after the last `node integrations/...` invocation, before the closing quote) |

## Dependent Types

No TypeScript types are added or changed by this task.

## Config Changes

- **shared/package.json:** no change
- **eslint.config.mjs:** no change

## Steps

### Step 1: Root `.gitignore` negation

Open `.gitignore`. On the line immediately after `.cursor/hooks/AIC-*.cjs`, insert a new line containing exactly `!.cursor/hooks/aic-dir.cjs`.

**Verify:** Run `git check-ignore -q .cursor/hooks/aic-dir.cjs` from the repository root. Expected: process exits with status 1 (path not ignored). Git evaluates the path against ignore rules without requiring the file on disk.

### Step 2: Sync `prompt-log.cjs`

Replace the full contents of `.cursor/hooks/prompt-log.cjs` with the full contents of `integrations/shared/prompt-log.cjs` (binary-identical copy).

**Verify:** `rg 'require\\(\"./aic-dir.cjs\"\\)' .cursor/hooks/prompt-log.cjs` returns a match.

### Step 3: Sync `session-log.cjs`

Replace the full contents of `.cursor/hooks/session-log.cjs` with the full contents of `integrations/shared/session-log.cjs`.

**Verify:** `rg 'require\\(\"./aic-dir.cjs\"\\)' .cursor/hooks/session-log.cjs` returns a match.

### Step 4: Sync `session-model-cache.cjs`

Replace the full contents of `.cursor/hooks/session-model-cache.cjs` with the full contents of `integrations/shared/session-model-cache.cjs`.

**Verify:** `rg 'require\\(\"./aic-dir.cjs\"\\)' .cursor/hooks/session-model-cache.cjs` returns a match.

### Step 5: Add `conversation-id.cjs`

Copy `integrations/shared/conversation-id.cjs` to `.cursor/hooks/conversation-id.cjs` (create or overwrite).

**Verify:** `rg conversationIdFromTranscriptPath .cursor/hooks/conversation-id.cjs` returns a match.

### Step 6: Add `resolve-project-root.cjs`

Copy `integrations/shared/resolve-project-root.cjs` to `.cursor/hooks/resolve-project-root.cjs` (create or overwrite).

**Verify:** `rg resolveProjectRoot .cursor/hooks/resolve-project-root.cjs` returns a match.

### Step 7: Add `aic-dir.cjs`

Copy `integrations/shared/aic-dir.cjs` to `.cursor/hooks/aic-dir.cjs` (create or overwrite).

**Verify:** `rg 'getAicDir|ensureAicDir|appendJsonl' .cursor/hooks/aic-dir.cjs` returns at least three matches across those names.

### Step 8: Extend `AIC_IGNORE_ENTRIES`

In `shared/src/storage/ensure-aic-dir.ts`, add `"!.cursor/hooks/aic-dir.cjs"` as the array element immediately after `".cursor/hooks/AIC-*.cjs"`. Add one `//` comment on the line above the new entry explaining that Git with `core.ignorecase` matches lowercase `aic-dir.cjs` to the `AIC-*.cjs` glob.

**Verify:** `pnpm exec eslint shared/src/storage/ensure-aic-dir.ts` exits 0.

### Step 9: Storage regression test

In `shared/src/storage/__tests__/ensure-aic-dir.test.ts`, add one new `it("ensure_aic_dir_negation_appends", ...)` that: creates a temp directory, writes a `.gitignore` whose body is exactly `node_modules/\n.cursor/hooks/AIC-*.cjs\n`, calls `ensureAicDir(toAbsolutePath(tmp))`, reads `.gitignore`, asserts the content includes `!.cursor/hooks/aic-dir.cjs`, and asserts the first index of `.cursor/hooks/AIC-*.cjs` is less than the first index of `!.cursor/hooks/aic-dir.cjs`.

**Verify:** `pnpm exec vitest run shared/src/storage/__tests__/ensure-aic-dir.test.ts` exits 0.

### Step 10: Repository gitignore integration test

Create `integrations/cursor/__tests__/gitignore-aic-dir-tracked.test.cjs` as a strict CommonJS script that defines `repoRoot` as `path.resolve(__dirname, "..", "..", "..")`, reads `path.join(repoRoot, ".gitignore")` as UTF-8, splits on newlines, finds the trimmed line index of `.cursor/hooks/AIC-*.cjs` and of `!.cursor/hooks/aic-dir.cjs`, throws if either is missing or if the negation index is not greater than the AIC index, then runs `spawnSync("git", ["check-ignore", "-q", ".cursor/hooks/aic-dir.cjs"], { cwd: repoRoot, encoding: "utf8" })` and throws if `status !== 1`. Log a single success line and exit 0 on pass. Use only `node:fs`, `node:path`, and `node:child_process`.

**Verify:** `node integrations/cursor/__tests__/gitignore-aic-dir-tracked.test.cjs` exits 0.

### Step 11: Wire test into `pnpm test`

Edit root `package.json` `scripts.test` string: append ` && node integrations/cursor/__tests__/gitignore-aic-dir-tracked.test.cjs` immediately after the last existing `node integrations/` segment.

**Verify:** `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')).scripts.test.includes('gitignore-aic-dir-tracked')"` prints `true`.

### Step 12: Final verification and commit

Run `pnpm test` and `pnpm lint`. Both exit 0 with no new warnings.

Stage only these paths: `.gitignore`, `.cursor/hooks/prompt-log.cjs`, `.cursor/hooks/session-log.cjs`, `.cursor/hooks/session-model-cache.cjs`, `.cursor/hooks/conversation-id.cjs`, `.cursor/hooks/resolve-project-root.cjs`, `.cursor/hooks/aic-dir.cjs`, `shared/src/storage/ensure-aic-dir.ts`, `shared/src/storage/__tests__/ensure-aic-dir.test.ts`, `integrations/cursor/__tests__/gitignore-aic-dir-tracked.test.cjs`, `package.json`.

Run `git status`. Unstaged changes outside those paths must be resolved separately; staged set must match the list above.

Commit with subject exactly: `chore(integrations): fix gitignore for aic-dir; commit Phase AJ cursor hook deploys`

**Verify:** `git log -1 --format=%s` prints that subject.

## Tests

| Test case                         | Description                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ensure_aic_dir_negation_appends` | New `it` in `ensure-aic-dir.test.ts` — partial `.gitignore` gains `!.cursor/hooks/aic-dir.cjs` after AIC glob |
| `gitignore_aic_dir_trackable`     | `gitignore-aic-dir-tracked.test.cjs` — repo `.gitignore` order plus `git check-ignore -q` status 1   |

## Acceptance Criteria

- [ ] All files in the Files table created or modified as specified
- [ ] `gitignore_aic_dir_trackable` and `ensure_aic_dir_negation_appends` behaviors verified
- [ ] `pnpm test` — all pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] Commit subject matches the Step 12 subject line exactly
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` outside allowed files
- [ ] No `let` in production code (only `const`; control flags in imperative closures are the sole exception)
- [ ] Single-line comments only where comments are added; explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. List the adaptations, report to the user, and re-evaluate before continuing.
