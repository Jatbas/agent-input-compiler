# Agent Input Compiler (AIC)

![License](https://img.shields.io/badge/license-Apache%202.0-blue)
![Status](https://img.shields.io/badge/status-Phase%200.5%20in%20progress-yellow)
![Local-first](https://img.shields.io/badge/local--first-yes-brightgreen)
![Telemetry](https://img.shields.io/badge/telemetry-opt--in-lightgrey)
![MCP Compatible](https://img.shields.io/badge/MCP-compatible-purple)

> Deterministic context compiler for AI coding tools. Local-first MCP server + CLI that selects relevant files and compresses context before it reaches the model.

---

## Why use it

Modern AI models have massive context windows, leading to a dangerous developer habit: dumping large amounts of code into the prompt. This triggers **"Lost in the Middle" syndrome** — the model gets overwhelmed by noise, hallucinates APIs, forgets instructions, and produces subtly broken code.

AIC fixes this by acting as a deterministic context compiler. It filters the noise _before_ the model runs, ensuring the AI sees a curated, relevant subset of your codebase.

| The Problem                            | How AIC helps                                                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **"Lost in the Middle" hallucination** | Selects only high-relevance files (via heuristic scoring) and compresses them, focusing the model on the right code                            |
| **Inconsistent outputs**               | Deterministic pipeline: same intent + same codebase = same compiled context, every time                                                        |
| **Wasted tokens (and money)**          | Content transformation (comment stripping, lock file skipping, JSON compaction) + 4-tier summarisation ladder reduce token usage significantly |
| **Leaked credentials**                 | **Context Guard** blocks secrets, API keys, and `.env` files before they reach the model                                                       |
| **No visibility into context**         | `aic inspect` shows exactly which files were selected, why, and how they were transformed — full pipeline transparency                         |

---

## Architecture: Two Layers

AIC has two distinct layers:

**1. Core Pipeline (editor-agnostic)** — The compilation engine. Takes an intent and a project root, runs a deterministic pipeline (classify, select, guard, transform, compress, assemble), and returns compiled context. The pipeline handles every compilation scenario — session start, per-prompt, per-subagent, pre-compaction — identically. It doesn't know or care who called it.

**2. Integration Layer (per-editor)** — Thin adapters that ensure the core pipeline runs at the right time and delivers its output to the model. Each editor exposes different hook capabilities, so each integration layer calls `aic_compile` at different points in the editor's lifecycle.

**What this means:** AIC's compilation capabilities are complete. Any perceived limitation in what AIC "can do" is actually a limitation of the editor's hook system — whether the editor gives AIC the opportunity to run at a given moment. Because AIC follows SOLID principles (dependency injection, interface segregation), adding a new integration layer for a new editor means writing thin hook scripts that call the same core pipeline. No core changes needed.

### What AIC needs from an editor

For full AIC integration, an editor should expose these hook capabilities:

| Capability                             | What it enables                                                                        | Required?    |
| -------------------------------------- | -------------------------------------------------------------------------------------- | ------------ |
| **Session start + context injection**  | Compile context once and inject into the conversation. Model starts with curated code. | Recommended  |
| **Per-prompt + context injection**     | Compile intent-specific context on every user message. Adapts to topic changes.        | Ideal        |
| **Pre-tool-use gating**                | Block tool calls until `aic_compile` runs. Enforces compilation on tool-using turns.   | Recommended  |
| **Subagent start + context injection** | Inject compiled context when subagents spawn. Closes the biggest agentic gap.          | Ideal        |
| **Session end**                        | Log session lifecycle for telemetry.                                                   | Nice to have |
| **Pre-compaction**                     | Re-compile before context window compaction. Preserves quality during long sessions.   | Nice to have |
| **Trigger rule**                       | Text instruction asking the model to call `aic_compile`. Minimum viable integration.   | Minimum      |

No editor currently supports all of these. But the core pipeline is ready for all of them — the only variable is which hooks the editor provides.

### Current editor support

| Capability                         | Cursor | Claude Code |
| ---------------------------------- | ------ | ----------- |
| Session start + context injection  | Yes    | Yes         |
| Per-prompt + context injection     | No     | Yes         |
| Pre-tool-use gating                | Yes    | Yes         |
| Subagent start + context injection | No     | Yes         |
| Session end                        | No     | Yes         |
| Pre-compaction                     | No     | Yes         |
| Trigger rule                       | Yes    | Yes         |

Cursor's integration layer is built and active. Claude Code's is not yet built, but its hook system covers all capabilities — making it the most complete target for AIC integration.

---

## Present Work: Cursor Integration

AIC's integration layer currently targets **Cursor**, which provides the richest hook system for context injection and tool gating.

### What the Cursor integration does

| Hook               | What happens                                                                                                                                                                      | When                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Session start**  | AIC compiles context with your project's current state and injects it into the conversation's system prompt. The model starts every session with a curated view of your codebase. | Once, when you open a new chat |
| **Prompt capture** | Records your message so the compilation can be targeted to your specific intent                                                                                                   | Every time you send a message  |
| **Tool gate**      | Ensures the model calls `aic_compile` before using other tools, so it always has compiled context rather than reading raw files                                                   | Before each tool call          |
| **Edit tracking**  | Records which files the agent edits during the session                                                                                                                            | After each file edit           |
| **Stop check**     | Runs ESLint and TypeScript type-checking on all files edited during the session, and reports errors for the agent to fix                                                          | When the agent finishes        |

### The value of session-start context

When AIC compiles context at session start, it selects the most relevant files from your codebase and compresses them into a token-efficient representation. This compiled context persists for the entire conversation, meaning:

- The model starts with a curated understanding of your codebase from the first message
- It doesn't need to spend tokens reading raw files to orient itself
- File selection is algorithmic and deterministic, not dependent on the model's guesswork
- Security scanning (Context Guard) runs before any code reaches the model

Even if AIC doesn't compile every subsequent prompt in the conversation (that depends on the agent's behavior and the tool gate), the initial compilation provides a foundation that benefits every turn.

---

## How to Use AIC: Best Practices

These are best practices for getting the most out of AI-assisted coding. AIC is designed to amplify them — when you follow these patterns, AIC ensures your AI assistant has the best possible context.

### Start a new session for each task

**Why:** Every new chat session starts with a clean context window. The model has no residual assumptions from a previous task — no stale variable names, no outdated file contents, no prior reasoning that might conflict with the new task. Research on LLM attention shows that models weigh recent context more heavily; starting fresh ensures no interference from unrelated prior turns.

**How AIC helps:** At session start, AIC compiles fresh context targeted to your project's current state. A new session means a new compilation — clean, relevant, and up to date.

### Be specific with your first message

**Why:** The more specific your intent, the better the model understands what you need. Vague prompts like "fix the bug" give the model nothing to anchor on — it must guess which files matter. Specific prompts like "fix the authentication timeout in src/auth/middleware.ts" let it focus immediately, reducing the need for exploratory file reads that consume tokens.

**How AIC helps:** AIC uses your intent to classify the task and select which files to include. A specific intent produces higher-confidence classification and better file scoring — the model sees the right code from the start instead of a broad, unfocused selection.

### One concern per session

**Why:** Mixing "fix the auth bug" with "also refactor the database layer" creates context pollution. The model's attention is split across unrelated code, and its context window fills with files from both concerns. LLMs show degraded accuracy when the context contains information irrelevant to the current question — the "Lost in the Middle" effect.

**How AIC helps:** AIC compiles context per intent. A focused session means the compiled context is precisely targeted — not diluted across unrelated concerns. All selected files score high for one task, not medium for two.

### Keep sessions focused and short

**Why:** Long conversations accumulate noise. The model's context window fills with previous messages, tool outputs, and intermediate results. When the context window reaches capacity, the editor compacts (summarizes) earlier content, and the model loses details from the beginning of the conversation — including AIC's compiled context. Short, focused sessions avoid this compaction loss entirely.

**How AIC helps:** In a short session, AIC's initial compiled context remains prominent in the context window. The model works with curated code throughout rather than increasingly summarized leftovers. In Claude Code, the `PreCompact` hook offers an opportunity to re-compile before compaction.

### Start fresh when switching topics

**Why:** If you're working on authentication and suddenly ask about the database schema, the model carries assumptions from the auth work. Its context window is full of auth code, auth-related tool outputs, and auth-focused reasoning. It might hallucinate connections between auth and database that don't exist, or miss important database context because there's no room for it.

**How AIC helps:** A new session triggers a new AIC compilation targeted to the new topic. The model gets files scored and selected for the database task, not leftovers from auth work.

### Review before accepting

**Why:** AI hallucinations happen even with good context. The model might generate plausible-looking code that references APIs that don't exist, uses wrong method signatures, or subtly breaks edge cases. Better context reduces the frequency of hallucinations but cannot eliminate them — the model is still probabilistic.

**How AIC helps:** AIC reduces the hallucination surface by giving the model verified, relevant code rather than noise. Context Guard ensures no secrets leak into the model's view. But AIC doesn't eliminate the need for review — always verify generated code against your actual codebase.

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

### See it in action

```
$ aic inspect "refactor auth module"

Task Classification
  Class: refactor (confidence: 0.92)

Selected Files (8 of 142)
  # | File                          | Score | Tokens | Tier
  1 | src/auth/service.ts           | 0.91  | 1,240  | L0
  2 | src/auth/middleware.ts        | 0.87  |   890  | L0
  3 | src/auth/types.ts             | 0.82  |   340  | L0
  ...

Guard: clean (0 files blocked)

Token Summary
  Raw (all 142 files):  45,000 tokens
  Selected (8 files):   17,210 tokens
  After transforms:      3,970 tokens
  Reduction:             91.2%
```

---

## Setup

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

### Other MCP-compatible editors

AIC's MCP tool works with any editor that supports MCP. Add the server to your editor's MCP config. The model can call `aic_compile` when instructed to by rules or when it chooses to.

Note: without an integration layer (hooks), AIC relies on the model voluntarily calling the tool. The trigger rule improves this, but enforcement varies by editor. See [Limitations](#limitations) for details.

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

## Developer utilities

For inspection and debugging:

```bash
aic compile "fix the login bug"         # output the compiled prompt to stdout
aic inspect "refactor auth module"      # full pipeline breakdown (no model call)
aic status                              # project summary: compilations, Guard blocks, config health
aic init                                # scaffold config, hooks, and .aic/ directory
aic init --upgrade                      # migrate config to current schema version
```

---

## Telemetry

AIC records compilation telemetry locally in `.aic/aic.sqlite`. This includes token counts, file selection, duration, and cache hits — never file paths, file content, prompts, or PII. Telemetry is local-only by default; anonymous aggregate reporting is opt-in.

### What telemetry covers

- Every `aic_compile` call (whether from hooks, MCP, or CLI)
- Token reduction per compilation (raw vs compiled)
- Files selected and their summarisation tiers
- Guard findings (blocked files count)
- Cache hit/miss rates

### What telemetry does not cover

- The model's own token usage (not accessible to AIC)
- Tool calls the model makes independently (file reads, searches, etc.)
- Total conversation token cost
- What the model does with the compiled context

Telemetry measures AIC's compilation efficiency. It does not measure overall conversation efficiency — that depends on the model's behavior, which AIC cannot observe.

---

## Limitations

AIC's core pipeline has no inherent limitations on when or how it can compile context. The limitations below are constraints of the editor's hook system, not of AIC itself. As editors add new hooks, AIC can immediately take advantage of them without core changes.

### Editor-specific integration gaps

Each editor exposes a different subset of the hook capabilities AIC can use. Gaps in one editor may not exist in another:

- **Cursor** does not support per-prompt context injection or subagent context injection. AIC can inject compiled context at session start and enforce compilation via tool gating, but text-only turns and subagent spawns bypass AIC.
- **Claude Code** supports all hook capabilities AIC needs (including per-prompt and subagent injection), but the integration layer is not yet built.
- **Other editors** without hooks rely solely on the trigger rule, which is suggestive — the model may or may not call `aic_compile`.

### Telemetry scope

AIC measures its own compilation efficiency (tokens before and after compilation). It cannot measure the total token cost of a conversation or whether the model used the compiled context effectively — that data is internal to the editor and model. Planned improvements include linking compilations to conversation IDs, tracking trigger source (which hook triggered the compilation), and distinguishing hook-initiated from model-initiated calls.

---

## Future Work

### Claude Code integration (high priority)

Claude Code provides the most complete hook system for AIC — it covers all capabilities in the table above (`SessionStart`, `UserPromptSubmit` with context injection, `PreToolUse`, `SubagentStart` with context injection, `SessionEnd`, `PreCompact`). Building the Claude Code integration layer is the single highest-impact item because it enables capabilities that are structurally impossible in Cursor:

- **Per-prompt context injection** — compile intent-specific context on every user message
- **Subagent context injection** — inject compiled context when subagents spawn
- **Pre-compaction compilation** — re-compile before the editor compacts, preserving context quality in long sessions

The core pipeline requires no changes — only new hook scripts calling the same `aic_compile` tool.

### Additional editor support

As editors add hook capabilities, AIC can add thin integration layers. The "What AIC needs from an editor" table above serves as a checklist — any editor that exposes those hooks can be supported without core changes.

### Agentic session tracking

Multi-step agent workflows would benefit from session-level deduplication, conversation compression, and adaptive budget allocation. This is planned for Phase 1 and requires a session tracking layer on top of the core pipeline.

### Token reduction benchmarks

Reproducible benchmarks across multiple real-world repos and task types are needed to quantify AIC's token reduction. Currently, the project has individual data points but no published benchmark suite. This is tracked as Phase K in `mvp-progress.md`.

---

## Documentation

| Document                                                                   | Description                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [`project-plan.md`](documentation/project-plan.md)                         | Architecture, design principles, interfaces, ADRs, roadmap    |
| [`mvp-specification-phase0.md`](documentation/mvp-specification-phase0.md) | Implementation details, pipeline spec, success criteria       |
| [`security.md`](documentation/security.md)                                 | Security model, vulnerability reporting, compliance readiness |
| [`mvp-progress.md`](documentation/mvp-progress.md)                         | Current progress, daily log                                   |

---

## Roadmap

| Phase                           | Focus                                                                                  | Status      |
| ------------------------------- | -------------------------------------------------------------------------------------- | ----------- |
| MVP (`0.1.0`)                   | Core pipeline, transformers, Guard, telemetry, MCP server, CLI                         | Done        |
| Quality Release (`0.2.0`)       | Cursor integration layer, multi-language imports, intent-aware discovery, benchmarks   | In progress |
| OSS Release (`1.0.0`)           | Public repo, Claude Code integration, agentic session tracking, Specification Compiler | Planned     |
| Semantic + Governance (`2.0.0`) | Vector search, policy engine, conversation compression for agents                      | Planned     |
| Enterprise Platform (`3.0.0`)   | RBAC, SSO, fleet management, dashboard                                                 | Future      |

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
