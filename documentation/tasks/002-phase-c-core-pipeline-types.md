# Task 002: Phase C — Core Pipeline Types & Interfaces

> **Status:** Pending
> **Phase:** C (Pipeline Steps 1–8)
> **Layer:** core
> **Depends on:** Phase A (all Done), Phase B (all Done)

## Goal

Add the remaining core domain types and port interfaces that the pipeline step implementations (Tasks 003–005) depend on: `ImportRef`, `CodeChunk`, `ExportedSymbol`, `LanguageProvider`, `RulePackProvider`, `BudgetConfig`, `FileContentReader`.

## Architecture Notes

- ADR-010: Branded types from `#core/types/`
- Core layer may only import from `#core/` (enforced by ESLint)
- One interface per `*.interface.ts` file; all properties `readonly`; all arrays `readonly T[]`
- No implementation logic — only type definitions and interface contracts

## Files

| Action | Path                                                                           |
| ------ | ------------------------------------------------------------------------------ |
| Create | `shared/src/core/types/import-ref.ts`                                          |
| Create | `shared/src/core/types/code-chunk.ts`                                          |
| Create | `shared/src/core/types/exported-symbol.ts`                                     |
| Create | `shared/src/core/interfaces/language-provider.interface.ts`                    |
| Create | `shared/src/core/interfaces/rule-pack-provider.interface.ts`                   |
| Create | `shared/src/core/interfaces/budget-config.interface.ts`                        |
| Create | `shared/src/core/interfaces/file-content-reader.interface.ts`                  |
| Modify | `shared/src/core/types/index.ts` (export ImportRef, CodeChunk, ExportedSymbol) |

## Interface / Signature

```typescript
// shared/src/core/types/import-ref.ts
export interface ImportRef {
  readonly source: string;
  readonly symbols: readonly string[];
  readonly isRelative: boolean;
}
```

```typescript
// shared/src/core/types/code-chunk.ts
import type { RelativePath } from "#core/types/paths.js";
import type { TokenCount, LineNumber } from "#core/types/units.js";
import type { SymbolType } from "#core/types/enums.js";

export interface CodeChunk {
  readonly filePath: RelativePath;
  readonly symbolName: string;
  readonly symbolType: SymbolType;
  readonly startLine: LineNumber;
  readonly endLine: LineNumber;
  readonly content: string;
  readonly tokenCount: TokenCount;
}
```

```typescript
// shared/src/core/types/exported-symbol.ts
import type { SymbolKind } from "#core/types/enums.js";

export interface ExportedSymbol {
  readonly name: string;
  readonly kind: SymbolKind;
}
```

```typescript
// shared/src/core/interfaces/language-provider.interface.ts
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { ImportRef } from "#core/types/import-ref.js";
import type { CodeChunk } from "#core/types/code-chunk.js";
import type { ExportedSymbol } from "#core/types/exported-symbol.js";

export interface LanguageProvider {
  readonly id: string;
  readonly extensions: readonly FileExtension[];
  parseImports(fileContent: string, filePath: RelativePath): readonly ImportRef[];
  extractSignaturesWithDocs(fileContent: string): readonly CodeChunk[];
  extractSignaturesOnly(fileContent: string): readonly CodeChunk[];
  extractNames(fileContent: string): readonly ExportedSymbol[];
}
```

```typescript
// shared/src/core/interfaces/rule-pack-provider.interface.ts
import type { RulePack } from "#core/types/rule-pack.js";
import type { AbsolutePath } from "#core/types/paths.js";
import type { TaskClass } from "#core/types/enums.js";

export interface RulePackProvider {
  getBuiltInPack(name: string): RulePack;
  getProjectPack(projectRoot: AbsolutePath, taskClass: TaskClass): RulePack | null;
}
```

```typescript
// shared/src/core/interfaces/budget-config.interface.ts
import type { TokenCount } from "#core/types/units.js";
import type { TaskClass } from "#core/types/enums.js";

export interface BudgetConfig {
  getMaxTokens(): TokenCount;
  getBudgetForTaskClass(taskClass: TaskClass): TokenCount | null;
}
```

```typescript
// shared/src/core/interfaces/file-content-reader.interface.ts
import type { RelativePath } from "#core/types/paths.js";

export interface FileContentReader {
  getContent(path: RelativePath): string;
}
```

## Steps

### Step 1: Create domain type files

Create `import-ref.ts`, `code-chunk.ts`, `exported-symbol.ts` in `shared/src/core/types/` using exact signatures above.

**Verify:** `pnpm typecheck` passes.

### Step 2: Update types barrel

Add exports for `ImportRef`, `CodeChunk`, and `ExportedSymbol` to `shared/src/core/types/index.ts`.

**Verify:** `pnpm typecheck` passes.

### Step 3: Create port interfaces

Create `language-provider.interface.ts`, `rule-pack-provider.interface.ts`, `budget-config.interface.ts`, `file-content-reader.interface.ts` in `shared/src/core/interfaces/` using exact signatures above.

**Verify:** `pnpm typecheck` passes.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass, zero warnings.

## Tests

No new test files — these are pure type/interface definitions. Typecheck is the test.

| Test case        | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `pnpm typecheck` | All interfaces compile; imports resolve correctly    |
| `pnpm lint`      | No layer violations, ISP enforced, no banned imports |
| `pnpm test`      | Existing tests still pass (no regressions)           |

## Acceptance Criteria

- [ ] All 3 type files and 4 interface files created per Files table
- [ ] `shared/src/core/types/index.ts` exports all new types
- [ ] Every interface matches the signature in this task exactly
- [ ] All properties `readonly`; all arrays `readonly T[]`
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all existing tests pass
- [ ] No imports violating layer boundaries

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section to this file with:
   - What you tried
   - What went wrong
   - What decision you need from the user
3. Report to the user and wait for guidance
