# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).
This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Cursor and Claude integration-layer guides document optional `aic_compile` agentic fields and `toolOutputs.relatedFiles` (selection + cache preimage), and note that shipped hook scripts omit `toolOutputs`

## [0.11.7] - 2026-04-02

### Fixed

- Correct sibling `require()` paths in published integration hook bundles so shared modules load after npm install

## [0.11.6] - 2026-04-02

### Added

- Weak intent fallback when the prompt is too generic for reliable file selection, with shared hook deployment from the published package

### Changed

- Remove output-format section from compiled prompts and Cursor rule documentation
- Enforce compile gate order: without devMode, require a successful `aic_compile` before other tools; rules document mandatory per-message compilation
- Inherit parent intent for Claude Code subagent compiles; strip IDE-only instruction blocks from hook-injected context
- Skip markdown paths in the command-injection guard scanner to cut false positives; ban `let` in production TypeScript via ESLint
- Extend pack-install smoke coverage and document long-running skills for Composer versus auto mode

### Fixed

- Align npm OIDC provenance metadata and publish workflow with trusted publishing requirements

## [0.11.5] - 2026-04-01

## [0.11.0] - 2026-03-31 (Deprecated)

### Added

- Standalone bundled uninstall script for global teardown (`--global` removes user-level integration artifacts and `~/.aic/`)
- SECURITY.md and CODEOWNERS for vulnerability reporting and default code ownership

### Changed

- Public documentation audit and corrected install URLs for the GitHub-hosted repository
- Dependency updates including MCP SDK and diff; Dependabot configuration for the monorepo
- Contributor agent skills: auto-mode resilience, PR review skill, planner and executor guardrails; expanded pack-install smoke tests across integration layers

### Fixed

- Claude Code stop hook invokes ESLint and TypeScript through execFileSync instead of a shell
- Add `repository`, `homepage`, `bugs`, and related manifest fields on published packages so npm trusted publishing (OIDC provenance) validates

### Security

- Upgrade Minimatch to remediate ReDoS advisories in transitive dependencies

## [0.10.2] - 2026-03-30 (Deprecated)

### Fixed

- Skip adding `aic.config.json` to project ignore manifests during bootstrap when **`devMode`** is enabled in that file so shared dev config can be committed
- Bundle the global cleanup script in the published `@jatbas/aic` package so npm-based uninstall can remove **`~/.aic/`** when **`--global`** is used
- Avoid rewriting the managed AIC block in **`CLAUDE.md`** on MCP server startup when it already matches the installed template

## [0.10.1] - 2026-03-30 (Deprecated)

### Changed

- Uninstall scripts default to project-local cleanup only; **`--global`** is required to remove user-level Cursor MCP, global Claude wiring, and **`~/.aic/`** (see [installation.md § Uninstall](documentation/installation.md#uninstall)); follow-up edits fix the environment-variables ToC anchor, clarify **`<project>`** and bundled script entrypoints, spell out uninstall project-root layering vs `resolveProjectRoot`, and add a warning before manual **`~/.aic`** deletion
- Documentation aligned with the Cursor compile-gate development bypass: `devMode` in `aic.config.json` (see [installation.md](documentation/installation.md), [CONTRIBUTING.md](CONTRIBUTING.md), and [cursor-integration-layer.md §7.3](documentation/technical/cursor-integration-layer.md)); bootstrap ignore manifest described consistently across implementation-spec, security, project-plan, and installation.

## [0.10.0] - 2026-03-29 (Deprecated)

### Added

- Bundle the Claude Code integration installer with the published `@jatbas/aic` package and detect the Claude Code extension when present

### Fixed

- Reconcile project IDs when a row for the same project root already exists in the global database

## [0.9.3] - 2026-03-29 (Deprecated)

### Added

- Add `--aic-bootstrap-integration` and `AIC_BOOTSTRAP_INTEGRATION` to select editor integrations on MCP startup, with CLI overriding env and invalid values exiting before the server starts

### Changed

- Update docs for bootstrap override precedence and wrapped dev MCP launch examples

### Fixed

- Set TypeScript `compilerOptions.target` to `ES2024` so workspace builds succeed on supported compiler targets
- Declare `@types/node` on `@jatbas/aic-core` so clean installs resolve Node typings during `tsc -b`

## [0.9.2] - 2026-03-27 (Deprecated)

### Added

- Bundle the Cursor integration installer with the published `@jatbas/aic` package so installs can run the bundled bootstrap script

### Changed

- Update Cursor installation docs and the Cursor integration-layer reference for bundled-install flows
- Align internal contributor rules and documentation tooling guidance with current practices

## [0.9.1] - 2026-03-25 (Deprecated)

### Fixed

- Enforce SQLite `foreign_keys` when opening the global database and register the homedir scope in the projects table so foreign-key rules stay satisfied
- Forward config path into the MCP compilation runner so custom `aic.config.json` locations are honored

## [0.9.0] - 2026-03-25 (Deprecated)

### Added

- Add rolling time window for status aggregates in `aic status`
- Add `--project` flag on `aic status` and `aic last` to target a workspace root
- Add shell commands for status, last, chat-summary, and projects with MCP-matching payloads
- Allow compile requests to include `toolOutputs` for prior tool results in compression
- Limit session compressor to the last ten steps
- Extend MCP compile parameters for multi-turn agent sessions with conversation linkage and tool output attachments
- Install conversation id injection hook in the Claude Code plugin installer
- Remove AIC state under the user home directory during uninstall

### Changed

- Simplify default `aic status` table layout for terminal reading
- Merge MCP server entries on Claude Code install, strip them on uninstall, preserve manual `CLAUDE.md` edits outside the managed AIC block
- Bundle shared Cursor hook helpers for project resolution, conversation id, session markers, logs, edited-file cache, and stdin reads
- Refresh documentation and installation guides for the global database model and technical integration references
- Align diagnostics and user-facing copy on exclusion rate terminology

### Fixed

- Omit resolved editor buffer content from `aic_inspect` traces
- Key compile cache and session state by conversation when a conversation id is present
- Honor allow patterns from configuration in the context guard
- Clear session start lock on session end in the Claude Code plugin
- Correct gitignore handling, install layout, and subagent model identification in integrations

### Security

- Validate cache rows on read and sanitize cache-derived identifiers before the compilation pipeline uses them

## [0.7.0] - 2026-03-18 (Deprecated)

### Added

- Cursor `subagentStart` hook: calls `aic_compile` with `trigger_source` subagent_start for subagent telemetry
- Hook-sourced `model_id` for `compilation_log`: Cursor passes model from hook input; Claude uses optional sixth arg or cache under `~/.aic`
- `trigger_source` on compilations from hooks (`session_start`, `prompt_submit`, `subagent_start`)
- Uninstall scripts for Cursor (`integrations/cursor/uninstall.cjs`) and Claude Code (`integrations/claude/uninstall.cjs`) plus installation docs

### Changed

- MCP bootstrap: workspace folders initialized on first compile per root (removed symlink-based dev bootstrap); cleaner batch shutdown
- Claude Code installer: global-only `~/.claude/hooks` and settings merge aligned with Cursor (idempotent copies, stale hook cleanup, version-stamped CLAUDE.md)
- Documentation: installation guide, Cursor and Claude integration layer references, global DB and project_id (W13)

### Fixed

- Claude hooks: SessionStart lock to avoid triple fire; `conversation_id` from transcript path; prompt / subagent intent handling; global settings merge preserves non-AIC keys and deduplicates AIC hook blocks
- Cursor: preToolUse deny-once behavior; compile-gate development bypass (later moved to `aic.config.json` `devMode`; see current installation docs); dynamic project root in compile flow
- Editor detection: `cursor-claude-code` when Cursor project dir is set with Claude Code client
- `conversation_id` and `editor_id` forwarded consistently into `aic_compile` (including PreToolUse inject path)
- npm update check: Content-Type and strict packument contract; response body capped at 100 KB
- Server tests stub registry fetch so update checks do not flake

## [0.6.9] - 2026-03-13 (Deprecated)

### Changed

- Proactive bootstrap when MCP client connects so all workspace folders are ready on first compile
- Schema descriptions for `projectRoot` in aic_compile and aic_inspect so AI clients send the workspace path instead of home directory

### Fixed

- Home directory is no longer accepted as project root; projects table no longer stores homedir when server starts with unresolved root
- Nested node_modules excluded correctly in monorepos
- Hooks install is idempotent; AIC-block-no-verify hook added to prevent git `--no-verify` in preToolUse

## [0.6.8] - 2026-03-13 (Deprecated)

### Added

- Comprehensive default ignore patterns for Python, Rust, Java, Go, and other major ecosystems so scans skip build artifacts and system directories by default

### Changed

- Bootstrap removes stale AIC hook scripts and updates the trigger rule when the installed AIC version changes

### Fixed

- MCP server process now releases all file watchers on close so the Node process can exit cleanly

## [0.6.7] - 2026-03-13 (Deprecated)

### Added

- Proactive project bootstrap when MCP connects using provided roots so projects are ready on first compile

### Changed

- Internal tooling and dependency updates

## [0.6.6] - 2026-03-12 (Deprecated)

### Changed

- Internal tooling and dependency updates

## [0.6.5] - 2026-03-12 (Deprecated)

### Changed

- Internal tooling and dependency updates

## [0.6.4] - 2026-03-12 (Deprecated)

### Added

- aic_status and aic_last exposed as MCP tools (replacing resources) for "show aic status" and "show aic last" prompt commands
- Self-upgrade of global MCP config: on startup, AIC rewrites the global `~/.cursor/mcp.json` AIC entry to use `@jatbas/aic@latest` when the current args omit a version, so users stay on the latest without editing config by hand

### Changed

- Install link and README now use `npx -y @jatbas/aic@latest` so new installs get the latest published version
- Update-available warning now includes cache-clear and reload steps (e.g. clear npx cache then reload Cursor) so users can update reliably
- Guard metadata in aic_compile responses no longer includes file paths; only type and count are returned to the model (findings omit file, blocked/redacted/warned file lists are empty)
- Compilation memory and I/O improvements: bounded file-content cache (LRU, default 500 entries) and bounded runner cache (cap 10, watcher cleanup on eviction and shutdown)

## [0.6.3] - 2026-03-12 (Deprecated)

### Fixed

- Node process no longer crashes with "JavaScript heap out of memory" on large projects (50k+ files). Raised heap limit to 4 GB, batched concurrent file reads in symbol scoring, and cached `.gitignore` parsing to avoid redundant I/O

## [0.6.2] - 2026-03-12 (Deprecated)

### Fixed

- When AIC is in both global and workspace MCP configs, AIC no longer modifies the workspace config (Cursor was disconnecting the server when the file changed). A clear warning is shown instead with step-by-step instructions to remove the duplicate manually and reload
- Duplicate-install warning now explains that reloading Cursor is enough and no reinstall or Cursor link is needed

## [0.6.1] - 2026-03-12 (Deprecated)

### Fixed

- When AIC is registered in both global and workspace MCP configs, the duplicate workspace entry is now removed automatically; a warning is shown in the output console and in the chat asking the user to reload Cursor
- Multi-project compilations in a single session no longer fail with a session database constraint error

## [0.6.0] - 2026-03-12 (Deprecated)

### Added

- Global MCP server with per-project isolation — single `~/.aic/aic.sqlite` database, stable project IDs that survive folder renames, data scoped via foreign keys
- `aic_projects` tool to list all known projects with compilation stats
- Per-project disable via `"enabled": false` in `aic.config.json`
- Project-scoped `aic_status` and `aic_last` MCP tools with per-project breakdown
- Duplicate-install warning when AIC is registered in both global and workspace configs

### Changed

- Database moved from per-project `.aic/aic.sqlite` to global `~/.aic/aic.sqlite`
- Install deep-link now registers globally in `~/.cursor/mcp.json` instead of per-workspace
- Schema migrations consolidated into a single initial migration for faster fresh installs
- Faster repeat compilations via cached file-tree hash when repo map is unchanged
- Hot-path compile I/O reduced: async prompt log writes, init/install guarded behind per-project once-flags
- Lower memory footprint: LRU-bounded file-content cache, bounded runner cache with watcher cleanup
- Fewer per-request object allocations via cached repo-map hash

## [0.5.5] - 2026-03-10 (Deprecated)

### Changed

- `failClosed` switched from `true` to `false` on the `preToolUse` enforcement hook to prevent deadlock when hook scripts are accidentally corrupted
- `installCursorHooks` now restores `hooks.json` from defaults when the file contains invalid JSON, ensuring self-healing on next `aic_compile`

### Added

- Global database at `~/.aic/aic.sqlite` with per-project isolation (`project_id`): schema, stores, migrations, and design notes documented in `implementation-spec.md` (global server model)

## [0.5.4] - 2026-03-10 (Deprecated)

### Fixed

- `AIC-require-aic-compile` hook skipped enforcement when the project was detected as the AIC source tree (path-based; later superseded by `devMode` in `aic.config.json` — see installation docs)

## [0.5.3] - 2026-03-10 (Deprecated)

### Fixed

- Project files (`.cursor/hooks/`, `.cursor/rules/AIC.mdc`, `aic.config.json`) are now created in the correct project directory on first `aic_compile` call, instead of in the server's working directory

## [0.5.2] - 2026-03-09 (Deprecated)

### Fixed

- MCP server no longer times out on startup when launched from the home directory by deferring language provider scanning from server boot
- Language provider glob exclusions now cover Windows (`$Recycle.Bin`, `AppData`) and Linux (`.local`, `.cache`, `snap`) system directories

## [0.5.1] - 2026-03-09 (Deprecated)

### Fixed

- MCP server no longer crashes with EPERM when started from the home directory on macOS (e.g. `.Trash` protected by SIP)

## [0.5.0] - 2026-03-09 (Deprecated)

### Added

- Install scope detection: `show aic status` reports whether AIC is installed globally, per-workspace, or both
- Proactive duplicate-install warning when AIC is registered in both global and workspace config
- One-click Cursor deep-link install via GitHub Pages redirect

### Fixed

- MCP server now starts correctly when invoked via symlink (e.g. npx), resolving "Client closed" failures on fresh installs
- Published npm package no longer contains unresolved `workspace:*` dependency
- CI publish workflow uses `pnpm pack` to resolve workspace dependencies before publishing
- Install scope detection matches the MCP server key case-insensitively

## [0.3.0] - 2026-03-09 (Deprecated)

### Added

- Specification-aware context compilation: project rules, ADRs, and design docs included and compressed alongside code
- Session-level compilation deduplication and conversation context compression
- Adaptive budget allocation from session history
- Context quality improvements: symbol-level intent matching, reverse dependency scoring, structural project map, chunk-level file inclusion, per-task-class scoring weights
- Granular file-level transformation cache and cached RepoMap with file watcher for faster recompilation
- Compilation scan performance improvements: non-blocking async repo scan with fast-glob bundled stats (no extra full-tree stat pass) and in-memory cached RepoMap
- Research-backed prompt assembly: constraints preamble to mitigate lost-in-the-middle, line-level pruner, context-completeness signal
- Command-injection and markdown instruction guard scanners
- Block- and line-level benchmark annotations and per-task-class precision/recall metrics
- MCP server security hardening: path containment, input validation, compilation timeout, tool-invocation audit log
- Cursor hook upgrades: sessionEnd, stop quality check, afterFileEdit tracking, sessionStart env propagation, preToolUse schema alignment, postToolUse compile confirmation
- License header audit and optional prepend script for release
- AIC-only ignore entries so user .gitignore and formatter config stay untouched
- Update notification on startup and in status when a newer AIC version is available

### Fixed

- Resolve all zero-install packaging gaps: import specifiers now match published npm package names, hook scripts included in published tarball, shebang present for npx execution

### Security

- Path containment validation, timeout enforcement, audit logging, and safer aic_last tool behavior (no raw compiled prompt in response)

## [0.2.1] - 2026-03-08 (Deprecated)

### Added

- Claude Code hook-based delivery design documentation
- MCP server security hardening coverage table in security docs
- Contributing guide
- npm publish workflow for `@jatbas/aic` and Knip dead-code checks

### Changed

- README rewritten to be developer-first and less technical
- Cursor hook coverage documentation clarified

### Fixed

- Remove synthetic example output from public docs in favor of captured real output

## [0.2.0] - 2026-03-04 (Deprecated)

### Added

- aic_status tool with budget utilization
- aic_last tool and aic_chat_summary tool
- MCP-only distribution: CLI removed, init via npx and auto-init on MCP startup
- Conversation tracking and per-conversation stats
- Multiple language provider support (TypeScript, Python, Go, Rust, Java, and others)
- Transformer and guard upgrades including warn severity and safety tests

### Changed

- Documentation reorganized for public release
- README simplified for GitHub users

## [0.1.0] - 2026-02-26 (Deprecated)

### Added

- Initial MCP server release
- Deterministic context compilation pipeline
- aic_compile and aic_inspect tools
- Local telemetry and cache
