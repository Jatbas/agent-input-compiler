# Contributing

Contributions are welcome. This guide is for people **developing the AIC codebase** (not only installing and using AIC as an end user).

> The architecture is deliberate; small, focused changes are more likely to be reviewed and merged quickly.

## Table of contents

- [Development setup](#development-setup)
  - [1. Clone and install dependencies](#1-clone-and-install-dependencies)
  - [2. Install the AIC MCP server for your editor](#2-install-the-aic-mcp-server-for-your-editor)
  - [3. Dev mode](#3-dev-mode)
  - [4. Verify the baseline](#4-verify-the-baseline)
  - [5. Read the relevant docs](#5-read-the-relevant-docs)
  - [Other useful commands](#other-useful-commands)
  - [Local MCP testing](#local-mcp-testing)
  - [Reflecting code changes during development](#reflecting-code-changes-during-development)
- [Branches and RFC](#branches-and-rfc)
  - [Branch names](#branch-names)
  - [RFC for non-trivial changes](#rfc-for-non-trivial-changes)
- [Good contribution types](#good-contribution-types)
- [Contribution expectations](#contribution-expectations)
- [Pull request checklist](#pull-request-checklist)

## Development setup

Node.js 20+ and pnpm are required.

### 1. Clone and install dependencies

Clone the repository, then from the repo root:

```bash
pnpm install
```

### 2. Install the AIC MCP server for your editor

Follow [documentation/installation.md](documentation/installation.md).

> AIC creates per-project files (`aic.config.json`, hooks, trigger rules) on first use; you do not need to create them manually.

### 3. Dev mode

While working **in this repository**, some editor setups expect `aic_compile` before other tools run. Set **`AIC_DEV_MODE=1`** during development (for example in your shell, in a `.env` file at the repo root, or by starting your editor with that variable in the environment). See the installation doc for your editor.

To verify CLI diagnostic subcommands against your local build (instead of the published npm package), use `pnpm aic` from the repo root after building:

```bash
pnpm build
pnpm aic status
pnpm aic last
pnpm aic chat-summary --project $(pwd)
pnpm aic projects
```

This routes through `node mcp/dist/server.js` directly, so you see the output of your local changes immediately without an npm release.

### 4. Verify the baseline

```bash
pnpm test
pnpm lint
```

### 5. Read the relevant docs

At minimum, read [architecture.md](documentation/architecture.md) and [implementation-spec.md](documentation/implementation-spec.md) so your changes match the project's design and rules.

For optional Agent Skill workflows in this repo (planning, execution, documentation, research), see [contributor-agent-skills.md](documentation/contributor-agent-skills.md).

### Other useful commands

Husky already runs checks on commit and push: **lint-staged** on commit (ESLint with fix on staged TypeScript under `shared/` and `mcp/`; Prettier on staged files matched by the project config). Staged `*.ts` files at the repository root get Prettier only, not ESLint. **commitlint** runs on the commit message; **typecheck**, **tests**, and **lint:clones** run on push. You can still run the commands below locally before committing or when debugging CI.

| Command                 | Purpose                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`        | Full TypeScript project build                                                                                                 |
| `pnpm test:watch`       | Tests in watch mode                                                                                                           |
| `pnpm lint:fix`         | ESLint with auto-fix                                                                                                          |
| `pnpm format`           | Prettier write                                                                                                                |
| `pnpm format:check`     | Prettier check only                                                                                                           |
| `pnpm knip`             | Unused files, exports, and dependencies                                                                                       |
| `pnpm check:headers`    | SPDX license headers                                                                                                          |
| `pnpm lint:clones`      | Duplicate-code scan (`jscpd`; also runs on pre-push)                                                                          |
| `pnpm aic <subcommand>` | CLI diagnostics against the local build (`status`, `last`, `chat-summary`, `projects`; see Local MCP testing for `--project`) |

> `pnpm aic` requires a prior `pnpm build`. Use `pnpm run dev:mcp` for a live-reloading MCP server during development (no build step needed).

### Local MCP testing

To run the MCP server from your clone instead of the published package:

1. From the repo root (no build step required):

   ```bash
   pnpm run dev:mcp
   ```

2. Temporarily replace the `aic` server entry in your editor's MCP config with:

   ```json
   "aic": {
     "command": "pnpm",
     "args": ["run", "dev:mcp"],
     "cwd": "/absolute/path/to/your/AIC/clone"
   }
   ```

   > Use the real absolute path to your clone for `cwd`. If your editor does not support `cwd`, start the editor from the AIC repo root.

3. Restart your editor or reload MCP so it picks up the local server. Restore the published entry when done: `"command": "npx", "args": ["-y", "@jatbas/aic@latest"]`.

4. From the repo root, run `pnpm build`, then run `pnpm aic status`, `pnpm aic projects`, `pnpm aic last`, and `pnpm aic chat-summary --project <absolute workspace root>` to exercise the compiled diagnostic CLI. When your shell cwd is not registered in the global AIC database—including a git worktree root that has no `projects` row—pass `--project <absolute path to a registered clone>` to `status`, `last`, and `chat-summary`.

### Reflecting code changes during development

`pnpm run dev:mcp` runs the server via `tsx` (on-the-fly TypeScript), so no build step is needed during development. The server process must be restarted to pick up changes:

| What you changed                                           | What to do                                                                                                                        |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Integration hooks** (`integrations/*/hooks/*.cjs`)       | Restart the AIC dev server. On startup the server re-runs the installers, which copy the updated hooks to their target locations. |
| **Integration installers** (`integrations/*/install.cjs`)  | Restart the AIC dev server.                                                                                                       |
| **MCP server code** (`mcp/src/**`)                         | Restart the AIC dev server.                                                                                                       |
| **Core / pipeline / adapters / storage** (`shared/src/**`) | Restart the AIC dev server. `tsx` picks up changes at next start — no separate build needed.                                      |

> Restart the dev MCP process (reload MCP or restart the editor — whichever your setup uses) so the server is respawned. A full `pnpm build` is only needed before publishing or running the compiled MCP server (`mcp/dist/server.js`).

## Branches and RFC

### Branch names

Use a descriptive branch before substantial work.

**Pattern:** `(kind) firstnamelastname/short-slug`

- **firstnamelastname:** first and last name run together, lowercase, no spaces (e.g. Jorge Santos → `jorgesantos`).
- **short-slug:** lowercase, hyphenated.

**Example:** `(feature) jorgesantos/new-feature-that-will-do-whatever`

**Kinds:** `(feature)`, `(fix)`, and `(chore)`; also `(docs)`, `(refactor)`, or `(test)` when the PR is limited to that kind of change.

### RFC for non-trivial changes

Use an RFC when the change affects architecture, pipeline behavior, rule enforcement, guardrails or security boundaries, editor integration strategy, or public configuration or user-facing workflow.

Add **`RFC.md` at the repository root** on the **same branch** as your implementation. Commit it with or before your code so the PR shows design and changes together.

The RFC should explain:

- the problem
- the proposed change
- why the current design is insufficient
- expected impact on determinism, security, and token efficiency
- migration or compatibility concerns, if any

## Good contribution types

- bug fixes
- editor integration improvements
- language provider improvements
- content transformer improvements
- test coverage
- benchmark and validation work
- documentation clarifications

## Contribution expectations

- Keep changes narrowly scoped.
- Follow the existing architecture and naming patterns.
- Preserve deterministic behavior.
- Do not weaken local-first guarantees, guardrails, or logging boundaries without prior discussion.
- Include tests for behavior changes.
- Update documentation when changing commands, config, workflow, or other user-visible behavior.

## Pull request checklist

Before opening a PR, ensure:

- [ ] Branch name follows the convention when the change is non-trivial
- [ ] `RFC.md` is on the branch when an RFC is required (see above)
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] `pnpm knip` passes if relevant to the change
- [ ] New behavior is covered by tests
- [ ] Docs are updated where needed
- [ ] The change does not introduce editor-specific assumptions into the core pipeline
- [ ] The PR description explains motivation and scope clearly

For deeper contribution rules and project context, see the [project documentation](documentation/).
