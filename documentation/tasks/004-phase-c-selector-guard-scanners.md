# Task 004: Phase C — HeuristicSelector, ContextGuard, Guard Scanners

> **Status:** Pending
> **Phase:** C (Pipeline Steps 1–8)
> **Layer:** pipeline
> **Depends on:** Phase B (all Done), Task 002 (core pipeline types)

## Goal

Implement the context selection and security scanning steps: HeuristicSelector (ContextSelector port), ContextGuard, and the three MVP guard scanners (ExclusionScanner, SecretScanner, PromptInjectionScanner).

## Architecture Notes

- Pipeline layer may import from `#core/` only — no adapters, storage, Node, or external packages
- Constructor injection: HeuristicSelector receives LanguageProvider[]; ContextGuard receives GuardScanner[] and FileContentReader
- No `Date.now()`, `Math.random()`, or mutating array methods; return new objects
- Scoring weights from Project Plan §8: path relevance 0.4, import proximity 0.3, recency 0.2, size penalty 0.1

## Files

| Action | Path                                              |
| ------ | ------------------------------------------------- |
| Create | `shared/src/pipeline/heuristic-selector.ts`       |
| Create | `shared/src/pipeline/heuristic-selector.test.ts`  |
| Create | `shared/src/pipeline/exclusion-scanner.ts`        |
| Create | `shared/src/pipeline/secret-scanner.ts`           |
| Create | `shared/src/pipeline/prompt-injection-scanner.ts` |
| Create | `shared/src/pipeline/context-guard.ts`            |
| Create | `shared/src/pipeline/context-guard.test.ts`       |

## Interface / Signature

```typescript
// shared/src/pipeline/heuristic-selector.ts
import type { ContextSelector } from "#core/interfaces/context-selector.interface.js";
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { RepoMap } from "#core/types/repo-map.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { TokenCount } from "#core/types/units.js";
import type { ContextResult } from "#core/types/selected-file.js";

export interface HeuristicSelectorConfig {
  readonly maxFiles: number;
  readonly weights?: {
    readonly pathRelevance: number;
    readonly importProximity: number;
    readonly recency: number;
    readonly sizePenalty: number;
  };
}

export class HeuristicSelector implements ContextSelector {
  constructor(
    private readonly languageProviders: readonly LanguageProvider[],
    private readonly config: HeuristicSelectorConfig,
  ) {}

  selectContext(
    task: TaskClassification,
    repo: RepoMap,
    budget: TokenCount,
    rulePack: RulePack,
  ): ContextResult;
}
```

Scoring (from MVP spec §4 Step 4 + Project Plan §8):

- Final score = pathRelevance × 0.4 + importProximity × 0.3 + recency × 0.2 + sizePenalty × 0.1
- Range [0.0, 1.0]; boostPatterns +0.2, penalizePatterns −0.2 (clamped)
- Import proximity: BFS from seed files; depth 0 = 1.0, depth 1 = 0.6, depth 2 = 0.3, depth 3+ = 0.1, no path = 0.0
- Size penalty: inverted min-max normalized (smallest = 1.0, largest = 0.0) on estimatedTokens
- Recency: min-max normalized (most recent = 1.0, oldest = 0.0) on lastModified
- Path relevance: keyword matching on file path segments against intent keywords
- Constraints: includePatterns (whitelist), excludePatterns (blacklist), maxFiles (default 20)

```typescript
// shared/src/pipeline/exclusion-scanner.ts
import type { GuardScanner } from "#core/interfaces/guard-scanner.interface.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { GuardFinding } from "#core/types/guard-types.js";

export class ExclusionScanner implements GuardScanner {
  readonly name = "ExclusionScanner";

  scan(file: SelectedFile, content: string): readonly GuardFinding[];
}
```

Never-include patterns (MVP spec §4 Step 5):
`.env`, `.env.*`, `*.pem`, `*.key`, `*.pfx`, `*.p12`, `*secret*`, `*credential*`, `*password*`, `*.cert`

```typescript
// shared/src/pipeline/secret-scanner.ts
import type { GuardScanner } from "#core/interfaces/guard-scanner.interface.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { GuardFinding } from "#core/types/guard-types.js";

export class SecretScanner implements GuardScanner {
  readonly name = "SecretScanner";

  scan(file: SelectedFile, content: string): readonly GuardFinding[];
}
```

Secret regex patterns (Project Plan §8.4):

- `AKIA[0-9A-Z]{16}` — AWS Access Key ID
- `gh[pousr]_[A-Za-z0-9]{36,}` — GitHub token
- `sk_(live|test)_[0-9a-zA-Z]{24,}` — Stripe secret key
- `(?i)(api_key|apikey|api-key)\s*[:=]\s*['"]?[A-Za-z0-9\-_]{20,}` — Generic named API key
- `eyJ[A-Za-z0-9\-_=]+\.eyJ[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_.+/=]+` — JWT
- `-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----` — SSH/TLS private key header

```typescript
// shared/src/pipeline/prompt-injection-scanner.ts
import type { GuardScanner } from "#core/interfaces/guard-scanner.interface.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { GuardFinding } from "#core/types/guard-types.js";

export class PromptInjectionScanner implements GuardScanner {
  readonly name = "PromptInjectionScanner";

  scan(file: SelectedFile, content: string): readonly GuardFinding[];
}
```

Prompt injection patterns (Project Plan §8.4):

- `(?i)ignore\s+(all\s+)?(previous|above|prior)\s+instructions`
- `(?i)you\s+are\s+now\s+(a|an|acting\s+as)`
- `(?i)system\s*:\s*`
- `(?i)do\s+not\s+follow\s+(any\s+)?(other|previous)\s+(rules|instructions|constraints)`
- `(?i)<\|?(system|im_start|endofprompt)\|?>`
- `(?i)\[INST\].*\[/INST\]`

```typescript
// shared/src/pipeline/context-guard.ts
import type { ContextGuard as IContextGuard } from "#core/interfaces/context-guard.interface.js";
import type { GuardScanner } from "#core/interfaces/guard-scanner.interface.js";
import type { FileContentReader } from "#core/interfaces/file-content-reader.interface.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { GuardResult } from "#core/types/guard-types.js";
import type { GlobPattern } from "#core/types/paths.js";

export class ContextGuard implements IContextGuard {
  constructor(
    private readonly scanners: readonly GuardScanner[],
    private readonly fileContentReader: FileContentReader,
    private readonly allowPatterns: readonly GlobPattern[],
  ) {}

  scan(files: readonly SelectedFile[]): {
    readonly result: GuardResult;
    readonly safeFiles: readonly SelectedFile[];
  };
}
```

Behavior: for each file, if path matches allowPatterns → skip scanning. Otherwise get content via fileContentReader, run each scanner in order (Exclusion → Secret → PromptInjection). Aggregate findings. safeFiles = files with zero `block`-severity findings. If all blocked → `result.passed = false`, `safeFiles = []`.

## Steps

### Step 1: HeuristicSelector implementation

Create `shared/src/pipeline/heuristic-selector.ts`. Implement four-signal scoring with configurable weights (defaults 0.4/0.3/0.2/0.1). Apply include/exclude/boost/penalize from RulePack. Sort by score desc; fill to budget and maxFiles.

**Verify:** `pnpm typecheck` passes.

### Step 2: HeuristicSelector tests

Create `shared/src/pipeline/heuristic-selector.test.ts` with cases:

- Scoring formula produces expected scores for known inputs
- `maxFiles` cap respected
- `includePatterns` whitelist filtering
- `excludePatterns` blacklist filtering
- `boostPatterns` add +0.2, `penalizePatterns` subtract −0.2 (clamped)
- Budget cap: stops adding files when budget exceeded
- Files with no LanguageProvider get importProximity = 0

**Verify:** `pnpm test -- heuristic-selector` passes.

### Step 3: Guard scanner implementations

Create `exclusion-scanner.ts`, `secret-scanner.ts`, `prompt-injection-scanner.ts` using the exact patterns listed above.

**Verify:** `pnpm typecheck` passes.

### Step 4: ContextGuard implementation

Create `shared/src/pipeline/context-guard.ts`. Run scanners in order; aggregate findings; filter blocked files.

**Verify:** `pnpm typecheck` passes.

### Step 5: ContextGuard tests

Create `shared/src/pipeline/context-guard.test.ts` with cases:

- ExclusionScanner blocks `.env`, `*.pem`, `*secret*` files
- SecretScanner detects AWS key, GitHub token, JWT in content
- PromptInjectionScanner detects instruction-override strings
- allowPatterns bypass scanning for matching files
- All files blocked → `passed: false`, `safeFiles: []`
- Clean files pass through unchanged

**Verify:** `pnpm test -- context-guard` passes.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass, zero warnings.

## Tests

| Test case                           | Description                          |
| ----------------------------------- | ------------------------------------ |
| heuristic-selector: scoring formula | Known inputs produce expected scores |
| heuristic-selector: maxFiles cap    | Selection stops at maxFiles          |
| heuristic-selector: include/exclude | Patterns filter correctly            |
| heuristic-selector: boost/penalize  | Score adjustments clamped 0–1        |
| context-guard: exclusion            | Blocks .env, *.pem, *secret\* paths  |
| context-guard: secrets              | Detects AWS key, GitHub token, JWT   |
| context-guard: prompt injection     | Detects instruction-override strings |
| context-guard: allow patterns       | Bypasses scanning for matches        |
| context-guard: all blocked          | passed=false, empty safeFiles        |

## Acceptance Criteria

- [ ] All 7 files created per Files table
- [ ] HeuristicSelector scoring matches spec weights and algorithm
- [ ] Each scanner uses exact patterns from Project Plan §8.4
- [ ] ContextGuard orchestrates scanners in order and aggregates correctly
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] No imports from adapters, storage, Node, or external packages

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section to this file with:
   - What you tried
   - What went wrong
   - What decision you need from the user
3. Report to the user and wait for guidance
