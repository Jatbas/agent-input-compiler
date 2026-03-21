# Session start lock and session context marker

## When to update this document

Update this document when:

- You change `integrations/shared/session-markers.cjs` exports, lock or marker paths, or the filesystem primitives used for mutual exclusion or marker writes.
- You change Claude hook responsibilities or ordering for SessionStart, UserPromptSubmit, or SessionEnd as they relate to the lock or marker.
- You change stale lock recovery rules or tests in `integrations/shared/__tests__/session-markers.test.cjs`.
- You merge or replace the two `.aic/` paths with a single artifact; rewrite this document to describe the new layout.
- Inventory and caller details for shared modules live in [Integrations shared modules reference](integrations-shared-modules.md); update that document when those change.

## Scope

This document describes `.aic/.session-start-lock` and `.aic/.session-context-injected`: roles, writers, readers, and Claude hook ordering. It records why the repository keeps two separate paths instead of one merged file.

JSONL caches (`session-models.jsonl`, `prompt-log.jsonl`, `session-log.jsonl`) and edited-files temp storage under `os.tmpdir()` are documented in [AIC JSONL caches under `.aic/`](aic-jsonl-caches.md).

## Layout

| Path                             | Role                                                       | Writers                                                                                   | Readers                                                | Notes                                 |
| -------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------- |
| `.aic/.session-start-lock`       | Exclusive SessionStart-in-progress lock                    | `acquireSessionLock` creates with `fs.openSync(path, "wx")`; `releaseSessionLock` unlinks | none                                                   | `wx` fails if the path already exists |
| `.aic/.session-context-injected` | Records `session_id` after successful SessionStart compile | `writeSessionMarker` after `callAicCompile` succeeds                                      | `isSessionAlreadyInjected` in `aic-prompt-compile.cjs` | Trimmed UTF-8 equals `session_id`     |

Implementation: `integrations/shared/session-markers.cjs` (mirrored under `.cursor/hooks/session-markers.cjs`). Exports: `acquireSessionLock`, `releaseSessionLock`, `writeSessionMarker`, `readSessionMarker`, `clearSessionMarker`, `isSessionAlreadyInjected`.

**Hook order (Claude Code):**

- **SessionStart** (`aic-session-start.cjs`): `acquireSessionLock` returns false → exit; on success, `callAicCompile`, then on success `writeSessionMarker`; `finally` always `releaseSessionLock`.
- **UserPromptSubmit** (`aic-prompt-compile.cjs`): `isSessionAlreadyInjected` only; no lock acquire or release.
- **SessionEnd** (`aic-session-end.cjs`): `clearSessionMarker`, then `releaseSessionLock`.

Product rationale for the marker file when SessionStart output is dropped is in [Claude Code integration layer](claude-code-integration-layer.md) §7.2.

## Mechanisms

- **Lock:** `fs.openSync(lockPath, "wx")` requests exclusive create. Node.js documents `wx` in the File system flags section of the Node.js `fs` API reference.
- **Marker:** `fs.writeFileSync` writes the marker with the current `session_id` after SessionStart succeeds.

## Stale lock recovery

When `acquireSessionLock` cannot create the lock (`wx` fails), the implementation checks whether the marker exists with non-empty trimmed content. When true, it removes the lock path with `unlinkSync` (errors ignored) and returns `false`. The next `acquireSessionLock` call can succeed. `integrations/shared/__tests__/session-markers.test.cjs` includes `stale_lock_recovery` for this behavior.

## Cursor versus Claude paths

`integrations/claude/hooks/` requires `session-markers.cjs` for SessionStart, SessionEnd, and prompt compile. `integrations/cursor/hooks/` does not import `session-markers.cjs`. Cursor uses per-generation files under `os.tmpdir()` for gate and prewarm; see [Cursor integration layer](cursor-integration-layer.md) §7.2 and §7.3. The `.aic` marker pair belongs to the Claude Code integration path in this repository.

## Constraints on merging into one file

The lock serializes concurrent SessionStart work. The marker records which `session_id` received SessionStart context for the UserPromptSubmit fallback. One path must still encode mutual exclusion and completed injection without ambiguity.

POSIX states that when `rename` replaces an existing file name, the old file is removed ([POSIX `rename`](https://pubs.opengroup.org/onlinepubs/9699919799/functions/rename.html)). Same-directory replacement gives atomic visibility of the new content to readers that open the final path. A merged design needs explicit state transitions, crash behavior, and tests; `rename` from a temp file in the same directory is preferable over in-place truncation when the body must appear atomically.

SessionEnd clears the marker then releases the lock. UserPromptSubmit reads the marker without holding the lock. A merged-file design must keep: after SessionEnd, `isSessionAlreadyInjected` is false until a new successful SessionStart writes state for the new session.

Stale lock recovery today ties lock deletion to a non-empty marker. A merged artifact needs equivalent rules so a crash cannot leave the system blocked indefinitely.

The repository keeps two paths under `.aic/` for the lock and the session-context marker. A single-file design would need a defined state machine, atomic replacement, full interleaving tests, and documented Windows behavior for the chosen primitives.

## Related documentation

- [Integrations shared modules reference](integrations-shared-modules.md)
- [Claude Code integration layer](claude-code-integration-layer.md)
- [Cursor integration layer](cursor-integration-layer.md)
- [AIC JSONL caches under `.aic/`](aic-jsonl-caches.md)
- [MCP server and shared CJS boundary](mcp-and-shared-cjs-boundary.md)
