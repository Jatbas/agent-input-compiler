# Task 018: Zod schemas (CLI)

> **Status:** Done
> **Phase:** 0 (MVP)
> **Layer:** cli
> **Depends on:** None

## Goal

Add Zod validation schemas in `cli/src/schemas/` so CLI commands (compile, inspect, init, status) can validate parsed argv at the boundary and produce typed args; commands are implemented in later tasks.

## Architecture Notes

- ADR-009: validation at boundaries only; CLI parser is a validation boundary, so Zod lives in cli/src/schemas/.
- No interface or class in this task; only exported Zod schemas and z.infer<> types for use by future commands.
- One schema file per command group (compile, inspect, init, status) to match MCP pattern and keep options isolated; four schema files + four test files justified by four distinct commands.

## Files

| Action | Path                                                 |
| ------ | ---------------------------------------------------- |
| Create | `cli/src/schemas/compilation-args.ts`                |
| Create | `cli/src/schemas/inspect-args.ts`                    |
| Create | `cli/src/schemas/init-args.ts`                       |
| Create | `cli/src/schemas/status-args.ts`                     |
| Create | `cli/src/schemas/__tests__/compilation-args.test.ts` |
| Create | `cli/src/schemas/__tests__/inspect-args.test.ts`     |
| Create | `cli/src/schemas/__tests__/init-args.test.ts`        |
| Create | `cli/src/schemas/__tests__/status-args.test.ts`      |

## Interface / Signature

This task creates only Zod schemas; no core interface is implemented. Each file exports a schema and an inferred type. Pattern (same for all four):

```typescript
import { z } from "zod";

export const CompilationArgsSchema = z.object({
  intent: z.string().min(1).max(10_000),
  projectRoot: z.string().min(1),
  configPath: z.string().nullable().default(null),
  dbPath: z.string().nullable().default(null),
});
export type CompilationArgs = z.infer<typeof CompilationArgsSchema>;
```

```typescript
// InspectArgsSchema: intent, projectRoot, configPath, dbPath (same shape as compilation).
// InitArgsSchema: upgrade (z.boolean().optional().default(false)).
// StatusArgsSchema: projectRoot, configPath, dbPath (no intent).
```

## Dependent Types

### Tier 0 — verbatim

Parsed output shape (consumers will map these to branded types in commands):

- **CompilationArgs / InspectArgs:** `intent: string`, `projectRoot: string`, `configPath: string | null`, `dbPath: string | null`
- **InitArgs:** `upgrade: boolean`
- **StatusArgs:** `projectRoot: string`, `configPath: string | null`, `dbPath: string | null`

### Tier 2 — path-only

| Type            | Path  | Factory                                                                                    |
| --------------- | ----- | ------------------------------------------------------------------------------------------ |
| Zod schema APIs | `zod` | `z.object()`, `z.string()`, `z.boolean()`, `.min()`, `.max()`, `.nullable()`, `.default()` |

## Config Changes

- **package.json:** No change (zod 3.25.7 already in cli/package.json).
- **eslint.config.mjs:** No change (CLI layer may import zod per ADR-009).

## Steps

### Step 1: compilation-args.ts

Create `cli/src/schemas/compilation-args.ts`. Export `CompilationArgsSchema` as `z.object({ intent: z.string().min(1).max(10_000), projectRoot: z.string().min(1), configPath: z.string().nullable().default(null), dbPath: z.string().nullable().default(null) })`. Export `CompilationArgs` as `z.infer<typeof CompilationArgsSchema>`.

**Verify:** File exists; `pnpm typecheck` in cli passes.

### Step 2: inspect-args.ts

Create `cli/src/schemas/inspect-args.ts`. Export `InspectArgsSchema` with the same four fields as CompilationArgsSchema: intent (string min 1 max 10_000), projectRoot (string min 1), configPath (string nullable default null), dbPath (string nullable default null). Export `InspectArgs` as `z.infer<typeof InspectArgsSchema>`.

**Verify:** File exists; `pnpm typecheck` in cli passes.

### Step 3: init-args.ts

Create `cli/src/schemas/init-args.ts`. Export `InitArgsSchema` as `z.object({ upgrade: z.boolean().optional().default(false) })`. Export `InitArgs` as `z.infer<typeof InitArgsSchema>`.

**Verify:** File exists; `pnpm typecheck` in cli passes.

### Step 4: status-args.ts

Create `cli/src/schemas/status-args.ts`. Export `StatusArgsSchema` as `z.object({ projectRoot: z.string().min(1), configPath: z.string().nullable().default(null), dbPath: z.string().nullable().default(null) })`. Export `StatusArgs` as `z.infer<typeof StatusArgsSchema>`.

**Verify:** File exists; `pnpm typecheck` in cli passes.

### Step 5: compilation-args.test.ts

Create `cli/src/schemas/__tests__/compilation-args.test.ts`. Test: valid_object_parses_successfully — pass an object with intent, projectRoot, configPath, dbPath; call `CompilationArgsSchema.parse()`; assert result has the same values. Test: missing_intent_throws — pass object without intent or with intent empty string; call `CompilationArgsSchema.safeParse()`; assert success is false. Test: intent_over_max_throws — pass intent string length > 10_000; call safeParse; assert success is false.

**Verify:** `pnpm test` for cli runs and these tests pass.

### Step 6: inspect-args.test.ts

Create `cli/src/schemas/__tests__/inspect-args.test.ts`. Test: valid_object_parses_successfully — same pattern as compilation-args with intent, projectRoot, configPath, dbPath. Test: missing_intent_throws — same as compilation-args.

**Verify:** `pnpm test` for cli runs and these tests pass.

### Step 7: init-args.test.ts

Create `cli/src/schemas/__tests__/init-args.test.ts`. Test: empty_object_defaults_upgrade_false — pass `{}` to `InitArgsSchema.parse()`, assert result.upgrade === false. Test: upgrade_true_parses — pass `{ upgrade: true }`, assert result.upgrade === true.

**Verify:** `pnpm test` for cli runs and these tests pass.

### Step 8: status-args.test.ts

Create `cli/src/schemas/__tests__/status-args.test.ts`. Test: valid_object_parses_successfully — pass object with projectRoot, configPath, dbPath; parse and assert. Test: missing_project_root_throws — pass object without projectRoot or empty projectRoot string; call safeParse; assert success is false.

**Verify:** `pnpm test` for cli runs and these tests pass.

### Step 9: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                      | Description                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| valid_object_parses_successfully (compilation) | CompilationArgsSchema.parse(valid) returns typed result                     |
| missing_intent_throws (compilation)            | safeParse without intent or empty intent; assert success is false           |
| intent_over_max_throws (compilation)           | safeParse with intent length > 10_000; assert success is false              |
| valid_object_parses_successfully (inspect)     | InspectArgsSchema.parse(valid) returns typed result                         |
| missing_intent_throws (inspect)                | safeParse without intent or empty intent; assert success is false           |
| empty_object_defaults_upgrade_false            | InitArgsSchema.parse({}) yields upgrade false                               |
| upgrade_true_parses                            | InitArgsSchema.parse({ upgrade: true }) yields upgrade true                 |
| valid_object_parses_successfully (status)      | StatusArgsSchema.parse(valid) returns typed result                          |
| missing_project_root_throws (status)           | safeParse without projectRoot or empty projectRoot; assert success is false |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] Each schema file exports schema and z.infer<> type
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries (cli may import zod)
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
