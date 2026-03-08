# Security Policy

## Table of Contents

- [Reporting a Vulnerability](#reporting-a-vulnerability)
  - [Severity Classification](#severity-classification)
- [Scope](#scope)
- [Security Architecture](#security-architecture)
- [Context Guard](#context-guard)
- [Prompt Injection Prevention](#prompt-injection-prevention)
- [API Key Handling](#api-key-handling)
- [Data Handling](#data-handling)
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

---

## Reporting a Vulnerability

If you discover a security vulnerability in AIC, please report it responsibly.

**Email:** security@aic.dev

**Encrypted reports:** If you need to share sensitive details (exploit code, credentials found in a release, etc.), request a PGP public key in your initial email and we will provide one for encrypted follow-up. Alternatively, include your own PGP public key and we will encrypt our replies.

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

- **Acknowledgement:** Within 48 hours
- **Assessment:** Within 5 business days
- **Fix release:** Within 30 days for critical issues, 90 days for non-critical
- **Disclosure:** Coordinated with the reporter. We aim to publish a security advisory within 7 days of the fix release.

### Severity Classification

AIC classifies vulnerabilities using the following scheme, aligned with [CVSS v3.1](https://www.first.org/cvss/) severity ranges:

| Severity     | CVSS range | AIC definition                                                                                                                                                    | Response                                          | Examples                                                                                                                     |
| ------------ | :--------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Critical** |  9.0–10.0  | Exploitable remotely or locally with no user interaction; leads to arbitrary code execution, full data exfiltration, or secret leakage to an external endpoint    | Fix within **30 days**; out-of-band patch release | Context Guard bypass allowing secrets to reach the model endpoint; RCE via crafted rule pack or MCP payload                  |
| **High**     |  7.0–8.9   | Exploitable with minimal user interaction or requires local access; leads to partial secret exposure, prompt injection bypass, or privilege escalation within AIC | Fix within **30 days**                            | Prompt injection pattern evasion that causes the model to execute attacker instructions; SQLite injection via crafted config |
| **Medium**   |  4.0–6.9   | Requires specific conditions or user misconfiguration; leads to information disclosure, denial of service, or weakened security posture                           | Fix within **90 days**                            | Telemetry payload containing unintended metadata; RepoMap cache poisoning via symlink; crash on malformed config             |
| **Low**      |  0.1–3.9   | Minimal impact; defence-in-depth hardening opportunity; requires unlikely conditions                                                                              | Fix in next scheduled release                     | Timing side-channel in cache lookup; verbose error message revealing internal path; minor false-negative in secret scanner   |

When a report does not include a CVSS score, the AIC maintainers assign one during the assessment phase and share it with the reporter.

### Safe Harbor

We consider security research conducted in good faith to be authorized. We will not pursue legal action against researchers who:

- Make a good-faith effort to avoid privacy violations, data destruction, and service disruption
- Only interact with accounts they own or with explicit permission of the account holder
- Report vulnerabilities through the process described above
- Allow reasonable time for a fix before any public disclosure

---

## Scope

### In scope

| Component          | Description                                                       |
| ------------------ | ----------------------------------------------------------------- |
| `@aic/mcp`         | The MCP server package (npm)                                      |
| Context Guard      | All scanner implementations (secret, exclusion, prompt injection) |
| SQLite storage     | Local database schema, migrations, and data handling              |
| Telemetry endpoint | `https://telemetry.aic.dev` — payload processing and storage      |
| Configuration      | `aic.config.json` parsing, validation, and schema migration       |
| Rule pack loading  | Built-in and project-level rule pack resolution                   |
| Published releases | Any artifact published to npm under the `@aic` scope              |

### Out of scope

| Component                       | Reason                                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Third-party model providers     | OpenAI, Anthropic, and Ollama APIs are outside AIC's control. Report issues to those providers directly. |
| Editor plugins / extensions     | Cursor, Claude Code, and other editors have their own security policies                                  |
| User-authored rule packs        | Custom JSON files in `aic-rules/` (advanced) are authored and controlled by the project owner            |
| User-configured model endpoints | Custom endpoints set via `model.endpoint` in config are the user's responsibility                        |

---

## Security Architecture

AIC is a **local-first** tool. All compilation processing runs on the developer's machine. No source code, prompts, or file paths are ever transmitted to AIC servers.

```
┌────────────────────────────────────────────────────────────┐
│  Developer's Machine (trust boundary)                      │
│                                                            │
│  ┌──────────┐    stdio    ┌──────────────────────┐         │
│  │  Editor  │◄───────────►│   AIC MCP Server     │         │
│  │ (Cursor, │   (local    │   ┌────────────────┐ │         │
│  │  Claude  │    IPC)     │   │ Context Guard  │ │         │
│  │  Code)   │             │   │ (blocks secrets│ │         │
│  └──────────┘             │   │  & injections) │ │         │
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
              ┌────────────────────────┼──────────────────┐
              │  External (crosses trust boundary)        │
              │                                           │
              │ ┌─────────────────┐  ┌──────────────────┐ │
│ │ Model endpoint  │  │telemetry.aic.dev │ │
│ │ (future executor│  │ (opt-in only)    │ │
│ │  path only)     │  │                   │ │
              │ │ Guarded content │  │ no code/paths/PII│ │
              │ └─────────────────┘  └──────────────────┘ │
              │                                           │
              └───────────────────────────────────────────┘
```

**Key trust boundaries:**

| Boundary             | What crosses it                  | Protection                                                                                                                                                                |
| -------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor ↔ AIC         | Intent string, compiled prompt   | stdio transport (local IPC, no network)                                                                                                                                   |
| AIC → Model endpoint | Compiled prompt (Guard-filtered) | Only when a model adapter is configured. Context Guard blocks secrets and injections before content reaches the model. `aic_compile` never contacts any external service. |
| AIC → Telemetry      | Anonymous aggregate metrics      | Opt-in only. No code, paths, prompts, or PII. TLS only. See [Telemetry Endpoint Threat Model](#telemetry-endpoint-threat-model).                                          |

For the full architectural specification, see [Project Plan §12](project-plan.md).

---

## Context Guard

Context Guard (pipeline Step 5) scans every selected file **before** it reaches the Content Transformer (Step 5.5) or the model. It prevents secrets, credentials, excluded paths, and prompt injection patterns from entering the compiled prompt.

| Scanner                  | Finding type       | What it detects                                |
| ------------------------ | ------------------ | ---------------------------------------------- |
| `ExclusionScanner`       | `excluded-file`    | File path matches a never-include pattern      |
| `SecretScanner`          | `secret`           | File content matches a known secret regex      |
| `PromptInjectionScanner` | `prompt-injection` | Suspected instruction-override string detected |

**Never-include path patterns (always active, not overridable):**
`.env`, `.env.*`, `*.pem`, `*.key`, `*.pfx`, `*.p12`, `*secret*`, `*credential*`, `*password*`, `*.cert`

**Secret patterns (6 regex patterns):**
AWS keys, GitHub tokens, Stripe keys, generic named API keys (e.g. `api_key = "..."`), JWTs (`eyJ...`), and SSH/TLS private key headers (`-----BEGIN ... PRIVATE KEY-----`).

**Behaviour on detection:**

- Blocked files are **removed** from context — they never reach the model
- The pipeline never fails due to Guard findings — it filters and continues
- All findings are logged in `CompilationMeta.guard` and visible via `aic_inspect`
- If all selected files are blocked, the pipeline returns empty context with `guard.passed: false`

**False-positive handling:** Files matching `guard.allowPatterns` (globs) or `guard.allowFiles` (exact paths) skip all scanners. Use this for test fixtures or documentation that intentionally contains secret-like strings. Built-in never-include patterns (`.env`, `*.pem`, etc.) are **not** overridable by allow patterns.

Full pattern tables: [Project Plan §8.4](project-plan.md).

---

## Prompt Injection Prevention

AIC defends against prompt injection at multiple layers:

| Risk                               | Mitigation                                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **User intent contains injection** | AIC treats the intent as opaque text placed inside a structured template, not interpolated into system instructions     |
| **Source code contains injection** | Context Guard scans every file for 6 categories of injection patterns (see below); matched files are blocked and logged |
| **Rule pack injection**            | Rule packs are local JSON files controlled by the developer — no remote loading in MVP                                  |
| **Prompt structure hardening**     | Context is encapsulated in clearly delimited code blocks; the constraints section is always placed after context        |

**Prompt injection pattern categories (MVP):**

| Category                  | Example match                             | Purpose                                            |
| ------------------------- | ----------------------------------------- | -------------------------------------------------- |
| Instruction override      | "Ignore all previous instructions"        | Classic instruction-override attack                |
| Persona hijack            | "You are now a helpful assistant that..." | Attempts to redefine the model's role              |
| Fake system prompt header | `system: you are a code reviewer`         | Embedded system prompt in source code              |
| Constraint override       | "Do not follow any other rules"           | Direct constraint override attempt                 |
| OpenAI chat markup        | `<\|system\|>`, `<\|im_start\|>`          | Model-specific special token injection             |
| Llama/Mistral tokens      | `[INST] new instructions [/INST]`         | Instruction token injection for open-weight models |

**False-positive mitigation:** These patterns target adversarial strings that have no legitimate reason to appear in production source code. If a legitimate file triggers the scanner (e.g., a test fixture for injection detection), add it to `guard.allowPatterns` or `guard.allowFiles`. The scanner logs the matched pattern in `GuardFinding.pattern` to help diagnose false positives.

Full regex patterns: [Project Plan §8.4](project-plan.md).

---

## API Key Handling

| Rule                                | Implementation                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| **Never store API keys in config**  | Config references env var _names_ (`apiKeyEnv: "OPENAI_API_KEY"`), never actual keys |
| **Never log API keys**              | All logging sanitizes env var values; keys replaced with `***`                       |
| **Never cache API keys**            | Cache stores compiled prompts + metadata only; no credentials                        |
| **Never include keys in telemetry** | Telemetry events contain no secrets — verified by typed schema                       |

---

## Data Handling

| Data type           |             Stored locally?              |                  Sent externally?                   |
| ------------------- | :--------------------------------------: | :-------------------------------------------------: |
| Source code         |     Cache only (`.aic/`, gitignored)     |        Never in the current MCP-only package        |
| Prompts / intents   |     `compilation_log` table (SQLite)     |                        Never                        |
| File paths          |     `compilation_log` table (SQLite)     |                        Never                        |
| API keys            |               Never stored               |      Not used by the current MCP-only package       |
| Guard findings      |     `guard_findings` table (SQLite)      |                        Never                        |
| Anonymous telemetry | `anonymous_telemetry_log` table (SQLite) | Opt-in only. No code, paths, or prompts. See below. |

---

## Data Leakage Prevention

| Risk                                 | Mitigation                                                                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Telemetry leaks source code**      | Telemetry stores only typed metrics (token counts, durations, task class enum) — never file contents, paths, or prompt text. Schema enforced at build time. |
| **Cache contains sensitive code**    | Cache is stored in `.aic/cache/` (gitignored, `0700` permissions); never uploaded; user controls TTL via config                                             |
| **`repo_id` reveals project path**   | `repo_id` is a SHA-256 hash of the absolute path — irreversible, cannot be used to identify the project                                                     |
| **Model endpoint receives code**     | `aic_compile` never contacts any external service. Context Guard blocks secrets and credentials before content reaches the model endpoint.                  |
| **SQLite database contains prompts** | Database is stored in `.aic/` (gitignored, `0700`). Contains compilation metadata and intents — never pushed to any external service.                       |

For the full threat/mitigation analysis, see [Project Plan §12 — Data Leakage Prevention](project-plan.md).

---

## `.aic/` Directory Security

The `.aic/` directory stores AIC's local database, cache, and metadata. It is treated as sensitive:

- **Auto-gitignored:** `npx @aic/mcp init` adds `.aic/` to `.gitignore` automatically. The directory is never committed to version control.
- **Permissions:** Created with `0700` (owner-only read/write/execute). No group or world access.
- **No symlink traversal:** AIC does not follow symlinks inside `.aic/` to prevent symlink attacks that could redirect reads/writes outside the intended directory.

---

## Anonymous Telemetry

AIC can optionally send anonymous usage statistics to help improve the product. This is **disabled by default** and requires explicit opt-in during `npx @aic/mcp init`.

**What is sent:** AIC version, OS, Node version, task class (enum), primary language (enum), token reduction percentage, file counts, Guard block counts, cache hit rate, duration, model family (enum), editor (enum), heuristic signal averages.

**What is NEVER sent:** File paths, file content, prompts, intents, project names, API keys, user identifiers, or any personally identifiable information.

**Privacy guarantees (mandatory, non-negotiable):**

| Rule                  | Enforcement                                                        |
| --------------------- | ------------------------------------------------------------------ |
| No file paths         | Payload schema enforced at build time — no string fields for paths |
| No file content       | Only numeric aggregates and enum values                            |
| No prompts or intents | `task_class` is a fixed enum, not free text                        |
| No project names      | Not included in schema                                             |
| No persistent user ID | Each payload is independent; no session tracking                   |
| No IP logging         | Telemetry endpoint does not log client IPs                         |
| HTTPS only            | All payloads sent over TLS                                         |

**Full transparency:** Every payload is stored locally in SQLite before sending. Inspect the local `anonymous_telemetry_log` table in `.aic/aic.sqlite` with any SQLite client. For example:

```bash
sqlite3 .aic/aic.sqlite "SELECT created_at, status, payload_json FROM anonymous_telemetry_log ORDER BY created_at DESC LIMIT 5;"
```

**Batching:** Payloads are queued locally and sent in a single HTTPS request at most once per 5 minutes. The endpoint stores received payloads in a cloud database. After a payload is successfully sent, the local row is removed so the queue does not grow unbounded. If the endpoint is unreachable, payloads are silently dropped (not retried, not stored on the server).

Full payload schema and audit log spec: [MVP Spec §4d](implementation-spec.md).

---

## Telemetry Endpoint Threat Model

The `https://telemetry.aic.dev` endpoint is designed as an append-only, anonymous, low-value target.

| Threat                                 | Mitigation                                                                                                                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Payload injection** (fake telemetry) | Strict JSON schema validation — reject payloads that don't match the typed schema. Rate-limit by IP (10 req/min). Analytics-grade data only — never used for security decisions. |
| **DDoS**                               | CDN/WAF (Cloudflare). Rate limiting. Write-only endpoint with minimal attack value.                                                                                              |
| **Man-in-the-middle**                  | TLS only (HTTPS). No plaintext fallback.                                                                                                                                         |
| **Endpoint impersonation**             | URL hardcoded in AIC binary. Override only via explicit config change.                                                                                                           |
| **Data value if breached**             | Minimal — no PII, no code, no paths, no prompts. Worst case: polluted analytics.                                                                                                 |

**Design principle:** If the telemetry endpoint goes down, AIC continues working normally. If it's compromised, no user data is at risk.

Full threat model: [Project Plan §12 — Telemetry Endpoint Security](project-plan.md).

---

## MCP Server Top 10 Coverage

Mapping of AIC against the [CSA MCP Server Top 10 Security Risks](https://modelcontextprotocol-security.io/top10/server/) and the [MCP Security Best Practices spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices).

| #      | Risk                          |  AIC Status   | AIC Controls                                                                                                                                                                                                                                              | Notes                                                                                                   |
| ------ | ----------------------------- | :-----------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| MCP-01 | Prompt Injection              |    Covered    | Context Guard (6 pattern categories), `PromptInjectionScanner`, `MarkdownInstructionScanner`, `CommandInjectionScanner`, structural prompt template (intent is opaque, code in delimited blocks, constraints after context)                               | See [Prompt Injection Prevention](#prompt-injection-prevention)                                         |
| MCP-02 | Confused Deputy               |      N/A      | AIC is a local stdio server with no OAuth, no delegated auth, no multi-user. Single-user, single-process.                                                                                                                                                 | Would apply if AIC added HTTP transport or multi-user auth (Phase 2+)                                   |
| MCP-03 | Tool Poisoning                |      N/A      | AIC exposes exactly 3 tools (`aic_compile`, `aic_inspect`, `aic_chat_summary`). No dynamic tool loading, no third-party tool registry, no remote tool discovery.                                                                                          | Fixed tool set compiled into the binary                                                                 |
| MCP-04 | Credential & Token Exposure   |    Covered    | Config references env var _names_ only (never values). Log sanitization replaces secrets with `***`. Context Guard blocks `.env`, `*.pem`, `*.key`. `compiledPrompt` removed from `aic://last` resource. No API keys in SQLite or cache.                  | See [API Key Handling](#api-key-handling)                                                               |
| MCP-05 | Insecure Server Configuration |    Covered    | stdio only (no network exposure). `projectRoot`/`configPath` path containment guards reject traversal and sensitive prefixes. `.aic/` directory `0700` permissions, auto-gitignored. Zod schema validation at boundary with `max`/`regex` constraints.    | See [`.aic/` Directory Security](#aic-directory-security)                                               |
| MCP-06 | Supply Chain Attacks          | Covered (MVP) | Lockfile committed and verified. `pnpm audit` in CI. Exact version pinning (no `^`). Minimal runtime deps. Rule packs are local JSON only — no remote loading in MVP.                                                                                     | SBOM, signed npm releases, Dependabot/Snyk planned for Phase 1                                          |
| MCP-07 | Excessive Permissions         |    Covered    | All 3 tools are read-only (compile, inspect, summary). No file write, no shell exec, no network access exposed via MCP. Path containment guards prevent tools from reading outside the project home directory.                                            | Principle of least privilege by design                                                                  |
| MCP-08 | Data Exfiltration             |    Covered    | `aic_compile` never contacts external services. Telemetry is opt-in with no code, paths, or PII. `compiledPrompt` removed from `aic://last`. `tool_invocation_log` provides audit trail for all tool calls.                                               | See [Data Leakage Prevention](#data-leakage-prevention) and [Anonymous Telemetry](#anonymous-telemetry) |
| MCP-09 | Context Spoofing              |    Covered    | Intent is treated as opaque text (never interpolated into system instructions). Zod schema validation at boundary. Intent control-char strip removes `\x00-\x08`, `\x0B-\x1F`. `conversationId`/`modelId` constrained to printable ASCII with max length. | See [Prompt Injection Prevention](#prompt-injection-prevention)                                         |
| MCP-10 | Insecure Communication        |    Covered    | stdio transport only — local IPC, no network. No plaintext fallback.                                                                                                                                                                                      | If HTTP transport added (Phase 2+), mutual TLS or token auth required                                   |

**Honourable Mentions coverage:**

| Risk                      | AIC Status | AIC Controls                                                                                                                                             |
| ------------------------- | :--------: | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Insufficient Logging      |  Covered   | `tool_invocation_log` records every tool call with `params_shape` (typeof-only). `compilation_log` and `guard_findings` tables provide full audit trail. |
| Resource Exhaustion (DoS) |  Covered   | 30s compilation timeout via `Promise.race`. Intent capped at 10,000 chars. `configPath` capped at 4,096 chars.                                           |
| Input Validation Failures |  Covered   | Zod schemas validate all MCP handler inputs. Path containment guards reject traversal. `conversationId`/`modelId` regex-constrained to printable ASCII.  |
| Session Management        |  Covered   | Session tracking with `startSession`/`stopSession`. Shutdown handler for graceful cleanup. Crashed session backfill on startup.                          |

---

## MCP Transport & Rule Pack Security

| Attack surface           | Current state (MVP)                                 | Future hardening                                                    |
| ------------------------ | --------------------------------------------------- | ------------------------------------------------------------------- |
| **MCP transport**        | stdio only — local IPC, no network exposure         | Phase 2+: if HTTP transport added, require mutual TLS or token auth |
| **Rule pack loading**    | Local JSON files only — no remote URLs in MVP       | Phase 2: remote rule packs require signature verification (ed25519) |
| **Config `extends` URL** | Not implemented in MVP (`extends` field is Phase 2) | Phase 2: HTTPS only, URL allowlist, response schema validation      |
| **SQLite access**        | Local file with `0700` directory permissions        | Phase 2: optional SQLCipher encryption for at-rest protection       |

### MCP Tool Approval Requirements

Both Cursor and Claude Code require explicit user approval before MCP tools can execute. AIC's `aic_compile` and `aic_inspect` tools must be approved (allowed) by the user for AIC to function.

| Editor          | Approval mechanism                                                                                                             | If not approved                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| **Cursor**      | MCP indicator shows an approval prompt on first invocation. User clicks "Always allow" per tool. Reviewable in Settings → MCP. | Tool calls silently fail. Trigger rule detects this and notifies the user. |
| **Claude Code** | Runtime permission prompt, `--allowedTools` CLI flag, or `.mcp.json` permissions configuration.                                | Tool calls rejected. Trigger rule detects this and notifies the user.      |

**Risk:** If the user denies or never approves AIC tools, `aic_compile` is blocked even though the MCP server is running. The model operates without compiled context — no file selection, no security scanning, no token reduction.

**Mitigation:**

- The trigger rule (`.cursor/rules/AIC.mdc` or equivalent) includes a fallback instruction: if `aic_compile` is unavailable, the model tells the user how to enable it in their MCP settings.
- Installation documentation (README) explicitly instructs users to approve both `aic_compile` and `aic_inspect` during setup.
- The MCP server itself is unaffected — it runs normally. The block happens at the IDE layer between the model and the server.

---

## Supply Chain Security

| Control                  | Phase   | Implementation                                                                                                 |
| ------------------------ | ------- | -------------------------------------------------------------------------------------------------------------- |
| **Lockfile integrity**   | MVP     | `pnpm-lock.yaml` committed and verified in CI                                                                  |
| **Dependency audit**     | MVP     | `pnpm audit` runs in CI on every PR; build fails on critical vulnerabilities                                   |
| **Minimal dependencies** | All     | Runtime dependencies kept to minimum: `tiktoken`, `better-sqlite3`, `commander`, `fast-glob`, `ignore`, `diff` |
| **Automated scanning**   | Phase 1 | Dependabot or Snyk for continuous vulnerability monitoring                                                     |
| **SBOM generation**      | Phase 1 | CycloneDX SBOM generated on every release, published alongside npm package                                     |
| **Signed releases**      | Phase 1 | npm `--provenance` flag for tamper-proof publish attestation                                                   |

---

## Supported Versions

| Version   |          Supported           |
| --------- | :--------------------------: |
| 0.x (MVP) | ✅ Security fixes backported |
| < 0.1.0   |  ❌ Pre-release, no support  |

Security patches are released as patch versions (e.g., `0.1.1`). Critical vulnerabilities receive out-of-band releases regardless of the regular release schedule.

---

## Compliance

AIC's architecture is designed to be **technically compliant** with GDPR, SOC 2, and ISO 27001 from the start. Formal certifications are pursued when commercially justified — the architecture does not change.

### Design Principles

| Principle              | How AIC achieves it                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Privacy by default** | No data collection without explicit opt-in. No PII in any storage.                                                              |
| **Data minimisation**  | Telemetry collects only typed aggregates — no code, paths, or prompts                                                           |
| **User control**       | Opt-in/out at any time. Local telemetry rows can be inspected in `.aic/aic.sqlite`, and disabling telemetry stops future sends. |
| **Local-first**        | All processing on user's machine. No cloud dependency for core functionality.                                                   |
| **Transparency**       | Every telemetry payload logged locally before sending. Audit trail always available.                                            |
| **Security by design** | Context Guard, API key isolation, `.aic/` permissions, no symlink traversal                                                     |

### GDPR Readiness

| Requirement               |   Status   | Implementation                                                                        |
| ------------------------- | :--------: | ------------------------------------------------------------------------------------- |
| Lawful basis (consent)    |     ✅     | Opt-in prompt during `npx @aic/mcp init`. Default: disabled.                          |
| Data minimisation         |     ✅     | Fixed enum fields only. No free-text. No PII.                                         |
| Right to access           |     ✅     | Inspect or export `anonymous_telemetry_log.payload_json` from `.aic/aic.sqlite`       |
| Right to erasure          |     ✅     | Delete local `anonymous_telemetry_log` rows and set `telemetry.anonymousUsage: false` |
| Right to withdraw consent |     ✅     | Set config to `false` at any time. Immediate effect.                                  |
| Purpose limitation        |     ✅     | "Product improvement" stated in opt-in prompt and privacy policy                      |
| Data retention limit      | ⚠️ Phase 1 | Server-side: auto-delete after 90 days                                                |
| Privacy policy            | ⚠️ Phase 1 | Publish at `https://docs.aic.dev/privacy`                                             |

### SOC 2 Readiness

| Trust Principle     | Control                                                 |   Status   |
| ------------------- | ------------------------------------------------------- | :--------: |
| **Security**        | Local-first, no shared state                            |   ✅ MVP   |
|                     | Encryption in transit (TLS)                             |   ✅ MVP   |
|                     | Vulnerability management (`pnpm audit`)                 |   ✅ MVP   |
|                     | Incident response (`security.md`)                       |   ✅ MVP   |
|                     | Encryption at rest (SQLCipher)                          | ⚠️ Phase 2 |
|                     | Automated scanning (Dependabot/Snyk)                    | ⚠️ Phase 1 |
|                     | Penetration testing                                     | ❌ Phase 3 |
| **Availability**    | Works offline, local-first                              |   ✅ MVP   |
|                     | SQLite = single file backup                             |   ✅ MVP   |
| **Confidentiality** | Context Guard data classification                       |   ✅ MVP   |
|                     | No code leaves machine in the current MCP-only package  |   ✅ MVP   |
|                     | Third-party data sharing: opt-in, anonymous, verifiable |   ✅ MVP   |

### Compliance Roadmap

| Phase       | Milestone                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| **MVP**     | `security.md` published. `pnpm audit` in CI. Telemetry audit log. Privacy-by-default architecture.                        |
| **Phase 1** | Privacy policy. SBOM. Signed npm releases. Dependabot/Snyk. OpenSSF Scorecard badge. Server-side 90-day retention policy. |
| **Phase 2** | SQLCipher optional encryption. Formal risk register. SOC 2 Type I prep. GDPR DPIA. Rule pack signature verification.      |
| **Phase 3** | SOC 2 Type I audit. ISO 27001 gap assessment. Penetration test. Formal certifications when commercially justified.        |

Full compliance readiness mapping (including ISO 27001): [Project Plan §24](project-plan.md).
