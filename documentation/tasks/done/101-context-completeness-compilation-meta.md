# Task 101: contextCompleteness confidence signal in CompilationMeta

> **Status:** Done
> **Phase:** Q (Research-Backed Quality & Security)
> **Layer:** core (type) + pipeline (wiring)
> **Depends on:** —

## Goal

Add a `contextCompleteness` confidence signal to `CompilationMeta` so callers can observe how complete the compiled context is (future: unresolved imports, missing symbols, intent token coverage). This task adds the field and wires it at all construction sites with a placeholder value.

## Architecture Notes

- ADR-010: Use branded type `Confidence` from `#core/types/scores.js` for the new field.
- No new interface or class — extend existing `CompilationMeta`; all construction sites must supply the field.
- TelemetryEvent is not extended in this task; a follow-up can add persistence/display of the signal.

## Files

| Action | Path                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------ |
| Modify | `shared/src/core/types/compilation-types.ts` (add `contextCompleteness: Confidence`, add import)             |
| Modify | `shared/src/pipeline/compilation-runner.ts` (add field in buildCacheHitMeta and buildFreshMeta)              |
| Modify | `shared/src/testing/stub-compilation-meta.ts` (add contextCompleteness to stub)                              |
| Modify | `shared/src/core/__tests__/build-telemetry-event.test.ts` (add contextCompleteness to metaOverrides default) |
| Modify | `mcp/src/handlers/__tests__/compile-handler.test.ts` (add contextCompleteness to stubMeta)                   |

## Interface / Signature

```typescript
// CompilationMeta in shared/src/core/types/compilation-types.ts — add one field and extend import
import type { Percentage, Confidence } from "#core/types/scores.js";
// ... existing imports unchanged ...

export interface CompilationMeta {
  readonly intent: string;
  readonly taskClass: TaskClass;
  readonly filesSelected: number;
  readonly filesTotal: number;
  readonly tokensRaw: TokenCount;
  readonly tokensCompiled: TokenCount;
  readonly tokenReductionPct: Percentage;
  readonly cacheHit: boolean;
  readonly durationMs: Milliseconds;
  readonly modelId: string;
  readonly editorId: EditorId;
  readonly transformTokensSaved: TokenCount;
  readonly summarisationTiers: Readonly<Record<InclusionTier, number>>;
  readonly guard: GuardResult | null;
  readonly contextCompleteness: Confidence;
}
```

No new class. Type extension only; all sites that build `CompilationMeta` must include `contextCompleteness`.

## Dependent Types

### Tier 0 — verbatim

`CompilationMeta` is defined above (full interface with `contextCompleteness`).

### Tier 2 — path-only

| Type         | Path                              | Factory             |
| ------------ | --------------------------------- | ------------------- |
| `Confidence` | `shared/src/core/types/scores.ts` | `toConfidence(raw)` |

## Config Changes

- **package.json:** None
- **eslint.config.mjs:** None

## Steps

### Step 1: Add contextCompleteness to CompilationMeta

In `shared/src/core/types/compilation-types.ts`: change the import from `import type { Percentage } from "#core/types/scores.js";` to `import type { Percentage, Confidence } from "#core/types/scores.js";`. Add `readonly contextCompleteness: Confidence;` to the `CompilationMeta` interface (after `guard`).

**Verify:** Run `pnpm typecheck`; it reports missing property `contextCompleteness` at `compilation-runner.ts`, `stub-compilation-meta.ts`, `build-telemetry-event.test.ts`, and `compile-handler.test.ts`.

### Step 2: Wire contextCompleteness in compilation-runner

In `shared/src/pipeline/compilation-runner.ts`: extend the existing scores import from `import { toPercentage } from "#core/types/scores.js";` to `import { toPercentage, toConfidence } from "#core/types/scores.js";`. In `buildCacheHitMeta`, add `contextCompleteness: toConfidence(1)` to the returned object. In `buildFreshMeta`, add `contextCompleteness: toConfidence(1)` to the returned object.

**Verify:** Run `pnpm typecheck`; the `compilation-runner.ts` errors are resolved. Remaining errors expected in `stub-compilation-meta.ts`, `build-telemetry-event.test.ts`, and `compile-handler.test.ts`.

### Step 3: Add contextCompleteness to STUB_COMPILATION_META

In `shared/src/testing/stub-compilation-meta.ts`: change the import from `import { toPercentage } from "#core/types/scores.js";` to `import { toPercentage, toConfidence } from "#core/types/scores.js";`. Add `contextCompleteness: toConfidence(1)` to `STUB_COMPILATION_META`.

**Verify:** Run `pnpm typecheck`; the `stub-compilation-meta.ts` error is resolved. Remaining errors expected in `build-telemetry-event.test.ts` and `compile-handler.test.ts`.

### Step 4a: Add contextCompleteness to build-telemetry-event.test metaOverrides

In `shared/src/core/__tests__/build-telemetry-event.test.ts`: change the import from `import { toPercentage } from "#core/types/scores.js";` to `import { toPercentage, toConfidence } from "#core/types/scores.js";`. In the object returned by `metaOverrides` (the default shape before `...overrides`), add `contextCompleteness: toConfidence(1)`.

**Verify:** Run `pnpm typecheck`; the `build-telemetry-event.test.ts` error is resolved. Remaining error expected in `compile-handler.test.ts`. Run `pnpm test shared/src/core/__tests__/build-telemetry-event.test.ts` — passes.

### Step 4b: Add contextCompleteness to compile-handler.test stubMeta

In `mcp/src/handlers/__tests__/compile-handler.test.ts`: change the import from `import { toPercentage } from "@aic/shared/core/types/scores.js";` to `import { toPercentage, toConfidence } from "@aic/shared/core/types/scores.js";`. Add `contextCompleteness: toConfidence(1)` to the `stubMeta` object.

**Verify:** Run `pnpm typecheck` — passes clean. Run `pnpm test mcp/src/handlers/__tests__/compile-handler.test.ts` — passes.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                  | Description                                                                 |
| -------------------------- | --------------------------------------------------------------------------- |
| typecheck                  | CompilationMeta has contextCompleteness; all construction sites supply it   |
| build-telemetry-event.test | metaOverrides returns valid CompilationMeta; buildTelemetryEvent tests pass |
| compile-handler.test       | stubMeta is valid CompilationMeta; handler tests pass                       |
| lint                       | Zero errors, zero warnings                                                  |
| knip                       | No new unused files, exports, or dependencies                               |

## Acceptance Criteria

- [ ] All files modified per Files table
- [ ] CompilationMeta includes `readonly contextCompleteness: Confidence`
- [ ] buildCacheHitMeta and buildFreshMeta set contextCompleteness to toConfidence(1)
- [ ] STUB_COMPILATION_META and test stubs include contextCompleteness
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
