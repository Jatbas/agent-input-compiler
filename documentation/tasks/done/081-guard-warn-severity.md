# Task 081: Guard Warn Severity

> **Status:** Done
> **Phase:** Phase L (Quality Release — Phase 0.5)
> **Layer:** pipeline + core/types
> **Depends on:** ContextGuard (Done), PromptInjectionScanner (Done), GuardResult type (Done)

## Goal

Split PromptInjectionScanner patterns into BLOCK (special tokens, instruction blocks) and WARN (text-based heuristics), add `filesWarned` tracking to `GuardResult`, and update `ContextGuard` to compute warned paths — enabling the guard system to distinguish between definitive threats and suspicious-but-common patterns.

## Architecture Notes

- `GUARD_SEVERITY.WARN` already exists in `shared/src/core/types/enums.ts` — no enum changes needed.
- `guard_findings` schema stores `severity` as TEXT — no migration needed; `"warn"` values persist natively.
- `SqliteGuardStore.write()` and `buildTelemetryEvent()` already handle any severity — no changes to storage or telemetry code.
- Pattern split rationale: special tokens (`<|system|>`, `<|im_start|>`, `<|endofprompt|>`) and instruction blocks (`[INST]...[/INST]`) are model-specific artifacts that never appear in legitimate source code (near-zero false positive → BLOCK). Text-based heuristics (`system:`, `ignore ... instructions`, `you are now`, `do not follow ... rules`) frequently match YAML configs, documentation, and security test files (high false positive → WARN).
- `filesWarned` = unique files with WARN findings that are NOT in `blockedSet`. A file with both BLOCK and WARN findings counts as blocked, not warned.
- `buildTelemetryEvent` reads `findings.length` (all severities) and `filesBlocked.length` (blocked only). These counts now naturally diverge when WARN findings exist — no telemetry code changes needed.
- The golden snapshot (`golden-snapshot.test.ts.snap`) will auto-update when tests run because `GuardResult` gains a new field. No manual snapshot editing needed.

## Files

| Action | Path                                                                      |
| ------ | ------------------------------------------------------------------------- |
| Modify | `shared/src/core/types/guard-types.ts` (add `filesWarned` to GuardResult) |
| Modify | `shared/src/pipeline/prompt-injection-scanner.ts` (split patterns)        |
| Modify | `shared/src/pipeline/context-guard.ts` (compute `warnedPaths`)            |
| Modify | `shared/src/pipeline/__tests__/context-guard.test.ts` (add WARN tests)    |
| Modify | `shared/src/pipeline/__tests__/inspect-runner.test.ts` (fix mock)         |
| Modify | `shared/src/core/__tests__/build-telemetry-event.test.ts` (fix mock)      |

## Interface / Signature

The `ContextGuard` interface does not change — `scan()` returns `GuardResult`, which gains a field:

```typescript
// Source: shared/src/core/interfaces/context-guard.interface.ts
import type { SelectedFile } from "#core/types/selected-file.js";
import type { GuardResult } from "#core/types/guard-types.js";

export interface ContextGuard {
  scan(
    files: readonly SelectedFile[],
  ): Promise<{
    readonly result: GuardResult;
    readonly safeFiles: readonly SelectedFile[];
  }>;
}
```

Updated `GuardResult` type (after modification):

```typescript
// Source: shared/src/core/types/guard-types.ts
export interface GuardResult {
  readonly passed: boolean;
  readonly findings: readonly GuardFinding[];
  readonly filesBlocked: readonly RelativePath[];
  readonly filesRedacted: readonly RelativePath[];
  readonly filesWarned: readonly RelativePath[];
}
```

Updated `PromptInjectionScanner` class (after modification):

```typescript
// Source: shared/src/pipeline/prompt-injection-scanner.ts
export class PromptInjectionScanner implements GuardScanner {
  readonly name: string;
  scan(file: SelectedFile, content: string): readonly GuardFinding[];
}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// Source: shared/src/core/types/guard-types.ts
import type { GuardSeverity, GuardFindingType } from "#core/types/enums.js";
import type { RelativePath } from "#core/types/paths.js";
import type { LineNumber } from "#core/types/units.js";

export interface GuardFinding {
  readonly severity: GuardSeverity;
  readonly type: GuardFindingType;
  readonly file: RelativePath;
  readonly line?: LineNumber;
  readonly message: string;
  readonly pattern?: string;
}
```

```typescript
// Source: shared/src/core/types/enums.ts
export const GUARD_SEVERITY = {
  BLOCK: "block",
  WARN: "warn",
} as const;
export type GuardSeverity = (typeof GUARD_SEVERITY)[keyof typeof GUARD_SEVERITY];

export const GUARD_FINDING_TYPE = {
  SECRET: "secret",
  EXCLUDED_FILE: "excluded-file",
  PROMPT_INJECTION: "prompt-injection",
} as const;
export type GuardFindingType =
  (typeof GUARD_FINDING_TYPE)[keyof typeof GUARD_FINDING_TYPE];
```

```typescript
// Source: shared/src/core/interfaces/scan-pattern.interface.ts
export interface ScanPattern {
  readonly pattern: RegExp;
  readonly label: string;
}
```

### Tier 1 — signature + path

| Type              | Path                                                              | Members | Purpose                    |
| ----------------- | ----------------------------------------------------------------- | ------- | -------------------------- |
| `GuardScanner`    | `shared/src/core/interfaces/guard-scanner.interface.ts`           | 2       | scan + props: name         |
| `SelectedFile`    | `shared/src/core/types/selected-file.js`                          | 5       | props: path, language, estimatedTokens, relevanceScore, tier |
| `FileContentReader` | `shared/src/core/interfaces/file-content-reader.interface.ts`   | 1       | getContent               |

### Tier 2 — path-only

| Type             | Path                              | Factory               |
| ---------------- | --------------------------------- | --------------------- |
| `RelativePath`   | `shared/src/core/types/paths.ts`  | `toRelativePath(raw)` |
| `GlobPattern`    | `shared/src/core/types/paths.ts`  | `toGlobPattern(raw)`  |
| `LineNumber`     | `shared/src/core/types/units.ts`  | `toLineNumber(n)`     |
| `GuardSeverity`  | `shared/src/core/types/enums.ts`  | enum value            |
| `GuardFindingType` | `shared/src/core/types/enums.ts` | enum value            |

## Config Changes

- **shared/package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add `filesWarned` to `GuardResult`

In `shared/src/core/types/guard-types.ts`, add one field to the `GuardResult` interface:

```typescript
export interface GuardResult {
  readonly passed: boolean;
  readonly findings: readonly GuardFinding[];
  readonly filesBlocked: readonly RelativePath[];
  readonly filesRedacted: readonly RelativePath[];
  readonly filesWarned: readonly RelativePath[];
}
```

**Verify:** `pnpm typecheck` reports errors in files that construct `GuardResult` without `filesWarned` — this is expected. Steps 3, 5, and 6 resolve these.

### Step 2: Split PromptInjectionScanner patterns

In `shared/src/pipeline/prompt-injection-scanner.ts`, replace the single `PROMPT_INJECTION_PATTERNS` array with two arrays and update `scan()` to call `scanWithPatterns` twice:

```typescript
const BLOCK_PATTERNS: readonly ScanPattern[] = [
  {
    pattern: /<\|?(system|im_start|endofprompt)\|?>/i,
    label: "special token",
  },
  { pattern: /\[INST\].*\[\/INST\]/i, label: "instruction block" },
];

const WARN_PATTERNS: readonly ScanPattern[] = [
  {
    pattern: /ignore\s+(all\s+)?(previous|above|prior)\s+instructions/i,
    label: "instruction override",
  },
  {
    pattern: /you\s+are\s+now\s+(a|an|acting\s+as)/i,
    label: "role override",
  },
  { pattern: /system\s*:\s*/i, label: "system prefix" },
  {
    pattern:
      /do\s+not\s+follow\s+(any\s+)?(other|previous)\s+(rules|instructions|constraints)/i,
    label: "constraint override",
  },
];
```

Update `scan()`:

```typescript
scan(file: SelectedFile, content: string): readonly GuardFinding[] {
  const blockFindings = scanWithPatterns(
    file,
    content,
    BLOCK_PATTERNS,
    GUARD_SEVERITY.BLOCK,
    GUARD_FINDING_TYPE.PROMPT_INJECTION,
    "Prompt injection pattern: ",
  );
  const warnFindings = scanWithPatterns(
    file,
    content,
    WARN_PATTERNS,
    GUARD_SEVERITY.WARN,
    GUARD_FINDING_TYPE.PROMPT_INJECTION,
    "Prompt injection pattern: ",
  );
  return [...blockFindings, ...warnFindings];
}
```

**Verify:** `pnpm typecheck` passes for this file. `pnpm lint` passes for this file.

### Step 3: Compute `warnedPaths` in ContextGuard

In `shared/src/pipeline/context-guard.ts`, after the `blockedPaths` computation, add `warnedPaths`:

```typescript
const warnedPaths = [
  ...new Set(
    allFindings
      .filter((f) => f.severity === GUARD_SEVERITY.WARN)
      .map((f) => f.file)
      .filter((p) => !blockedSet.has(p)),
  ),
];
```

Update the return object to include `filesWarned: warnedPaths`:

```typescript
return {
  result: {
    passed,
    findings: allFindings,
    filesBlocked: blockedPaths,
    filesRedacted: blockedPaths,
    filesWarned: warnedPaths,
  },
  safeFiles,
};
```

**Verify:** `pnpm typecheck` passes for `context-guard.ts`.

### Step 4: Add WARN tests to context-guard.test.ts

In `shared/src/pipeline/__tests__/context-guard.test.ts`, add 5 new test cases inside the existing `describe("ContextGuard")` block:

**Test: `warn_findings_do_not_block_files`**
Create a `FileContentReader` that returns `"system: foo"` for a file. Scan with the full scanner array. Assert: `safeFiles` includes the file, `result.filesBlocked` is empty, `result.filesWarned` contains the file path, `result.passed` is `true`.

**Test: `block_injection_still_blocks`**
Create a `FileContentReader` that returns `"<|system|>"` for a file. Scan with the full scanner array. Assert: `safeFiles` is empty, `result.filesBlocked` contains the file path, `result.filesWarned` is empty.

**Test: `mixed_warn_and_block_different_files`**
Create a `FileContentReader` that returns `"system: config"` for one file and `"<|im_start|>"` for another. Scan both. Assert: the WARN file is in `safeFiles` and `result.filesWarned`, the BLOCK file is in `result.filesBlocked` and not in `safeFiles`, `result.passed` is `true`.

**Test: `mixed_severity_same_file_counts_as_blocked`**
Create a `FileContentReader` that returns `"system: config <|system|>"` for a single file. Scan it. Assert: the file is in `result.filesBlocked`, the file is NOT in `result.filesWarned`, `safeFiles` is empty.

**Test: `clean_files_empty_filesWarned`**
Create a `FileContentReader` that returns `"const x = 1;"`. Scan a clean file. Assert: `result.filesWarned` is empty, `result.filesBlocked` is empty, `result.findings` is empty.

Also update the existing test `PromptInjectionScanner detects instruction-override strings` to verify the finding has `severity` equal to `GUARD_SEVERITY.WARN` (since "ignore all previous instructions" is now a WARN pattern).

**Verify:** `pnpm test shared/src/pipeline/__tests__/context-guard.test.ts` passes. All 11 tests (6 existing + 5 new) pass.

### Step 5: Fix GuardResult mock in inspect-runner.test.ts

In `shared/src/pipeline/__tests__/inspect-runner.test.ts`, find the `guardResult` constant (which constructs a `GuardResult` object literal) and add `filesWarned: []`:

```typescript
const guardResult: GuardResult = {
  passed: true,
  findings: [],
  filesBlocked: [],
  filesRedacted: [],
  filesWarned: [],
};
```

**Verify:** `pnpm typecheck` passes for this file. `pnpm test shared/src/pipeline/__tests__/inspect-runner.test.ts` passes.

### Step 6: Fix GuardResult mock in build-telemetry-event.test.ts

In `shared/src/core/__tests__/build-telemetry-event.test.ts`, find the `guard` constant in the `"buildTelemetryEvent guard with counts"` test case and add `filesWarned: []`:

```typescript
const guard: GuardResult = {
  passed: false,
  findings: [
    {
      severity: GUARD_SEVERITY.BLOCK,
      type: GUARD_FINDING_TYPE.SECRET,
      file: toRelativePath("src/secret.ts"),
      message: "secret",
    },
  ],
  filesBlocked: [toRelativePath("src/secret.ts"), toRelativePath("src/keys.ts")],
  filesRedacted: [],
  filesWarned: [],
};
```

**Verify:** `pnpm typecheck` passes for this file. `pnpm test shared/src/core/__tests__/build-telemetry-event.test.ts` passes.

### Step 7: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

Update the golden snapshot: run `pnpm test shared/src/integration/__tests__/golden-snapshot.test.ts -- -u` to accept the new `filesWarned` field in the snapshot.

## Tests

| Test case                                     | Description                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `warn_findings_do_not_block_files`             | File with `system: foo` produces WARN finding, stays in safeFiles, appears in `filesWarned`    |
| `block_injection_still_blocks`                 | File with `<\|system\|>` produces BLOCK finding, removed from safeFiles, in `filesBlocked`     |
| `mixed_warn_and_block_different_files`         | WARN file in safeFiles + filesWarned; BLOCK file in filesBlocked; passed is true               |
| `mixed_severity_same_file_counts_as_blocked`   | File with both patterns: in filesBlocked, NOT in filesWarned                                   |
| `clean_files_empty_filesWarned`                | Clean file: empty filesWarned, empty filesBlocked, empty findings                              |

## Acceptance Criteria

- [ ] All files modified per Files table
- [ ] `GuardResult` has `filesWarned: readonly RelativePath[]` field
- [ ] `PromptInjectionScanner` produces BLOCK for special tokens and instruction blocks, WARN for text heuristics
- [ ] `ContextGuard` populates `filesWarned` with files having WARN-only findings
- [ ] Files with both BLOCK and WARN findings appear in `filesBlocked`, not `filesWarned`
- [ ] All 5 new test cases pass
- [ ] All existing tests pass (including updated snapshot)
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` outside allowed files
- [ ] No `let` in production code (only `const`; control flags in imperative closures are the sole exception)
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
