# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).
This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Claude Code hook-based delivery design documentation
- MCP server security hardening coverage table
- Contributing guide

### Changed

- README rewritten to be developer-first and less technical
- Cursor hook coverage documentation clarified

### Fixed

- Remove synthetic example output from public docs in favor of captured real output

## [1.0.0] - YYYY-MM-DD

### Added

- Public OSS release of AIC MCP server
- Specification-aware context compilation
- Session-aware compilation deduplication
- Conversation context compression
- Adaptive budget allocation
- MCP security hardening
- Cursor hook upgrades

### Changed

- Documentation reorganized for public release
- README simplified for GitHub users

### Security

- Add path containment validation, timeout enforcement, audit logging, and safer `aic://last` behavior

## [0.2.0] - YYYY-MM-DD

### Added

- Quality release improvements
- `aic://status` resource
- `aic://last` resource
- `aic_chat_summary` tool
- Multiple language provider support
- Transformer and guard upgrades

## [0.1.0] - YYYY-MM-DD

### Added

- Initial MCP server release
- Deterministic context compilation pipeline
- Inspect and compile handlers
- Local telemetry and cache
