# Recipe: General-purpose (structured fallback)

Full detail: `../SKILL-recipes.md` lines 520–834.

## Quick Card

- **When to use:** Last resort. Only when no specialized recipe fits. Run the Closest-Recipe Analysis first.
- **Mandatory before writing anything:**
  1. **Closest-recipe analysis** recorded in the Exploration Report:
     ```
     RECIPE: general-purpose
     CLOSEST RECIPE: <adapter | storage | pipeline | composition-root | benchmark | release-pipeline>
     WHY NOT: <specific reason, not "it's different">
     ```
  2. **Component characterization** (5 dimensions), each with evidence from a tool call (not memory):
     - Primary concern (pure domain logic / bootstrap / integration / configuration / type-only / refactoring / test infrastructure)
     - Layer placement (core / pipeline / bootstrap / mcp / test / cross-layer)
     - Interface relationship (implements existing / defines new / standalone function / no new code)
     - Dependency profile (none / interface-only / external library / database / mixed)
     - State model (stateless / immutable config / mutable with justification)
  3. **Self-correction protocol (4 steps):** Recipe re-check, Evidence audit, Simplicity check, Graduated uncertainty resolution.

## Files pattern (derived, not fixed)

| Condition                | Minimum files                                      |
| ------------------------ | -------------------------------------------------- |
| Single class or function | 2: `source.ts` + `source.test.ts`                  |
| New interface needed     | 3: `interface.ts` + `source.ts` + `source.test.ts` |
| New branded type(s)      | 1 per type in `core/types/`                        |
| Modifies existing files  | 1 Modify row per affected file                     |
| Type-only / refactoring  | 0 Create rows, N Modify rows                       |

**Simplicity constraint — HARD:** More than 3 Create rows for a single-concern component requires justification.

## Function-vs-class decision

Stateless + single public method → prefer function. Class is justified only when:

- the component has constructor-injected dependencies, OR
- multiple related methods share state, OR
- the component implements an existing interface that requires a class shape.

Record the decision in Architecture Notes.

## Existing-home check — HARD

Before creating new files, answer:

- Could this be a method on an existing class? If YES, propose that instead.
- Could this live in an existing file? If YES, propose that instead.

## Enhanced user gate

The A.5 summary for general-purpose tasks must present the full characterization and closest-recipe analysis for explicit user confirmation before Pass 2 proceeds.

## Explicit reasoning prompts (forcing function)

At each stage, write one sentence explaining the reasoning:

- "I chose general-purpose over <closest> because <reason>."
- "Evidence: <tool call result>. This means <dimension value> because <reason>."
- "Re-check passed. No specialized recipe fits because <reason>."
- "New files needed because <reason>."
- "Chose <function | class> because <reason>."

Record these in the Exploration Report.

## Mechanical checks

A, B, C, D, E, F, G, H, I, J, M, S always apply. K/L/N/O/P/T conditional on characterization (library / bootstrap / refactoring / database triggers).
