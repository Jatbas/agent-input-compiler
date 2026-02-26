# Task Planner — Guardrails

Reference file for the task-planner skill. Read this before writing the task file (Phase C) and apply every guardrail. The Phase D review subagent enforces these automatically, but applying them during writing avoids rework.

---

## Size cap

If the Files table exceeds ~10 new files, **split into multiple tasks**. Each task should be completable in one focused session (~30 min of agent work). When the user asks for "everything" in a phase, produce a sequence of tasks (002, 003, 004...) rather than one mega-task.

## No prose signatures

Every class and function in the Files table **must** have an exact TypeScript code block in the Interface/Signature section showing the class declaration, constructor, and method signatures. Never describe a constructor or method in prose (e.g. "Constructor: `(config: BudgetConfig)`"). If you can't write the exact code, you don't understand the component well enough — go back to Phase A (Explore).

## Test parity

Every implementation file with non-trivial logic **must** have a corresponding `.test.ts` in the Files table. If the MVP test plan (`documentation/mvp-specification-phase0.md` §8a) specifies test cases for a step, those test cases must appear in the task's Tests table. A step that only verifies with `pnpm typecheck` (no test) is only acceptable for pure type/interface definitions.

## No ambiguity

Every file in the Files table is **mandatory**. Never mark a file as "optional" or say "may be added in this task or a follow-up." If you're unsure whether to include something, ask the user. The executor must never have to decide scope.

This extends to **all instructions**, not just the Files table:

- **No hedging language.** Ban: "if needed", "or optionally", "may be added", "if type is extended", "you may use X or Y", "or document behaviour". Every instruction must be a single definitive action.
- **No design decisions for the executor.** If a step says "decide whether to replace or append" or "inject X if you need it", the planner hasn't finished designing. Go back to Phase B, resolve the question (or ask the user), and write one clear instruction.
- **No "if not present" for known state.** After the exploration checklist, you know whether a dependency exists and at what version. Write "already at 1.0.21" or "add at 1.0.21" — never "add if not present."

## Single definition

Never show alternative interfaces or "Option A / Option B" in the Interface/Signature section. The task file must contain exactly **one** interface definition and exactly **one** class signature. If you're unsure which design is better, ask the user before writing the task file. Showing multiple options means the planner hasn't made a decision.

## Signature consistency

The interface and the implementing class must use **identical** parameter types and return types. After writing both code blocks, cross-check:

- Every parameter name and type matches (including `readonly` modifiers).
- Return types match exactly (e.g. `readonly RelativePath[]` in interface must also be `readonly RelativePath[]` in class, not `RelativePath[]`).
- If the interface method has parameters, the class method must list the same parameters — even if the implementation ignores them.

## Branded type check

Every parameter that represents a domain value must use the correct branded type. Before writing signatures, check `core/types/` for:

- Paths → `AbsolutePath`, `RelativePath`, `FilePath` (never raw `string`)
- Tokens → `TokenCount` (never raw `number`)
- Timestamps → `ISOTimestamp` (never raw `string`)
- IDs → `UUIDv7`, `SessionId`, `RepoId` (never raw `string`)
- Scores → `Percentage`, `Confidence`, `RelevanceScore` (never raw `number`)

If the existing core interface uses `string` for a parameter that should be branded, note this as a potential issue and ask the user — do not silently propagate the mismatch.

## Step size limit

No single step should implement more than **2 methods** or modify more than **1 file**. If a class has 4 methods, split implementation across 2+ steps (e.g. "Step 2: Implement parseImports", "Step 3: Implement extractSignaturesWithDocs and extractSignaturesOnly", "Step 4: Implement extractNames"). Large steps cause agents to rush and miss edge cases.

## One file per step (no exceptions)

The step size limit says "max 1 file per step." This is absolute for all recipes including composition roots. If Step 1 needs to modify both `shared/package.json` and `mcp/package.json`, split into Step 1a and Step 1b. If a test step needs to export a function from the source file AND create the test file, split into two steps. No step touches two files. This prevents step-overlap ambiguity.

## Test table ↔ step instructions

Every test case listed in the Tests table must appear in the test step's instructions. After writing both sections, cross-check: scan each Tests table row and confirm the corresponding step mentions it by name or describes the exact assertion. If a test case exists in the table but no step tells the executor to write it, the executor will skip it. Conversely, if a step mentions a test not in the table, add it to the table.

## Sync vs async for adapters

When a task wraps an external library, the step that implements the adapter must state whether to use the library's **sync** or **async** API. The interface return type determines this: if the interface returns `T`, the adapter must use the sync API; if `Promise<T>`, the async API. Never leave this implicit.

## Dispatch pattern

If any method in the task dispatches on an enum value or type discriminator with 3+ branches, the Architecture Notes must specify the dispatch pattern. The step instructions must show the dispatch map structure. If/else-if chains with 3+ branches are banned by ESLint. Two patterns are available:

- **`Record<Enum, Handler>`** — for exhaustive enum dispatch (compile-time safety that all variants are covered).
- **Handler array** (`readonly { matches: predicate; extract: handler }[]`) — for predicate-based dispatch (e.g. AST node types) where you cannot index by a single key.

The planner must choose one and write it into the task. The executor must not decide.

## Never guess library APIs

Every external library class name, import path, constructor signature, and method call in the task file must be verified against installed `.d.ts` files or official documentation. Never write a library API from memory. If you cannot read the `.d.ts` files (package not installed, no type definitions available), this is a **blocker** — stop and tell the user.

Common failure: writing `Server` when the actual class is `McpServer`, or writing `import from "@pkg"` when the actual subpath is `import from "@pkg/server/mcp.js"`. These errors produce tasks that look correct but fail during execution.

## Recipe fit required

Every task must match one of the defined recipes: adapter, storage, pipeline, or composition root. If a component does not fit any recipe, do not improvise a task structure. Stop and tell the user. The recipes exist because each component type has different template requirements, test strategies, and verification dimensions. A task written without a recipe will violate template requirements it doesn't know about.

## Module resolution verification

If a task proposes changes to `package.json` `exports`, `imports`, or `tsconfig.json` paths, the planner must verify that TypeScript can resolve types through the proposed configuration. Read the relevant `tsconfig.json` and record the `moduleResolution` setting. Unverified module resolution changes can silently break `pnpm typecheck` across the entire monorepo.

## Composition root: no "None" for Dependent Types

Composition roots by definition wire interfaces to implementations. They always use domain types (`ExecutableDb`, `Clock`, `AbsolutePath`, etc.). Writing "Dependent Types: None" for a composition root is almost certainly wrong. If you wrote "None", re-check the WIRING SPECIFICATION — every constructor parameter type and every function parameter type is a dependent type that the executor needs to see.

## Verify instructions must be actionable

For each step's Verify line, confirm the verification is actionable against the current codebase state at that step. If verification says "file X that imports Y fails lint" but file X doesn't exist yet, rewrite to: "Run `pnpm lint` — passes with zero errors." If `pnpm typecheck` is listed as verification but the step introduces symbols defined in a later step, the verification will fail — reorder steps or change the verify instruction.

## Final " or " sweep

Before finishing the task file, scan every sentence — Steps, Tests table descriptions, Architecture Notes, parenthetical qualifiers, implementation notes below code blocks. For each sentence containing " or ", ask: does the executor have to choose between two actions? If yes, resolve it now. Common traps:

- Test descriptions: "same order or stable sort" → pick one: "identical output order across calls"
- Parenthetical qualifiers: "(sync or async)" → the decision was made in Phase B, write only the chosen one
- Implementation notes: "use X or Y API" → write the exact function name
