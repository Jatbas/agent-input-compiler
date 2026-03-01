# Agent Input Compiler (AIC)

![License](https://img.shields.io/badge/license-Apache%202.0-blue)
![Status](https://img.shields.io/badge/status-0.2.0%20in%20progress-yellow)
![Local-first](https://img.shields.io/badge/local--first-yes-brightgreen)
![Telemetry](https://img.shields.io/badge/telemetry-opt--in-lightgrey)
![MCP Compatible](https://img.shields.io/badge/MCP-compatible-purple)
![AI-Assisted Engineering](https://img.shields.io/badge/AI--assisted-engineering-blueviolet)

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

No editor has a complete AIC integration for all of these yet. But the core pipeline is ready for all of them — the only variable is which hooks the editor provides and whether AIC's integration layer has been built for them.

### Editor hook coverage and integration status

**Integrated** = editor exposes the hook and AIC's integration is built. **Hook available** = editor exposes the hook but AIC integration is not yet built. **—** = editor does not expose this hook.

| Capability                         | Cursor     | Claude Code    |
| ---------------------------------- | ---------- | -------------- |
| Session start + context injection  | Integrated | Hook available |
| Per-prompt + context injection     | —          | Hook available |
| Pre-tool-use gating                | Integrated | Hook available |
| Subagent start + context injection | —          | Hook available |
| Session end                        | —          | Hook available |
| Pre-compaction                     | —          | Hook available |
| Trigger rule                       | Integrated | Hook available |

Cursor has the most mature AIC integration (3 of 7 capabilities built and active). Claude Code's hook system covers all 7 capabilities, but the integration layer is not yet built — making it the highest-impact target for future work.

---

## Present Work: Cursor Integration

AIC's integration layer currently targets **Cursor**, which has the most mature integration for context injection and tool gating.

### What the Cursor integration does

| Hook               | What happens                                                                                                                                                                      | When                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Session start**  | AIC compiles context with your project's current state and injects it into the conversation's system prompt. The model starts every session with a curated view of your codebase. | Once, when you open a new chat |
| **Prompt capture** | Records your message so the compilation can be targeted to your specific intent                                                                                                   | Every time you send a message  |
| **Tool gate**      | Ensures the model calls `aic_compile` before using other tools, so it always has compiled context rather than reading raw files                                                   | Before each tool call          |
| **Edit tracking**  | Records which files the agent edits during the session                                                                                                                            | After each file edit           |
| **Stop check**     | Runs ESLint and TypeScript type-checking on all files edited during the session, and reports errors for the agent to fix                                                          | When the agent finishes        |

Note: this table lists all hooks in the Cursor integration, including operational hooks (prompt capture, edit tracking, stop check) that are not compilation capabilities. The coverage table above focuses on compilation-relevant capabilities only. Prompt capture records the user's intent for use in the next compilation — it does not compile and inject context on every prompt (that would require per-prompt context injection, which Cursor does not expose).

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

### One task, one session

**Why:** Dedicate each chat session to a single, focused task. Mixing concerns — "fix the auth bug, then refactor the database layer" — splits the model's attention across unrelated code and fills the context window with files from both tasks. Neither gets the model's full focus, and LLMs show degraded accuracy when context contains irrelevant information (the "Lost in the Middle" effect). When you finish a task or need to switch topics, start a new session. A new session gives the model a clean context window — no stale variable names, no outdated file contents, no prior reasoning that might conflict with the new task.

**How AIC helps:** Each new session triggers a fresh AIC compilation. The compiled context is precisely targeted to the current task — all selected files score high for one concern, not medium for two. Starting fresh also means AIC re-evaluates your codebase's current state, picking up any changes from the previous session.

### Be specific with your intent

**Why:** The more specific your intent, the better the model understands what you need. Vague prompts like "fix the bug" give the model nothing to anchor on — it must guess which files matter. Specific prompts like "fix the authentication timeout in src/auth/middleware.ts" let it focus immediately, reducing the need for exploratory file reads that consume tokens.

**How AIC helps:** AIC uses your intent to classify the task and select which files to include. A specific intent produces higher-confidence classification and better file scoring — the model sees the right code from the start instead of a broad, unfocused selection.

### Keep sessions short

**Why:** Long conversations accumulate noise. The model's context window fills with previous messages, tool outputs, and intermediate results. When the context window reaches capacity, the editor compacts (summarizes) earlier content, and the model loses details from the beginning of the conversation — including AIC's compiled context. Short sessions avoid this compaction loss entirely.

**How AIC helps:** In a short session, AIC's initial compiled context remains prominent in the context window throughout. Once built, Claude Code's integration will use the `PreCompact` hook to re-compile before compaction, preserving context quality even in longer sessions.

### Don't switch models mid-chat

**Why:** When you change the AI model in the middle of a conversation (e.g., switching from Claude to GPT-4o), the editor treats it as the same session. Session-start hooks don't re-fire, so the new model misses the compiled context and architectural instructions that were injected at the beginning. The new model may also lack the tool-use patterns needed to call `aic_compile` on its own, effectively operating without any compiled context for the rest of the conversation.

**How AIC helps — if you start fresh:** Starting a new chat after switching models triggers all session-start hooks again. AIC compiles fresh context, injects it into the new model's system prompt, and the tool gate enforces compilation before any other tool use. The new model gets the same curated context the previous one had.

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
- File selection counts and summarisation tier distribution
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

## Development approach

This project uses AI coding assistants as part of the development workflow. Every change passes through multiple verification layers before it's accepted: ESLint enforces architecture boundaries, immutability rules, and type safety at the linter level; TypeScript strict mode catches type errors at compile time; integration tests verify behavior; and human review validates design decisions, intent, and edge cases that automation cannot catch. The architecture is designed so that any contributor — human or AI — produces code that meets the same standards.

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
