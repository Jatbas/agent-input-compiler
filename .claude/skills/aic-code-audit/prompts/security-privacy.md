# Code Audit — security & privacy subagent

You are scanning files for security vulnerabilities, privacy violations, and storage boundary defects in the AIC codebase.

## Input

- Scope files: `{{SCOPE_FILES}}`
- Static analysis output (pre-read for context): `{{STATIC_OUTPUT_PATH}}`
- Output path: `{{OUTPUT_PATH}}`

## Before you start

1. Read the file at `{{STATIC_OUTPUT_PATH}}`. Every error listed there is a pre-confirmed finding candidate — carry it forward into your confirmed findings unless you can disprove it. Pay special attention to `no-restricted-imports` violations (SQL outside storage layer) and any errors touching auth, tokens, or project_id guards.
2. Read `.claude/skills/aic-pr-review/SKILL-checklist.md` dimensions X (security & privacy) and S (storage & SQL) in full. Run every check in those dimensions against the scope files.

## How to scan

Prioritize static-analysis hits, production files, storage/security/MCP boundary files, and high-risk directories before tests or leaf utilities. Only report findings you can confirm with a direct `file:line` citation. If you suspect a violation but cannot confirm it, put it in Discarded candidates. If the scope is too large for the budget, list skipped partitions in the Pass list as "not inspected" rather than claiming they passed.

## Checks

### X — Security & Privacy (X1–X7)

- No hardcoded API keys, tokens, or credentials
- Config uses env var names (`apiKeyEnv`), never values
- Logs sanitize secrets — replace with `***`
- Telemetry payloads: no file paths, file content, prompts, intents, project names, or PII — only typed aggregates and enum values
- `.aic/` directory: `0700` permissions, gitignored, no symlink traversal
- Context Guard never-include patterns intact and non-overridable
- No secrets written to SQLite or cache files

### S — Storage & SQL (S1–S7)

- All SQL exclusively in `shared/src/storage/` — no SQL in pipeline, adapters, or mcp
- Every schema change has a migration in `shared/src/storage/migrations/`
- No raw DDL outside `MigrationRunner`; no edits to merged migrations
- DB opened only in composition roots; storage classes receive DB via constructor injection
- Entity PKs use UUIDv7 `TEXT(36)` — never `INTEGER AUTOINCREMENT`
- Timestamps: `YYYY-MM-DDTHH:mm:ss.sssZ` via `Clock`/`ISOTimestamp` — no `date('now')` or `datetime('now')` in SQL
- Per-project data scoped with `project_id` in every query

## Budget

Hard cap: {{BUDGET}}.

## Output

Write to `{{OUTPUT_PATH}}`:

```
CHECKPOINT: aic-code-audit/security-privacy — complete
EVIDENCE: <N> citations | BUDGET: used/total

## Confirmed findings
- [<file:line>] <issue> — Dim: <X1/S3/…> — <one-line description>

## Systemic patterns
- <same pattern> in N locations: [list]

## Pass list
- <dimension or sub-check confirmed clean>

## Discarded candidates
- [<file:line>] <why this is not a confirmed finding>
```
