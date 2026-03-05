# Task 105: CommandInjectionScanner (GuardScanner)

> **Status:** Pending
> **Phase:** Q (Research-Backed Quality & Security)
> **Layer:** pipeline
> **Depends on:** ContextGuard impl (Done)

## Goal

Add a GuardScanner that detects shell command-injection patterns (`$(...)`, backtick substitution, pipe chains) in file content so that compiled context containing them can be blocked before reaching the model or downstream tooling.

## Architecture Notes

- Implements existing `GuardScanner` interface; extends the scanner chain in `create-pipeline-deps.ts` (OCP). No changes to ContextGuard or GuardScanner interface.
- Reuses `scanWithPatterns` from `pattern-scanner.ts` and `ScanPattern` — same pattern as SecretScanner and PromptInjectionScanner.
- New finding type `GUARD_FINDING_TYPE.COMMAND_INJECTION` in core enums so guard result and telemetry distinguish command-injection from prompt-injection and secret.
- All findings BLOCK severity (no WARN tier). ADR and security: Context Guard runs before Content Transformer; blocked files never reach the model.

## Files

| Action | Path                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------- |
| Modify | `shared/src/core/types/enums.ts` (add COMMAND_INJECTION to GUARD_FINDING_TYPE)                 |
| Create | `shared/src/pipeline/command-injection-scanner.ts`                                             |
| Create | `shared/src/pipeline/__tests__/command-injection-scanner.test.ts`                              |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (add CommandInjectionScanner to scanners array) |

## Interface / Signature

```typescript
// Interface copied verbatim from core (with imports)
import type { SelectedFile } from "#core/types/selected-file.js";
import type { GuardFinding } from "#core/types/guard-types.js";

export interface GuardScanner {
  readonly name: string;
  scan(file: SelectedFile, content: string): readonly GuardFinding[];
}
```

```typescript
// Class declaration, constructor with all parameters, every method signature
import type { GuardScanner } from "#core/interfaces/guard-scanner.interface.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { GuardFinding } from "#core/types/guard-types.js";
import type { ScanPattern } from "#core/interfaces/scan-pattern.interface.js";
import { scanWithPatterns } from "./pattern-scanner.js";
import { GUARD_SEVERITY, GUARD_FINDING_TYPE } from "#core/types/enums.js";

const COMMAND_INJECTION_PATTERNS: readonly ScanPattern[] = [
  { pattern: /\$\([^)]*\)/, label: "dollar-paren substitution" },
  { pattern: /`[^`]*`/, label: "backtick substitution" },
  { pattern: /\|\s*\S+/, label: "pipe chain" },
];

export class CommandInjectionScanner implements GuardScanner {
  readonly name = "CommandInjectionScanner";

  scan(file: SelectedFile, content: string): readonly GuardFinding[] {
    return scanWithPatterns(
      file,
      content,
      COMMAND_INJECTION_PATTERNS,
      GUARD_SEVERITY.BLOCK,
      GUARD_FINDING_TYPE.COMMAND_INJECTION,
      "Command injection pattern: ",
    );
  }
}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// GuardFinding — shared/src/core/types/guard-types.ts
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
// SelectedFile — shared/src/core/types/selected-file.ts
import type { RelativePath } from "#core/types/paths.js";
import type { TokenCount, StepIndex } from "#core/types/units.js";
import type { RelevanceScore } from "#core/types/scores.js";
import type { InclusionTier } from "#core/types/enums.js";

export interface SelectedFile {
  readonly path: RelativePath;
  readonly language: string;
  readonly estimatedTokens: TokenCount;
  readonly relevanceScore: RelevanceScore;
  readonly tier: InclusionTier;
  readonly previouslyShownAtStep?: StepIndex;
  readonly resolvedContent?: string;
}
```

### Tier 1 — signature + path

| Type          | Path                                                   | Members | Purpose                                   |
| ------------- | ------------------------------------------------------ | ------- | ----------------------------------------- |
| `ScanPattern` | `shared/src/core/interfaces/scan-pattern.interface.ts` | 2       | pattern, label — used by scanWithPatterns |

### Tier 2 — path-only

| Type           | Path                             | Factory               |
| -------------- | -------------------------------- | --------------------- |
| `RelativePath` | `shared/src/core/types/paths.js` | `toRelativePath(raw)` |
| `LineNumber`   | `shared/src/core/types/units.js` | `toLineNumber(n)`     |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add COMMAND_INJECTION to GUARD_FINDING_TYPE

In `shared/src/core/types/enums.ts`, add to the `GUARD_FINDING_TYPE` object a new entry: `COMMAND_INJECTION: "command-injection"` (after `PROMPT_INJECTION`).

**Verify:** Grep for `COMMAND_INJECTION` in `shared/src/core/types/enums.ts` returns one match; typecheck passes.

### Step 2: Implement CommandInjectionScanner

Create `shared/src/pipeline/command-injection-scanner.ts`. Define `COMMAND_INJECTION_PATTERNS` as a `readonly ScanPattern[]` with three entries: `{ pattern: /\$\([^)]*\)/, label: "dollar-paren substitution" }`, `{ pattern: /`[^`]_`/, label: "backtick substitution" }`, `{ pattern: /\|\s_\S+/, label: "pipe chain" }`. Export class `CommandInjectionScanner`implementing`GuardScanner`with`readonly name = "CommandInjectionScanner"`and`scan(file: SelectedFile, content: string): readonly GuardFinding[]`that calls`scanWithPatterns(file, content, COMMAND_INJECTION_PATTERNS, GUARD_SEVERITY.BLOCK, GUARD_FINDING_TYPE.COMMAND_INJECTION, "Command injection pattern: ")`and returns the result. Use named imports from`#core/interfaces/guard-scanner.interface.js`, `#core/types/guard-types.js`, `#core/types/enums.js`, `#core/interfaces/scan-pattern.interface.js`, and `./pattern-scanner.js`.

**Verify:** `pnpm typecheck` passes; file exists and exports `CommandInjectionScanner`.

### Step 3: Wire CommandInjectionScanner in create-pipeline-deps

In `shared/src/bootstrap/create-pipeline-deps.ts`, add import for `CommandInjectionScanner` from `#pipeline/command-injection-scanner.js`. Instantiate `const commandInjectionScanner = new CommandInjectionScanner()`. Replace the current `scanners` array so it includes the new scanner: `const scanners = [exclusionScanner, secretScanner, promptInjectionScanner, commandInjectionScanner] as const`.

**Verify:** Grep for `commandInjectionScanner` in `create-pipeline-deps.ts` shows declaration and use in `scanners`; `pnpm typecheck` passes.

### Step 4: Unit tests for CommandInjectionScanner

Create `shared/src/pipeline/__tests__/command-injection-scanner.test.ts`. Use vitest (describe, it, expect). Create a helper that builds a `SelectedFile` with `toRelativePath`, `toTokenCount`, `toRelevanceScore`, `INCLUSION_TIER.L0` and path `"src/foo.ts"`. Add test cases: (1) **detects_dollar_paren_substitution**: content `"run $(whoami) here"` yields at least one finding with `type` equal to `GUARD_FINDING_TYPE.COMMAND_INJECTION` and `message` starting with `"Command injection pattern:"`. (2) **detects_backtick_substitution**: content that includes a backtick-wrapped token (backtick + `id` + backtick) yields at least one finding. (3) **detects_pipe_chain**: content `"a | b"` yields at least one finding. (4) **clean_content_returns_empty**: content `"const x = 1;"` with no substitution or pipe yields empty array. (5) **finding_includes_file_and_line**: content `"$(echo)"` (exactly one match); assert `findings.length >= 1`, `findings[0].file` equals the mock file path, and `findings[0].line` is defined. Import `CommandInjectionScanner`, `GUARD_FINDING_TYPE`, and types from the same paths as the implementation.

**Verify:** `pnpm test shared/src/pipeline/__tests__/command-injection-scanner.test.ts` passes.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                         | Description                                                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| detects_dollar_paren_substitution | Content with $(...) yields at least one finding with type command-injection and message prefix "Command injection pattern:" |
| detects_backtick_substitution     | Content with backtick command substitution yields at least one finding                                                      |
| detects_pipe_chain                | Content with pipe chain "a \| b" yields at least one finding                                                                |
| clean_content_returns_empty       | Content with no command substitution or pipe returns empty array                                                            |
| finding_includes_file_and_line    | Single match yields finding with file path and line defined                                                                 |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] Interface matches signature exactly
- [ ] All test cases pass
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
