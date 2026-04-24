# Task Planner — Drift Catalog

Reference file. **Do not pre-read.** Load only when:

- The circuit breaker (HARD RULE 21) has fired and you need the root-cause hypothesis for a failing check.
- The user asks "why does rule X exist?" or "what failure does check Y close?".
- You are proposing to widen or loosen a gate and need the original failure evidence first.

Every entry records the **exact observed failure** that led to the enforcement. HARD RULES and mechanical-check descriptions elsewhere in this skill stay one sentence each; the drift history lives here so Pass 2 context stays small.

---

## HARD RULES — drift catalog

### HARD RULE 12 — Source citation fidelity (AN / AN-lite / AN-table)

Closes the drift observed in task 333 where the Files table cited `mcp/src/server.test.ts` (not on disk) while the real path `mcp/src/__tests__/server.test.ts` appeared only in the Tests section. AN-lite passed because no `Source:` line carried the wrong path; AN-table now catches it.

### HARD RULE 13 — Existing-symbol signature fidelity (AG)

Closes the failure class where a task's redeclared signature diverges from reality. Observed: `runCliDiagnosticsAndExit` declared `Promise<number>` when the actual signature was `void`.

### HARD RULE 14 — Change Specification round-trip (AH)

Closes the failure class where directive and target text contradict. Observed: task 325 Step 6 said "alphabetically between A and B" but the Target placed the insertion between A and C.

### HARD RULE 15 — Unit contract for numeric bindings (AJ)

Closes the failure class where a column named `_ratio` stores a percentage value without the task flagging the scale. Observed: task 322 shipped `token_reduction_ratio`, `selection_ratio`, `budget_utilisation` with inconsistent `[0, 1]` vs `[0, 100]` scales.

### HARD RULE 16 — Dual anchors for line references (AL / AL-extension)

Closes the stale-anchor failure class — pure line numbers drift between plan time and execute time. The anchor-line proximity extension covers the case where the anchor exists but the line number is wrong by more than 5 lines: task 348 Step 1 cited "line 158" for `lastCompilationForwardedHero` but the anchor `` `AIC optimised context by intent:` `` is at line 173.

### HARD RULE 17 — Goal-to-acceptance traceability (AM)

Closes the failure class where generic acceptance criteria (`pnpm lint clean`, `pnpm typecheck clean`) pass while the task's specific goal is silently unmet.

### HARD RULE 18 — Exploration-to-task coverage (AO)

Closes the lossy-compression class where material exploration findings (CONSUMER ANALYSIS, CALLER CHAIN, TEST IMPACT, BEHAVIOR CHANGES) silently drop during Pass 2 writing.

### HARD RULE 19 — Prerequisite graph validation (AP)

Closes the failure class where a task references a prerequisite that does not exist on disk, or forms an impossible chain (cycle, `Pending` task depending on another `Pending` task without ordering discipline).

### HARD RULE 20 — Predecessor contract discipline (C.5b probe + item 24)

Closes the cross-task coherence class. Observed: task 322 persisted `classifier_confidence = NULL`; task 323 tests assumed a non-null path was exercised. The null-vs-zero semantics mismatch surfaced only at merge time.

### HARD RULE 22 — Deferred-field bookkeeping (AQ)

Closes the cross-task obligation leak observed in task 322 where `classifier_confidence` shipped hardcoded `null` with the parenthetical "populated in a later task" but no named successor task, causing `aic_quality_report` to report `classifierConfidence.available = false` indefinitely.

### HARD RULE 23 — Successor-contract closure (AR in SKILL-phase-3-write.md)

Closes the 322→330 drift: task 322 advertised `classifierConfidence` deferred to a later task, task 330 (classifier-scores) landed as the nominal successor but only populated `compilation_log.classifier_confidence` and never touched `quality_snapshots.classifier_confidence`. No mechanical gate connected the advertised obligation to the unfulfilled delivery.

### HARD RULE 24 — Documentation routing (AR in validate-task.sh)

Closes the drift observed in task 333 where a 15-line README sample insertion was bundled into a code task without routing to the documentation specialist — discovered only by human validation of the generated task file.

### HARD RULE 25 — Behavior-change test-surface simulation (AS + AV)

Closes two related drifts:

- Task 342 (BF02): new zero-semantic-signal floor required edits to `heuristic-selector.test.ts` fixtures, three integration `defaultRulePack` helpers, and `test/benchmarks/expected-selection/1.json` — all predictable by simulation, none listed in the Files table, all discovered at execute time.
- Task 347: four production files (`compilation-runner.ts`, `run-pipeline-steps.ts`, `handlers/compile-handler.ts`, `cli-diagnostics.ts`) each had a sibling test on disk and none were in the Files table. AV now fires mechanically on this shape.

### HARD RULE 26 — Architectural invariants (8 defect classes)

No single historical drift — instead, each of the 8 triggers (DRY-01, SRP-01, LABEL-01, BRAND-01, DIP-01, OCP-01, SCOPE-01, PERSIST-01) has its own fixture under `.claude/skills/shared/scripts/__tests__/fixtures/` and pre-audit draft under `__tests__/audit-replay/`. See those fixtures for the concrete defect each trigger catches.

---

## Mechanical check — drift catalog

Per-check historical evidence. Each entry explains the specific failure that led the gate to exist. Descriptions in `SKILL-phase-3-write.md` stay one line; full evidence lives here.

### AE — Metric naming coherence

Red flags observed in the wild: (a) `ambiguityIndex` computed as a signal-absence product rather than inter-candidate competition; (b) `confidence` computed as a per-winner saturation without runner-up margin; (c) `specificity` derived from a count without any normalisation to a reference set; (d) `distance` that is not a metric (asymmetric or violates triangle inequality). This check asks the C.5b reviewer explicitly: "does each new metric name describe what its formula computes?" with formula and name side by side.

### AF — Derived metric input persistence

Red flags: (a) persisting `ambiguityIndex = (1 − confidence) · (1 − specificity)` while persisting only `confidence`; (b) persisting an aggregate without its components when the raw components are cheap (≤ 8 bytes each); (c) persisting a normalised value without its un-normalised source. Future analysts must be able to reconstruct any alternative derivation from stored columns — dropping an input silently defeats this.

### AG — Existing-symbol signature fidelity

See HARD RULE 13 drift above.

### AH — Change Specification round-trip

See HARD RULE 14 drift above. Directive verbs and target mutations must be mechanically consistent:

- "insert X between A and B" → Target must contain `A…X…B`.
- "replace X with Y" → Current must contain X; Target must not contain X; Target must contain Y.
- "append X after Y" → Target's Y immediately followed by X.
- "increment N to M" → Target contains M at the same syntactic position Current had N.
- "remove X" → Current contains X; Target does not.

### AI — Intra-bullet assignment consistency

Observed: task 322 Step 7 said `tokenReductionRatio → toPercentage(Number(...))` then "store `Number(...)`" — two different expressions referencing the same target slot in one bullet.

### AJ — Unit contract mandate

See HARD RULE 15 drift above.

### AK — Section edit resolution

Observed: task 325 Step 8 Target text contained "produced by running the documentation-writer skill" — shifting the doc-writer invocation from planner to executor. Delegation placeholders must be resolved during planning via (a) inlined literal, (b) cited file path with resolved text, or (c) a planner-time Step that invokes the delegated skill and pastes the output.

### AL — Dual anchor required

See HARD RULE 16 drift above.

### AM — Goal-to-acceptance traceability

See HARD RULE 17 drift above.

### AN — Source citation fidelity

See HARD RULE 12 drift above. AN must run before any other check that reads cited content — running downstream checks against hallucinated sources wastes work.

### AO — Exploration-to-task coverage

See HARD RULE 18 drift above.

### AP — Prerequisite graph validation

See HARD RULE 19 drift above.

### AQ — Deferred-field bookkeeping

See HARD RULE 22 drift above.

### AR — Successor-contract closure (SKILL-phase-3-write.md)

See HARD RULE 23 drift above. **Check-id namespace note:** `AR` in `SKILL-phase-3-write.md` = successor-contract closure. `AR` in `validate-task.sh` = documentation routing. Both namespaces exist and both checks fire.

### AS — Fixture simulation coverage

See HARD RULE 25 drift (first bullet — task 342 BF02).

### AT — Files-table row cap

Closes the "atomic across persistence + consumers" pattern observed in task 347 where 17 files shipped bundled and the planner-gate did not fire. A "File-count note" rationale does NOT satisfy this check; the only fix is to split the task.

### AU — Step complexity cap

Observed in task 347 where Step 6 packed ≥ 6 method-level edits plus 2 re-exports into one numbered bullet. The executor treats each step atomically, so concentration caused partial edits.

### AV — Test-surface sibling coverage

See HARD RULE 25 drift (second bullet — task 347).

### Z-extension — nullish-boundary examples

Observed: task 348 Step 1 said "omit when nullish" but the cache-hit fixture had `tokenReductionPct: 0` and the cache-hit Behavior Change example showed no reduction clause. Zero-is-not-nullish is a frequent implementor error; leaving the boundary undocumented passes the ambiguity to the executor.

### C.5b Pattern-claim verification

Observed: task 323 claimed to mirror `status-request.schema.ts` but exported `z.object(...)` instead of a shape object — prose said "mirror", structure did not. When task prose claims "mirrors X", "follows the pattern in X", or equivalent, every structural feature (export shape, factory signature, parameter order, default-value conventions, return-type wrapper) must be reproduced byte-for-byte.

### C.5b Predecessor-contract probe

See HARD RULE 20 drift above.

---

## Guardrail — drift catalog

### Sibling quorum — layout pattern

Closes the drift observed in task 333 draft where the proposed hero line would have rendered as `Title\nHero\nSEP\nBody`, breaking the `[SEP, hero, SEP]` pattern used by every sibling renderer in `format-diagnostic-output.ts`. Renderers/formatters need a LAYOUT PATTERN catalog (separator placement, hero/title positioning, column width, footer structure, row ordering) in addition to structural features.

### Rename/move: transitive reference rewriting

The failure mode: file A and file B are both renamed. B contains `require("./A")`. The plan rewrites external callers of A and B but does not rewrite B's internal reference to A. At runtime B crashes with `MODULE_NOT_FOUND`. A regex that only matches one import pattern (e.g. `require("../../shared/...")`) but misses another (e.g. `require("./...")`) is a bug the task must fix.

### Cross-editor hook parity

When a task adds, renames, or removes a hook in `integrations/<editor>/hooks/`, the parallel editor directory must be checked for the same hook name. Absent sibling = blocker (either include as in-scope or document exclusion). Presence-only tests (`names.includes("AIC-foo.cjs")`) miss broken internal requires; add a content test (`content.includes('require("./AIC-bar.cjs")')`) for files with sibling dependencies.

### Fixture-bound relational assertions

Red flag: a test asserts `expect(result.meta.filesSelected).toBeGreaterThan(0)` where `result` came from `runner.run(makeRequest(fixtureRoot))` but exploration never counted the files in `fixtureRoot`. Without evidence the fixture contains files that survive the pipeline's inclusion rules, the lower bound is unverifiable at plan time and brittle at execute time.

### Function-restructure isolation

Observed red flags:

- A step extends `BlobPayload` (additive) AND restructures `parseBlobPayload` (control-flow change) AND updates `set`'s payload literal AND updates `get`'s return — four distinct operations in one numbered step.
- A step says "In `parseBlobPayload`, after `JSON.parse`, derive a local numeric count … otherwise use `0`" alongside three property-addition bullets.

Why it matters: a bare cast replacement changes the function's control flow. An executor reading a multi-edit step naturally allocates attention across all bullets; the restructuring gets a share, not full focus. Result: incorrect cast, silent fallback, or missed guard.

### Dispatch pattern

Detection heuristic: any algorithm sketch containing a list of "X => value, Y => value, Z => value, else => default" with 3+ entries is a dispatch pattern. This includes scoring tier maps (path prefix => score), conditional classification tables, and feature flag routing. If/else-if chains with 3+ branches are banned by ESLint — use `Record<Enum, Handler>` for exhaustive enum dispatch or a handler array (`readonly { matches: predicate; score/handler: value }[]`) for predicate dispatch.

### Named imports in code blocks

When referencing a sibling's import pattern, check that the sibling uses named imports. If it uses `import * as P from ...` that is a legacy violation — do not propagate it. Namespace imports are allowed only for Node.js built-ins and established library APIs (`typescript`).

### Never guess library APIs or protocol behavior

Common failures: writing `Server` when the actual class is `McpServer`; writing `import from "@pkg"` when the actual subpath is `import from "@pkg/server/mcp.js"`; assuming MCP stdio uses newline-delimited JSON when it actually uses LSP-style `Content-Length` header framing. When a task involves a transport, either (a) specify the exact wire format with evidence from `.d.ts`/source, or (b) use the library's own client SDK to avoid framing concerns entirely.

### Conditional dependency loading

Red flags: a bootstrap function calls `new HeavyProvider()` unconditionally; a composition root creates every language provider regardless of whether the project uses that language; async initialization propagates into bootstrap functions that should be sync, just to eagerly load a resource that may not be needed. The fix is always the same: accept conditional dependencies as an injected parameter; `main()` (already async) decides at runtime whether to create each dependency.

### Composition root modification snippet

When a task modifies an existing function in a composition root, the step must include a concrete code block showing the function's expected state after the change. A step that says "extend `functionName()` to add X" without a code block is a red flag — the executor will need to guess the structure.

### Optional field access

Red flags: a step says `rulePack.heuristic.boostPatterns` but `heuristic` is `heuristic?:` — runtime error when undefined. A step says `config.weights.pathRelevance` but `weights` is `weights?:` — same issue. Exploration item 9 flags every optional field the implementation accesses; Pass 2 must use `?.` + fallback.

### Node smoke command correctness

`node -e "fn() === 'value'"` always exits 0 — the comparison result is discarded. `node -e "console.log(fn() === 'value')"` prints `false` but still exits 0. Neither is a guard. Use `assert.strictEqual` from the `assert` module:

```
node -e "const assert = require('assert'); assert.strictEqual(require('./path').fn(args), expected)"
```

### Hook file naming convention

Cursor-specific hooks at source use `AIC-<name>.cjs` (uppercase prefix). Claude-specific hooks at source use `aic-<name>.cjs` (lowercase prefix). Shared modules in `integrations/shared/` keep plain names; install scripts apply the correct prefix via `sharedDeployedName()` when copying to the hook directory.
