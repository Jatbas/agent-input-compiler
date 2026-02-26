# Task 001: Phase B — Core Interfaces

> **Status:** Done
> **Phase:** B (Core Interfaces)
> **Layer:** core
> **Depends on:** Phase A (all Done)

## Goal

Define all port interfaces and domain types that pipeline steps, adapters, and storage implementations depend on — so that Phases C–F can be built against stable contracts.

## Architecture Notes

- ADR-007: UUIDv7 for all entity IDs
- ADR-008: ISO 8601 UTC with ms precision for all timestamps
- ADR-010: Branded types for compile-time safety
- ISP: one interface per `*.interface.ts` file (enforced by ESLint)
- Core layer may only import from `#core/` (enforced by ESLint whitelist)
- No implementation logic — only type definitions and interface contracts
- Domain types (data shapes) go in `core/types/`; port interfaces go in `core/interfaces/`
- All properties `readonly`; all arrays `readonly T[]`

## Files

### Domain types (`shared/src/core/types/`)

| Action | Path                                                    |
| ------ | ------------------------------------------------------- |
| Create | `shared/src/core/types/task-classification.ts`          |
| Create | `shared/src/core/types/rule-pack.ts`                    |
| Create | `shared/src/core/types/selected-file.ts`                |
| Create | `shared/src/core/types/guard-types.ts`                  |
| Create | `shared/src/core/types/transform-types.ts`              |
| Create | `shared/src/core/types/repo-map.ts`                     |
| Create | `shared/src/core/types/compilation-types.ts`            |
| Modify | `shared/src/core/types/index.ts` (export all new types) |

### Port interfaces (`shared/src/core/interfaces/`)

| Action | Path                                                                   |
| ------ | ---------------------------------------------------------------------- |
| Create | `shared/src/core/interfaces/intent-classifier.interface.ts`            |
| Create | `shared/src/core/interfaces/rule-pack-resolver.interface.ts`           |
| Create | `shared/src/core/interfaces/budget-allocator.interface.ts`             |
| Create | `shared/src/core/interfaces/context-selector.interface.ts`             |
| Create | `shared/src/core/interfaces/context-guard.interface.ts`                |
| Create | `shared/src/core/interfaces/guard-scanner.interface.ts`                |
| Create | `shared/src/core/interfaces/content-transformer.interface.ts`          |
| Create | `shared/src/core/interfaces/content-transformer-pipeline.interface.ts` |
| Create | `shared/src/core/interfaces/summarisation-ladder.interface.ts`         |
| Create | `shared/src/core/interfaces/prompt-assembler.interface.ts`             |
| Create | `shared/src/core/interfaces/cache-store.interface.ts`                  |
| Create | `shared/src/core/interfaces/telemetry-store.interface.ts`              |
| Create | `shared/src/core/interfaces/config-store.interface.ts`                 |
| Create | `shared/src/core/interfaces/guard-store.interface.ts`                  |

## Interface / Signature

### Domain types

```typescript
// task-classification.ts
import type { TaskClass } from "#core/types/enums.js";
import type { Confidence } from "#core/types/scores.js";

export interface TaskClassification {
  readonly taskClass: TaskClass;
  readonly confidence: Confidence;
  readonly matchedKeywords: readonly string[];
}
```

```typescript
// rule-pack.ts
import type { GlobPattern } from "#core/types/paths.js";
import type { TokenCount } from "#core/types/units.js";

export interface RulePack {
  readonly name?: string;
  readonly version?: number;
  readonly description?: string;
  readonly constraints: readonly string[];
  readonly includePatterns: readonly GlobPattern[];
  readonly excludePatterns: readonly GlobPattern[];
  readonly budgetOverride?: TokenCount;
  readonly heuristic?: {
    readonly boostPatterns: readonly GlobPattern[];
    readonly penalizePatterns: readonly GlobPattern[];
  };
}
```

```typescript
// selected-file.ts
import type { RelativePath } from "#core/types/paths.js";
import type { TokenCount } from "#core/types/units.js";
import type { RelevanceScore } from "#core/types/scores.js";
import type { InclusionTier } from "#core/types/enums.js";

export interface SelectedFile {
  readonly path: RelativePath;
  readonly language: string;
  readonly estimatedTokens: TokenCount;
  readonly relevanceScore: RelevanceScore;
  readonly tier: InclusionTier;
}

export interface ContextResult {
  readonly files: readonly SelectedFile[];
  readonly totalTokens: TokenCount;
  readonly truncated: boolean;
}
```

```typescript
// guard-types.ts
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

export interface GuardResult {
  readonly passed: boolean;
  readonly findings: readonly GuardFinding[];
  readonly filesBlocked: readonly RelativePath[];
  readonly filesRedacted: readonly RelativePath[];
}
```

```typescript
// transform-types.ts
import type { SelectedFile } from "#core/types/selected-file.js";
import type { RelativePath } from "#core/types/paths.js";
import type { TokenCount } from "#core/types/units.js";

export interface TransformContext {
  readonly directTargetPaths: readonly RelativePath[];
  readonly rawMode: boolean;
}

export interface TransformResult {
  readonly files: readonly SelectedFile[];
  readonly metadata: readonly TransformMetadata[];
}

export interface TransformMetadata {
  readonly filePath: RelativePath;
  readonly originalTokens: TokenCount;
  readonly transformedTokens: TokenCount;
  readonly transformersApplied: readonly string[];
}
```

```typescript
// repo-map.ts
import type { AbsolutePath, RelativePath } from "#core/types/paths.js";
import type { Bytes, TokenCount } from "#core/types/units.js";
import type { ISOTimestamp } from "#core/types/identifiers.js";

export interface FileEntry {
  readonly path: RelativePath;
  readonly language: string;
  readonly sizeBytes: Bytes;
  readonly estimatedTokens: TokenCount;
  readonly lastModified: ISOTimestamp;
}

export interface RepoMap {
  readonly root: AbsolutePath;
  readonly files: readonly FileEntry[];
  readonly totalFiles: number;
  readonly totalTokens: TokenCount;
}
```

```typescript
// compilation-types.ts
import type { AbsolutePath, FilePath, RelativePath } from "#core/types/paths.js";
import type { TokenCount, Milliseconds, StepIndex } from "#core/types/units.js";
import type { Percentage } from "#core/types/scores.js";
import type { SessionId } from "#core/types/identifiers.js";
import type {
  TaskClass,
  EditorId,
  InclusionTier,
  ToolOutputType,
} from "#core/types/enums.js";
import type { GuardResult } from "#core/types/guard-types.js";

export interface ToolOutput {
  readonly type: ToolOutputType;
  readonly content: string;
  readonly relatedFiles?: readonly RelativePath[];
}

export interface CompilationRequest {
  readonly intent: string;
  readonly projectRoot: AbsolutePath;
  readonly modelId: string | null;
  readonly editorId: EditorId;
  readonly configPath: FilePath | null;
  readonly sessionId?: SessionId;
  readonly stepIndex?: StepIndex;
  readonly stepIntent?: string;
  readonly previousFiles?: readonly RelativePath[];
  readonly toolOutputs?: readonly ToolOutput[];
  readonly conversationTokens?: TokenCount;
}

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
}
```

### Port interfaces

```typescript
// intent-classifier.interface.ts
import type { TaskClassification } from "#core/types/task-classification.js";

export interface IntentClassifier {
  classify(intent: string): TaskClassification;
}
```

```typescript
// rule-pack-resolver.interface.ts
import type { TaskClassification } from "#core/types/task-classification.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { AbsolutePath } from "#core/types/paths.js";

export interface RulePackResolver {
  resolve(task: TaskClassification, projectRoot: AbsolutePath): RulePack;
}
```

```typescript
// budget-allocator.interface.ts
import type { RulePack } from "#core/types/rule-pack.js";
import type { TaskClass } from "#core/types/enums.js";
import type { TokenCount } from "#core/types/units.js";

export interface BudgetAllocator {
  allocate(rulePack: RulePack, taskClass: TaskClass): TokenCount;
}
```

```typescript
// context-selector.interface.ts
import type { TaskClassification } from "#core/types/task-classification.js";
import type { RepoMap } from "#core/types/repo-map.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { TokenCount } from "#core/types/units.js";
import type { ContextResult } from "#core/types/selected-file.js";

export interface ContextSelector {
  selectContext(
    task: TaskClassification,
    repo: RepoMap,
    budget: TokenCount,
    rulePack: RulePack,
  ): ContextResult;
}
```

```typescript
// context-guard.interface.ts
import type { SelectedFile } from "#core/types/selected-file.js";
import type { GuardResult } from "#core/types/guard-types.js";

export interface ContextGuard {
  scan(files: readonly SelectedFile[]): {
    readonly result: GuardResult;
    readonly safeFiles: readonly SelectedFile[];
  };
}
```

```typescript
// guard-scanner.interface.ts
import type { SelectedFile } from "#core/types/selected-file.js";
import type { GuardFinding } from "#core/types/guard-types.js";

export interface GuardScanner {
  readonly name: string;
  scan(file: SelectedFile, content: string): readonly GuardFinding[];
}
```

```typescript
// content-transformer.interface.ts
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { InclusionTier } from "#core/types/enums.js";

export interface ContentTransformer {
  readonly id: string;
  readonly fileExtensions: readonly FileExtension[];
  transform(content: string, tier: InclusionTier, filePath: RelativePath): string;
}
```

```typescript
// content-transformer-pipeline.interface.ts
import type { SelectedFile } from "#core/types/selected-file.js";
import type { TransformContext, TransformResult } from "#core/types/transform-types.js";

export interface ContentTransformerPipeline {
  transform(files: readonly SelectedFile[], context: TransformContext): TransformResult;
}
```

```typescript
// summarisation-ladder.interface.ts
import type { SelectedFile } from "#core/types/selected-file.js";
import type { TokenCount } from "#core/types/units.js";

export interface SummarisationLadder {
  compress(files: readonly SelectedFile[], budget: TokenCount): readonly SelectedFile[];
}
```

```typescript
// prompt-assembler.interface.ts
import type { TaskClassification } from "#core/types/task-classification.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { OutputFormat } from "#core/types/enums.js";

export interface PromptAssembler {
  assemble(
    task: TaskClassification,
    files: readonly SelectedFile[],
    constraints: readonly string[],
    format: OutputFormat,
  ): string;
}
```

```typescript
// cache-store.interface.ts
import type { ISOTimestamp } from "#core/types/identifiers.js";
import type { TokenCount } from "#core/types/units.js";

export interface CachedCompilation {
  readonly key: string;
  readonly compiledPrompt: string;
  readonly tokenCount: TokenCount;
  readonly createdAt: ISOTimestamp;
  readonly expiresAt: ISOTimestamp;
  readonly fileTreeHash: string;
  readonly configHash: string;
}

export interface CacheStore {
  get(key: string): CachedCompilation | null;
  set(entry: CachedCompilation): void;
  invalidate(key: string): void;
  invalidateAll(): void;
}
```

```typescript
// telemetry-store.interface.ts
import type { UUIDv7, ISOTimestamp, RepoId } from "#core/types/identifiers.js";
import type { TokenCount, Milliseconds } from "#core/types/units.js";
import type { TaskClass, InclusionTier } from "#core/types/enums.js";

export interface TelemetryEvent {
  readonly id: UUIDv7;
  readonly timestamp: ISOTimestamp;
  readonly repoId: RepoId;
  readonly taskClass: TaskClass;
  readonly tokensRaw: TokenCount;
  readonly tokensCompiled: TokenCount;
  readonly filesSelected: number;
  readonly filesTotal: number;
  readonly summarisationTiers: Readonly<Record<InclusionTier, number>>;
  readonly guardBlockedCount: number;
  readonly guardFindingsCount: number;
  readonly cacheHit: boolean;
  readonly durationMs: Milliseconds;
  readonly model: string | null;
}

export interface TelemetryStore {
  write(event: TelemetryEvent): void;
}
```

```typescript
// config-store.interface.ts
export interface ConfigStore {
  getLatestHash(): string | null;
  writeSnapshot(configHash: string, configJson: string): void;
}
```

```typescript
// guard-store.interface.ts
import type { UUIDv7 } from "#core/types/identifiers.js";
import type { GuardFinding } from "#core/types/guard-types.js";

export interface GuardStore {
  write(compilationId: UUIDv7, findings: readonly GuardFinding[]): void;
  queryByCompilation(compilationId: UUIDv7): readonly GuardFinding[];
}
```

## Steps

### Step 1: Create domain type files

Create the 7 files in `shared/src/core/types/` using the exact signatures above. Each file uses `#core/` imports only.

**Verify:** `pnpm typecheck` passes.

### Step 2: Update types barrel export

Add all new domain types to `shared/src/core/types/index.ts`.

**Verify:** `pnpm typecheck` passes.

### Step 3: Create pipeline port interfaces

Create 10 pipeline interface files in `shared/src/core/interfaces/`:
`intent-classifier`, `rule-pack-resolver`, `budget-allocator`, `context-selector`, `context-guard`, `guard-scanner`, `content-transformer`, `content-transformer-pipeline`, `summarisation-ladder`, `prompt-assembler`.

**Verify:** `pnpm typecheck` passes.

### Step 4: Create store port interfaces

Create 4 store interface files:
`cache-store`, `telemetry-store`, `config-store`, `guard-store`.

**Verify:** `pnpm typecheck` passes.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass, zero warnings.

## Tests

No new test files — these are pure type/interface definitions. Typecheck is the test.

| Test case        | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `pnpm typecheck` | All interfaces compile; imports resolve correctly    |
| `pnpm lint`      | No layer violations, ISP enforced, no banned imports |
| `pnpm test`      | Existing 14 tests still pass (no regressions)        |

## Acceptance Criteria

- [ ] All 7 domain type files created per Files table
- [ ] All 14 port interface files created per Files table
- [ ] `shared/src/core/types/index.ts` exports all new types
- [ ] Every interface matches the signature in this task exactly
- [ ] All properties are `readonly`; all arrays are `readonly T[]`
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all 14 existing tests pass
- [ ] No imports violating layer boundaries
- [ ] Single-line comments only, explain why not what
- [ ] Clock (port) row in mvp-progress.md updated to Done

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section to this file with:
   - What you tried
   - What went wrong
   - What decision you need from the user
3. Report to the user and wait for guidance
