# Agent Input Compiler (AIC)

![License](https://img.shields.io/badge/license-Apache%202.0-blue)
![Status](https://img.shields.io/badge/status-0.3.0-brightgreen)
![Local-first](https://img.shields.io/badge/local--first-yes-brightgreen)
![Telemetry](https://img.shields.io/badge/telemetry-opt--in-lightgrey)
![MCP Compatible](https://img.shields.io/badge/MCP-compatible-purple)

> Deterministic context compiler for AI coding tools.
> AIC is a local-first MCP server that selects relevant files, removes noise, and returns a smaller context package before it reaches the model.

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

| Problem                               | What AIC does                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| Too much irrelevant context           | Selects and compresses only the files that matter                               |
| Inconsistent context quality          | Produces deterministic compiled context for the same task and codebase          |
| Wasted tokens                         | Strips noise and progressively compresses content to stay within budget         |
| Secret exposure risk                  | Blocks secrets, excluded paths, and suspicious prompt injection strings locally |
| No visibility into what the model saw | Lets you inspect the latest compilation from inside the editor                  |

### Real captured output

The example below is **real captured output from AIC's own development usage**. It is useful as a concrete datapoint, not as a universal benchmark for every repository.

> `show aic status`

```text
Status = project-level AIC status.

| Field                          | Value                                         |
| ------------------------------ | --------------------------------------------- |
| Compilations (total)           | 1,001                                         |
| Compilations (today)           | 150                                           |
| Total tokens (raw → compiled)  | 501.8M → 7.4M                                 |
| Total tokens saved             | 494.4M                                        |
| Budget (max tokens)            | 8,000                                         |
| Budget utilization             | 96.2%                                         |
| Cache hit rate                 | 43.4%                                         |
| Avg reduction                  | 98.5%                                         |
| Guard by type                  | prompt-injection: 40, secret: 20              |
| Top task classes               | general 422, refactor 313, bugfix 91          |
| Last compilation               | Execute task 089… — 10 of 405 files,          |
|                                | 7,692 tokens (98.8%), cursor                  |
| Installation                   | OK                                            |
| Installation notes             | (none)                                        |
```

> `show aic last`

```text
Last = most recent compilation.

| Field            | Value                                                  |
| ---------------- | ------------------------------------------------------ |
| Intent           | Update the README example with the real show aic last  |
| Selected         | 1 of 405 files                                         |
| Tokens compiled  | 2,842                                                  |
| Reduction        | 99.5%                                                  |
| Created          | 2026-03-04T21:38:50Z (recent)                          |
| Editor           | cursor                                                 |
```

---

## Quick start

Requirements: Node.js 18+

### 1. Install the MCP server

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://jatbas.github.io/agent-input-compiler/install/cursor-install.html)

Or copy this URL into your browser:

```text
cursor://anysphere.cursor-deeplink/mcp/install?name=aic&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqYXRiYXMvYWljIl19
```

Cursor will prompt to add the server to your global MCP config (`~/.cursor/mcp.json`); confirm and you're done. AIC is now available in every workspace — no per-project setup needed.

### 2. Start prompting

Approve the tools when prompted and start coding. AIC creates its config file, hooks, and local data directory the first time it runs in a project. All projects share a single database at `~/.aic/aic.sqlite`; per-project files remain in each project directory. Nothing else to install or configure.

### Disabling AIC for a specific project

Add `"enabled": false` to `aic.config.json` in the project root. AIC returns immediately with no compilation and no database writes. Set it back to `true` (or remove the field) to re-enable. The `show aic status` command reflects the current state.

For the full list of available configuration options, see [§6 Configuration in the Project Plan](documentation/project-plan.md#6-configuration--aicconfigjson).

### Other editors

Claude Code and other MCP-compatible editors can connect directly by adding AIC to their MCP config (`"command": "npx", "args": ["-y", "@jatbas/aic"]`). A dedicated integration layer for Claude Code is planned; without it, the model calls AIC tools voluntarily rather than being guided automatically. [Open an issue](https://github.com/Jatbas/agent-input-compiler/issues) to request support for your editor or contribute an integration layer.

---

## Verify your setup

Ask the model in your editor:

```text
show aic status
show aic last
show aic chat summary
```

What to look for:

- **Installation: OK** in `show aic status`
- a recent compilation in `show aic last`
- selected file count, compiled tokens, and reduction figures that make sense for the task
- AIC blocking sensitive or excluded content

If there is no recent compilation, the model may not be calling AIC automatically. Check that the AIC tools are approved in your editor's MCP settings and try starting a new chat.

---

## Team setup

For team use, the practical split is simple:

- each developer installs the MCP server on their machine
- `aic.config.json` and editor rule files are committed to the repo so the whole team compiles against the same settings
- `.aic/` (local cache and runtime data) stays on each developer's machine and should not be committed

AIC is useful for individuals, but it becomes more valuable when teams want more consistent context quality across the same codebase.

---

## How AIC fits into the workflow

1. Your editor automatically calls `aic_compile` at the start of each AI session
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

This prevents sensitive content from being included in bulk context. It does not prevent the model from reading files directly through editor tools — that is the editor's responsibility. For details, see [`security.md`](documentation/security.md).

Telemetry is local by default. AIC stores compilation metadata locally and does not need an AIC account or API key.

---

## Commands

```text
show aic status        # project-level status and lifetime stats
show aic last          # most recent compilation
show aic chat summary  # current conversation summary
```

---

## Documentation

Use the README for orientation. Use the docs below for implementation detail.

| Document                                                         | Description                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------- |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)                             | Development setup, run from source, contribution process  |
| [`architecture.md`](documentation/architecture.md)               | Core pipeline, integration layer, editor capability model |
| [`best-practices.md`](documentation/best-practices.md)           | Practical usage guidance                                  |
| [`security.md`](documentation/security.md)                       | Security model and hardening details                      |
| [`implementation-spec.md`](documentation/implementation-spec.md) | Detailed pipeline and implementation behavior             |
| [`mvp-progress.md`](documentation/mvp-progress.md)               | Current progress and OSS release work                     |

---

## Contributing

Contributions are welcome. This is a structured codebase with a defined architecture; small, focused changes are more likely to be reviewed and merged quickly than broad refactors.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, local MCP testing, RFC requirements, and the PR checklist.

---

## License

Licensed under the [Apache License, Version 2.0](LICENSE).
