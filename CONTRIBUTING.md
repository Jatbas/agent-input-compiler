# Contributing

Contributions are welcome. This is a structured codebase with a defined architecture; small, focused changes are more likely to be reviewed and merged quickly than broad refactors.

## Development setup

Node.js 20+ and pnpm are required for development.

### 1. Install the AIC MCP server globally

Follow [documentation/installation.md](documentation/installation.md) for your editor. Installation is zero-intervention — AIC auto-generates all per-project files (`aic.config.json`, hooks, trigger rules) on first use. You do not need to create them manually.

### 2. Enable dev mode

When working on the AIC codebase itself, the preToolUse hook would normally block tools until `aic_compile` is called. Set `AIC_DEV_MODE=1` to bypass this gate:

```bash
# Add to your shell rc, or create a .env file in the repo root:
AIC_DEV_MODE=1
```

For Cursor, you can also launch it as `AIC_DEV_MODE=1 cursor .` from the repo root.

### 3. Clone and install dependencies

```bash
pnpm install
```

### 4. Verify the baseline

```bash
pnpm test
pnpm lint
```

### 5. Read the relevant docs

At minimum, read [architecture.md](documentation/architecture.md) and [implementation-spec.md](documentation/implementation-spec.md) so your changes match the project's design and rules.

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

   Use the real absolute path to your clone for `cwd`. If your editor does not support `cwd`, start the editor from the AIC repo root.

3. Restart your editor (or reload MCP) so it picks up the local server.
   Restore the original config when done: `"command": "npx", "args": ["@aic/mcp"]`.

### Reflecting code changes during development

`pnpm run dev:mcp` runs the server via `tsx` (on-the-fly TypeScript), so no build step is needed during development. However, the server process must be restarted to pick up changes:

| What you changed                                           | What to do                                                                                                                        |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Integration hooks** (`integrations/*/hooks/*.cjs`)       | Restart the AIC dev server. On startup the server re-runs the installers, which copy the updated hooks to their target locations. |
| **Integration installers** (`integrations/*/install.cjs`)  | Restart the AIC dev server.                                                                                                       |
| **MCP server code** (`mcp/src/**`)                         | Restart the AIC dev server.                                                                                                       |
| **Core / pipeline / adapters / storage** (`shared/src/**`) | Restart the AIC dev server. `tsx` picks up the changes at next start — no separate build needed.                                  |

In all cases, "restart the AIC dev server" means reload MCP in your editor (e.g. Cursor: `Cmd+Shift+P` → **Reload Window**) so the server process is respawned.

A full `pnpm build` is only needed before publishing or running the production entry point (`dist/server.js`).

## Good contribution types

- bug fixes
- editor integration improvements
- language provider improvements
- content transformer improvements
- test coverage
- benchmark and validation work
- documentation clarifications

## RFC-first for non-trivial changes

Before starting implementation, submit an RFC for changes that affect:

- architecture
- pipeline behavior
- rule enforcement
- guardrails or security boundaries
- editor integration strategy
- public configuration or user-facing workflow

The RFC should explain:

- the problem
- the proposed change
- why the current design is insufficient
- expected impact on determinism, security, and token efficiency
- migration or compatibility concerns, if any

## Contribution expectations

- Keep changes narrowly scoped.
- Follow the existing architecture and naming patterns.
- Preserve deterministic behavior.
- Do not weaken local-first guarantees, guardrails, or logging boundaries without prior discussion.
- Include tests for behavior changes.
- Update documentation when changing commands, config, workflow, or other user-visible behavior.

## Pull request checklist

Before opening a PR, ensure:

- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] `pnpm knip` passes if relevant to the change
- [ ] New behavior is covered by tests
- [ ] Docs are updated where needed
- [ ] The change does not introduce editor-specific assumptions into the core pipeline
- [ ] The PR description explains motivation and scope clearly

For deeper contribution rules and project context, see the [project documentation](documentation/).
