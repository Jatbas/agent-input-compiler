# AIC_DEV_MODE in .env and Cursor preToolUse Hook

**Date:** 2026-03-17  
**Context:** User has `AIC_DEV_MODE=1` in project `.env`; gate blocking behavior under investigation.

## Summary

The preToolUse hook (`AIC-require-aic-compile.cjs`) **only reads `process.env.AIC_DEV_MODE`**. It does **not** load the project `.env` file. So `AIC_DEV_MODE=1` in `.env` has no effect unless some other mechanism has already loaded that file into the hook process environment.

## Verified Facts

1. **Hook implementation** (`integrations/cursor/hooks/AIC-require-aic-compile.cjs` lines 11–15):
   - Checks `process.env.AIC_DEV_MODE === "1"` and, if true, allows and exits.
   - No `require("dotenv")`, no `fs.readFileSync(".env")`, no parsing of any `.env` file.

2. **Documentation** (CONTRIBUTING.md):
   - Says: "Add to your shell rc, **or create a .env file in the repo root**" and "For Cursor, you can also launch it as `AIC_DEV_MODE=1 cursor .`".
   - The comment in the hook says: "set AIC_DEV_MODE=1 in env or .env".

3. **Codebase**:
   - No use of `dotenv` or similar in `integrations/cursor/`; no code in the hook chain loads project `.env` into `process.env`.

## Implication When User Has AIC_DEV_MODE=1 in .env

- If the user **still sees** tool blocking ("You must call the aic_compile MCP tool FIRST..."), then the hook process never received `AIC_DEV_MODE=1`. That is consistent with the hook not loading `.env` and Cursor (as far as we can tell) not injecting project `.env` into the preToolUse hook process environment.
- If the user **does not** see blocking, then Cursor (or something in the chain) is providing `AIC_DEV_MODE=1` to the hook (e.g. by loading `.env` or inheriting from a process that did). Our repo does not document or guarantee that.

## Does Cursor Load Project .env for Hooks?

- **Not documented in the AIC repo.** There is no code or doc that states Cursor loads the project root `.env` when spawning hook subprocesses.
- **Reliable alternatives today:** Export in shell (`export AIC_DEV_MODE=1`) or launch Cursor with env set (`AIC_DEV_MODE=1 cursor .` from repo root), so the variable is in the environment Cursor inherits and passes to hooks.

## Recommendation

1. **Make .env effective for the gate:** In `AIC-require-aic-compile.cjs`, if `process.env.AIC_DEV_MODE` is not already set (or not `"1"`), **load project `.env` once** from the project root and re-check `AIC_DEV_MODE`:
   - Project root: `process.env.CURSOR_PROJECT_DIR || process.cwd()`.
   - Read `path.join(projectRoot, ".env")` if the file exists; parse only simple `KEY=value` lines (no `dotenv` dependency); set `process.env.AIC_DEV_MODE` if the line `AIC_DEV_MODE=1` (or similar) is present; then run the existing `process.env.AIC_DEV_MODE === "1"` check.
   - This makes "AIC_DEV_MODE=1 in .env" work regardless of whether Cursor injects `.env`.

2. **Documentation:** In CONTRIBUTING.md and the hook comment, state that the hook will read `AIC_DEV_MODE` from the project root `.env` when not set in the environment, so that "create a .env file in the repo root" is accurate.

3. **Optional:** Document that Cursor’s behavior (whether it loads project `.env` for hooks) is unknown; the above change makes the repo self-sufficient.

## Follow-up for Task Planning

If implementing the above:

- **Recipe:** general-purpose (hook script change + minimal .env parsing, no new interface).
- **Scope:** one file change (`AIC-require-aic-compile.cjs`): add a small function to read and parse `.env` from project root only for `AIC_DEV_MODE`, then keep existing allow/deny logic.
- **Tests:** unit test that when `.env` contains `AIC_DEV_MODE=1` and `process.env.AIC_DEV_MODE` is unset, the hook allows; when `.env` is missing or lacks that line, behavior unchanged (or still denies when aic_compile state is missing).
