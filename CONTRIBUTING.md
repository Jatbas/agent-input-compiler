# Contributing

Contributions are welcome. This is a structured codebase with a defined architecture; small, focused changes are more likely to be reviewed and merged quickly than broad refactors.

## Development setup

Node.js 18+ and pnpm are required for development.

1. **Clone and install**

   ```bash
   pnpm install
   ```

2. **Run the test suite** to confirm the baseline is green

   ```bash
   pnpm test
   ```

3. **Run the linter** and fix any issues

   ```bash
   pnpm lint
   ```

4. **Check for unused code** (optional but recommended)

   ```bash
   pnpm knip
   ```

5. **Read the relevant docs** — at least [architecture.md](documentation/architecture.md) and [implementation-spec.md](documentation/implementation-spec.md) — so your changes match the project's design and rules.

6. **Local MCP testing** — To try AIC in your editor against the local build, see [Local MCP testing](#local-mcp-testing) below.

### Local MCP testing

Run the MCP server from your clone instead of the published package:

1. From the repo root (no build required):

   ```bash
   pnpm run dev:mcp
   ```

2. In `~/.cursor/mcp.json`, temporarily replace the `aic` server entry with:

   ```json
   "aic": {
     "command": "pnpm",
     "args": ["run", "dev:mcp"],
     "cwd": "/absolute/path/to/your/AIC/clone"
   }
   ```

   Use the real path to your AIC clone for `cwd`. If your editor does not support `cwd`, start the editor from the AIC repo root.

3. Restart Cursor (or reload MCP) so it uses the local server.
   Restore the original config when done: `"command": "npx", "args": ["@aic/mcp"]`.

4. **Developing AIC in Cursor:** The preToolUse hook blocks all tools until `aic_compile` has been called. To bypass this gate when working on the AIC repo itself, set `AIC_DEV_MODE=1` in your shell when launching Cursor (e.g. `AIC_DEV_MODE=1 cursor .`) or in a `.env` file in the repo root. With `AIC_DEV_MODE=1` set, the hook allows tool use without requiring a prior aic_compile call.

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
