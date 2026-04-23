# Phase 3: Implement

### 3-doc. Implement (documentation mode)

**Replaces §3 for doc tasks.** Pre-write: read full target doc, 2 siblings, Writing Standards in one batch. Internalize voice/tone.

**Content format conventions** (source of truth: `SKILL-standards.md`; violations cause 4-doc-c failures):

- 3+ definitions → table (Term, Definition). 1-2 may be inline.
- 2+ comparisons across dimensions → table.
- Procedures → numbered lists.
- New `##`/`###` headings → add to ToC in correct position.
- Place new sections per document flow (intro→concepts→procedures→reference→appendix).
- Preserve the source document's line-break structure.

**For each step in the Steps section:**

1. **Read the Change Specification** — current text, rationale, target text.
2. **Apply** via StrReplace. Don't rewrite surrounding sections.
3. **Per-edit quick check** — re-read ± 5 lines. Verify: correct application, smooth transitions, formatting, ToC, definition format.

**After all steps → §4-doc.**

### 4-doc. Verify (documentation mode)

**Replaces §4 for doc tasks.**

**4-doc-a — Adversarial Review.** Run the `aic-documentation-writer` skill's Phase 3.

**How to run Phase 3:**

1. Read `.claude/skills/aic-documentation-writer/SKILL.md` (Phase 3 sections 3a–3f) and `SKILL-dimensions.md` (critic templates).
2. Spawn 3–4 critics in parallel. Each receives: edited document path, sibling doc paths, Change Specification.
   - **Critic 1 — Editorial** (`generalPurpose`): voice/tone, cohesion, heading hierarchy, parallel section symmetry.
   - **Critic 2 — Factual** (`explore`, `fast`): re-verifies technical claims against codebase.
   - **Critic 3 — Cross-doc consistency** (`explore`, `fast`): key terms vs sibling/mirror docs.
   - **Critic 4 — Reader simulation** (`generalPurpose`, conditional): user-facing docs only. Skip for dev references.
3. Evaluate per `SKILL.md` 3d. Run double-blind reconciliation (3e) if Explorer 1 findings available. Apply backward feedback (3f) if needed.

**4-doc-b — Process critic results.**

Follow SKILL.md section 3d. For each reported issue:

- **Editorial (Critic 1):** Fix. Re-read context around fix.
- **Factual NOT FOUND/CONTRADICTED (Critic 2):** Investigate source file. Fix doc to match codebase. If codebase is wrong, add to Blocked instead.
- **Consistency divergences (Critic 3):** Fix edited doc to match authoritative source. Note sibling fixes as follow-up.
- **Reader simulation (Critic 4):** Fix in-scope findings. Note out-of-scope as follow-up.
- **Anti-agreement (3c):** If any critic reported zero issues on a substantial doc, re-spawn with strengthened mandate.
- **Double-blind reconciliation (3e):** Compare Explorer 1 findings vs Critic 2. Resolve discrepancies per 3e.

**4-doc-c — Run mechanical verification.**

After fixing all critic-reported issues, run the mechanical checks:

| Dim                           | Check                                                                                                                                           | Evidence                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1. Change spec compliance     | Re-read Change Spec vs edited document                                                                                                          | Each change — APPLIED / MISSING                                          |
| 2. Factual accuracy           | Grep codebase for every technical claim in edited sections                                                                                      | Each claim — VERIFIED / NOT FOUND / CONTRADICTED                         |
| 3. Cross-doc consistency      | Grep sibling docs for key terms in edited sections                                                                                              | Each term — CONSISTENT / DIVERGENT                                       |
| 4. Link validity              | Glob for every `[text](path)` target                                                                                                            | Each link — VALID / BROKEN                                               |
| 5. Writing quality            | Critic 1 output — all issues resolved                                                                                                           | Each issue — FIXED / ACCEPTED (with reason)                              |
| 6. No regressions             | `git diff` — only intended sections changed                                                                                                     | Diff matches Change Spec only                                            |
| 7. ToC-body match             | Verify every ToC entry ↔ body heading (including new headings)                                                                                  | Each entry — MATCHES / MISSING IN BODY / ORDER MISMATCH / MISSING IN TOC |
| 8. Scope-adjacent consistency | Grep full document for key concepts from edited sections                                                                                        | Each concept — CONSISTENT / STALE / CONTRADICTED                         |
| 9. Pre-existing issue scan    | Grep for "GAP", "TODO", "FIXME", "will be added", "future task", stale phase heading refs (regex `Phase (?:[A-Z]{1,2}\|[0-9]+(?:\.[0-9]+)?)\b`) | Each marker — IN TARGET (fix) / OUTSIDE TARGET (info)                    |
| 10. Content format compliance | 3+ definitions → table; new sections → ToC entry; placement follows document flow                                                               | Each check — COMPLIANT / VIOLATION                                       |
| 11. Cross-doc term ripple     | Grep `documentation/` for old values of replaced terms; classify as non-historical (fix/follow-up) or historical (leave)                        | Each old term — [file:line] — NON-HISTORICAL / HISTORICAL                |
| 12. Intra-doc consistency     | Grep full document for same concepts described in edited sections; flag contradictions                                                          | Each concept — CONSISTENT / CONTRADICTED                                 |

**Blocking:** Dims 1–7, 10, 11 (in-scope non-historical), 12. Dims 8, 9 are informational.

**4-doc-d — Track first-pass quality.** Report in §5a (e.g. "12/12 first-pass clean").

### 3-mixed. Implement documentation changes (mixed-mode tasks)

**Runs AFTER §3 for mixed tasks only.** Same workflow as §3-doc, scoped to documentation files within a code task.

**Pre-write:** Read in one batch: full target document, 2 most-related sibling docs, and the Change Specification. Internalize voice and tone. Content format conventions from §3-doc apply.

**For each documentation step:** Same as §3-doc — read Change Specification, apply via StrReplace, run per-edit quick check.

After all documentation steps, proceed to §4 (code verification) first, then §4-mixed.

### 4-mixed. Verify documentation changes (mixed-mode tasks)

**Runs AFTER §4a-§4b for mixed tasks only.** Uses the same documentation-writer Phase 3 pipeline as §4-doc.

**4-mixed-a — Adversarial Review.** Same as §4-doc-a — spawn 3–4 critics per the documentation-writer skill's Phase 3. **Scaling:** For MECHANICAL changes, run Critic 2 only. For SECTION EDIT changes, run the full critic set.

**4-mixed-b — Process critic results.** Same as §4-doc-b.

**4-mixed-c — Mechanical verification.** Run the §4-doc-c dimensions on each modified `.md` file, subset: dims 1–7, 10, 12 must be clean. Dims 8, 9, 11 are informational only.

**4-mixed-d — Track first-pass quality.** Report separately from code: "Code: N/M. Docs: N/M."

### 3. Implement

Work through the **Steps** section in order.

**Worktree context (§3–§5).** All file ops target the worktree: set `working_directory` for Shell, use worktree-prefixed paths for Read/Write/StrReplace/Grep/Glob. `shared/src/foo.ts` → `<worktree>/shared/src/foo.ts`.

**Dual-anchor consumption.** Task instructions may pair a line number with a backtick-quoted literal: `line 323 (where `runCliDiagnosticsAndExit` appears)`. The literal is the authoritative anchor; the line number is a hint. Always StrReplace using the backticked literal as `old_string`, not the line number — lines drift between plan time and execute time, literals do not. If the literal is non-unique in the target file, expand `old_string` with minimal surrounding context from the same region until it is unique.

**Unit contract fidelity.** The task's Architecture Notes may carry a `**Unit contract:**` bullet listing each named numeric slot and its domain (`[0, 1]` decimal ratio, `[0, 100]` percentage, count, ms, seconds, etc.). Before writing a numeric value to any listed slot, verify the source expression's domain matches the declared domain. Mismatch (e.g. source is `[0, 100]` but slot is declared `[0, 1]`) means either (a) the expression needs conversion, or (b) the slot is misnamed and the task is wrong — stop and ask. Never silently rescale.

**Pre-write reference (rules NOT caught by ESLint).** Internalize before writing — each causes a §4b failure if missed.

| #   | Rule                | What to check                                                                                                                                        | Wrong                                          | Right                                                                 |
| --- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| 1   | Readonly arrays     | Every `T[]` has `readonly` — props, params, locals, returns, generics (e.g. `reduce<{ readonly files: readonly T[] }>`)                              | `items: string[]`                              | `readonly items: readonly string[]`                                   |
| 2   | Readonly properties | Every class and interface property                                                                                                                   | `id: string`                                   | `readonly id: string`                                                 |
| 3   | No mutating methods | No `.push()` `.splice()` `.sort()` `.reverse()` — use spread, reduce, `.toSorted()`, `.toReversed()`. Tests exempt                                   | `arr.push(x)`                                  | `[...arr, x]`                                                         |
| 4   | Branded types       | Factory functions for all domain values — never raw `string`/`number` for paths, tokens, scores, IDs                                                 | `path: string`                                 | `path: RelativePath`                                                  |
| 5   | Comment style       | Only `//` — ESLint catches `/* */` but NOT `/** */`                                                                                                  | `/** comment */`                               | `// comment`                                                          |
| 6   | No `let`            | `const` exclusively — reduce, ternary, helpers for accumulators. Only boolean flags in imperative closures exempt. Tests exempt                      | `let acc = []`                                 | `reduce(...)` or `const x = cond ? a : b`                             |
| 7   | Typed exports       | Explicit type annotation on exported const objects                                                                                                   | `export const x = {`                           | `export const x: Type = {`                                            |
| 8   | Return types        | Explicit return type on every exported function and method                                                                                           | `transform(c)`                                 | `transform(c): string`                                                |
| 9   | Signature match     | Params, types, return types EXACTLY match the interface — including `readonly` modifiers                                                             | Mismatched param type or missing `readonly`    | Exact match with interface file                                       |
| 10  | Immutable returns   | Never mutate inputs — always return new objects                                                                                                      | `input.x = y; return input`                    | `return { ...input, x: y }`                                           |
| 11  | Code clones         | Import existing shared utilities — never duplicate logic from sibling files                                                                          | Copy-paste from sibling                        | `import { fn } from "./shared.js"`                                    |
| 12  | SQL determinism     | No `date('now')` or `datetime('now')` in SQL — bind time from Clock                                                                                  | `date('now')`                                  | `? (bound from Clock)`                                                |
| 13  | DB normalization    | Schema at 3NF minimum — no multi-value columns (1NF), no partial key deps (2NF), no transitive deps (3NF), lookup tables for repeated string domains | `status TEXT` with repeated values across rows | FK to a reference table, or justified exception in Architecture Notes |

**Recipe-specific pitfalls** (check the ones matching your task's layer):

- **Pipeline:** `readonly` on all arrays + lookup tables. Readonly tuples in `reduce`. One `safety_*` test per extension.
- **Storage:** Bind time from Clock. Branded factories in tests. Test zero-denominator edge cases for computed SQL columns. 3NF minimum — no comma-separated or JSON-array TEXT columns for queryable data (use junction tables), no partial dependencies on composite keys (split tables), no transitive dependencies between non-key columns (extract to lookup tables). Repeated domains → lookup table unless 2–3 values + justified.
- **Adapters:** Check interface return type for sync/async. ESLint block must include ALL boundary paths.
- **Composition roots:** No eager conditional deps. No `new` in helpers. Ternary-spread.

**Code clones.** Check shared utils first: `glob-match.ts`, `pattern-scanner.ts`, `handle-command-error.ts`, `run-action.ts`, `tree-sitter-node-utils.ts`, `tree-sitter-provider-factory.ts`. 0% duplication enforced by `pnpm lint:clones`.

**Sibling check.** Read closest sibling file. Follow its pattern — if task spec conflicts with sibling's pattern, follow the sibling. If sibling has structurally identical functions, extract to shared utility (parameterized with callbacks). If no sibling exists (first file of its kind), check whether any function you are writing is generic (its structure would be identical in a future sibling with different config/predicates). If so, place it in a shared utility file from the start.

**Test steps:** Every Tests table row → one test case with that exact name. No extras, no skips. Use Dependent Types for test data. If the Tests table has a third column (`Mock / assert contract`), implement the mocks and assertions exactly as specified: exact mock signatures (`Clock → ISO literal`), inline seed data, and literal assertion values (`expect(result.x).toEqual(<literal>)`). No "close enough" assertions, no improvised mocks. If the contract is genuinely wrong or unimplementable, stop and report (HARD RULE 5).

**Test structure by task layer:**

- **Storage tests:** In-memory DB (`new Database(":memory:")`), run migration, create store with `ExecutableDb` + mock `Clock`/`IdGenerator`. Use branded factories for test data.
- **Adapter tests:** File-based → temp dir with fixtures. Parser/encoder → in-memory strings. Clean up temp dirs.
- **Pipeline tests:** Mock dependencies. Verify no input mutation. Test edge cases (empty, zero, none).
- **Composition root tests (MCP/CLI):** Integration-style. MCP servers: use SDK `Client` with `InMemoryTransport`. Spawn tests: verify wire format from `.d.ts` (content-length headers, not newline-delimited). Scope creation: temp dir, verify structure. Idempotency: call twice, verify no crash. Clean up temp dirs.

For each step:

1. Do exactly what the step says.
2. Run the **Verify** command listed in that step.
3. If verification fails, fix the issue before moving to the next step.
4. If you cannot fix it after 2 attempts, go to **Blocked diagnostic** (see §Blocked Handling in `SKILL.md`). The 2-attempt limit is for per-step `Verify`; the separate 3-attempt limit in §Autonomous execution applies to the full-toolchain gate in §4a.
5. **Circuit breaker:** 3+ pieces of unlisted code (type casts, stubs, wrappers) to make it compile → **Blocked diagnostic** (see §Blocked Handling in `SKILL.md`). List each unlisted piece.
6. **Scope tripwire (HARD RULE 9).** If `Verify`, a failing test, or any side-effect points at a file outside the Files table (and outside the narrow `SKILL-phase-5-finalize.md §5c Step 2` whitelist) as the fix location, STOP. Do not open or edit the file. Follow §Blocked Handling in `SKILL.md`: report (a) the step, (b) the out-of-list file(s), (c) why the core change forces the edit (common patterns: unrelated test fixture captures a newly-excluded path, integration snapshot needs regeneration, benchmark's `expected-selection/*.json` narrows), (d) three options — extend scope / re-plan via `aic-task-planner` / discard. Wait for the user's choice.

**Per-file quick check (after writing each production file).** Run these 4 Grep commands on each production file you just wrote, **dispatched in a single parallel batch** (one assistant message with four `Grep` tool calls — not four sequential messages). They are independent read-only checks against the same file; serial dispatch is a regression. Skip for test files.

1. Grep for `\.push\(|\.splice\(|\.sort\(|\.reverse\(` — mutating methods (table row 3)
2. Grep for `/\*\*` — block comment style (table row 5)
3. Grep for `^\s*let ` — mutable bindings (table row 6)
4. Grep for `export const \w+ = \{` — check each match has a type annotation (table row 7)

If any match, fix in the same file before proceeding. Do NOT defer to §4b — fixing now prevents compound rework later.

**Prefer direct implementation** with parallel tool calls. When subagents needed: `fast` for 1-2 files, default for multi-file, most capable for design. Protocol:

- **DONE:** Verify the subagent's output independently before proceeding.
- **DONE_WITH_CONCERNS:** Read the concerns before proceeding. If concerns are about correctness or scope, address them before verification. If they are observations (e.g. "this file is getting large"), note them and proceed.
- **NEEDS_CONTEXT:** Re-dispatch with the missing context.
- **BLOCKED:** Assess the blocker: (1) context problem → provide more context and re-dispatch, (2) task requires more reasoning → re-dispatch with a more capable model, (3) task is too large → break into smaller pieces, (4) plan itself is wrong → escalate to the user. Never ignore an escalation or force the same model to retry without changes.

---

**Emit the implementation-complete checkpoint now.** Run this exactly:

```
echo "CHECKPOINT: aic-task-executor/implementation-complete — complete"
bash .claude/skills/shared/scripts/checkpoint-log.sh \
  aic-task-executor implementation-complete "<short-artifact-note>"
```

The artifact note is free-text (e.g. `"task-347 BH01 allocator budget"`) — it ends up in `.aic/skill-log.jsonl` and is read by operators reconstructing what the run produced. Do not proceed until this command exits 0.

**Phase 3 complete.**

- **Pure documentation tasks:** §4-doc verification ran above. Skip `SKILL-phase-4-verify.md`. Read `SKILL-phase-5-finalize.md` and execute it immediately — there is no `verification-complete` checkpoint for pure-doc tasks (Phase 4 is the code-mode verification phase, which was substituted by §4-doc inside Phase 3).
- **Code and mixed tasks:** Read `SKILL-phase-4-verify.md` and execute it immediately.
