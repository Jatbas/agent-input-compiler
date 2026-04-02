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

Every file in the Files table is **mandatory**. Never mark a file as "optional" or say "may be added in this task or a follow-up." If you're unsure whether to include something, ask the user. The executor must never have to decide scope.

This extends to **all instructions**, not just the Files table. The rule is simple: **the executor follows instructions, never makes choices.** If any sentence in the task file requires the executor to decide between alternatives, pick an approach, or interpret vague guidance — the planner hasn't finished designing.

Below are the **banned patterns**, organized by category. If ANY pattern appears in a step instruction, verify line, test description, or implementation note, it is a violation. The only safe zone is Architecture Notes explaining rationale (not giving instructions).

### Category 1: Hedging — uncertain obligation

These signal the planner isn't sure whether something should be done:

> `if needed`, `if necessary`, `if required`, `if appropriate`, `if desired`, `if applicable`,
> `as needed`, `as necessary`, `as appropriate`, `as desired`, `as required`, `as applicable`,
> `may`, `may be`, `may want`, `may need`, `may be added`, `may require`,
> `might`, `might want`, `might need`, `might be`,
> `could`, `you could`, `one could`, `could also`,
> `should work`, `should be fine`, `should suffice`,
> `probably`, `likely`, `presumably`, `possibly`, `potentially`, `perhaps`,
> `try to`, `attempt to`, `aim to`,
> `ideally`, `preferably`,
> `feel free to`, `don't hesitate to`

**Fix:** Decide yes or no. If yes, write the definitive instruction. If no, remove it.

### Category 2: Examples-as-instructions — delegation via illustration

These present a suggestion instead of a directive. The executor must guess whether to use the example literally or adapt it:

> `e.g.`, `eg.`, `eg `, `for example`, `for instance`, `such as` (in instructions),
> `something like`, `along the lines of`, `along these lines`,
> `similar to` (when suggesting approach), `like` (when suggesting approach),
> `or similar`, `or equivalent`, `or comparable`, `or analogous`,
> `or something like`, `some kind of`, `some sort of`, `some form of`

**Fix:** Replace the example with the definitive instruction. `(e.g. process.cwd())` becomes `process.cwd()`.

### Category 3: Delegation of choice — executor must decide

These explicitly hand a design decision to the executor:

> `decide whether`, `decide if`, `choose between`, `pick one`, `select` (as instruction),
> `depending on`, `depends on`, `based on your preference`,
> `up to you`, `your choice`, `your call`, `at your discretion`,
> `alternatively`, `or alternatively`,
> `whichever`, `whatever works`, `however you prefer`,
> `or optionally`, `optionally`, `optional` (for mandatory instructions)

**Fix:** Go back to Pass 1 (A.4 decisions), make the decision, write one instruction.

### Category 4: Vague qualifiers — unresolved specificity

These hide the fact that the planner hasn't determined the exact value:

> `appropriate` (without specifying what), `suitable`, `relevant`, `proper` (without specifying what),
> `reasonable`, `sensible`, `adequate`,
> `some` (when count is known), `various`, `several` (when list is known),
> `etc.`, `and so on`, `and so forth`, `and more`, `...` (trailing, in prose)

**Fix:** Replace with the specific value, name, count, or list.

### Category 5: Conditional state hedges — known state treated as unknown

After the exploration checklist, the planner knows the codebase state. These pretend otherwise:

> `if not present`, `if not already`, `if it doesn't exist`, `if missing`,
> `if not installed`, `add if not present`, `create if not exists`,
> `if type is extended`, `if needed later`, `if required in future`,
> `or document`, `or document behaviour`, `or document behavior`

**Fix:** State the known fact: "already at 1.0.21" or "add at 1.0.21". "File exists" or "file does not exist — create it."

**Idempotent operations:** When describing `mkdir`, `CREATE TABLE IF NOT EXISTS`, or similar operations that are idempotent by design, do not restate the conditional in prose ("create directory if missing"). Instead, specify the idempotent API call directly: "`fs.mkdirSync(dir, { recursive: true, mode: 0o700 })`" — the `recursive: true` flag makes the call idempotent without a prose hedge. For SQL, `IF NOT EXISTS` is a keyword in the DDL statement, not prose — it belongs inside the SQL code block, not in the step instruction text.

### Category 6: Escape clauses — deferral or opt-out

These give the executor permission to skip work:

> `or skip`, `or ignore`, `or leave for later`,
> `or a follow-up`, `in a later task`, `in a future task`,
> `if possible`, `where possible`, `when possible`, `if feasible`,
> `if time permits`, `if practical`,
> `mock or skip`, `mock or conditional`

**Fix:** If the work is in scope, write the instruction. If it's out of scope, don't mention it at all.

### Category 7: False alternatives in instructions

These present two implementation paths where the planner should have chosen one:

> `X or Y` (two implementation options in one sentence),
> `or use`, `or another`, `or any`,
> `either...or` (presenting implementation alternatives)

**Fix:** Pick one. If genuinely uncertain, ask the user during Pass 1 decisions (A.4).

### Category 8: Tool-conditional scope — deferring decisions to executor tool runs

These make the scope of a step, Files table entry, or acceptance criterion depend on the output of a tool the executor must run, instead of resolving the scope during exploration:

> `if knip reports`, `if knip flags`, `if lint shows`, `if lint reports`,
> `if test shows`, `if test fails`, `if typecheck reports`,
> `if [tool] reports`, `if [tool] flags`, `if [tool] shows`,
> `run [tool] and add`, `run [tool] to determine`, `check [tool] output`,
> `if [tool] reports unused`, `add entries ... if [tool]`

This also covers **implicit** tool-conditional scope: a Files table description that says "add ignore entries for X, Y, Z if knip reports unused" or a step that says "fix any lint errors that appear" without listing them.

**Fix:** Run the verification tool during exploration (item 22). Record the output. Write the exact scope — specific file paths, specific ignore entries, specific lint errors to fix. If the tool cannot be run (artifact does not exist yet), resolve by static analysis of tool config (e.g., read knip.json entry patterns to determine what it would flag). If static analysis is insufficient, flag as a BLOCKER and tell the user. Never write a conditional that the executor must resolve by running a tool.

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

**Enforced by:** A.4 design decisions (constructor parameters, "Conditional dependencies" check) and the composition root recipe in `SKILL-recipes.md`.

## Composition root modification snippet

When a task modifies an existing function in a composition root (e.g. `initLanguageProviders()`, `createMcpServer()`), the step must include a **concrete code block** showing the function's expected state after the change — not just prose saying "extend the function." If the function needs structural changes (e.g. converting an early-return to an accumulation pattern), the first task to make that change must show the full before/after. Subsequent tasks that add incremental entries show only the new lines plus the updated return statement.

**Red flags:**

- A step says "extend `functionName()` to add X" without a code block
- A step modifies a function but doesn't show what it looks like after the modification
- A structural refactoring (single-case to multi-case, sync to async, early-return to accumulation) is buried in prose rather than shown in code

**Required pattern:**

- The first task that restructures a function shows the **complete function body** as a code block
- Incremental tasks show the **new entry** as a code block plus the **updated return statement**
- The code block respects project conventions (immutability: ternary-spread, no `.push()`)

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

## Sync vs async for adapters

When a task wraps an external library, the step that implements the adapter must state whether to use the library's **sync** or **async** API. The interface return type determines this: if the interface returns `T`, the adapter must use the sync API; if `Promise<T>`, the async API. Never leave this implicit.

## Dispatch pattern

If any method in the task has 3+ branches — dispatching on an enum, a type discriminator, **or ordered predicate matching** (path prefix tiers, conditional scoring maps, node-type checks) — the Architecture Notes must specify the dispatch pattern. The step instructions must show the dispatch map structure as a code block. If/else-if chains with 3+ branches are banned by ESLint. Two patterns are available:

- **`Record<Enum, Handler>`** — for exhaustive enum dispatch (compile-time safety that all variants are covered).
- **Handler array** (`readonly { matches: predicate; score/handler: value }[]`) — for predicate-based dispatch (e.g. AST node types, path prefix tiers) where you cannot index by a single key, or where ordering matters (most specific match first).

**Detection heuristic:** Any algorithm sketch containing a list of "X => value, Y => value, Z => value, else => default" with 3+ entries is a dispatch pattern. This includes scoring tier maps (path prefix => score), conditional classification tables, and feature flag routing.

The planner must choose one and write it into the task. The executor must not decide.

## Optional field access

When the implementation reads a field from a dependent type and that field is declared optional (`?:`), the step instructions must explicitly specify optional chaining (`?.`) and a fallback value. Never write `obj.optionalField.method()` in step text — write `obj.optionalField?.method() ?? fallback`.

**Detection:** During exploration (A.1 item 9), the planner reads every dependent type and flags optional fields the implementation accesses. These are recorded in the OPTIONAL FIELD HAZARDS section of the Exploration Report. During writing (Pass 2), every field access in step instructions is cross-checked against this list.

**Red flags:**

- A step says `rulePack.heuristic.boostPatterns` but `heuristic` is `heuristic?:` — runtime error when undefined
- A step says `config.weights.pathRelevance` but `weights` is `weights?:` — same issue
- The exploration report lists a Tier 1 type member as `heuristic` without noting it is optional

**Enforced by:** A.1 item 9 (flag optional fields), Exploration Report OPTIONAL FIELD HAZARDS section, C.5 check B (verify step instructions handle optional fields).

## Never guess library APIs or protocol behavior

Every external library class name, import path, constructor signature, and method call in the task file must be verified against installed `.d.ts` files or official documentation. Never write a library API from memory. If you cannot read the `.d.ts` files (package not installed, no type definitions available), this is a **blocker** — stop and tell the user.

Common failure: writing `Server` when the actual class is `McpServer`, or writing `import from "@pkg"` when the actual subpath is `import from "@pkg/server/mcp.js"`. These errors produce tasks that look correct but fail during execution.

**Protocol and transport behavior must also be verified.** When a task involves sending/receiving data over a transport (stdio, HTTP, WebSocket, etc.), do not assume the wire format. Read the transport's `.d.ts` or source to determine the exact framing (content-length headers, newline-delimited, binary length prefix, etc.). Common failure: assuming MCP stdio uses newline-delimited JSON when it actually uses LSP-style `Content-Length` header framing. If the test strategy involves communicating with a transport, the task must either (a) specify the exact wire format with evidence from `.d.ts`/source, or (b) use the library's own client SDK to avoid framing concerns entirely.

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

## Rename/move: transitive reference rewriting

When a task renames, moves, or copies-with-rename any file, the planner must trace the **full transitive dependency graph** — not just direct consumers of the renamed file, but also internal references between files in the renamed set.

**The failure mode:** File A and file B are both renamed. B contains `require("./A")`. The plan rewrites external callers of A and B but does not rewrite B's internal reference to A. At runtime B crashes with MODULE_NOT_FOUND.

**Required during exploration (item 8c):**

1. Identify every file being renamed or moved.
2. For each file, grep for all references TO it (direct consumers — one hop).
3. For each file, grep for all references FROM it to other files in the renamed set (sibling references — second hop).
4. If a script performs the rename (install script, build script), read the script and verify it rewrites BOTH external references (step 2) AND internal sibling references (step 3). A regex that only matches one import pattern (e.g. `require("../../shared/...")`) but misses another (e.g. `require("./...")`) is a bug the task must fix.

**Required in the task file:**

- The Files table must include the script that performs the rename, with explicit mention of both rewrite passes.
- Tests must verify that deployed files contain correct internal references — not just that files exist with the right names. A presence-only test (`names.includes("AIC-foo.cjs")`) misses broken internal requires; add a content test (`content.includes('require("./AIC-bar.cjs")')`) for files with sibling dependencies.

**Red flags:**

- A task renames files deployed by a script but only tests file presence, not internal reference correctness
- A task adds a regex rewrite for one import pattern but does not analyze whether other patterns exist in the affected files
- The exploration report lists "require paths" but only traces one hop of the dependency graph

**Enforced by:** Exploration (A.1 item 8c rename bullet) and mechanical review C.5.

## Final ambiguity sweep

Before finishing the task file, run three mechanical scans on every sentence in Steps, Tests table descriptions, Verify lines, implementation notes, and parenthetical qualifiers. Architecture Notes explaining rationale are excluded (they don't instruct the executor).

**Scan 1 — Banned patterns:** Search for every pattern listed in the "No ambiguity" section above (Categories 1–8). Any match in an instruction context is a violation. Fix each one per the category's fix guidance. Scan scope includes ALL non-code text: step instructions, verify lines, Files table descriptions, acceptance criteria, and Architecture Notes (only instruction-like bullets, not rationale).

**Scan 2 — " or " in instructions:** For each non-code sentence containing " or ", ask: does the executor have to choose between two actions? If yes, resolve it now. Acceptable uses of "or": conditional behavior descriptions ("if file exists, read it; otherwise return null"), conjunctions ("zero errors or warnings"), error descriptions ("throws ConfigError or returns null").

**Scan 3 — Parenthetical hedges:** Search for parenthesized text `(...)` in step instructions. Parentheses in instructions often hide hedges: `(if needed)`, `(optional)`, `(e.g. X)`, `(or similar)`, `(sync or async)`. If the parenthetical contains any banned pattern, remove it and write the definitive instruction inline.
