# Recipe: Composition root (wiring boundary)

Full detail: `../SKILL-recipes.md` lines 103–196.

## Quick Card

- **When to use:** The task instantiates concrete classes, opens databases, connects transports, registers handlers, or starts a process. The composition boundary is the one layer allowed to use `new` for infrastructure.
- **Files:**
  - Create/Modify: the repo's primary wiring site (`mcp/src/server.ts` in this project).
  - Create/Modify: the matching integration or server test file.
  - Modify: package.json files if exports/dependencies change.
- **Template replaces Interface/Signature with "Wiring Specification":**
  1. Code block listing every concrete class instantiated, with constructor signatures copied verbatim from source.
  2. Exported function signatures (`main()`, `createProjectScope()`, etc.).
  3. Code blocks for every external library class used — imports + signatures from `.d.ts`.
- **Dependent Types — tiered:** Never "None" for a composition root. Use Tier 0 (verbatim, for types whose methods are called or whose shape is constructed inline), Tier 1 (signature + path + member count, for pass-through types), Tier 2 (path-only, for branded types and `as const` enums).
- **Conditional dependency loading — HARD:** Do NOT eagerly instantiate dependencies that only apply when the project has certain files. Bootstrap functions accept conditional deps as an injected parameter; `main()` decides at runtime.
- **Immutable accumulation:** Use ternary-spread, not `.push()` or `let`:
  ```typescript
  const py = projectHasExtension(projectRoot, ".py")
    ? [await PythonProvider.create()]
    : [];
  const go = projectHasExtension(projectRoot, ".go") ? [await GoProvider.create()] : [];
  return [...py, ...go];
  ```
- **One file per step — HARD:** Even across near-identical changes. If wiring touches multiple files, split into Step 5a, 5b, etc.
- **Tests:** Integration-style. Prefer in-process client SDK (e.g. `Client` + `InMemoryTransport` for MCP) over child-process spawning. Verify scope creation, error boundaries, idempotency, and `.aic/` permissions.

## Mechanical checks

A, B, C, D, E, F, G, H (constructor branded types), K (library API), L (wiring accuracy), O (conditional dependency), S.

## Red flags

- "Dependent Types: None" on a composition root.
- `new HeavyProvider()` unconditionally when the provider is only needed for specific project states.
- Async `await` propagating into bootstrap functions that should be sync.
