# Agent Input Compiler (AIC)

![License](https://img.shields.io/badge/license-Apache%202.0-blue)
![Status](https://img.shields.io/badge/status-0.7.0-brightgreen)
![Local-first](https://img.shields.io/badge/local--first-yes-brightgreen)
![Telemetry](https://img.shields.io/badge/telemetry-opt--in-lightgrey)
![MCP Compatible](https://img.shields.io/badge/MCP-compatible-purple)

Deterministic context compiler for AI coding tools. AIC is a local-first MCP server that selects relevant files, removes noise, and returns a smaller context package before it reaches the model.

AIC does **not** replace your editor. It runs alongside MCP-compatible editors and improves the context they send to the model.

---

## Why developers use AIC

AI coding tools often pull in too much irrelevant context. That wastes tokens, weakens instruction-following, and increases hallucinations.

AIC adds a compilation step before the model runs:

- classifies the task
- selects the most relevant files
- blocks sensitive or irrelevant content
- compresses the result to fit a token budget
- returns a bounded context package the model can reason over

The result is a smaller, more relevant, and more inspectable input.

### What it helps with

| Problem                               | What AIC does                                                                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Too much irrelevant context           | Selects and compresses only the files that matter                                                                                                                                                                   |
| Inconsistent context quality          | Produces deterministic compiled context for the same task and codebase                                                                                                                                              |
| Wasted tokens                         | Strips noise and progressively compresses content to stay within budget                                                                                                                                             |
| Secret exposure risk                  | Blocks secrets, excluded paths, and suspicious prompt injection strings locally                                                                                                                                     |
| No visibility into what the model saw | Lets you inspect the latest compilation from inside the editor                                                                                                                                                      |
| Editor lag from context compaction    | Compiled context is bounded by a hard token budget, so its contribution to window fill is predictable regardless of repo size; this leaves stable headroom in the context window and reduces pressure on compaction |

### Real captured output

The example below is **real captured output from AIC's own development usage**. It is useful as a concrete datapoint, not as a universal benchmark for every repository.

#### `show aic status`

```text
Status = project-level AIC status.

| Field                    | Value                                         |
| ------------------------ | --------------------------------------------- |
| Compilations (total)     | 1,001                                         |
| Compilations (today)     | 150                                           |
| Tokens: raw → compiled   | 501,800,000 → 7,400,000                       |
| Tokens excluded          | 494,400,000                                   |
| Budget limit             | 8,000                                         |
| Budget utilization       | 96.2%                                         |
| Cache hit rate           | 43.4%                                         |
| Avg exclusion rate       | 98.5%                                         |
| Guard findings           | prompt-injection: 40, secret: 20              |
| Top task classes         | general 422, refactor 313, bugfix 91          |
| Last compilation         | Execute task 089… · 2 min ago                 |
| Installation             | OK                                            |
| Update available         | —                                             |

Exclusion rate: % of total repo tokens not included in the compiled prompt.
Budget utilization: % of token budget filled.
```

#### `show aic last`

```text
Last = most recent compilation.

| Field              | Value                                                  |
| ------------------ | ------------------------------------------------------ |
| Compilations       | 1,001                                                  |
| Intent             | Update the README example with the real show aic last  |
| Files              | 1 selected / 405 total                                 |
| Tokens compiled    | 2,842                                                  |
| Budget utilization | 35.5%                                                |
| Exclusion rate     | 99.5%                                                  |
| Compiled           | 2 min ago                                              |
| Editor             | cursor                                                 |
| Guard              | —                                                      |
| Compiled prompt    | Available (12,450 tokens) — ask to see it              |

Exclusion rate: % of total repo tokens not included in the compiled prompt.
Budget utilization: % of token budget filled.
```

---

## Quick start

Requirements: Node.js 20+

### Cursor

1. **Install the MCP server** — use the one-click link or copy the URL into your browser:

   [![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://jatbas.github.io/agent-input-compiler/install/cursor-install.html)

   Or copy this URL:

   ```text
   cursor://anysphere.cursor-deeplink/mcp/install?name=aic&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqYXRiYXMvYWljQGxhdGVzdCJdfQ==
   ```

   Cursor will prompt to add the server to your global MCP config (`~/.cursor/mcp.json`). Confirm and you're done. AIC is now available in every workspace — no per-project setup needed.

2. **Start prompting** — approve the tools when prompted and start coding. On the first `aic_compile` for the project (or when the server first sees the project via workspace roots), AIC writes `aic.config.json`, the `.aic/` directory, ignore-file entries, and the Cursor trigger rule. All projects share one database at `~/.aic/aic.sqlite`; other per-project files stay in the project directory.

   **Cursor lifecycle hooks** (`.cursor/hooks.json` and the `AIC-*.cjs` scripts) are optional: the published npm package does not install them into arbitrary projects. With your project as the current working directory, run `node` on `integrations/cursor/install.cjs` either inside the project (if you copied that tree from the repository) or using the absolute path to that file in an AIC checkout — see [Installation — Cursor](documentation/installation.md#cursor). Bootstrap also runs that installer when `integrations/cursor/install.cjs` is already present in the workspace.

### Claude Code

1. Add the AIC marketplace: `/plugin marketplace add Jatbas/agent-input-compiler`
2. Install the plugin: `/plugin install aic@aic-tools`

The plugin starts the MCP server and registers hooks so every project gets compiled context automatically. Nothing else to install or configure. For prerequisites, direct installer, and troubleshooting, see [Installation — Claude Code](documentation/installation.md#claude-code).

### Disabling AIC for a specific project

Add `"enabled": false` to `aic.config.json` in the project root. AIC returns immediately with no compilation and no database writes. Set it back to `true` (or remove the field) to re-enable. The `show aic status` command reflects the current state.

For the full list of available configuration options, see [§6 Configuration in the Project Plan](documentation/project-plan.md#6-configuration--aicconfigjson).

### Other editors

AIC requires a dedicated integration layer to compile context automatically. Cursor and Claude Code have first-class integration layers; other editors do not yet have one. To request support for your editor or contribute an integration layer, [open an issue](https://github.com/Jatbas/agent-input-compiler/issues).

---

## Commands

These are natural-language prompts for your editor's AI, not terminal commands. Use only the words before `#` on each line; everything after `#` is a reminder for you, not part of the prompt.

```text
show aic status        # project-level status and lifetime stats
show aic last          # most recent compilation
show aic chat summary  # per-conversation compilation stats for this workspace
show aic projects      # known AIC projects (IDs, paths, last seen, compilation counts)
```

---

## Verify your setup

Run the phrases in [Commands](#commands) above, then check the following.

What to look for:

- **Installation: OK** in `show aic status`
- a recent compilation in `show aic last` (send a normal coding message first if nothing has compiled yet)
- per-conversation compilation stats in `show aic chat summary` after AIC has recorded at least one compilation for the current editor conversation
- selected file count, compiled tokens, and exclusion rate figures that make sense for the task
- AIC blocking sensitive or excluded content
- your project path listed in `show aic projects` after AIC has seen the workspace

> If there is no recent compilation, the model may not be calling AIC automatically. Check that the AIC tools are approved in your editor's MCP settings and try starting a new chat.

---

## Team setup

For team use, the practical split is simple:

- each developer installs the MCP server on their machine
- commit shared `aic.config.json` and editor rule files when you want the whole team on the same settings — bootstrap adds `aic.config.json` to ignore files by default, so remove that ignore entry (or add an exception) if the file should live in git; see [Per-Project Artifacts](documentation/installation.md#per-project-artifacts)
- `.aic/` (local cache and runtime data) stays on each developer's machine and should not be committed

AIC is useful for individuals, but it becomes more valuable when teams want more consistent context quality across the same codebase.

---

## How AIC fits into the workflow

1. Your editor integration (hooks and/or the trigger rule) is set up to call `aic_compile` before or as part of handling each user message — see [installation.md](documentation/installation.md) for how that differs by editor
2. AIC classifies the task, selects relevant files, applies guardrails, and compresses content
3. AIC returns a bounded context package
4. The editor continues the normal model workflow using that compiled context

AIC compiles context. It does not call models, replace the editor, or act as a separate coding environment.

---

## Security

AIC is local-first. All processing runs on the developer's machine.

AIC's Context Guard excludes the following from compiled context before it reaches the model:

- common secrets and credentials
- excluded paths such as `.env`, keys, and similar sensitive files
- suspicious prompt-injection strings in selected content

> This prevents sensitive content from being included in bulk context. It does not prevent the model from reading files directly through editor tools — that is the editor's responsibility. For details, see [`security.md`](documentation/security.md).
>
> Telemetry is local by default. AIC stores compilation metadata locally and does not need an AIC account or API key.

---

## Documentation

Use the README for orientation. Use the docs below for implementation detail.

| Document                                                                   | Description                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [`installation.md`](documentation/installation.md)                         | Installation, delivery, bootstrap, and per-editor details          |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)                                       | Development setup, run from source, contribution process           |
| [`architecture.md`](documentation/architecture.md)                         | Core pipeline, integration layer, editor capability model          |
| [`best-practices.md`](documentation/best-practices.md)                     | Practical usage guidance                                           |
| [`security.md`](documentation/security.md)                                 | Security model and hardening details                               |
| [`implementation-spec.md`](documentation/implementation-spec.md)           | Detailed pipeline and implementation behavior                      |
| [`project-plan.md`](documentation/project-plan.md)                         | Product architecture, ADRs, and full configuration reference       |
| [`contributor-agent-skills.md`](documentation/contributor-agent-skills.md) | Contributors: optional Claude Code agent skills for repo workflows |

---

## Contributing

Contributions are welcome.

> This is a structured codebase with a defined architecture; small, focused changes are more likely to be reviewed and merged quickly than broad refactors.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, local MCP testing, RFC requirements, and the PR checklist.

---

## License

Licensed under the [Apache License, Version 2.0](LICENSE).
