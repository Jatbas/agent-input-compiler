# Security Policy

## Table of Contents

- [Reporting a Vulnerability](#reporting-a-vulnerability)
  - [Severity Classification](#severity-classification)
  - [Safe Harbor](#safe-harbor)
- [Scope](#scope)
  - [In scope](#in-scope)
  - [Out of scope](#out-of-scope)
- [Security Architecture](#security-architecture)
- [Context Guard](#context-guard)
- [Prompt Injection Prevention](#prompt-injection-prevention)
- [API Key Handling](#api-key-handling)
- [Data Handling](#data-handling)
  - [External API response validation](#external-api-response-validation)
  - [Update check (version notification)](#update-check-version-notification)
- [Data Leakage Prevention](#data-leakage-prevention)
- [`.aic/` Directory Security](#aic-directory-security)
- [Anonymous Telemetry](#anonymous-telemetry)
- [Telemetry Endpoint Threat Model](#telemetry-endpoint-threat-model)
- [MCP Server Top 10 Coverage](#mcp-server-top-10-coverage)
- [MCP Transport & Rule Pack Security](#mcp-transport--rule-pack-security)
  - [MCP Tool Approval Requirements](#mcp-tool-approval-requirements)
- [Supply Chain Security](#supply-chain-security)
- [Supported Versions](#supported-versions)
- [Compliance](#compliance)
  - [Design Principles](#design-principles)
  - [GDPR Readiness](#gdpr-readiness)
  - [SOC 2 Readiness](#soc-2-readiness)
  - [Compliance Roadmap](#compliance-roadmap)

---

## Reporting a Vulnerability

If you discover a security vulnerability in AIC, please report it responsibly.

**GitHub Security Advisories (preferred):** [Report a vulnerability](https://github.com/Jatbas/agent-input-compiler/security/advisories/new)

**Email:** jatbas@gmail.com — use when GitHub is not an option.

**Please include:**

- Description of the vulnerability and its potential impact
- Steps to reproduce (or a proof-of-concept if available)
- AIC version, Node version, OS, and editor (if relevant)
- Any suggested mitigation or fix

**Do NOT:**

- Open a public GitHub issue for security vulnerabilities
- Share details publicly before a fix is available
- Exploit the vulnerability beyond what is needed for a proof-of-concept

**Response timeline:**

- **Acknowledgment:** Within 48 hours
- **Assessment:** Within 5 business days
- **Fix release:** Within 30 days for critical issues, 90 days for non-critical
- **Disclosure:** Coordinated with the reporter. We aim to publish a security advisory within 7 days of the fix release.

### Severity Classification

AIC classifies vulnerabilities using the following scheme, aligned with [CVSS v3.1](https://www.first.org/cvss/) severity ranges:

| Severity     | CVSS range | AIC definition                                                                                                                                                    | Response                                          | Examples                                                                                                                     |
| ------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Critical** | 9.0–10.0   | Exploitable remotely or locally with no user interaction; leads to arbitrary code execution, full data exfiltration, or secret leakage to an external endpoint    | Fix within **30 days**; out-of-band patch release | Context Guard bypass allowing secrets to reach the model endpoint; RCE via crafted rule pack or MCP payload                  |
| **High**     | 7.0–8.9    | Exploitable with minimal user interaction or requires local access; leads to partial secret exposure, prompt injection bypass, or privilege escalation within AIC | Fix within **30 days**                            | Prompt injection pattern evasion that causes the model to execute attacker instructions; SQLite injection via crafted config |
| **Medium**   | 4.0–6.9    | Requires specific conditions or user misconfiguration; leads to information disclosure, denial of service, or weakened security posture                           | Fix within **90 days**                            | Telemetry payload containing unintended metadata; RepoMap cache poisoning via symlink; crash on malformed config             |
| **Low**      | 0.1–3.9    | Minimal impact; defense-in-depth hardening opportunity; requires unlikely conditions                                                                              | Fix in next scheduled release                     | Timing side-channel in cache lookup; verbose error message revealing internal path; minor false-negative in secret scanner   |

> When a report does not include a CVSS score, the AIC maintainers assign one during the assessment phase and share it with the reporter.

### Safe Harbor

We consider security research conducted in good faith to be authorized. We will not pursue legal action against researchers who:

- Make a good-faith effort to avoid privacy violations, data destruction, and service disruption
- Only interact with accounts they own or with explicit permission of the account holder
- Report vulnerabilities through the process described above
- Allow reasonable time for a fix before any public disclosure

---

## Scope

### In scope

| Component                   | Description                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@jatbas/aic`               | The MCP server package (npm)                                                                                                                       |
| Context Guard               | All scanner implementations (secret, exclusion, prompt injection)                                                                                  |
| SQLite storage              | Local database schema, migrations, and data handling                                                                                               |
| Telemetry endpoint (design) | Intended sink for **future** opt-in anonymous aggregates — **not contacted** by the shipped `@jatbas/aic` client; server-side design and ops scope |
| Configuration               | `aic.config.json` parsing, validation, and schema migration                                                                                        |
| Rule pack loading           | Built-in and project-level rule pack resolution                                                                                                    |
| Published releases          | Any artifact published to npm (current package: `@jatbas/aic`)                                                                                     |

### Out of scope

| Component                       | Reason                                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Third-party model providers     | OpenAI, Anthropic, and Ollama APIs are outside AIC's control. Report issues to those providers directly. |
| Editor plugins / extensions     | Cursor, Claude Code, and other editors have their own security policies                                  |
| User-authored rule packs        | Custom JSON files in `aic-rules/` (advanced) are authored and controlled by the project owner            |
| User-configured model endpoints | Custom endpoints set via `model.endpoint` in config are the user's responsibility                        |

---

## Security Architecture

AIC is a **local-first** tool. All compilation processing runs on the developer's machine. No source code, prompts, or file paths are transmitted to AIC-operated telemetry or analytics endpoints from the shipped MCP package. The only fixed outbound request is an npm registry **GET** for version metadata (no repository content) — see [Update check (version notification)](#update-check-version-notification).

```
┌────────────────────────────────────────────────────────────┐
│  Developer's Machine (trust boundary)                      │
│                                                            │
│  ┌──────────┐    stdio    ┌──────────────────────┐         │
│  │  Editor  │◄───────────►│   AIC MCP Server     │         │
│  │ (Cursor, │   (local    │   ┌────────────────┐ │         │
│  │  Claude  │    IPC)     │   │ Context Guard  │ │         │
│  │  Code)   │             │   │ (filters       │ │         │
│  └──────────┘             │   │  secrets from  │ │         │
│                           │   │  compiled ctx) │ │         │
│                           │   └────────────────┘ │         │
│                           │   ┌────────────────┐ │         │
│                           │   │ SQLite (.aic/) │ │         │
│                           │   │ 0700 perms     │ │         │
│                           │   │ gitignored     │ │         │
│                           │   └────────────────┘ │         │
│                           └──────────┬───────────┘         │
│                                      │                     │
└──────────────────────────────────────┼─────────────────────┘
                                       │
              ┌────────────────────────┼────────────────────┐
              │  External (crosses trust boundary)          │
              │                                             │
              │ ┌──────────────────┐  ┌───────────────────┐ │
              │ │ Model endpoint   │  │telemetry.aic.dev  │ │
              │ │ (future executor │  │ (future outbound; │ │
              │ │  path only)      │  │  no client ships) │ │
              │ │ Guarded content  │  │ design: no paths) │ │
              │ └──────────────────┘  └───────────────────┘ │
              │                                             │
              └─────────────────────────────────────────────┘
```

**Key trust boundaries:**

| Boundary             | What crosses it                      | Protection                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor ↔ AIC         | Intent string, compiled prompt       | stdio transport (local IPC, no network)                                                                                                                                                                                               |
| AIC → Model endpoint | Compiled prompt (Guard-filtered)     | Only when a model adapter is configured. Context Guard excludes secrets and injections from the compiled context. `aic_compile` never contacts any external service.                                                                  |
| AIC → Telemetry host | Anonymous aggregate metrics (design) | **Shipped:** no HTTP client to AIC telemetry. **When implemented:** opt-in only; enum/numeric payloads; TLS. See [Telemetry Endpoint Threat Model](#telemetry-endpoint-threat-model) and [Anonymous Telemetry](#anonymous-telemetry). |

For the full architectural specification, see [Project Plan §13](project-plan.md#13-security-considerations).

---

## Context Guard

Context Guard (pipeline Step 5) scans every selected file **before** it reaches the Content Transformer (Step 5.5) or the prompt assembler. It excludes secrets, credentials, excluded paths, and prompt injection patterns from the compiled context that AIC returns to the editor.

**Scope of protection:** Context Guard controls what AIC includes in its compiled prompt. It does not control what the model or editor does independently — models can still read files directly through editor-provided tools (e.g. `read_file`, `Shell`). AIC's role is to ensure that bulk context injection does not carry sensitive content; direct file access is governed by the editor's own permission model (e.g. `.cursorignore`).

| Scanner                      | Finding type        | What it detects                                                                                                                                                  |
| ---------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ExclusionScanner`           | `excluded-file`     | File path matches a never-include pattern                                                                                                                        |
| `SecretScanner`              | `secret`            | File content matches a known secret regex                                                                                                                        |
| `PromptInjectionScanner`     | `prompt-injection`  | Instruction-override and special-token patterns on all selected non-markdown files                                                                               |
| `MarkdownInstructionScanner` | `prompt-injection`  | Same instruction-pattern pass, limited to `.md`, `.mdc`, `.mdx`                                                                                                  |
| `CommandInjectionScanner`    | `command-injection` | Shell-like patterns (e.g. command substitution, backticks, pipe chains) on non-markdown files; markdown paths are handled by `MarkdownInstructionScanner`, BLOCK |

**Never-include path patterns (always active, not overridable):**
`.env`, `.env.*`, `*.pem`, `*.key`, `*.pfx`, `*.p12`, `*secret*`, `*credential*`, `*password*`, `*.cert`

**Secret patterns (6 regex patterns):**
AWS keys, GitHub tokens, Stripe keys, generic named API keys (e.g. `api_key = "..."`), JWTs (`eyJ...`), and SSH/TLS private key headers (`-----BEGIN ... PRIVATE KEY-----`).

**Behavior on detection:**

- A file is **removed** from the compiled context when any scanner reports a **BLOCK** severity finding on that path (exclusions, secrets, command-injection patterns, and the BLOCK-tier instruction patterns). **WARN** findings (some instruction-pattern matches) are logged but the file can still pass through if nothing blocks it
- The pipeline never fails due to Guard findings — it filters and continues
- All findings are logged in `CompilationMeta.guard` and visible via `aic_inspect`
- If all selected files are blocked, the pipeline returns empty context with `guard.passed: false`

**False-positive mitigation:** The allow list is loaded from `aic.config.json` (`guard.allowPatterns`). Paths matching those globs skip content scanners; never-include paths (`.env`, `*.pem`, etc.) stay mandatory blocks and cannot be overridden. See [Implementation Spec — Step 5](implementation-spec.md#step-5-context-guard) and [Project Plan §8.4](project-plan.md#84-contextguard-interface).

Full pattern tables: [Project Plan §8.4](project-plan.md#84-contextguard-interface).

---

## Prompt Injection Prevention

AIC defends against prompt injection at multiple layers:

| Risk                               | Mitigation                                                                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User intent contains injection** | AIC treats the intent as opaque text placed inside a structured template, not interpolated into system instructions                                                               |
| **Source code contains injection** | Context Guard runs instruction and command-injection scanners; BLOCK-level matches exclude the file; WARN-level instruction matches are logged but the file may remain in context |
| **Rule pack injection**            | Rule packs are local JSON files controlled by the developer — no remote loading in the shipped implementation                                                                     |
| **Prompt structure hardening**     | Context is encapsulated in clearly delimited code blocks; the constraints section is always placed after context                                                                  |

**Prompt injection pattern categories (shipped):**

| Category                  | Example match                             | Purpose                                            |
| ------------------------- | ----------------------------------------- | -------------------------------------------------- |
| Instruction override      | "Ignore all previous instructions"        | Classic instruction-override attack                |
| Persona hijack            | "You are now a helpful assistant that..." | Attempts to redefine the model's role              |
| Fake system prompt header | `system: you are a code reviewer`         | Embedded system prompt in source code              |
| Constraint override       | "Do not follow any other rules"           | Direct constraint override attempt                 |
| OpenAI chat markup        | `<\|system\|>`, `<\|im_start\|>`          | Model-specific special token injection             |
| Llama/Mistral tokens      | `[INST] new instructions [/INST]`         | Instruction token injection for open-weight models |

**False-positive mitigation:** These patterns target adversarial strings that have no legitimate reason to appear in production source code. Paths matching `guard.allowPatterns` in `aic.config.json` skip content scanners. The scanner logs the matched pattern in `GuardFinding.pattern` to help diagnose false positives.

Full regex patterns: [Project Plan §8.4](project-plan.md#84-contextguard-interface).

---

## API Key Handling

| Rule                                | Implementation                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| **Never store API keys in config**  | Config references env var _names_ (`apiKeyEnv: "OPENAI_API_KEY"`), never actual keys         |
| **Never log API keys**              | All logging sanitizes env var values; keys replaced with `***`                               |
| **Never cache API keys**            | Cache stores compiled prompts + metadata only; no credentials                                |
| **Never include keys in telemetry** | `telemetry_events` / `compilation_log` metric shapes include no API keys — typed fields only |

---

## Data Handling

| Data type                      | Stored locally?                                                                | Sent externally?                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Source code                    | Cache only under project `.aic/cache/` (gitignored)                            | Never in the current MCP-only package                                                                             |
| Prompts / intents              | `compilation_log.intent` (global `~/.aic/aic.sqlite`)                          | Never                                                                                                             |
| File paths                     | `guard_findings.file`, `cache_metadata.file_path` (and similar cache metadata) | Never                                                                                                             |
| API keys                       | Never stored                                                                   | Not used by the current MCP-only package                                                                          |
| Guard findings                 | `guard_findings` table (SQLite)                                                | Never                                                                                                             |
| Anonymous telemetry (outbound) | `anonymous_telemetry_log` table (schema in `001-consolidated-schema.ts`)       | **No shipped writer** — table reserved for a future queue. Privacy design: no code, paths, or prompts. See below. |

**Other local path columns:** The same database also stores absolute paths in `projects.project_root`, `repomap_cache.project_root`, and transform-cache tables (`file_path` and similar). Same rules apply: local only, never sent to AIC servers. Authoritative column list: `shared/src/storage/migrations/001-consolidated-schema.ts`.

### External API response validation

AIC treats all data received from external endpoints as untrusted. For every outbound GET request:

- The response is accepted only when the `Content-Type` header indicates JSON (e.g. `application/json`). Responses with a missing or non-JSON Content-Type are discarded without parsing.
- Response body size is bounded (e.g. 100 KB for the npm registry) and a timeout applies. Excess or slow responses are discarded.
- Only expected fields are read. The client uses a strict contract: it reads a fixed set of keys and ignores the rest. Invalid or missing structure yields a safe default (e.g. no update).
- The npm registry does not sign packument metadata; authenticity of the response is not cryptographically verified. Validation is limited to format, size, and schema.

### Update check (version notification)

- **Data source:** GET `https://registry.npmjs.org/<package>` (fixed URL).
- **Validate and bound:** Timeout 2s, max response body 100 KB, version string must match semver regex and max 32 chars; invalid data yields no update.
- **Content-Type:** The response is accepted only when the `Content-Type` header includes `application/json`. Other types are discarded without parsing.
- **Strict response contract:** Only the `dist-tags.latest` field is read from the packument. Missing or invalid structure (e.g. `dist-tags` not an object, `latest` not a string) yields no update.
- **No code/prompt injection:** Only fixed-format message with validated version; install link from our code only.
- **Writes only under `.aic/`:** `version-check-cache.json`, `update-available.txt`; no user/registry input in paths.
- **No SSRF:** Fixed registry URL.
- **Cache:** Validate version strings when reading cache before use.
- **HTTPS only,** default TLS verification.
- **No sensitive data sent to registry.**

---

## Data Leakage Prevention

| Risk                                 | Mitigation                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Telemetry leaks source code**      | `compilation_log` / `telemetry_events` store typed metrics and local diagnostics (`intent` on `compilation_log` only) — never file contents in metrics tables. Paths appear only in separate tables (e.g. Guard findings). See [Project Plan §9.1](project-plan.md#91-compile-telemetry-local-sqlite). |
| **Cache contains sensitive code**    | Cache is stored in `.aic/cache/` (gitignored, `0700` permissions); never uploaded; user controls TTL via config                                                                                                                                                                                        |
| **`repo_id` reveals project path**   | `repo_id` is a SHA-256 hash of the absolute path — irreversible, cannot be used to identify the project                                                                                                                                                                                                |
| **Model endpoint receives code**     | `aic_compile` never contacts any external service. Context Guard excludes secrets and credentials from the compiled context AIC returns to the editor.                                                                                                                                                 |
| **SQLite database contains prompts** | MCP server uses global `~/.aic/aic.sqlite` (`0700` on `~/.aic/`). Stores per-project compilation rows (intents, counts, tokens). Project `.aic/` holds cache and `last-compiled-prompt.txt` — never pushed to AIC servers.                                                                             |

For the full threat/mitigation analysis, see [Project Plan §13 — Data Leakage Prevention](project-plan.md#data-leakage-prevention).

---

## `.aic/` Directory Security

AIC uses **`~/.aic/`** for the global SQLite database (`aic.sqlite`) and **`<projectRoot>/.aic/`** for per-project cache, compiled-prompt artifact, and related files. Both are treated as sensitive:

- **Auto-gitignored:** Bootstrap appends the AIC ignore manifest (`shared/src/storage/aic-ignore-entries.json`, including `.aic/` and related paths) to `.gitignore`, `.eslintignore`, and `.prettierignore` on first-time init. Project `.aic/` and cache paths stay out of version control.
- **Permissions:** Global `~/.aic/` is created with `0700` (owner-only). Project `.aic/` is created with restricted permissions for cache writes.
- **Paths:** Writes use fixed filenames under `.aic/` (database, cache keys, `last-compiled-prompt.txt`). Do not point `.aic/` at untrusted locations.
- **Cursor compile gate:** The preToolUse compile gate is always active by default. An emergency bypass requires **both** `"devMode": true` and `"skipCompileGate": true` in `aic.config.json` ([installation.md](installation.md)). The gate uses `failClosed: true` — hook crashes deny rather than allow. This bypass is local workflow configuration for emergencies only, not a substitute for Context Guard on compiled context.

---

## Anonymous Telemetry

**Shipped vs designed:** The global database includes an `anonymous_telemetry_log` table (see `shared/src/storage/migrations/001-consolidated-schema.ts`). **There is no shipped TypeScript code that inserts into that table or performs HTTPS POST to a telemetry host** — see [Implementation Spec §4d — Anonymous Telemetry](implementation-spec.md#4d-additional-implementation-notes). The minimal `aic.config.json` loader (`shared/src/config/load-config-from-file.ts`) does **not** define `telemetry.anonymousUsage` or related keys.

**Compile telemetry (local, separate topic):** On each successful `aic_compile` when the project is not disabled, the handler writes `compilation_log` and `telemetry_events` rows (metrics and local diagnostics). That path is **not** gated by a `telemetry.enabled` flag in the minimal loader. Details: [Project Plan §9.1](project-plan.md#91-compile-telemetry-local-sqlite), [Implementation Spec — Step 10](implementation-spec.md#step-10-telemetry-logger).

**Target behaviour (outbound anonymous aggregates — when implemented):** A future client would send only enum and numeric aggregates — never file paths, file content, raw prompts, intents, project names, API keys, user identifiers, or PII. Intended payload shape and endpoint threat model remain design requirements below; they are **not** assertions about current binaries.

**Privacy guarantees for outbound payloads (mandatory, non-negotiable — design):**

| Rule                  | Enforcement (target)                          |
| --------------------- | --------------------------------------------- |
| No file paths         | Payload schema — no string fields for paths   |
| No file content       | Only numeric aggregates and enum values       |
| No prompts or intents | Aggregate metrics only — not free-text intent |
| No project names      | Not included in schema                        |
| No persistent user ID | Each payload independent; no session tracking |
| No IP logging         | Telemetry endpoint should not log client IPs  |
| HTTPS only            | TLS for any outbound POST                     |

**Inspecting the queue table (when populated):** If a future release writes rows, you would inspect `anonymous_telemetry_log` in `~/.aic/aic.sqlite`. Today the table is typically empty:

```bash
sqlite3 ~/.aic/aic.sqlite "SELECT created_at, status, payload_json FROM anonymous_telemetry_log ORDER BY created_at DESC LIMIT 5;"
```

> **Batching (target):** A future sender might batch HTTPS requests (e.g. at most once per 5 minutes), remove rows after successful delivery, and drop payloads when the endpoint is unreachable — not shipped behaviour today.

Normative shipped-state notes: [Implementation Spec §4d](implementation-spec.md#4d-additional-implementation-notes). Threat model for the endpoint: [Telemetry Endpoint Threat Model](#telemetry-endpoint-threat-model) below.

---

## Telemetry Endpoint Threat Model

The telemetry endpoint described below is a **design target only** — it does not exist today and the shipped `@jatbas/aic` package contains **no code that contacts it**. The design is documented here so the threat model is established before any implementation ships. See [Anonymous Telemetry](#anonymous-telemetry) and [Implementation Spec §4d](implementation-spec.md#4d-additional-implementation-notes).

| Threat                                 | Mitigation                                                                                                                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Payload injection** (fake telemetry) | Strict JSON schema validation — reject payloads that don't match the typed schema. Rate-limit by IP (10 req/min). Analytics-grade data only — never used for security decisions. |
| **DDoS**                               | CDN/WAF (Cloudflare). Rate limiting. Write-only endpoint with minimal attack value.                                                                                              |
| **Man-in-the-middle**                  | TLS only (HTTPS). No plaintext fallback.                                                                                                                                         |
| **Endpoint impersonation**             | URL hardcoded in AIC binary. Override only via explicit config change.                                                                                                           |
| **Data value if breached**             | Minimal — no PII, no code, no paths, no prompts. Worst case: polluted analytics.                                                                                                 |

**Design principle:** If the telemetry endpoint goes down, AIC continues working normally. If it's compromised, no user data is at risk.

Full threat model: [Project Plan §13 — Telemetry Endpoint Security](project-plan.md#telemetry-endpoint-security).

---

## MCP Server Top 10 Coverage

Mapping of AIC against the [CSA MCP Server Top 10 Security Risks](https://modelcontextprotocol-security.io/top10/server/) and the [MCP Security Best Practices spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices).

| #      | Risk                          | AIC Status        | AIC Controls                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Notes                                                                                                   |
| ------ | ----------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| MCP-01 | Prompt Injection              | Covered           | Context Guard (6 pattern categories), `PromptInjectionScanner`, `MarkdownInstructionScanner`, `CommandInjectionScanner`, structural prompt template (intent is opaque, code in delimited blocks, constraints after context)                                                                                                                                                                                                                                                    | See [Prompt Injection Prevention](#prompt-injection-prevention)                                         |
| MCP-02 | Confused Deputy               | N/A               | AIC is a local stdio server with no OAuth, no delegated auth, no multi-user. Single-user, single-process.                                                                                                                                                                                                                                                                                                                                                                      | Would apply if AIC added HTTP transport or multi-user auth (future major release)                       |
| MCP-03 | Tool Poisoning                | N/A               | AIC exposes 6 tools (`aic_compile`, `aic_inspect`, `aic_projects`, `aic_status`, `aic_last`, `aic_chat_summary`). No dynamic tool loading, no third-party tool registry, no remote tool discovery.                                                                                                                                                                                                                                                                             | Fixed tool set compiled into the binary                                                                 |
| MCP-04 | Credential & Token Exposure   | Covered           | Config references env var _names_ only (never values). Log sanitization replaces secrets with `***`. Context Guard excludes `.env`, `*.pem`, `*.key` from compiled context. `compiledPrompt` omitted from `aic_last` response. No API keys in SQLite or cache.                                                                                                                                                                                                                 | See [API Key Handling](#api-key-handling)                                                               |
| MCP-05 | Insecure Server Configuration | Covered           | MCP tools use stdio (local IPC). `projectRoot`/`configPath` path containment rejects traversal and blocks `projectRoot` = user home (`os.homedir()`). Global `~/.aic/` created at `0700`. Project workspace: AIC ignore manifest appended to `.gitignore` / `.eslintignore` / `.prettierignore` on init (includes `.aic/`). Zod validation at boundary. Server performs a fixed outbound GET to the npm registry shortly after start for version check (not user-controlled).  | See [`.aic/` Directory Security](#aic-directory-security)                                               |
| MCP-06 | Supply Chain Attacks          | Covered (shipped) | Lockfile committed and verified. `pnpm audit` in CI. Exact version pinning (no `^`). Minimal runtime deps. Rule packs are local JSON only — no remote loading in the shipped code.                                                                                                                                                                                                                                                                                             | SBOM, signed npm releases, Dependabot/Snyk planned for near-term releases                               |
| MCP-07 | Excessive Permissions         | Covered           | No shell exec, no user-chosen URLs, no arbitrary path read/write. `aic_compile` persists compilations, cache, and related metadata; other tools query status or log invocations only where implemented. Path containment limits tool args to safe project roots.                                                                                                                                                                                                               | Principle of least privilege by design                                                                  |
| MCP-08 | Data Exfiltration             | Covered           | `aic_compile` never sends compiled context to AIC servers. Local `compilation_log` / `telemetry_events` rows stay in `~/.aic/aic.sqlite`; **no** shipped anonymous outbound client. `compiledPrompt` omitted from `aic_last` response. `aic_inspect` JSON omits per-file `resolvedContent` on `selectedFiles` (metadata-only trace; avoids response self-flooding). `tool_invocation_log` records `aic_compile`, `aic_inspect`, and `aic_chat_summary` (parameter shape only). | See [Data Leakage Prevention](#data-leakage-prevention) and [Anonymous Telemetry](#anonymous-telemetry) |
| MCP-09 | Context Spoofing              | Covered           | Intent is treated as opaque text (never interpolated into system instructions). Zod schema validation at boundary. Intent control-char strip removes `\x00-\x08`, `\x0B-\x1F`. `conversationId`/`modelId` constrained to printable ASCII with max length.                                                                                                                                                                                                                      | See [Prompt Injection Prevention](#prompt-injection-prevention)                                         |
| MCP-10 | Insecure Communication        | Covered           | stdio transport only — local IPC, no network. No plaintext fallback.                                                                                                                                                                                                                                                                                                                                                                                                           | If HTTP transport is added later, mutual TLS or token auth required                                     |

**Honorable Mentions coverage:**

| Risk                      | AIC Status | AIC Controls                                                                                                                                                                                                                                 |
| ------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Insufficient Logging      | Covered    | `tool_invocation_log` records `aic_compile`, `aic_inspect`, and `aic_chat_summary` with `params_shape` (typeof-only). `compilation_log` and `guard_findings` provide compilation audit trail.                                                |
| Resource Exhaustion (DoS) | Covered    | 30s compilation timeout via `Promise.race`. Intent capped at 10,000 chars. `configPath` capped at 4,096 chars.                                                                                                                               |
| Input Validation Failures | Covered    | Zod schemas validate all MCP handler inputs. Path containment guards reject traversal and home-directory misuse (`projectRoot` must be a project path, not `os.homedir()`). `conversationId`/`modelId` regex-constrained to printable ASCII. |
| Session Management        | Covered    | Session tracking with `startSession`/`stopSession`. Shutdown handler for graceful cleanup. Crashed session backfill on startup.                                                                                                              |

---

## MCP Transport & Rule Pack Security

| Attack surface           | Current state (shipped)                                    | Future hardening                                                           |
| ------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| **MCP transport**        | stdio only — local IPC, no network exposure                | If HTTP transport is added (v2.x target), require mutual TLS or token auth |
| **Rule pack loading**    | Local JSON files only — no remote URLs in the shipped code | Remote rule packs (v2.x target): signature verification (ed25519)          |
| **Config `extends` URL** | Not implemented in the shipped code                        | v2.x target: HTTPS only, URL allowlist, response schema validation         |
| **SQLite access**        | Local file with `0700` directory permissions               | v2.x target: optional SQLCipher encryption for at-rest protection          |

### MCP Tool Approval Requirements

Both Cursor and Claude Code require explicit user approval before MCP tools run. All six AIC tools (`aic_compile`, `aic_inspect`, `aic_projects`, `aic_status`, `aic_last`, `aic_chat_summary`) need approval where the editor enforces per-tool consent. **`aic_compile`** (and typically **`aic_inspect`**) must be allowed for full compilation and guard inspection.

| Editor          | Approval mechanism                                                                                                             | If not approved                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| **Cursor**      | MCP indicator shows an approval prompt on first invocation. User clicks "Always allow" per tool. Reviewable in Settings → MCP. | Tool calls silently fail. Trigger rule detects this and notifies the user. |
| **Claude Code** | Runtime permission prompt, `--allowedTools` CLI flag, or `.mcp.json` permissions configuration.                                | Tool calls rejected. Trigger rule detects this and notifies the user.      |

> **Risk:** If the user denies or never approves **`aic_compile`**, the MCP server may still run but the model gets no compiled context — no file selection, no Context Guard on that path, no context compilation.
>
> **Mitigation:** The trigger rule (`.cursor/rules/AIC.mdc` or equivalent) includes a fallback: if `aic_compile` is unavailable, the model tells the user how to enable it in MCP settings. [Installation](installation.md) and [Best practices](best-practices.md) describe approving **`aic_compile`** and **`aic_inspect`** during setup. The MCP server process is unaffected; the block is at the editor between the model and the server.

---

## Supply Chain Security

| Control                  | When    | Implementation                                                                                                                                                                                                                                                                        |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lockfile integrity**   | Shipped | `pnpm-lock.yaml` committed and verified in CI                                                                                                                                                                                                                                         |
| **Dependency audit**     | Shipped | `pnpm audit` runs in CI on every PR; build fails on critical vulnerabilities                                                                                                                                                                                                          |
| **Minimal dependencies** | Ongoing | Core (`@jatbas/aic-core`): e.g. `better-sqlite3`, `zod`, `tiktoken`, `typescript`, `fast-glob`, `ignore`, `diff`, `commander`, plus `web-tree-sitter` and Tree-sitter grammars. MCP package adds `@modelcontextprotocol/sdk` and `zod`. Exact pins in published `package.json` files. |
| **Automated scanning**   | Planned | Dependabot or Snyk for continuous vulnerability monitoring                                                                                                                                                                                                                            |
| **SBOM generation**      | Planned | CycloneDX SBOM generated on every release, published alongside npm package                                                                                                                                                                                                            |
| **Signed releases**      | Planned | npm `--provenance` flag for tamper-proof publish attestation                                                                                                                                                                                                                          |

---

## Supported Versions

| Version        | Supported                    |
| -------------- | ---------------------------- |
| 0.x (baseline) | ✅ Security fixes backported |
| < 0.1.0        | ❌ Pre-release, no support   |

Security patches are released as patch versions (e.g., `0.1.1`). Critical vulnerabilities receive out-of-band releases regardless of the regular release schedule.

---

## Compliance

AIC's architecture is designed to be **technically compliant** with GDPR, SOC 2, and ISO 27001 from the start. Formal certifications are pursued when commercially justified — the architecture does not change.

> **Legal and compliance notice:** The tables and status cells in this section describe engineering design choices, documentation posture, and product roadmap targets for discussion purposes. They do not constitute legal advice, regulatory guidance, or a determination that any law, standard, or certification requirement is satisfied.
>
> Symbols such as ✅ or ⚠️ reflect internal engineering assessments, not third-party audits, attestations, or regulator findings.
>
> How AIC is deployed, configured, and used determines outcomes in practice; organizations with compliance obligations should obtain advice from qualified counsel and perform their own assessments (for example, a data protection impact assessment where appropriate).

### Design Principles

| Principle              | How AIC achieves it                                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Privacy by default** | No outbound anonymous telemetry client in the shipped package. Compile metrics are local SQLite rows — see [Anonymous Telemetry](#anonymous-telemetry). No PII in metric fields.                      |
| **Data minimization**  | `compilation_log` / `telemetry_events` hold typed metrics; intents are local diagnostics only — not sent to AIC servers                                                                               |
| **User control**       | Inspect or delete `~/.aic/aic.sqlite`. Top-level `enabled: false` stops new compile rows for that project. Future anonymous opt-in will use an extended config loader — not the minimal schema today. |
| **Local-first**        | All processing on user's machine. No cloud dependency for core functionality.                                                                                                                         |
| **Transparency**       | Local compile history in `~/.aic/aic.sqlite`; `anonymous_telemetry_log` is schema-only until a sender ships                                                                                           |
| **Security by design** | Context Guard, API key isolation, `.aic/` permissions, no symlink traversal                                                                                                                           |

### GDPR Readiness

| Requirement               | Status          | Implementation                                                                                                                                                       |
| ------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lawful basis (consent)    | ✅              | No shipped anonymous outbound client; local compile metrics are operational data on the user’s machine — see [Anonymous Telemetry](#anonymous-telemetry)             |
| Data minimization         | ✅              | Metric tables use typed fields; `compilation_log.intent` is local diagnostics — not uploaded by shipped MCP paths                                                    |
| Right to access           | ✅              | Inspect `compilation_log` / `telemetry_events` in `~/.aic/aic.sqlite`; `anonymous_telemetry_log` has no application writer today                                     |
| Right to erasure          | ✅              | Delete `~/.aic/aic.sqlite` or disable the project (`enabled: false`) to stop new compile rows                                                                        |
| Right to withdraw consent | ✅              | N/A for outbound until implemented; local data removable as above                                                                                                    |
| Purpose limitation        | ⚠️ Outbound TBD | Shipped MCP path: no anonymous POST. When outbound ships: purpose disclosed in UI/config; see [Compliance Roadmap](#compliance-roadmap) (privacy policy ⚠️ Planned). |
| Data retention limit      | ⚠️ Planned      | Server-side: auto-delete after 90 days                                                                                                                               |
| Privacy policy            | ⚠️ Planned      | Not yet published — planned for a future release                                                                                                                     |

### SOC 2 Readiness

| Trust Principle     | Control                                                                                            | Status                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Security**        | Local-first; single global DB at `~/.aic/aic.sqlite` with project-level isolation via `project_id` | ✅ Baseline                                                                                                                                |
|                     | Encryption in transit (TLS)                                                                        | ✅ Baseline (npm registry version check; future anonymous client would use TLS)                                                            |
|                     | Vulnerability management (`pnpm audit`)                                                            | ✅ Baseline                                                                                                                                |
|                     | Incident response (`security.md`)                                                                  | ✅ Baseline                                                                                                                                |
|                     | Encryption at rest (SQLCipher)                                                                     | ⚠️ v2.x target                                                                                                                             |
|                     | Automated scanning (Dependabot/Snyk)                                                               | ⚠️ Planned                                                                                                                                 |
|                     | Penetration testing                                                                                | ❌ Enterprise maturity                                                                                                                     |
| **Availability**    | Works offline, local-first                                                                         | ✅ Baseline                                                                                                                                |
|                     | SQLite = single file backup                                                                        | ✅ Baseline                                                                                                                                |
| **Confidentiality** | Context Guard data classification                                                                  | ✅ Baseline                                                                                                                                |
|                     | No code leaves machine in the current MCP-only package                                             | ✅ Baseline                                                                                                                                |
|                     | Third-party data sharing                                                                           | ✅ Baseline — no compile context to third parties; anonymous outbound specified, not shipped ([Anonymous Telemetry](#anonymous-telemetry)) |

### Compliance Roadmap

| Milestone              | Deliverables                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Baseline (shipped)** | `security.md` published. `pnpm audit` in CI. Local compile metrics in SQLite; anonymous queue table schema only. Privacy-by-default architecture. |
| **Near-term**          | Privacy policy. SBOM. Signed npm releases. Dependabot/Snyk. OpenSSF Scorecard badge. Server-side 90-day retention policy.                         |
| **v2.x targets**       | SQLCipher optional encryption. Formal risk register. SOC 2 Type I prep documentation. GDPR DPIA. Rule pack signature verification.                |
| **Enterprise**         | SOC 2 Type I audit. ISO 27001 gap assessment. Penetration test. Full ISMS documentation. Formal certifications when commercially justified.       |

Full compliance readiness mapping (including ISO 27001): [Project Plan §25](project-plan.md#25-compliance-readiness).
