# Agent Input Compiler (AIC)

![License](https://img.shields.io/badge/license-Apache%202.0-blue)
![Status](https://img.shields.io/badge/status-0.2.0-brightgreen)
![Local-first](https://img.shields.io/badge/local--first-yes-brightgreen)
![Telemetry](https://img.shields.io/badge/telemetry-opt--in-lightgrey)
![MCP Compatible](https://img.shields.io/badge/MCP-compatible-purple)
![AI-Assisted Engineering](https://img.shields.io/badge/AI--assisted-engineering-blueviolet)

> Deterministic context compiler for AI coding tools. Local-first MCP server that selects relevant files and compresses context before it reaches the model.

---

## Why use it

Modern AI models have massive context windows, leading to a dangerous developer habit: dumping large amounts of code into the prompt. This triggers **"Lost in the Middle" syndrome** — the model gets overwhelmed by noise, hallucinates APIs, forgets instructions, and produces subtly broken code.

AIC fixes this by acting as a deterministic context compiler. It filters the noise _before_ the model runs, ensuring the AI sees a curated, relevant subset of your codebase.

Every token you save is capacity you reclaim. A leaner context means the model reasons over signal, not noise — producing more accurate code with fewer iterations. If you're on a metered plan, it also means more requests from the same budget. AIC makes the context window work harder so you can ship faster.

```
> show aic status

Status = project-level AIC status.

  Compilations:       875+
  Tokens saved:       420M (98.5% reduction)
  Budget:             6,300 / 8,000 tokens (79% utilized)
  Files guarded:      60 blocked across all sessions
  Cache hit rate:     42%
  Last compiled:      2 minutes ago

> show aic last

Last = what AIC sent to the model.

  Intent:    "refactor auth module"
  Task:      refactor (confidence: 0.92)
  Selected:  8 of 142 files
  Guard:     clean (0 blocked)
  Tokens:    45,000 → 3,970 (91.2% reduction)
```

| The Problem                            | How AIC helps                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **"Lost in the Middle" hallucination** | Scores every file by relevance and compresses them, so the model focuses on the right code                                                        |
| **Inconsistent outputs**               | Same intent + same codebase = same compiled context, every time                                                                                   |
| **Wasted tokens**                      | Strips comments, compacts JSON, and progressively summarises files to cut token usage by 98%                                                      |
| **Leaked credentials**                 | **Context Guard** blocks secrets, API keys, and `.env` files before they reach the model                                                          |
| **No visibility into context**         | "show aic last" displays which files were selected, how they were compressed, and what was blocked — full pipeline transparency inside the editor |

---

## Measured Impact

In real-world use during development with Cursor, AIC consistently reduces context sent to the model by over **98%** — compiling over 400M raw tokens (the full project scan across all compilations) down to under 7M. Every token saved is context window capacity recovered: the model focuses on relevant code instead of noise, produces fewer hallucinations, and you iterate faster.

---

## Setup

### Quick check

```bash
npx @aic/mcp --help
```

### Prerequisites

- **Node.js >= 18** — required for `npx`

### Cursor (recommended — full integration)

**Step 1 — Register the MCP server.** Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "aic": { "command": "npx", "args": ["@aic/mcp"] }
  }
}
```

**Step 2 — Install hooks and trigger rule.** Run in your project root:

```
npx @aic/mcp init
```

This creates:

- `.cursor/rules/aic.mdc` — trigger rule that instructs the model to call `aic_compile`
- `.cursor/hooks/AIC-*.cjs` — integration hooks for session context, tool gating, and quality checks
- `.aic/` directory (0700 permissions) — local storage for cache and telemetry

**Step 3 — Approve MCP tools.** When Cursor first invokes `aic_compile`, you will see an approval prompt on the MCP indicator. Click **"Always allow"** for both `aic_compile` and `aic_inspect`. If these tools are denied or left unapproved, AIC cannot compile context and the model will operate without curated project context. You can review approved tools at any time in **Settings → MCP**.

### Claude Code

**Step 1 — Register the MCP server.** Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "aic": { "command": "npx", "args": ["@aic/mcp"] }
  }
}
```

**Step 2 — Allow AIC tools.** Claude Code requires explicit tool permissions. When prompted during your first session, approve `aic_compile` and `aic_inspect`. Alternatively, pass `--allowedTools` when starting Claude Code, or add AIC tools to your permissions configuration so they are always permitted.

If the tools are not approved, the model cannot call `aic_compile` and will operate without compiled context. AIC's trigger rule will notify you if the tool is unavailable.

### Other MCP-compatible editors

AIC's MCP tool works with any editor that supports MCP. Add the server to your editor's MCP config. The model can call `aic_compile` when instructed to by rules or when it chooses to.

Note: without an integration layer (hooks), AIC relies on the model voluntarily calling the tool. The trigger rule improves this, but enforcement varies by editor. See the [architecture guide](documentation/architecture.md) for details on editor hook coverage.

---

## Prompt commands

Ask the model in your editor:

```
show aic status        # "Is it working?" — health check + lifetime stats
show aic last          # "What just happened?" — what AIC sent to the model last time
show aic chat summary  # this conversation's compilation stats
```

---

## How it works

AIC's core pipeline processes context through a multi-step pipeline:

1. **Classify** intent into a task class (refactor, bugfix, feature, docs, test, general)
2. **Resolve** applicable rule packs for constraints and patterns
3. **Allocate** token budget based on model context window
4. **Select** relevant files via heuristic scoring (path relevance, imports, recency, size)
5. **Guard** — scan selected files for secrets, excluded paths, and prompt injection; block before content reaches the model
   - 5.5. **Transform** — compress file content (comment stripping, JSON compaction, lock file skipping)
6. **Compress** through a 4-tier summarisation ladder (full content → signatures+docs → signatures only → names only)
7. **Inject** constraints from rule packs
8. **Assemble** the final compiled prompt

The core pipeline is editor-agnostic — it doesn't know or care who called it. Editor-specific integration layers (hooks) ensure the pipeline runs at the right time. See the [architecture guide](documentation/architecture.md) for the full two-layer design, editor hook capabilities, and integration status.

---

## Core properties

| Property              | Description                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Local-first**       | All processing runs on your machine — no cloud, no account, no API key for AIC itself                                  |
| **Deterministic**     | Same intent + same codebase → same compiled output, every time                                                         |
| **Zero config**       | Works out of the box with no `aic.config.json`; optional config for customization                                      |
| **Secure by default** | Context Guard scans every selected file for secrets, credentials, and excluded paths before anything reaches the model |
| **Extensible**        | New languages, transformers, and scanners plug in via interfaces without touching the core pipeline                    |
| **Model-agnostic**    | Works with any model the editor is configured to use — AIC compiles context, never calls models                        |

---

## Context Guard

Before any file content reaches the model, AIC's Context Guard scans every selected file and blocks:

- **Secrets and credentials** — AWS keys, GitHub tokens, Stripe keys, JWTs, SSH private key headers, and generic named API keys detected by regex
- **Excluded paths** — `.env`, `*.pem`, `*.key`, `*secret*`, `*credential*`, and similar patterns never enter context
- **Prompt injection** — suspected instruction-override strings blocked before they can influence the model

Blocked files are removed from the compiled context. Findings are attached to compilation metadata and logged locally. The pipeline always continues — Guard filters, it never crashes.

---

## Telemetry

AIC records compilation telemetry locally in `.aic/aic.sqlite` — token counts, file selection, duration, cache hits. Never file paths, file content, prompts, or PII. Local-only by default; anonymous aggregate reporting is opt-in.

---

## Limitations

Current integration gaps are editor-specific — the core pipeline handles all compilation scenarios identically. Cursor supports session-start compilation and tool gating but not per-prompt or subagent context injection. Claude Code supports all hook capabilities but its integration layer is not yet built. See the [architecture guide](documentation/architecture.md#editor-specific-integration-gaps) for the full breakdown.

---

## Future Work

**Claude Code integration** is the single highest-impact item — Claude Code's hook system enables per-prompt context injection, subagent context, and pre-compaction compilation, all structurally impossible in Cursor. The core pipeline requires no changes; only new hook scripts calling the same `aic_compile` tool. See the [architecture guide](documentation/architecture.md) for the full capability comparison.

**Additional editor support** — as editors add hook capabilities, AIC adds thin integration layers. The [architecture guide](documentation/architecture.md#what-aic-needs-from-an-editor) serves as a checklist.

**Agentic session tracking** — session-level deduplication, conversation compression, and adaptive budget allocation for multi-step agent workflows. Planned for Phase 1.

**Token reduction benchmarks** — a formal, reproducible benchmark suite across multiple open-source repos is planned to validate the 98%+ reduction broadly. Tracked as Phase K in [mvp-progress.md](documentation/mvp-progress.md).

---

## Documentation

| Document                                                         | Description                                                    |
| ---------------------------------------------------------------- | -------------------------------------------------------------- |
| [`architecture.md`](documentation/architecture.md)               | Two-layer design, editor hook capabilities, integration status |
| [`best-practices.md`](documentation/best-practices.md)           | Best practices for AI-assisted coding with AIC                 |
| [`project-plan.md`](documentation/project-plan.md)               | Architecture, design principles, interfaces, ADRs, roadmap     |
| [`implementation-spec.md`](documentation/implementation-spec.md) | Implementation details, pipeline spec, success criteria        |
| [`security.md`](documentation/security.md)                       | Security model, vulnerability reporting, compliance readiness  |
| [`mvp-progress.md`](documentation/mvp-progress.md)               | Current progress, daily log                                    |

---

## Roadmap

| Phase                           | Focus                                                                                  | Status  |
| ------------------------------- | -------------------------------------------------------------------------------------- | ------- |
| MVP (`0.1.0`)                   | Core pipeline, transformers, Guard, telemetry, MCP server                              | Done    |
| Quality Release (`0.2.0`)       | Cursor integration layer, multi-language imports, intent-aware discovery, benchmarks   | Done    |
| OSS Release (`1.0.0`)           | Public repo, Claude Code integration, agentic session tracking, Specification Compiler | Planned |
| Semantic + Governance (`2.0.0`) | Vector search, policy engine, conversation compression for agents                      | Planned |
| Enterprise Platform (`3.0.0`)   | RBAC, SSO, fleet management, dashboard                                                 | Future  |

---

## Contributing

Contributions are welcome — whether it's a bug fix, a new `LanguageProvider`, an additional `ContentTransformer`, or improving documentation.

**Quick start:**

1. Fork and clone the repo
2. `pnpm install`
3. `pnpm test` to verify the suite passes
4. Create a branch: `git checkout -b feat/your-feature`
5. Open a PR

For the full guide — code style, commit format, and PR checklist — see [Licensing & Contribution](documentation/project-plan.md#21-licensing--contribution-phase-1-prep) in the Project Plan.

---

## License

Apache 2.0
