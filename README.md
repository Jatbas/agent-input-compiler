# Agent Input Compiler (AIC)

![License](https://img.shields.io/badge/license-Apache%202.0-blue)
![Status](https://img.shields.io/badge/status-MVP%20in%20progress-yellow)
![Local-first](https://img.shields.io/badge/local--first-yes-brightgreen)
![Telemetry](https://img.shields.io/badge/telemetry-opt--in-lightgrey)
![MCP Compatible](https://img.shields.io/badge/MCP-compatible-purple)

> Deterministic context compiler for AI coding tools (Cursor, Claude Code, MCP-compatible editors).
>
> Local-first MCP server that sits transparently between your AI editor and any model, automatically selecting relevant files and compressing context — typically reducing tokens by ≥30% without changing your workflow.

---

## Prerequisites

- **Node.js ≥ 18** — required for `npx`. No other dependencies to install; `npx` handles everything.

---

## ⚡ Setup

Add to your editor's MCP config (one-time, per editor):

_Cursor_ — `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "aic": { "command": "npx", "args": ["@aic/mcp"] }
  }
}
```

_Claude Code_ — `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "aic": { "command": "npx", "args": ["@aic/mcp"] }
  }
}
```

Then continue prompting normally. AIC runs automatically from here — no config file, no account, no API key for AIC itself.

> **Optional:** Run `npx @aic/mcp init` in your project root to install the trigger rule (`.cursor/rules/aic.mdc` for Cursor, `.claude/CLAUDE.md` for Claude Code) and create `.aic/` for local storage.

---

## Why use it

Modern AI models have massive context windows, leading to a dangerous developer habit: dumping the entire codebase into the prompt. This triggers **"Lost in the Middle" syndrome** — the model gets overwhelmed by noise, hallucinates APIs, forgets instructions, and produces subtly broken code.

AIC fixes this by acting as a deterministic context compiler. It filters the noise _before_ the model runs, ensuring the AI only sees what matters.

| The Problem                            | How AIC solves it                                                                                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **"Lost in the Middle" hallucination** | Selects only high-relevance files (via heuristics) and compresses them, forcing the model to focus on the exact semantic context.                                                                                        |
| **Inconsistent outputs**               | Deterministic pipeline: same intent + same codebase = same compiled context, every time. No more rolling the dice on what the editor decides to include.                                                                 |
| **Wasted tokens (and time)**           | ≥30% reduction via content transformation (HTML→MD, dead code stripping) + 4-tier summarisation ladder. Faster inference, cheaper API bills.                                                                             |
| **Missed dependencies**                | Import-graph analysis automatically traverses the codebase to include the files your target code actually relies on.                                                                                                     |
| **Leaked credentials**                 | **Context Guard** blocks secrets, API keys, and `.env` files before they reach the model. Stop accidentally uploading production keys to random LLMs.                                                                    |
| **Team scalability**                   | Shared rule packs and org-level configs allow teams to enforce architectural standards (e.g., "always use React Server Components") automatically.                                                                       |
| **Agentic cost explosion**             | Agents make 5–50 model calls per task. AIC compiles per-step context with session awareness — deduplicating files already shown, adapting budgets as conversation grows, and compounding ≥30% savings across every step. |

---

## How AIC compares

| Tool                            | Approach                                           | The AIC difference                                                                                                                                                                                       |
| ------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cursor / Copilot**            | IDE-embedded, proprietary context engine           | AIC is open-source, deterministic, and proves _exactly_ what context was used. No black boxes.                                                                                                           |
| **Aider**                       | Git-aware, sends full files to the model           | AIC compresses files tier-by-tier (e.g. signatures only), preventing context bloat and preserving model accuracy.                                                                                        |
| **Continue.dev**                | IDE plugin with manual/configurable context        | AIC is CLI-first and runs automatically on every prompt.                                                                                                                                                 |
| **MCP-native tools** (emerging) | Various context and retrieval servers built on MCP | AIC focuses exclusively on _compiling_ context — not retrieval, code search, or agent orchestration. It is composable: other MCP servers can feed data into the editor alongside AIC's compiled context. |
| **Raw LLM usage**               | Manual copy-paste of context                       | AIC automates selection, enforces token budgets, and formats the prompt perfectly.                                                                                                                       |

**AIC's unique position:** The only tool focused entirely on _compiling the input_ securely and deterministically, maximizing model accuracy by ruthlessly eliminating noise. As the MCP ecosystem grows, AIC's scope — context compilation — is intentionally narrow and composable: it does one thing well and plays nicely with other MCP servers.

---

## Core properties

| Property                 | Description                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **Local-first**          | All processing runs on your machine — no cloud, no account, no API key for AIC itself                                  |
| **No workflow change**   | You continue prompting normally; AIC runs invisibly on every request                                                   |
| **Editor-agnostic**      | Cursor, Claude Code, any MCP-compatible editor                                                                         |
| **Model-agnostic**       | Auto-detects GPT-4o, Claude, Ollama, or any model; falls back to safe defaults                                         |
| **Deterministic**        | Same intent + same codebase → same compiled output, every time                                                         |
| **Zero config required** | Works out of the box with no `aic.config.json`                                                                         |
| **Extensible**           | New editors, models, and languages plug in without touching the core pipeline                                          |
| **Secure by default**    | Context Guard scans every selected file for secrets, credentials, and excluded paths before anything reaches the model |

---

## How it works

AIC runs a 10-step pipeline on every request:

1. **Classify** intent → task class (refactor / bugfix / feature / docs / test / general)
2. **Resolve** applicable rule packs
3. **Allocate** token budget
4. **Select** relevant files via heuristic scoring (path + imports + recency + size)
5. **Guard** — scan selected files for secrets, excluded paths, and prompt injection; block before content reaches the model
   5.5. **Transform** — compress file content for token efficiency (HTML→MD, JSON compaction, lock file/minified code skipping, comment stripping — savings of 40-99% per file)
6. **Compress** context through a 4-tier summarisation ladder (full → signatures+docs → signatures → names)
7. **Inject** constraints from rule packs
8. **Assemble** the final prompt
9. **Execute** (developer utilities only — not part of normal MCP flow)
10. **Log** telemetry (opt-in, disabled by default)

### See it in action

```
$ aic inspect "refactor auth module"

Task Classification
  Class: refactor (confidence: 0.92)
  Keywords: [refactor]

Rule Packs Applied
  1. built-in:default
  2. built-in:refactor

Context Budget: 8,000 tokens

Selected Files (8 of 142)
  # | File                          | Score | Tokens | Tier
  1 | src/auth/service.ts           | 0.91  | 1,240  | L0
  2 | src/auth/middleware.ts        | 0.87  |   890  | L0
  3 | src/auth/types.ts             | 0.82  |   340  | L0
  4 | src/config/jwt.ts             | 0.78  |   520  | L0
  5 | src/routes/auth.ts            | 0.72  |   680  | L0
  6 | src/components/App.html       | 0.54  |   960  | L1
  7 | package-lock.json             | 0.32  | 12,400 | L2
  8 | src/types/auth.ts             | 0.28  |   180  | L2

Guard: clean (0 files blocked)

Transforms
  3 files transformed, 13,240 tokens saved
  src/auth/middleware.ts    CommentStripper              890 →   710 tokens
  package-lock.json         LockFileSkipper           12,400 →    12 tokens
  src/components/App.html   HtmlToMarkdownTransformer    960 →   288 tokens

Token Summary
  Raw (all 142 files):  45,000 tokens
  Selected (8 files):   17,210 tokens
  After transforms:      3,970 tokens
  After ladder:          3,580 tokens
  Reduction:             92.0%
```

For full architecture and design decisions, see [`documentation/project-plan.md`](documentation/project-plan.md).

---

## Developer utilities

For inspection and debugging — normal usage does not require these commands:

```bash
aic compile "fix the login bug"         # output the compiled prompt (stdout)
aic run "fix the login bug"             # compile + send to model endpoint
aic run --dry-run "fix the login bug"   # show model-formatted prompt without calling model
aic inspect "refactor auth module"      # full pipeline breakdown (no model call)
aic compare "add rate limiting"         # diff vs last cached compilation — see what changed
aic status                              # project summary: savings, Guard blocks, config health
aic telemetry log                       # inspect what anonymous telemetry was sent
aic init                                # scaffold aic.config.json + .aic/
aic init --upgrade                      # migrate config to current schema version
```

`aic compile` outputs the raw compiled prompt — no API key needed. `aic run` sends it to a configured model (OpenAI, Anthropic, or Ollama — Ollama runs locally, no API key required). `aic compare` recompiles and diffs against the last cached result — answering "what changed about the context AIC would send?" after you edit files or change config. `aic status` shows what AIC has been doing for you — compilations, token savings, Guard blocks, and config health.

> **Tip:** Add `#raw` to any prompt to bypass all content transformers and send raw file content. Useful when you need the model to see exact formatting (e.g., editing HTML templates).

---

## Context Guard

Before any file content reaches the model, AIC's Context Guard scans every selected file and blocks:

- **Secrets and credentials** — AWS keys, GitHub tokens, Stripe keys, JWTs, SSH private key headers, and generic named API keys detected by regex
- **Excluded paths** — `.env`, `*.pem`, `*.key`, `*secret*`, `*credential*`, and similar patterns never enter context, regardless of how they were selected
- **Prompt injection** — suspected instruction-override strings blocked before they can influence the model's behaviour

Blocked files are removed automatically from the compiled context. Findings are attached to `CompilationMeta.guard` and accessible via the `aic://last-compilation` MCP resource. The pipeline always continues — Guard filters, it never crashes.

New scanners (e.g. PII detection) are added by implementing the `GuardScanner` interface — zero changes to the core pipeline.

---

## Rules & Hooks Analyzer

AIC scans your editor rules and hooks (`.cursorrules`, Cursor rule files, Claude Code settings) and reports:

- Conflicting instructions
- Redundant rules
- Overly broad triggers
- Constraints that duplicate what AIC already injects

Findings are available via the `aic://rules-analysis` MCP resource after each compilation.

---

## Documentation

| Document                                                                   | Description                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [`project-plan.md`](documentation/project-plan.md)                         | Architecture, design principles, interfaces, ADRs, roadmap    |
| [`mvp-specification-phase0.md`](documentation/mvp-specification-phase0.md) | Implementation details, pipeline spec, success criteria       |
| [`security.md`](documentation/security.md)                                 | Security model, vulnerability reporting, compliance readiness |

---

## Roadmap

| Phase                            | Focus                                                                                                              | Status         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------- |
| MCP Server + Utilities (`0.1.0`) | Core pipeline, transformers, Guard, telemetry                                                                      | 🟡 In progress |
| Quality Release (`0.2.0`)        | Multi-language imports, intent-aware discovery, session summary, CSS/TypeDecl/test-structure transformers          | ⬜ Next        |
| OSS Release (`1.0.0`)            | Public repo, team deployment, `aic history`, `aic suggest`, optional cost estimation, **agentic session tracking** | ⬜ Planned     |
| Semantic + Governance (`2.0.0`)  | Vector search, policy engine, org-level config, **conversation compression for agents**                            | ⬜ Planned     |
| Enterprise Platform (`3.0.0`)    | RBAC, SSO, fleet management, live dashboard                                                                        | ⬜ Future      |

---

## Contributing

Contributions are welcome — whether it's a bug fix, a new `LanguageProvider`, an additional `ContentTransformer`, or improving documentation.

**Quick start:**

1. Fork and clone the repo
2. `pnpm install` (no other setup needed)
3. `pnpm test` to verify the suite passes
4. Create a branch: `git checkout -b feat/your-feature`
5. Open a PR — the CI checks lint, types, tests, and benchmarks automatically

**What we look for in PRs:** Every contribution must follow the [SOLID principles and design patterns](documentation/project-plan.md#21-solid-principles--design-patterns) defined in the Project Plan. This is checked in code review before any other criterion. New pipeline features should implement an existing interface (OCP), not modify existing classes.

For the full guide — code style, commit format, DCO sign-off, and PR checklist — see [Licensing & Contribution](documentation/project-plan.md#21-licensing--contribution-phase-1-prep) in the Project Plan.

---

## License

Apache 2.0
