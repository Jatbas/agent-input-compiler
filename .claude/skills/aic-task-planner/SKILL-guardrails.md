# Task Planner — Guardrails

Reference file for the task-planner skill. Read this before writing the task file (Pass 2) and apply every guardrail. The mechanical review (C.5) enforces these automatically, but applying them during writing avoids rework.

---

## Size cap

If the Files table exceeds ~10 new files, **split into multiple tasks**. Each task should be completable in one focused session (~30 min of agent work). When the user asks for "everything" in a phase, produce a sequence of tasks (002, 003, 004...) rather than one mega-task.

## Simplicity

Every new artifact (file, type, interface) in the plan must be justified against what already exists. The planner's natural bias is toward comprehensiveness; this guardrail counteracts it.

**Red flags of over-engineering:**

- The plan creates 3+ new files for a single-concern component (beyond source + test)
- The plan introduces a new interface when an existing interface in the same layer could gain a method
- The plan creates a branded type used in exactly one place
- The plan creates a transformation/mapping function between two types with the same shape
- The plan creates a utility function called exactly once

**Enforced by:** A.4b simplicity sweep (during planning) and mechanical check M (after writing).

## No prose signatures

Every class and function in the Files table **must** have an exact TypeScript code block in the Interface/Signature section showing the class declaration, constructor, and method signatures. Never describe a constructor or method in prose (e.g. "Constructor: `(config: BudgetConfig)`"). If you can't write the exact code, you don't understand the component well enough — go back to Pass 1 (Explore).

## Test parity

Every implementation file with non-trivial logic **must** have a corresponding `.test.ts` in the Files table. If the MVP test plan (`documentation/implementation-spec.md` §8a) specifies test cases for a step, those test cases must appear in the task's Tests table. A step that only verifies with `pnpm typecheck` (no test) is only acceptable for pure type/interface definitions.

## No ambiguity

Every file in the Files table is **mandatory** — never "optional" / "may be added". The rule: **the executor follows instructions, never makes choices.** If any sentence requires the executor to decide between alternatives, pick an approach, or interpret vague guidance — the planner hasn't finished designing.

Banned patterns are mechanically enforced by `ambiguity-scan.sh` (ground truth). The full phrase lists live there; this section lists the **fix per category** so you can rewrite faster when a gate fires. The only safe zone for non-imperative wording is Architecture Notes explaining rationale.

| Category                        | What it looks like (examples)                                                                   | Fix                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **1. Hedging**                  | `if needed`, `may`, `might`, `could`, `probably`, `should work`, `try to`, `ideally`            | Decide yes or no; write the definitive instruction or remove the sentence.                  |
| **2. Examples-as-instructions** | `e.g.`, `for example`, `such as`, `something like`, `similar to`, `or similar`, `or equivalent` | Replace the example with the literal instruction: `(e.g. process.cwd())` → `process.cwd()`. |
| **3. Delegation of choice**     | `decide whether`, `choose between`, `alternatively`, `up to you`, `optionally`                  | Go back to Pass 1 (A.4 decisions), decide, write one instruction.                           |
| **4. Vague qualifiers**         | `appropriate`, `suitable`, `reasonable`, `etc.`, `some`, `various`, `and so on`                 | Replace with the specific value, name, count, or list.                                      |
| **5. Conditional state hedges** | `if not present`, `if not already`, `add if not present`, `if missing`                          | State the known fact: "file exists at v1.0.21" or "create at v1.0.21".                      |
| **6. Escape clauses**           | `or skip`, `if possible`, `in a later task`, `if feasible`, `mock or skip`                      | In scope → write the instruction; out of scope → don't mention it.                          |
| **7. False alternatives**       | `X or Y`, `or use`, `either...or` (implementation alternatives)                                 | Pick one. If genuinely uncertain, ask the user in A.4.                                      |
| **8. Tool-conditional scope**   | `if knip reports`, `if lint shows`, `run [tool] and add`                                        | Run the tool in exploration (item 18); record output; write the exact scope.                |

**Idempotent operations (Category 5 nuance).** When describing `mkdir`, `CREATE TABLE IF NOT EXISTS`, or similar operations that are idempotent by design, do not restate the conditional in prose ("create directory if missing"). Specify the idempotent API call directly — `fs.mkdirSync(dir, { recursive: true, mode: 0o700 })` — the `recursive: true` flag makes the call idempotent without a prose hedge. For SQL, `IF NOT EXISTS` is a keyword inside the DDL code block, not prose.

## Single definition

Never show alternative interfaces or "Option A / Option B" in the Interface/Signature section. The task file must contain exactly **one** interface definition and exactly **one** class signature. If you're unsure which design is better, ask the user before writing the task file. Showing multiple options means the planner hasn't made a decision.

## Named imports in code blocks

All `import` statements in the Interface/Signature section must use **named imports** for internal modules (relative or `#alias` paths). Never write `import * as X from "./barrel.js"` — always `import { A, B } from "./barrel.js"` with `import type { C } from "./barrel.js"` for type-only imports. Namespace imports are allowed only for Node.js built-ins (`node:path`, `node:fs`) and established library APIs (`typescript`). This is enforced by ESLint's `no-restricted-syntax` rule.

When referencing a sibling's import pattern, check that the sibling uses named imports. If it uses a namespace import (`import * as P from ...`), that is a legacy violation — do not propagate it. Use the named import style instead.

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

## Function-restructure isolation

When a step restructures a function's body — replacing a bare cast with a validation block, converting an early-return to an accumulation pattern, adding conditional branching to previously unconditional logic, or extracting local variables — that restructuring must be **the only edit in the step**. It cannot be bundled with additive edits (property additions to object literals, new fields in interfaces, new lines in return statements) in the same step.

**Detection:** The step body describes more than one distinct operation AND at least one uses language like: "derive a local … from the parsed object", "add conditional branching", "replace `…` with a block that …", "extract …", "coerce … or fall back to …", "refactor … to …". When matched: split into (a) a restructure-only step and (b) a follow-on step for the additive changes.

**Enforced by:** AU (step complexity cap) and this guardrail's pattern detection. Historical failures: see `SKILL-drift-catalog.md §Function-restructure isolation`.

## One file per step (no exceptions)

The step size limit says "max 1 file per step." This is absolute for all recipes including composition roots. If Step 1 needs to modify both `shared/package.json` and `mcp/package.json`, split into Step 1a and Step 1b. If a test step needs to export a function from the source file AND create the test file, split into two steps. No step touches two files. This prevents step-overlap ambiguity.

## Test table ↔ step instructions

Every test case listed in the Tests table must appear in the test step's instructions. After writing both sections, cross-check: scan each Tests table row and confirm the corresponding step mentions it by name or describes the exact assertion. If a test case exists in the table but no step tells the executor to write it, the executor will skip it. Conversely, if a step mentions a test not in the table, add it to the table.

## Conditional dependency loading

If a component wraps a heavy or environment-specific resource (WASM grammar, external service client, large data structure) that is only relevant when specific project characteristics hold (certain file extensions exist, a config flag is enabled, a service is reachable), the task must design it for **conditional injection**, not eager creation.

**Red flags:**

- A bootstrap function calls `new HeavyProvider()` or `await Provider.create()` unconditionally
- A composition root creates every language provider regardless of whether the project uses that language
- Async initialization (`await`) propagates into bootstrap functions that should be sync, just to eagerly load a resource that may not be needed

**Required pattern:**

- The bootstrap function accepts conditional dependencies as an **injected parameter** (e.g. `additionalProviders?: readonly LanguageProvider[]`)
- The composition root's **`main()`** decides at runtime whether to create each dependency, based on observable project state
- Bootstrap functions stay **sync** — only `main()` (which is already async) handles async resource initialization

**Enforced by:** A.4 design decisions and the composition root recipe in `SKILL-recipes.md`. Historical failures: see `SKILL-drift-catalog.md §Conditional dependency loading`.

## Composition root modification snippet

When a task modifies an existing function in a composition root (e.g. `initLanguageProviders()`, `createMcpServer()`), the step must include a **concrete code block** showing the function's expected state after the change — not just prose saying "extend the function." If the function needs structural changes (single-case → multi-case, sync → async, early-return → accumulation), the first task to make that change shows the full before/after body; subsequent tasks adding incremental entries show only the new lines plus the updated return statement. Code blocks must respect project conventions (immutability: ternary-spread, no `.push()`).

Historical failures: see `SKILL-drift-catalog.md §Composition root modification snippet`.

## Behavioral change verification

When a task changes existing behavior — whether fixing a bug, refactoring code, modifying wiring, adding entries to a config, or altering the contents of a directory — the test strategy must include at least one assertion that verifies the intended change took effect. This is distinct from "existing tests still pass" (regression testing) — this asserts the new state is correct.

**Applies to ALL task types that modify behavior, not just fix tasks:**

- **Fix/patch:** Assert the broken state is gone (e.g., "installed hook file does not contain `../../shared/`").
- **Greenfield with wiring:** Assert the new component is wired correctly (e.g., "tool list includes the new handler").
- **Refactoring:** Assert the refactored code produces identical output (e.g., "shared utility returns same result as the inlined code it replaced").
- **Config changes:** Assert the new config is loaded correctly (e.g., "ESLint reports error when forbidden import is used in non-exempt file").

**Red flags:**

- The Tests table only lists unit tests for the new code but no test verifying the change's effect on the existing system
- The acceptance criteria say "existing tests pass" but no test actually verifies the intended behavioral change
- A fix task has no test that would fail if the fix were reverted

**Enforced by:** Mechanical checks U (acceptance criteria achievability) and V (existing test compatibility), plus the fix/patch recipe's mandatory fix-verification test case.

## Fixture-bound relational assertions

Any test assertion that uses `toBeGreaterThan(0)` (or `> 0`, `>= 1`, `toBeGreaterThanOrEqual(1)`) on a value derived from running the actual pipeline against a fixture directory must be backed by explicit evidence that the fixture produces a non-zero result. "The pipeline selects files" is not evidence — cite the fixture path and confirm it contains files that will survive the pipeline's inclusion rules.

**Required during exploration (FIXTURE SIMULATION field):** When a test strategy includes a relational lower-bound assertion on pipeline output (file count, pruned-file count, token count), the Exploration Report's FIXTURE SIMULATION section must list the fixture path and a concrete count of files it contains, or a sample of which files pass the context selector for that intent.

**Required in the task file:** The Tests table's Mock / assert contract column must cite the specific fixture path and why its content guarantees the lower bound. `no mocks; expect(first.meta.filesSelected).toBeGreaterThan(0)` without fixture evidence is insufficient. Write: `no mocks; fixture at <path> contains N files (confirmed in exploration); expect(first.meta.filesSelected).toBeGreaterThan(0)`.

**Fix:** During exploration, `ls` the fixture directory, count non-excluded files, record the count into the Tests table contract column. If the count is zero, the assertion will always fail — choose a different fixture or assertion.

**Enforced by:** FIXTURE SIMULATION field in exploration and AS check. Historical failures: see `SKILL-drift-catalog.md §Fixture-bound relational assertions`.

## Sync vs async for adapters

When a task wraps an external library, the step that implements the adapter must state whether to use the library's **sync** or **async** API. The interface return type determines this: if the interface returns `T`, the adapter must use the sync API; if `Promise<T>`, the async API. Never leave this implicit.

## Dispatch pattern

If any method in the task has 3+ branches — dispatching on an enum, a type discriminator, **or ordered predicate matching** (path prefix tiers, conditional scoring maps, node-type checks) — the Architecture Notes must specify the dispatch pattern and the step instructions must show the dispatch map as a code block. If/else-if chains with 3+ branches are banned by ESLint. Two patterns are available:

- **`Record<Enum, Handler>`** — for exhaustive enum dispatch (compile-time safety).
- **Handler array** (`readonly { matches: predicate; score/handler: value }[]`) — for predicate-based dispatch where ordering matters (most specific first).

The planner chooses one and writes it into the task. Detection heuristic and historical failures: see `SKILL-drift-catalog.md §Dispatch pattern`.

## Optional field access

When the implementation reads a field from a dependent type and that field is declared optional (`?:`), step instructions must specify optional chaining (`?.`) and a fallback. Never write `obj.optionalField.method()` — write `obj.optionalField?.method() ?? fallback`.

**Detection:** During exploration (A.1 item 9), the planner reads every dependent type and flags optional fields the implementation accesses into the OPTIONAL FIELD HAZARDS section. Pass 2 cross-checks every field access against this list.

**Enforced by:** A.1 item 9, Exploration Report OPTIONAL FIELD HAZARDS, C.5 check B. Historical failures: see `SKILL-drift-catalog.md §Optional field access`.

## Never guess library APIs or protocol behavior

Every external library class name, import path, constructor signature, and method call in the task file must be verified against installed `.d.ts` files or official documentation. Never write a library API from memory. If the `.d.ts` cannot be read (package not installed, no types available), this is a **blocker** — stop and tell the user.

**Protocol and transport behavior must also be verified.** When a task involves sending/receiving data over a transport (stdio, HTTP, WebSocket), do not assume the wire format. Read the transport's `.d.ts`/source to determine the exact framing. The task must either (a) specify the exact wire format with evidence, or (b) use the library's own client SDK to avoid framing concerns entirely.

Historical failures: see `SKILL-drift-catalog.md §Never guess library APIs or protocol behavior`.

## Recipe fit required

Every task must match one of the defined recipes: adapter, storage, pipeline transformer, composition root, benchmark, release-pipeline, or **general-purpose**. Never improvise a task structure outside of a recipe.

The six specialized recipes encode domain-specific knowledge (template requirements, test strategies, verification dimensions) that produces higher-quality plans. Always prefer a specialized recipe when one fits. The **general-purpose recipe** is the structured fallback — it compensates for the lack of domain-specific guidance by requiring a full component characterization, closest-recipe analysis, existing-home check, and enhanced user gate. See `SKILL-recipes.md` for the complete general-purpose recipe.

A task must never be written without following a recipe. If the general-purpose recipe's mandatory characterization reveals the component _does_ fit a specialized recipe after all, switch to that recipe immediately.

## Module resolution verification

If a task proposes changes to `package.json` `exports`, `imports`, or `tsconfig.json` paths, the planner must verify that TypeScript can resolve types through the proposed configuration. Read the relevant `tsconfig.json` and record the `moduleResolution` setting. Unverified module resolution changes can silently break `pnpm typecheck` across the entire monorepo.

## Dependent Types — tiered system

Composition roots by definition wire interfaces to implementations. They always use domain types (`ExecutableDb`, `Clock`, `AbsolutePath`, etc.). Writing "Dependent Types: None" for a composition root is almost certainly wrong. If you wrote "None", re-check the WIRING SPECIFICATION — every constructor parameter type and every function parameter type is a dependent type that the executor needs to see.

All dependent types in a task file must be classified into one of three tiers. The tier determines how much detail appears in the task file:

**Tier 0 — verbatim (full code block):** For interfaces the component directly implements, calls methods on, or whose fields it must match in a constructor call. The executor needs the full definition to verify type correctness. Paste the complete interface with all method signatures, parameter types, and imports. Abbreviated summaries like "(interface with X, Y, Z)" are equally wrong — paste the actual TypeScript.

**Tier 1 — signature + path:** For interfaces passed through to other constructors but never directly consumed by the component being built. The composition root wires these into constructors but does not call their methods. Show: type name, file path, member count (methods + readonly properties), and one-line purpose. In the Purpose column, list members using the format: `methodA, methodB + props: propC, propD` to distinguish methods from readonly properties. The executor reads the file on demand only if the constructor call fails to typecheck.

**Tier 2 — path-only:** For branded types and simple aliases that are well-known from repeated use across tasks. Show: type name, file path, and factory function name. These types are single-line definitions — reading the file is trivial if needed.

### Tier assignment rules

- If the component **calls a method** on an instance of the type → Tier 0
- If the component **constructs an object matching the type's shape** (inline object literal) → Tier 0
- If the component **passes the type to a constructor** without calling methods on it → Tier 1
- If the component **collects instances into an array** and passes the array → Tier 1
- If the type is a **branded primitive** (`AbsolutePath`, `TokenCount`, `ISOTimestamp`, etc.) → Tier 2
- If the type is an **`as const` enum object** (`TaskClass`, `LanguageId`, etc.) → Tier 2
- When in doubt, use the **higher** tier (Tier 0 > Tier 1 > Tier 2) — more detail is always safe

### Format in the task file

Tier 0 types appear as full code blocks (same as before):

```
### Tier 0 — verbatim

\`\`\`typescript
// Source: shared/src/core/interfaces/executable-db.interface.ts
import type { ... } from '...';
export interface ExecutableDb {
  execute(sql: string, params?: readonly unknown[]): unknown[];
  // ... all methods ...
}
\`\`\`
```

Tier 1 types appear as a compact reference:

```
### Tier 1 — signature + path

| Type | Path | Members | Purpose |
|------|------|---------|---------|
| `LanguageProvider` | `shared/src/core/interfaces/language-provider.interface.ts` | 6 | parseImports, extractSignaturesWithDocs, extractSignaturesOnly, extractNames + props: id, extensions |
| `ContentTransformer` | `shared/src/core/interfaces/content-transformer.interface.ts` | 3 | transform + props: id, fileExtensions |
```

Tier 2 types appear as path-only references:

```
### Tier 2 — path-only

| Type | Path | Factory |
|------|------|---------|
| `AbsolutePath` | `shared/src/core/types/absolute-path.ts` | `toAbsolutePath(raw)` |
| `TokenCount` | `shared/src/core/types/token-count.ts` | `toTokenCount(n)` |
```

### Non-composition-root tasks

For adapter, storage, and pipeline tasks, the existing rule applies: paste all domain types verbatim (effectively everything is Tier 0). The tiered system only reduces verbosity for composition root tasks, where the majority of types are pass-through (Tier 1) or branded primitives (Tier 2).

## Verify instructions must be actionable

For each step's Verify line, confirm the verification is actionable against the current codebase state at that step. If verification says "file X that imports Y fails lint" but file X doesn't exist yet, rewrite to: "Run `pnpm lint` — passes with zero errors." If `pnpm typecheck` is listed as verification but the step introduces symbols defined in a later step, the verification will fail — reorder steps or change the verify instruction.

**Node smoke command correctness:** `node -e "fn() === 'value'"` always exits 0 (comparison result discarded); `node -e "console.log(...)"` prints `false` but still exits 0. Neither is a guard. Use `assert.strictEqual` — see `SKILL-drift-catalog.md §Node smoke command correctness` for the exact invocation.

## Plan failure patterns

These are plan failures — if any appear in a step instruction, Files table description, verify line, or test description, the plan is incomplete. The planner must resolve these before writing:

- "TBD", "TODO", "implement later", "in a future task"
- "add appropriate handling", "add appropriate tests", "appropriate" without qualifier
- "similar to Task N", "see Task N" — repeat the code, the executor may not have Task N
- "write tests for the above" without listing specific test case names
- "update as needed", "fix if broken" — state the specific update
- "handle edge cases" without listing each edge case
- "refactor if necessary" — decide now

**Enforced by:** Final ambiguity sweep (below) and C.5 mechanical review.

## Hook file naming convention

When a task creates or renames hook files under `integrations/`, the planner must enforce the AIC prefix convention. The convention makes every AIC-owned file instantly recognizable by prefix in the editor's hook directory.

| Location                     | Naming rule                         | Source example            | Deployed example                          |
| ---------------------------- | ----------------------------------- | ------------------------- | ----------------------------------------- |
| `integrations/cursor/hooks/` | `AIC-<name>.cjs` (uppercase prefix) | `AIC-compile-context.cjs` | `.cursor/hooks/AIC-compile-context.cjs`   |
| `integrations/claude/hooks/` | `aic-<name>.cjs` (lowercase prefix) | `aic-prompt-compile.cjs`  | `~/.claude/hooks/aic-prompt-compile.cjs`  |
| `integrations/shared/`       | No prefix (plain source names)      | `conversation-id.cjs`     | — (never deployed directly)               |
| Shared → Cursor deploy       | `sharedDeployedName()` adds `AIC-`  | `conversation-id.cjs`     | `.cursor/hooks/AIC-conversation-id.cjs`   |
| Shared → Claude deploy       | `sharedDeployedName()` adds `aic-`  | `conversation-id.cjs`     | `~/.claude/hooks/aic-conversation-id.cjs` |

**Rules:**

- Cursor-specific hooks at source must start with `AIC-`. A file like `integrations/cursor/hooks/my-hook.cjs` is a violation — it must be `AIC-my-hook.cjs`.
- Claude-specific hooks at source must start with `aic-`. A file like `integrations/claude/hooks/my-hook.cjs` is a violation — it must be `aic-my-hook.cjs`.
- Shared modules in `integrations/shared/` keep their plain names. The install scripts (`integrations/cursor/install.cjs` and `integrations/claude/install.cjs`) apply the correct prefix when copying to the hook directory via `sharedDeployedName()`.
- The Cursor hook manifest (`integrations/cursor/aic-hook-scripts.json`) must list the `AIC-` prefixed source names.
- Require paths inside hook files must reference the deployed (prefixed) name: `require("./AIC-conversation-id.cjs")` in Cursor hooks, `require("./aic-conversation-id.cjs")` in Claude hooks.
- When a task adds a new shared module, the Files table must include updates to both install scripts and their stale-cleanup sets if the new file affects the deployed name set.

**Red flags:**

- A new Cursor hook file without the `AIC-` prefix
- A new Claude hook file without the `aic-` prefix
- A require path referencing a shared file by its source name instead of its deployed name (e.g. `require("./conversation-id.cjs")` instead of `require("./AIC-conversation-id.cjs")`)
- A task creating a hook file that does not update the corresponding manifest or install script

**Enforced by:** Exploration (A.1) when the task touches `integrations/*/hooks/` and mechanical review C.5.

## Cross-editor hook parity

When a task adds, renames, or removes a hook in `integrations/<editor>/hooks/`, the planner must check every other editor directory under `integrations/` for the same hook name. If an equivalent hook is absent from any sibling editor, it is a **blocker** — the task must either (a) include the sibling hook as an in-scope deliverable, or (b) include an explicit Architecture Note explaining why the sibling is intentionally excluded.

**Required during exploration (item 8c):**

1. List the hook name being added/changed.
2. For each directory under `integrations/` that is not the target editor, check whether a hook with the same logical name exists (`ls integrations/<sibling>/hooks/`).
3. If absent: record as a gap. Decide scope (include or document exclusion) before Pass 2.

**Required in the task file:**

- The Files table must include the sibling hook file(s), OR the Architecture Notes must state the explicit reason the sibling is out of scope for this task (e.g. "Cursor already has the equivalent at `integrations/cursor/hooks/AIC-subagent-stop.cjs`").
- Tests must verify parity by asserting that `integrations/cursor/hooks/` and `integrations/claude/hooks/` both contain hook files for every event that either editor handles.

**Red flags:**

- A task adds `integrations/cursor/hooks/AIC-subagent-stop.cjs` without mentioning `integrations/claude/hooks/aic-subagent-stop.cjs`
- A task adds a Claude hook without checking whether Cursor has the same hook (or vice versa)
- The exploration report lists one editor's hook directory but not the other's

**Enforced by:** Exploration (A.1 item 8c) and mechanical review C.5.

## Rename/move: transitive reference rewriting

When a task renames, moves, or copies-with-rename any file, the planner traces the **full transitive dependency graph** — not just direct consumers of the renamed file, but also internal references between files in the renamed set.

**Required during exploration (item 8c):**

1. Identify every file being renamed or moved.
2. For each file, grep for all references TO it (one hop — external callers).
3. For each file, grep for all references FROM it to other files in the renamed set (second hop — sibling references).
4. If a script performs the rename, read it and verify it rewrites BOTH external references AND internal sibling references.

**Required in the task file:** the rename script is in the Files table with explicit mention of both rewrite passes; tests verify deployed files contain correct internal references. A presence-only test (`names.includes("AIC-foo.cjs")`) misses broken internal requires — add a content test (`content.includes('require("./AIC-bar.cjs")')`).

**Enforced by:** Exploration (A.1 item 8c rename bullet) and C.5. Historical failures: see `SKILL-drift-catalog.md §Rename/move`.

## Final ambiguity sweep

Before finishing the task file, run three mechanical scans on every sentence in Steps, Tests table descriptions, Verify lines, implementation notes, and parenthetical qualifiers. Architecture Notes explaining rationale are excluded (they don't instruct the executor).

**Scan 1 — Banned patterns:** Search for every pattern listed in the "No ambiguity" section above (Categories 1–8). Any match in an instruction context is a violation. Fix each one per the category's fix guidance. Scan scope includes ALL non-code text: step instructions, verify lines, Files table descriptions, acceptance criteria, and Architecture Notes (only instruction-like bullets, not rationale).

**Scan 2 — " or " in instructions:** For each non-code sentence containing " or ", ask: does the executor have to choose between two actions? If yes, resolve it now. Acceptable uses of "or": conditional behavior descriptions ("if file exists, read it; otherwise return null"), conjunctions ("zero errors or warnings"), error descriptions ("throws ConfigError or returns null").

**Scan 3 — Parenthetical hedges:** Search for parenthesized text `(...)` in step instructions. Parentheses in instructions often hide hedges: `(if needed)`, `(optional)`, `(e.g. X)`, `(or similar)`, `(sync or async)`. If the parenthetical contains any banned pattern, remove it and write the definitive instruction inline.

## Unit contract

When a task writes numeric values to a named slot — any DB column, interface field, config key, wire-format field, JSON response key, or CLI output value — the task's Architecture Notes must include a `**Unit contract:**` bullet. The bullet lists each numeric slot with its domain (e.g. `[0, 1]` decimal ratio, `[0, 100]` percentage, count of items, duration in milliseconds) and its source (the exact expression or `file:line` citation that produces the value).

**Red flags:**

- A column named `_ratio`, `_percent`, `_pct`, `_ms`, `_seconds`, `_count`, `_rate` with no Architecture Notes entry declaring its domain.
- Two columns with sibling names (`token_reduction_ratio`, `selection_ratio`) where one stores `[0, 1]` and the other stores `[0, 100]`.
- A step instruction that assigns a value to a named slot using a derivation expression (`Number(result.meta.tokenReductionPct) * 100`, `toPercentage(x)`) without the Architecture Notes declaring which domain the slot expects.
- A test literal that compares a field's value in a different scale than the writer produces (`expect(row.token_reduction_ratio).toBe(93)` when the writer stores `0.93`).

**Fix:** Add the Unit contract bullet listing every numeric slot. When two sibling fields have different domains, rename one to make the divergence visible at the call site (`selection_ratio` stays `[0, 1]`; the percentage sibling becomes `selection_percentage`, never `selection_ratio_pct`). Never store a domain-mismatched value under a name that implies the other domain.

**Enforced by:** Exploration item 25 (UNIT CONTRACT field) and mechanical check AJ (`SKILL-phase-3-write.md §C.5`).

## Dual-anchor line references

Line numbers become stale between plan time and execute time — upstream edits shift every subsequent line. Any line-number reference in the task body (`line N`, `lines N-M`, `at line N`, `line N of <file>`) must be paired with a literal, grep-unique substring quoted from that line.

**Required form:**

- `line 49 (where `show aic status|last|chat-summary|quality|projects` appears)` ✓
- `lines 54-57 (the `'aic:show-last'` bullet block)` ✓
- `line 178 (table header `| Command ... | Description |`)` ✓

**Red flags:**

- `line 49` with no anchor.
- `around line 100` — vague AND unanchored.
- An anchor quoted from a different line than the one referenced.

**Fix:** For each line reference in the task, open the cited file, copy a substring that is unique within the file, and quote it in backticks next to the line number. If no unique substring exists within a single line, cite a unique 2-line pair.

**Enforced by:** Mechanical check AL (`SKILL-phase-3-write.md §C.5`).

## Pattern-claim verification

When task prose claims `mirroring <path> style`, `follows the pattern in <path>`, `matches the convention in <path>`, or equivalent imitation language, the cited file must be read and every structural feature enumerated — not summarized in prose. Structural features include: the export shape (`z.object()` vs shape-object-with-`as const`), the factory signature, the parameter order, the default-value conventions, the return-type wrapper, the import style, the comment placement.

**Rule:** If the task claims imitation, the Interface/Signature and Step bodies must reproduce every enumerated structural feature byte-for-byte. Omitting even one structural feature is a drift — either match the pattern or stop claiming to mirror it.

**Red flags:**

- Task prose says "mirrors `status-request.schema.ts`" but exports `z.object({...})` while the cited file exports `{...} as const` (a shape object).
- Task imitation claim omits the `as const` suffix, the `readonly` modifier, or the `type XInput = z.infer<typeof schema>` companion line.
- A task cites an outlier sibling as the pattern source (see Sibling quorum below).

**Fix:** Read the cited file in full. Enumerate every structural feature as a checklist. Confirm each one is reproduced. If the task genuinely diverges from the pattern (for a documented reason), remove the imitation claim and record the divergence in Architecture Notes with its justification.

**Enforced by:** `SKILL-phase-3-write.md §C.5b` (Pattern-claim verification probe) and `SKILL-phase-2-explore.md` item 6 (Sibling quorum).

## Sibling quorum

Relying on a single "closest sibling" codifies outliers. The planner examines **at least two siblings** in the same directory (or layer, when the directory has one), picks the majority pattern, and reads a third to break ties.

**Required during exploration (item 6 quorum rule):** enumerate every sibling examined by file path; compare structural features pairwise; record agreement/disagreement; when they disagree, name the outlier and cite why it is treated as legacy. If only one sibling exists in the layer, mark it `SOLE SIBLING — treated as canonical`.

**Enforced by:** Exploration item 6 (SIBLING QUORUM field) and mechanical check P. Historical failures: see `SKILL-drift-catalog.md §Sibling quorum — layout pattern`.

## Predecessor contract discipline

When a task names another task under `Depends on:` or `Prerequisite:`, the current task consumes contracts from the predecessor — new columns, enum values, methods, schema fields, config keys, null-vs-zero semantics. Enumerate them during exploration (item 24) and thread them through the current task's design.

**Rule:** The current task must NOT construct input that violates the predecessor's declared nullability, read a column name the predecessor did not write, assume a non-null value when the predecessor writes null, or assume an enum value the predecessor did not define.

**Fix:** Record every consumed contract in Architecture Notes under `**Predecessor contracts:**` with the exact semantics copied from the predecessor (including nullability and stability). Design tests and step instructions around those semantics — tests for null paths MUST exercise the null case, not assume future population.

**Enforced by:** Exploration item 24 (PREDECESSOR CONTRACTS field), mechanical check AP, and C.5b Predecessor-contract probe. Historical failures: see `SKILL-drift-catalog.md §HARD RULE 20`.

## Circuit breaker (planner)

Verification loops must terminate. When the same mechanical check (or the same C.5b/C.5c probe) has failed 3 times and is about to re-run a 4th, STOP and escalate to the user. When the task file has undergone 5 full C.5 re-runs without all checks passing, STOP regardless.

Escalation report must contain: the check id, the exact failure message across attempts, the diffs applied between attempts, and a hypothesis naming the likely root cause (ambiguous exploration evidence, predecessor contract conflict, wrong architectural premise, rule that does not fit the task). Never silently mark the check "N/A" to bypass it.

**Enforced by:** `SKILL-phase-3-write.md §C.6` (Circuit breaker subsection).
