# AIC privacy overview

**Agent Input Compiler (AIC)** prepares context for AI coding assistants (for example through MCP in Cursor or Claude Code). This page is a short, factual summary for **developers evaluating the plugin**. For the full security architecture and threat discussion, see [security.md](documentation/security.md).

## At a glance

| Topic                                          | Summary                                                                                                                                                   |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where compilation runs                         | On your machine (local-first)                                                                                                                             |
| Compiled context sent to AIC-operated servers? | No — the compile path does not upload your context to AIC                                                                                                 |
| Outbound “phone home” telemetry today?         | No shipped client; an `anonymous_telemetry_log` table exists for a possible future opt-in queue only                                                      |
| AIC account or AIC API key?                    | Not required                                                                                                                                              |
| Sensitive local artifacts                      | Global DB can hold **intent text**, **project paths**, and guard metadata; project **`.aic/cache/`** can hold **compiled prompt** text — treat as private |

## Local-first processing

AIC runs on your computer. The editor talks to the MCP server over **standard input/output on the same machine** (local stdio transport), not over a separate network connection for MCP. The `aic_compile` tool path does not send compiled context to AIC-operated servers.

Your **model provider** (if you use one) is outside AIC: the editor or agent may call an API you configure. AIC only helps build context locally.

## No AIC account or API key

AIC does not require signing in or an AIC API key. Config references **environment variable names** for other tools, not secret values. See [API Key Handling in security.md](documentation/security.md#api-key-handling).

## What can leave your machine (network)

- **`aic_compile`:** the compile handler does not perform outbound HTTPS for your repository or prompts; see `mcp/src/handlers/compile-handler.ts`.
- **MCP process lifecycle:** a **bounded HTTPS GET** to the public npm registry may run for **version metadata** only (not your repo content). See [Update check (version notification)](documentation/security.md#update-check-version-notification) in security.md.
- **Installing or updating the package:** `npx` / npm may download packages from the registry — normal package tooling, not AIC uploading your project source.

## What is stored locally

### Global database: `~/.aic/aic.sqlite`

The server creates **`~/.aic/`** with **0700** (owner-only) and opens `aic.sqlite` there (`mcp/src/server.ts`).

Typical contents (schema in `shared/src/storage/migrations/001-consolidated-schema.ts`):

- **Project registration** — stable id and **absolute project root path** (`projects`).
- **Compilation history** — **intent string**, task class, file/token counts, cache hit, duration, editor id, optional model id, session and config linkage, optional conversation id (`compilation_log`).
- **Config snapshots** — full config JSON keyed by hash (`config_history`).
- **Compile telemetry rows** — numeric aggregates in `telemetry_events`: tier counts, guard block/finding counts, transform savings, and **`repo_id`** (derived from a **hash of the absolute project root**). The cleartext path is **not** stored in that telemetry row; the path still exists in `projects` for local operation. Built in `shared/src/core/build-telemetry-event.ts` and `shared/src/core/types/telemetry-types.ts`.
- **Guard findings** — type, severity, **file path**, line, message, pattern (`guard_findings`).
- **Cache index** — keys and paths to JSON files under the project’s `.aic/cache/` (`cache_metadata`).
- **Other tables** — sessions, tool invocations, optional agentic step state, file-transform cache (may store **transformed text**), etc.

The **`anonymous_telemetry_log`** table is reserved for a **possible future** outbound queue; **shipped code does not insert into it or POST it**. See [Anonymous Telemetry](documentation/security.md#anonymous-telemetry).

### Project directory: `<projectRoot>/.aic/`

- **`.aic/`** is created with **0700** via `shared/src/storage/ensure-aic-dir.ts`.
- **`cache/`** is created under that directory **without** passing `0700` explicitly (`shared/src/storage/create-project-scope.ts`, `shared/src/storage/sqlite-cache-store.ts`); permissions follow the process default/umask.
- **Cache JSON files** hold **compiled prompt** text, token count, and config hash (`sqlite-cache-store.ts` blob payload).
- **`last-compiled-prompt.txt`** — latest compiled prompt for local inspection (`mcp/src/handlers/compile-handler.ts`).
- Ignore rules (e.g. `shared/src/storage/aic-ignore-entries.json`) keep `.aic/` out of version control by default.

## Telemetry (local SQLite)

On **successful** compilation, when the project is not disabled (`enabled` is not `false` in `aic.config.json`), AIC writes local **`compilation_log`** and **`telemetry_events`** rows. Failed or timed-out compilations do not go through that success path (`mcp/src/handlers/compile-handler.ts`).

**`telemetry_events`** intentionally omits intent, file content, and file paths from its typed fields; it records counts and a hashed `repo_id` only.

**Outbound** anonymous telemetry is **not shipped**; when designed, it is **opt-in** and restricted to typed aggregates (no paths, content, prompts, intents, project names, or PII). Policy is stated in `.cursor/rules/AIC-architect.mdc` and [Anonymous Telemetry](documentation/security.md#anonymous-telemetry).

## Context Guard

Before the content transformer runs, **Context Guard** scans selected files: path-based exclusions (including **never-include** patterns that **`guard.allowPatterns` cannot override**), secret-like content, and prompt-injection-style patterns. Wiring lives in `shared/src/bootstrap/create-pipeline-deps.ts` and `shared/src/pipeline/context-guard.ts`; order relative to the transformer is in `shared/src/core/run-pipeline-steps.ts`. Full scanner list and behavior: [Context Guard in security.md](documentation/security.md#context-guard).

## Your controls

- **Disable compilation for a project:** `"enabled": false` in `aic.config.json` — the handler returns before the pipeline and does not write compile telemetry on that path.
- **Erase local history/cache:** delete `~/.aic/aic.sqlite` and/or the project `.aic/` directory.

## Related reading

[security.md](documentation/security.md) — data-handling tables, MCP transport, compliance notes, and deeper implementation detail.
