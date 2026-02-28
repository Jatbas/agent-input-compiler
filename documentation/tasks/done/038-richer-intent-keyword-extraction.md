# Task 038: Richer intent keyword extraction

> **Status:** In Progress
> **Phase:** Phase J — Intent & Selection Quality (from mvp-progress.md)
> **Layer:** pipeline
> **Depends on:** Phase I Live Wiring (Done)

## Goal

Expand the built-in keyword dictionary in IntentClassifier so more developer intents classify to the correct task class (richer keyword extraction). Same algorithm; no interface or type changes.

## Architecture Notes

- ADR: Core pipeline step; no new interface (OCP — extend data in place).
- Layer: shared/src/pipeline/ only; no adapters, no storage, no Node APIs.
- Design: Expand KEYWORDS map in intent-classifier.ts with the exact additional trigger words below; ORDERED_CLASSES and classify() logic unchanged.

## Files

| Action | Path                                                                                   |
| ------ | -------------------------------------------------------------------------------------- |
| Modify | `shared/src/pipeline/intent-classifier.ts` (expand KEYWORDS)                           |
| Modify | `shared/src/pipeline/__tests__/intent-classifier.test.ts` (add tests for new keywords) |

## Interface / Signature

```typescript
import type { TaskClassification } from "#core/types/task-classification.js";

export interface IntentClassifier {
  classify(intent: string): TaskClassification;
}
```

```typescript
export class IntentClassifier implements IIntentClassifier {
  classify(intent: string): TaskClassification;
}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
import type { TaskClass } from "#core/types/enums.js";
import type { Confidence } from "#core/types/scores.js";

export interface TaskClassification {
  readonly taskClass: TaskClass;
  readonly confidence: Confidence;
  readonly matchedKeywords: readonly string[];
}
```

### Tier 2 — path-only

| Type                      | Path                              | Factory           |
| ------------------------- | --------------------------------- | ----------------- |
| `TaskClass`, `TASK_CLASS` | `shared/src/core/types/enums.ts`  | `TASK_CLASS.*`    |
| `Confidence`              | `shared/src/core/types/scores.ts` | `toConfidence(n)` |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Expand KEYWORDS in intent-classifier.ts

In `shared/src/pipeline/intent-classifier.ts`, add the following keywords to the existing KEYWORDS map. Append each new keyword to the existing array for that task class. Do not remove any existing keywords. Do not change ORDERED_CLASSES or the classify() method.

Add to REFACTOR: migrate, extract, inline, rename, dedupe, consolidate, split, merge

Add to BUGFIX: debug, trace, wrong, fail, exception, patch, resolve

Add to FEATURE: extend, support, enable, wire, integrate

Add to DOCS: changelog, docstring, api doc

Add to TEST: stub, unittest, integration test, e2e, fixture

**Verify:** Run `pnpm typecheck` from repo root; passes with zero errors.

### Step 2: Add tests for new keywords

In `shared/src/pipeline/__tests__/intent-classifier.test.ts`, add the following test cases. Keep all existing tests unchanged and passing.

- **richer_keywords_refactor:** Assert classifier.classify("migrate the module").taskClass is TASK_CLASS.REFACTOR; assert classifier.classify("extract helper").taskClass is TASK_CLASS.REFACTOR.
- **richer_keywords_bugfix:** Assert classifier.classify("debug the crash").taskClass is TASK_CLASS.BUGFIX; assert classifier.classify("resolve the exception").taskClass is TASK_CLASS.BUGFIX.
- **richer_keywords_feature:** Assert classifier.classify("extend the API").taskClass is TASK_CLASS.FEATURE; assert classifier.classify("enable feature flag").taskClass is TASK_CLASS.FEATURE.
- **richer_keywords_docs:** Assert classifier.classify("update changelog").taskClass is TASK_CLASS.DOCS; assert classifier.classify("add docstring").taskClass is TASK_CLASS.DOCS.
- **richer_keywords_test:** Assert classifier.classify("add stub for service").taskClass is TASK_CLASS.TEST; assert classifier.classify("e2e test").taskClass is TASK_CLASS.TEST.

**Verify:** Run `pnpm test -- shared/src/pipeline/__tests__/intent-classifier.test.ts`; all tests pass including the five new cases and all nine existing cases.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                                               | Description                                          |
| ----------------------------------------------------------------------- | ---------------------------------------------------- |
| returns refactor for refactor keyword set                               | Existing: refactor, restructure, clean up → REFACTOR |
| returns bugfix for bugfix keyword set                                   | Existing: fix, repair → BUGFIX                       |
| returns feature for feature keyword set                                 | Existing: add, implement → FEATURE                   |
| returns docs for docs keyword set                                       | Existing: document, readme → DOCS                    |
| returns test for test keyword set                                       | Existing: unit test, coverage → TEST                 |
| returns general with confidence 0 when no keywords match                | Existing: general fallback                           |
| tie-breaks to alphabetical first when multiple classes match same count | Existing: fix add → BUGFIX                           |
| returns highest-count class when multi-keyword intent matches several   | Existing: multi-keyword                              |
| is case insensitive                                                     | Existing: REFACTOR, Fix the Bug                      |
| richer_keywords_refactor                                                | migrate, extract → REFACTOR                          |
| richer_keywords_bugfix                                                  | debug, resolve exception → BUGFIX                    |
| richer_keywords_feature                                                 | extend, enable feature flag → FEATURE                |
| richer_keywords_docs                                                    | changelog, docstring → DOCS                          |
| richer_keywords_test                                                    | stub, e2e test → TEST                                |

## Acceptance Criteria

- [ ] KEYWORDS in intent-classifier.ts include all existing keywords plus the listed additions per task class
- [ ] All 14 test cases pass (9 existing + 5 new)
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No interface or type changes; classify() behavior unchanged except for expanded match set
- [ ] No `let` in production code; single-line comments only

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
