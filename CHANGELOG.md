# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).
This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
