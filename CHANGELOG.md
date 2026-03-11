# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).
This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.6.2] - 2026-03-12

### Fixed

- When AIC is in both global and workspace MCP configs, AIC no longer modifies the workspace config (Cursor was disconnecting the server when the file changed). A clear warning is shown instead with step-by-step instructions to remove the duplicate manually and reload
- Duplicate-install warning now explains that reloading Cursor is enough and no reinstall or Cursor link is needed

## [0.6.1] - 2026-03-12

### Fixed

- When AIC is registered in both global and workspace MCP configs, the duplicate workspace entry is now removed automatically; a warning is shown in the output console and in the chat asking the user to reload Cursor
- Multi-project compilations in a single session no longer fail with a session database constraint error

## [0.6.0] - 2026-03-12

### Added

- Global MCP server with per-project isolation — single `~/.aic/aic.sqlite` database, stable project IDs that survive folder renames, data scoped via foreign keys
- `aic_projects` tool to list all known projects with compilation stats
- Per-project disable via `"enabled": false` in `aic.config.json`
- Project-scoped `aic://status` and `aic://last` resources with per-project breakdown
- Duplicate-install warning when AIC is registered in both global and workspace configs

### Changed

- Database moved from per-project `.aic/aic.sqlite` to global `~/.aic/aic.sqlite`
- Install deep-link now registers globally in `~/.cursor/mcp.json` instead of per-workspace
- Schema migrations consolidated into a single initial migration for faster fresh installs
- Faster repeat compilations via cached file-tree hash when repo map is unchanged
- Hot-path compile I/O reduced: async prompt log writes, init/install guarded behind per-project once-flags
- Lower memory footprint: LRU-bounded file-content cache, bounded runner cache with watcher cleanup
- Fewer per-request object allocations via cached repo-map hash

## [0.5.5] - 2026-03-10

### Changed

- `failClosed` switched from `true` to `false` on the `preToolUse` enforcement hook to prevent deadlock when hook scripts are accidentally corrupted
- `installCursorHooks` now restores `hooks.json` from defaults when the file contains invalid JSON, ensuring self-healing on next `aic_compile`

### Added

- Phase W (Global Server & Per-Project Isolation) tasks documented in `mvp-progress.md` and `implementation-spec.md` with full schema SQL, store changes, migration strategy, and dependency ordering

## [0.5.4] - 2026-03-10

### Fixed

- `AIC-require-aic-compile` hook auto-detects the AIC source repo and skips enforcement, eliminating the chicken-and-egg blocking during development

## [0.5.3] - 2026-03-10

### Fixed

- Project files (`.cursor/hooks/`, `.cursor/rules/AIC.mdc`, `aic.config.json`) are now created in the correct project directory on first `aic_compile` call, instead of in the server's working directory

## [0.5.2] - 2026-03-09

### Fixed

- MCP server no longer times out on startup when launched from the home directory by deferring language provider scanning from server boot
- Language provider glob exclusions now cover Windows (`$Recycle.Bin`, `AppData`) and Linux (`.local`, `.cache`, `snap`) system directories

## [0.5.1] - 2026-03-09

### Fixed

- MCP server no longer crashes with EPERM when started from the home directory on macOS (e.g. `.Trash` protected by SIP)

## [0.5.0] - 2026-03-09

### Added

- Install scope detection: `show aic status` reports whether AIC is installed globally, per-workspace, or both
- Proactive duplicate-install warning when AIC is registered in both global and workspace config
- One-click Cursor deep-link install via GitHub Pages redirect

### Fixed

- MCP server now starts correctly when invoked via symlink (e.g. npx), resolving "Client closed" failures on fresh installs
- Published npm package no longer contains unresolved `workspace:*` dependency
- CI publish workflow uses `pnpm pack` to resolve workspace dependencies before publishing
- Install scope detection matches the MCP server key case-insensitively

## [0.3.0] - 2026-03-09

### Added

- Specification-aware context compilation: project rules, ADRs, and design docs included and compressed alongside code
- Session-level compilation deduplication and conversation context compression
- Adaptive budget allocation from session history
- Context quality improvements: symbol-level intent matching, reverse dependency scoring, structural project map, chunk-level file inclusion, per-task-class scoring weights
- Granular file-level transformation cache and cached RepoMap with file watcher for faster recompilation
- Compilation scan performance improvements: async parallel I/O and single-stat file discovery
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

- Path containment validation, timeout enforcement, audit logging, and safer aic://last behavior (no raw compiled prompt in resource)

## [0.2.1] - 2026-03-08

### Added

- Claude Code hook-based delivery design documentation
- MCP server security hardening coverage table in security docs
- Contributing guide
- npm publish workflow for @aic/mcp and Knip dead-code checks

### Changed

- README rewritten to be developer-first and less technical
- Cursor hook coverage documentation clarified

### Fixed

- Remove synthetic example output from public docs in favor of captured real output

## [0.2.0] - 2026-03-04

### Added

- aic://status resource with budget utilization
- aic://last resource and aic_chat_summary tool
- MCP-only distribution: CLI removed, init via npx @aic/mcp init and auto-init on MCP startup
- Conversation tracking and per-conversation stats
- Multiple language provider support (TypeScript, Python, Go, Rust, Java, and others)
- Transformer and guard upgrades including warn severity and safety tests

### Changed

- Documentation reorganized for public release
- README simplified for GitHub users

## [0.1.0] - 2026-02-26

### Added

- Initial MCP server release
- Deterministic context compilation pipeline
- aic_compile and aic_inspect tools
- Local telemetry and cache
