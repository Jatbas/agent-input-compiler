# Phase 3: Pass 2 — Write + Verify + Finalize

**Goal:** Mechanically map Exploration Report + decisions into template. If not in the report, don't add it; if it is, don't omit it.

**HARD RULE:** After §C.6 passes, §6 runs immediately — the task is NOT complete until §6 finishes. There is no user gate between Pass 2 and §6 (see `SKILL.md §Autonomous execution`).

## C.1 Confirm reference files in context

The chosen recipe quick card (`recipes/<name>.md`) and `SKILL-guardrails.md` were read in Phase 1 / Phase 2. Re-read the matching recipe if context truncated (use offset/limit). Load `SKILL-recipes.md` (long-form appendix) only when the quick card defers to it explicitly, and load `SKILL-drift-catalog.md` only when a check fires and you need its historical evidence.

## C.2 Mapping table

| Report field                   | Template section                                                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EXISTING FILES                 | Files table (only "Create" for DOES NOT EXIST)                                                                                                                                                 |
| EXISTING SOLUTIONS             | Architecture Notes (reuse decisions)                                                                                                                                                           |
| SIBLING PATTERN                | Architecture Notes (reuse mandate) + Interface / Signature (structural pattern)                                                                                                                |
| CONSUMER ANALYSIS              | Files table ("Modify" rows for broken consumers)                                                                                                                                               |
| CALLER CHAIN ANALYSIS          | Files table ("Modify" rows for every file in chain) + Steps (closure restructure)                                                                                                              |
| APPROACH EVALUATION            | Architecture Notes (chosen approach + rationale)                                                                                                                                               |
| INTERFACES                     | Interface / Signature (first code block)                                                                                                                                                       |
| CONSTRUCTOR + METHOD BEHAVIORS | Interface / Signature (second code block — class)                                                                                                                                              |
| DEPENDENT TYPES                | Dependent Types (tiered: T0 verbatim, T1 table, T2 table)                                                                                                                                      |
| DEPENDENCIES + ESLINT CHANGES  | Config Changes                                                                                                                                                                                 |
| DESIGN DECISIONS               | Architecture Notes                                                                                                                                                                             |
| SYNC/ASYNC                     | Steps (implementation step must state this)                                                                                                                                                    |
| LIBRARY API CALLS              | Steps (exact function calls in implementation)                                                                                                                                                 |
| SCHEMA                         | Steps (SQL step references exact columns)                                                                                                                                                      |
| STEP PLAN                      | Steps (method-to-step assignment)                                                                                                                                                              |
| TEST STRATEGY                  | Steps (test step specifies exact mocking)                                                                                                                                                      |
| CHANGE-PATTERN INSTANCES       | Architecture Notes (blast radius summary) + Steps (ensure all instances covered)                                                                                                               |
| BOUNDARY CONTRACT MIRRORS      | Files table ("Modify" rows for IN SCOPE mirrors) + Steps (schema/validator/descriptor/test updates) + Follow-up Items (FOLLOW-UP mirrors)                                                      |
| TEST IMPACT                    | Files table ("Modify" rows for affected tests) + Steps (assertion updates)                                                                                                                     |
| COPY TARGET AUDIT              | Steps (exclusion strategy) + Architecture Notes (bundle contents justification)                                                                                                                |
| NON-TS ASSET PIPELINE          | Steps (build copy, CI build step, vitest alias) + Config Changes if needed                                                                                                                     |
| BEHAVIOR CHANGES               | Architecture Notes ("Behavior change:" bullets for each observable difference)                                                                                                                 |
| FIXTURE SIMULATION             | Files table ("Modify" rows for ASSERTION FLIPS fixtures) + Architecture Notes (`**Auto-ratcheting artifacts:**` bullet for AUTO-RATCHET paths) + Follow-up Items (FIXTURE BLOCKED latent bugs) |
| BINDING INVENTORY              | Steps ("use existing `name` (line N)" directives for reused bindings)                                                                                                                          |
| UNIT CONTRACT                  | Architecture Notes (`**Unit contract:**` bullet listing each numeric slot name)                                                                                                                |
| PREDECESSOR CONTRACTS          | Architecture Notes (`**Predecessor contracts:**` bullet listing consumed outputs)                                                                                                              |
| SIBLING QUORUM                 | Architecture Notes (majority-pattern citation when ≥2 siblings examined)                                                                                                                       |
| RESEARCH DOCUMENT              | Header `> **Research:**` line (path to `documentation/research/` file)                                                                                                                         |

**Research auto-reference:** If a research document was produced/used, the `> **Research:**` line MUST appear in task header. No document → omit line entirely.

## C.3 Write prohibitions

- Never write "if needed", "or optionally", "may be", "consider", "you could", "might want"
- Never reference another task file ("see Task 009")
- Never write "Create" in Files table for a file the Exploration Report marked EXISTS
- Never put 3+ methods in one step
- Never use raw `string`/`number` for domain-value constructor parameters
- Never paste Tier 1 or Tier 2 types verbatim — use the tiered format (table for Tier 1, table for Tier 2)
- Never use Tier 1 or Tier 2 for types the component calls methods on or constructs inline — those must be Tier 0
- Never write a manual class when the closest sibling uses a factory function for the same purpose — the Interface/Signature must use the same factory
- Never reimplement logic that the sibling delegates to shared utility functions — import and call the existing shared utilities
- Never produce a research document (via §0b or inline) without referencing it in the task's `> **Research:**` header line
- Never describe SQL bind-parameter changes with prose only — show complete `.all(...)`/`.run(...)` argument list
- Never write recursive copy without COPY TARGET AUDIT in exploration
- Never derive a value when target file has existing binding — say "use existing `<name>` (line N)"
- Never make scope depend on uncollected tool output — run tool in exploration or flag blocker
- Never offer alternative idioms when file already uses one — match existing convention
- Never remove the only consumer of an imported symbol without also removing its import — steps that drop a call-site (argument removal, helper replacement, signature shrinkage) must explicitly remove or update the import in the same step or a successor step in the same file. `pnpm lint` and `pnpm knip` must stay clean after the step runs; a dangling import that only surfaces at final verification means the step was incomplete.
- Never rewrite an SQL `SELECT`/`INSERT` column list by line anchor without echoing the table-alias convention of the cited line — if the source line uses `cl.intent, cl.files_selected, ...` (table-qualified), the step must write `, cl.<column>`; if the source line is unaliased, write `, <column>`. Mixing the two produces SQL ambiguous-column errors at runtime and will surface in Acceptance Criteria. When one file contains multiple `SELECT` statements with different alias conventions, write the prefix explicitly per step — do not say "append `, total_budget` to the query at line N" without stating the alias.

## C.4 Save the task file

Save to `documentation/tasks/$EPOCH-kebab-case-name.md`. Use `$EPOCH` in the heading (final NNN assigned in §6). Use template below.

---

## C.5 Mechanical review

Run all checks using Grep and Read. Fire Step 1 checks in one parallel batch. Re-read every referenced interface, type, and `.d.ts` file from disk first. Run checks A–AV in parallel, report pass/fail with evidence.

### C.5 check table (A–AV)

Column key:

- **Check** — check id used in logs, scripts, and C.5b/C.5c summaries.
- **Trigger** — "always", "auto-pass if ..." (conditional), or a script invocation.
- **Asserts** — one-line semantic check.
- **Fail hint** — shortest concrete fix.

Checks marked with `†` have additional mechanical grammar below the table (AH directive verbs, AL anchor proximity, AQ deferral patterns, AS fixture simulation sub-rules). Historical evidence for every check lives in `SKILL-drift-catalog.md §Mechanical check — drift catalog`.

| Check      | Trigger                                          | Asserts                                                                                                                                                                                                                               | Fail hint                                                                                                                                                                                             |
| ---------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A**      | always                                           | No ambiguity (`ambiguity-scan.sh` Cat 1–8 + `or` actions + parenthesized hedges) — full banned-phrase list in `SKILL-guardrails.md §No ambiguity`.                                                                                    | Replace hedged wording with the definitive instruction the executor can run without choosing.                                                                                                         |
| **B**      | always                                           | Signature cross-check: class methods match interface source byte-for-byte; optional fields (`?:`) accessed via `?.` + fallback; OPTIONAL FIELD HAZARDS cross-checked.                                                                 | Rewrite the class block to match the interface. Add `?.` + fallback to every optional field access.                                                                                                   |
| **C**      | always                                           | Dependent Types present (Tier 0 verbatim, Tier 1 table, Tier 2 table). No "see task NNN", no empty.                                                                                                                                   | Paste the type inline using the correct tier; delete any "see task NNN" reference.                                                                                                                    |
| **D**      | always                                           | Every step has ≤ 2 methods and exactly 1 file path. Doc steps are not exempt.                                                                                                                                                         | Split the step into one-file-per-step atomic edits.                                                                                                                                                   |
| **E**      | always                                           | Config Changes is either exact diff or "None" (no hedges).                                                                                                                                                                            | Write the literal diff, or "None" with no conditional text.                                                                                                                                           |
| **F**      | always                                           | Every "Create" row's path does NOT exist on disk.                                                                                                                                                                                     | Change the row to "Modify" or pick a different path.                                                                                                                                                  |
| **G**      | always                                           | No cross-task references ("see Task NNN", "defined in task …").                                                                                                                                                                       | Paste the needed content inline; the task must be self-contained.                                                                                                                                     |
| **H**      | always                                           | Every domain-value constructor param uses a branded type from `core/types/`, never raw `string`/`number`.                                                                                                                             | Replace `string`/`number` with the branded type; add the `to<Brand>(raw)` factory call if needed.                                                                                                     |
| **I**      | always                                           | Every `Verify:` line references an artifact that exists by that step; `node -e "... === ..."` uses `assert`.                                                                                                                          | Reorder the step, change the verify command, or switch to `node -e "const assert = require('assert'); assert.strictEqual(...)"`.                                                                      |
| **J**      | always                                           | Every Tests-table row appears in the step instructions and vice versa.                                                                                                                                                                | Add the missing test-case reference to the step, or add the missing row to the Tests table.                                                                                                           |
| **K**      | library API used                                 | External npm library APIs match `.d.ts` (method names, import paths, constructor signatures).                                                                                                                                         | Re-read the `.d.ts`; fix the import path, class name, or signature to match.                                                                                                                          |
| **L**      | composition root                                 | Every `new ClassName(...)` wiring matches the concrete class's actual constructor signature.                                                                                                                                          | Re-read the concrete class source; align param order and types with the actual constructor.                                                                                                           |
| **M**      | always                                           | Single-concern component has ≤ 3 "Create" rows (source + test + one config/migration) unless justified.                                                                                                                               | Reduce file count or add a justification in Architecture Notes naming each extra file.                                                                                                                |
| **N**      | interface / type modified                        | All 14a importers (4 grep patterns: imports, return types, type arguments, variable annotations) + 14c callers appear as "Modify" rows.                                                                                               | Re-run 14a / 14c patterns; add each hit as a Modify row.                                                                                                                                              |
| **O**      | composition root                                 | Conditional dependencies are injected, not eagerly created in bootstrap.                                                                                                                                                              | Refactor bootstrap to accept `additionalProviders?: readonly X[]`; construct in `main()` only.                                                                                                        |
| **P**      | always                                           | Sibling-pattern reuse: (P1) siblings with shared utilities → task imports them; (P2) second-of-kind → extract shared utility; (P3) first-of-kind → SHARED CODE PREDICTION present.                                                    | Use the sibling's factory/utility, or add the extraction Files row and sibling refactor.                                                                                                              |
| **Q**      | pipeline transformer                             | Transformer task has a benchmark verification step.                                                                                                                                                                                   | Add a step that runs the benchmark and asserts the new transformer's effect.                                                                                                                          |
| **R**      | pipeline transformer                             | Safety tests: non-format-specific → one per sensitive type (Python, YAML, JSX); format-specific → one per extension.                                                                                                                  | Add the missing safety test rows to the Tests table.                                                                                                                                                  |
| **S**      | always                                           | Every `.methodName(` / `new ClassName(` in code blocks targeting `shared/src/` project types matches a real source symbol.                                                                                                            | Grep the project source for the exact symbol; fix the name or import path.                                                                                                                            |
| **T**      | migration                                        | NORMALIZATION ANALYSIS present: 1NF, 2NF, 3NF, lookup tables, derivable-column audit.                                                                                                                                                 | Add the missing analysis; extract junction / lookup tables or justify denormalisation.                                                                                                                |
| **U**      | always                                           | Acceptance criteria are achievable: referenced tests exist and would pass, commands don't introduce failing patterns, `all tests pass` cross-refs TEST IMPACT.                                                                        | Rewrite the criterion to reference a concrete artifact; add the affected test to the Files table.                                                                                                     |
| **W**      | CALLER CHAIN present                             | Every chain file is a Modify row with step instructions; closures/wrappers have explicit restructure instructions; chain reaches a system boundary.                                                                                   | Add missing chain files as Modify rows; write restructure instructions for closures.                                                                                                                  |
| **V**      | always                                           | Existing-test compatibility: invalidated assertions → Modify row + update step; quantitative changes → correct new count; ALREADY STALE literals → fixed to post-task value.                                                          | Add the test-file Modify rows, update literals, or register EXCLUDED tests in `pnpm test` with standalone invocation.                                                                                 |
| **X**      | recursive copy                                   | COPY TARGET AUDIT lists all subdirectories and specifies exclusion strategy for non-production content.                                                                                                                               | Enumerate subdirectories with file counts and PRODUCTION/NON-PRODUCTION flags; add the exclusion filter.                                                                                              |
| **X2**     | runtime non-TS asset                             | NON-TS ASSET PIPELINE has build-copies, CI-builds-before-test, and vitest-alias-to-src all YES.                                                                                                                                       | Add the build copy step; reorder CI; alias vitest `src/` — any NO is a fix-in-task.                                                                                                                   |
| **Y**      | new code in existing file                        | Steps reuse existing bindings; no duplicate or shadow bindings; BINDING INVENTORY present.                                                                                                                                            | Replace the derivation with "use existing `<name>` (line N)"; resolve shadow by renaming.                                                                                                             |
| **Z** `†`  | "Modify" changing control flow                   | Architecture Notes has `**Behavior change:**` bullet (old → new → why). Z-extension: nullish-guard steps include an example at value `0`.                                                                                             | Add the bullet with the OLD/NEW/REASON triple; add a `0` example when the guard is `"omit when nullish"`.                                                                                             |
| **AA**     | non-doc task                                     | STALE/UPDATE doc files are Modify rows with Change Specification, or in Follow-up Items with a documentation-writer delegation.                                                                                                       | Add the Modify row with Current/Change/Target, or move to Follow-up Items naming `aic-documentation-writer`.                                                                                          |
| **AB**     | always                                           | No tool-conditional scope (`if knip`, `if lint`) outside code blocks; SPECULATIVE TOOL EXECUTION present; `knip.json` mods list exact entries.                                                                                        | Run the tool during exploration and write the exact scope; never defer scope to executor tool runs.                                                                                                   |
| **AC**     | "Modify" adding code                             | Steps match the file's existing idiom (JSON loading, module system, test framework); no alternatives offered.                                                                                                                         | Pick one idiom matching the file; remove alternative language.                                                                                                                                        |
| **AD**     | grep-based Verify                                | Grep patterns are substrings that would actually appear in the step's real output — file names in diagnostics exist in Files table; patterns aren't vacuous renames.                                                                  | Change the pattern to a substring that appears in the produced file or diagnostic.                                                                                                                    |
| **AE**     | new metric/score/index                           | Each new `*Index`/`*Score`/`*Confidence`/`*Rate`/`*Distance`/`*Probability` name describes what its formula computes.                                                                                                                 | Rename the field or change the formula so name and algorithm match.                                                                                                                                   |
| **AF**     | derived scalar persisted                         | All independent inputs of the persisted derived value are also persisted, OR Architecture Notes declares the derivation lossy and justifies the loss.                                                                                 | Add columns for each input, or add a lossy-derivation justification.                                                                                                                                  |
| **AG**     | Interface/Signature redeclares existing export   | Redeclared signature matches the source file byte-for-byte unless `**Signature change:**` block shows before/after.                                                                                                                   | Re-read the source and correct the declared signature; or add an explicit `**Signature change:**` block.                                                                                              |
| **AH** `†` | every Change Specification                       | Required-change directive is consistent with Current → Target mutation (see directive grammar below).                                                                                                                                 | Rewrite the directive or the target to match. See `SKILL-drift-catalog.md §AH`.                                                                                                                       |
| **AI**     | Step bullet binding values                       | Each target gets exactly one expression per bullet/sentence.                                                                                                                                                                          | Split the bullet, or pick one expression for the target.                                                                                                                                              |
| **AJ**     | numeric slot binding                             | Architecture Notes has `**Unit contract:**` bullet listing every numeric slot with domain and source.                                                                                                                                 | Add the bullet with `<slot> ∈ [<range>] — <source>` per numeric binding.                                                                                                                              |
| **AK**     | Change Spec with delegation placeholder          | `Target text` does NOT contain delegation placeholders (`produced by`, `generated by`, `output of`, `after running`, `TBD`, `resolved during execution`).                                                                             | Inline the resolved literal, cite a resolved file path, or invoke the delegated skill during planning.                                                                                                |
| **AL** `†` | line-number reference in task body               | Every `line N` / `lines N-M` / `at line N` is paired with a grep-unique substring anchor in backticks or quotes. AL-extension: anchor's actual line number is within ±5 of the stated N.                                              | Open the cited file, copy a unique substring from the line, quote it next to the line reference. Re-grep and align N.                                                                                 |
| **AM**     | always                                           | Every atomic clause of `## Goal` is covered by at least one Acceptance Criteria bullet referencing a concrete proof artifact (test name, exported symbol, CLI string, row count, log-line, MCP tool).                                 | Add the missing goal-traceability bullet; generic invariants (`pnpm lint clean`) do not satisfy this.                                                                                                 |
| **AN**     | every `Source:` line                             | Cited path exists on disk; verbatim-quoted blocks match the cited file byte-for-byte; line-range citations match the quoted content. **AN runs before any other check that reads cited content.**                                     | Fix the path, re-copy the exact bytes, or re-cite the correct line range.                                                                                                                             |
| **AO**     | Exploration Report present                       | Every IN-SCOPE exploration finding (CHANGE-PATTERN, BOUNDARY CONTRACT MIRRORS, CONSUMER, CALLER CHAIN, TEST IMPACT, BEHAVIOR CHANGES, OPTIONAL FIELD HAZARDS) has a Files row / Step / Architecture Note / Follow-up entry.           | Add the missing row, bullet, or follow-up entry.                                                                                                                                                      |
| **AP**     | `Depends on:` / `Prerequisite:` header           | Every referenced task file exists, Status is compatible, no cycles.                                                                                                                                                                   | Fix the reference, wait for the prerequisite, or remove the dependency.                                                                                                                               |
| **AQ** `†` | always (`deferral-probe.sh`)                     | Every hardcoded `null`/`false`/`0`/`""`/`''`/`[]`/`undefined`/`None` binding to a task-introduced field has a named successor in `## Follow-up Items` OR a permanent-value justification OR a Change Spec that populates it non-null. | Add `## Follow-up Items` entry naming the successor task, or add `remains null`/`stays null` wording in Architecture Notes.                                                                           |
| **AR**     | always (`followup-propagation-check.sh`)         | Every field advertised against the current task by another task's `## Follow-up Items` is mentioned somewhere in this task file.                                                                                                      | Expand scope to cover the field, or edit the originating task's Follow-up Items to name a different successor. **Namespace note:** `AR` in `validate-task.sh` = documentation routing (HARD RULE 24). |
| **AS** `†` | BEHAVIOR CHANGES has ≥ 1 entry                   | Exploration Report's `FIXTURE SIMULATION` field complete (see sub-rules 1–5 below).                                                                                                                                                   | Add the missing Files rows / Architecture Notes bullet / Follow-up entry per the failing sub-rule.                                                                                                    |
| **AT**     | always (`validate-task.sh`)                      | Files-table row count ≤ 10 (HARD RULE 6). A "File-count note" rationale does NOT exempt.                                                                                                                                              | Split into multiple tasks (usually persistence/migration vs consumer/read-path with `Depends on:`).                                                                                                   |
| **AU**     | always (`validate-task.sh`)                      | Per step: distinct source paths ≤ 1; distinct `line N` anchors ≤ 3.                                                                                                                                                                   | Split the step into one-file-per-step atomic edits.                                                                                                                                                   |
| **AV**     | "Modify" `.ts` under `shared/src/` or `mcp/src/` | Sibling `<dir>/__tests__/<basename>.test.ts` or `<dir>/<basename>.test.ts` (if on disk) is mentioned in the task file (Files row, Architecture Note, Follow-up, `**Auto-ratcheting artifacts:**`, or `**Test-surface excluded:**`).   | Add the sibling test as a Modify row, or add a `**Test-surface excluded:**` bullet naming the path and reason.                                                                                        |
| **AW**     | exported type or runtime contract shape changed  | Every `IN SCOPE` row in `BOUNDARY CONTRACT MIRRORS` has a Files-table Modify row and step instructions; every `COMPATIBLE` row cites evidence; every `FOLLOW-UP` row names a successor.                                               | Grep changed field names, sibling field names, and boundary terms; add missing schema/validator/descriptor/test rows or evidence.                                                                     |

### `†` Mechanical-grammar annexes

**AH directive grammar.** For each Change Specification, parse `Current text`, `Required change`, and `Target text`. The directive verb must be consistent with the Current → Target mutation:

- `insert X between A and B` → Target contains `A…X…B` (in order); Current contains `A…B` adjacently.
- `replace X with Y` → Current contains X; Target does not contain X; Target contains Y.
- `append X after Y` / `add X after Y` → Target's Y is immediately followed by X.
- `prepend X before Y` / `add X before Y` → mirror of append.
- `increment N to M` / `update count from N to M` → Target has M at the same syntactic position Current had N.
- `remove X` → Current contains X; Target does not.

**AL-extension anchor proximity.** After locating the anchor text in the step, Grep the cited source file for the anchor substring and record the matching line number. If the actual match is more than 5 lines away from the stated `line N`, fail — the anchor exists but the line number is misleading.

**AQ deferral patterns.** `deferral-probe.sh` scans Step bodies (outside fenced code blocks and `## Architecture Notes`) for `` `<field>` → `null` ``, `` `<field>` → `false` ``, `` `<field>` → `0` ``, `` `<field>` → `undefined` ``, `` `<field>` → `None` ``, `` `<field>` → "" ``, `` `<field>` → '' ``, or `` `<field>` → [] `` (and the colon-separated variant). Each hit must satisfy one of:

- `## Follow-up Items` section mentions the field AND names a successor task (`(task|Task) NNN`, `pending/NNN-*`, or `documentation/tasks/NNN-*`);
- a sentence in `## Architecture Notes` or `## Goal` names the field and states it `remains null` / `stays null` / `always null` / `permanently null` / `never populated`;
- a `## Change Specification` block whose Target text populates the field non-null within the same task.

**AS fixture-simulation sub-rules.** Read the Exploration Report's `FIXTURE SIMULATION` field. Fail if any of:

1. `BEHAVIOR CHANGES` has ≥ 1 entry but `FIXTURE SIMULATION` is missing, empty, or reads "No fixture simulation required".
2. `Importers simulated:` is empty or omits integration tests — grep `shared/src/integration/__tests__/**` and `test/benchmarks/**` independently; every hit must appear.
3. Any `ASSERTION FLIPS` fixture's test file path is NOT a Files-table Modify row.
4. Any `AUTO-RATCHET` fixture's path is NOT listed verbatim under `**Auto-ratcheting artifacts:**` in `## Architecture Notes` (executor `§5c` whitelist matches byte-for-byte).
5. Any `FIXTURE BLOCKED — latent bug` without a resolution path: (a) bug fix in current task, (b) successor task NNN in Follow-up Items, or (c) justified workaround in Architecture Notes with the workaround's scope described literally.

**Step 1 wrapper (mandatory invocation — single entry point).** Do NOT run the individual sub-scripts as the final gate. Invoke the wrapper once:

```
bash .claude/skills/shared/scripts/planner-gate.sh <task-file>
```

The wrapper runs every sub-gate in parallel, emits ordered per-gate pass/fail output, and appends a `{ "gate": "planner-gate", "status": "ok"|"fail", "target": "<abs-path>" }` record to `.aic/gate-log.jsonl`. Per-sub-gate coverage (which script enforces which check) is canonically listed in `SKILL.md` Output checklist — do not re-list it here; any drift between the two lists is a bug.

`checkpoint-log.sh` reads `.aic/gate-log.jsonl` and refuses `aic-task-planner task-finalized` unless a `planner-gate` ok record matching the current task file exists within the last 30 minutes (matching is task-scoped when `CHECKPOINT_TASK_FILE` is exported on the emission — always export it; see §6 step 7). Emergency bypass `CHECKPOINT_ALLOW_NO_GATE=1` leaves an audit trail. Individual sub-scripts may be run during iteration for faster feedback, but the wrapper is the only accepted gate before §6 finalize.

**Step 2: Score rubric.** 0 (fail) or 1 (pass) per check in the C.5 check table above. Conditional checks auto-pass when their trigger is unmet. Report the full table with pass/fail + one-line evidence per check.

**Check-id namespace note:** `AR` in this rubric = successor-contract closure (`followup-propagation-check.sh`). `AR` in `validate-task.sh` = documentation routing. Keep both references explicit when reporting failures.

**Run order constraint (AN first).** AN must run and pass before any other check that reads cited content. Re-running downstream checks against hallucinated sources wastes work — fix citations first, then re-run the full rubric.

## C.5b / C.5c / C.5d — parallel verification (MANDATORY batching)

After C.5 passes 100%, **dispatch C.5b, C.5c, and — when triggered — C.5d in a single parallel batch** (one message, multiple `Task` tool calls). They have disjoint, independently-designed inputs — C.5b gets the exploration report, C.5c explicitly does NOT, C.5d explicitly does NOT read the task file — so they cannot interact. Wait for all to return, union their findings, then act.

Do NOT run them serially. Serial dispatch was the previous pattern and was the single largest wall-clock cost in Pass 2; it is now a hard regression. The only exception is if C.5d's trigger is not met (skip it entirely — see its own section).

### Dispatch pattern (concrete template)

Issue one assistant message containing either two or three `Task` tool calls in the same tool-use block (two if C.5d's trigger is not met, three if it is). Example shape:

```
Message to user agent (single turn):
  Task(subagent_type="generalPurpose", description="C.5b independent verification",
       prompt="<C.5b role + inputs + checks + critic prompt if critic_required>")
  Task(subagent_type="generalPurpose", description="C.5c codebase verification",
       prompt="<C.5c role + inputs + convention/dependency probes>")
  # Only if C.5d's complexity trigger fires:
  Task(subagent_type="generalPurpose", description="C.5d adversarial re-planning",
       prompt="<C.5d role + inputs + goal-derivation instructions>")
```

A serial sequence of three `Task` calls across three messages is the regression this section blocks. If you catch yourself writing the second subagent call only after the first subagent returns, stop and re-issue them in one batch.

### Critic dispatch (HARD RULE 26 — mechanical, no LLM judgement)

Before rendering the C.5b prompt, read the latest `"gate":"architectural-invariants"` record in `.aic/gate-log.jsonl` (appended by `planner-gate.sh` in C.5 Step 1):

```
grep -F '"gate":"architectural-invariants"' .aic/gate-log.jsonl | tail -1
```

Inspect the record's `critic_required` field:

- `true` → the C.5b prompt MUST render `.claude/skills/shared/prompts/critic-measurement-consistency.md` as an additional critic prompt attached to the C.5b subagent, and the critic's HARD findings block `task-finalized` the same way other C.5b findings do.
- `false` → the C.5b prompt MUST NOT render the critic prompt.

No other input influences this choice — not the task's recipe, not your own estimate of complexity. The mechanical flag in the gate record is authoritative. Inverting it (rendering the critic when `false`, or skipping it when `true`) is a HARD RULE 26 violation.

Handling findings from the parallel batch:

- Union all findings first (no interleaving of fix cycles).
- For each genuine finding, fix the root cause, re-run the corresponding C.5 rubric check, and re-spawn **only the verification stage whose finding triggered the fix** (not all three). Do not re-run a stage that already returned PASS.
- The circuit breaker in §C.6 counts re-runs across stages — three failures of the same check id across any combination of C.5/C.5b/C.5c/C.5d is still the soft cap.

## C.5b Independent verification agent

Spawn a `generalPurpose` subagent with:

1. **Role:** "Independent task-file reviewer. No prior context. Find factual errors by cross-checking against source files and the exploration report."
2. **Inputs:** Task file path + every referenced source file path (interfaces, types, migrations, `.d.ts`, modified files) + the Exploration Report (as a read-only appendix for evidence comparison — the reviewer checks task claims against this primary evidence but does not anchor on exploration framing).
3. **Checks** (report FOUND/NOT_FOUND, MATCH/MISMATCH, COMPATIBLE/INVALIDATED):
   - API calls: extract `.methodName(`/`new ClassName(` → Grep interface/`.d.ts`
   - SQL columns: verify against migration `CREATE TABLE`
   - SQL normalization: 1NF, 2NF, 3NF, lookup tables
   - File paths: Glob every "Modify" row → EXISTS/DOES NOT EXIST
   - Signature match: class methods vs interface source
   - Acceptance criteria vs test assertions
   - Test assertion ground-truth: literals vs actual source → CORRECT/STALE
   - Test runner wiring: IN TEST SUITE/EXCLUDED
   - Coverage completeness: CHANGE-PATTERN INSTANCES → in Files table
   - Boundary-contract mirror completeness (AW): IN SCOPE schemas, validators, descriptors, structured-output tests, parser tests, and manual payload mirrors → in Files table; COMPATIBLE rows cite evidence; FOLLOW-UP rows name a successor.
   - Test impact completeness: invalidated tests → in Files table
   - Caller chain completeness: chain files → in Files table
   - Copy target audit, binding reuse, behavior change completeness, doc impact completeness
   - **Metric naming coherence** (AE): for every new field whose name implies a semantic (`*Index`, `*Score`, `*Confidence`, `*Rate`, `*Distance`, `*Probability`, etc.), read the formula and state whether the formula computes what the name describes. If not, report MISMATCH with a proposed rename or formula change.
   - **Derived metric input persistence** (AF): for every derived value persisted to storage, enumerate its independent inputs and verify each is also persisted OR the task justifies the loss.
   - **Verify pattern matchability** (AD): for every grep-based `Verify:` line, assert that the pattern could match real output. Flag vacuous greps (pattern never appears in any produced file or diagnostic).
   - **Pattern-claim verification** (AG-companion): whenever the task prose claims "mirroring `<path>` style", "follows the pattern in `<path>`", or equivalent imitation language, Read the cited pattern file and enumerate structural features (export shape — `z.object()` vs shape-object-with-`as const`; factory signature; parameter order; default-value conventions; return-type wrapper). Compare byte-for-byte. Any divergent structural feature = MISMATCH, report per-feature. See `SKILL-drift-catalog.md §C.5b Pattern-claim verification`.
   - **Predecessor-contract check** (mandatory — `Depends on:` / `Prerequisite:` header): Read every prerequisite task's `## Interface / Signature`, `## Step` bodies, and `## Architecture Notes`. Enumerate output contracts (column names + nullability, enum values, interface methods, schema fields, config keys, null-vs-zero semantics, default-value semantics). For each, Grep the current task for consistent consumption — the task must not construct input that violates declared nullability, read a column the predecessor did not write, assume a non-null value when the predecessor writes null, or assume an enum value the predecessor did not define. Each mismatch = INVALIDATED with the predecessor line cited. See `SKILL-drift-catalog.md §HARD RULE 20`.
   - **Synthesis-vs-exploration check:** Compare each Step and Architecture Note against the Exploration Report. Flag: steps that overstate exploration evidence (e.g., exploration said "uncertain" but step treats as established), steps that omit explored edge cases or caveats, and facts referenced in steps that do not appear in the exploration report.
4. **Output:** Structured findings list. Summary: "PASS — all N confirmed" or "FAIL — M of N errors" with specifics.

**FAIL:** Fix root cause, re-run corresponding C.5 check. Re-spawn only C.5b (not C.5c/d) unless the same fix plausibly invalidates their findings. Do NOT proceed until this stage returns PASS.
**PASS:** Contributes one third of the parallel batch result; proceed to C.6 only when C.5c and C.5d (if triggered) have also returned PASS.

## C.5c Independent Codebase Verification

Dispatched **in parallel with C.5b** (see `## C.5b / C.5c / C.5d` above). Spawn a `generalPurpose` subagent with task file path, project root, `.cursor/rules/aic-architect.mdc`. Do NOT provide exploration report.

**Category 1 — Dependency probes** ("Modify" rows with signature changes):

1. `MISSING_CALLER` — callers of changed functions not in Files table
2. `MISSING_CONSUMER` — **any file that uses the modified interface/type** not in Files table. Re-run all four 14a grep patterns independently (imports, return-type annotations, type arguments, variable/parameter annotations) against the entire workspace (`shared/src/`, `mcp/src/`, `integrations/`) without reading the task file or exploration report. Every hit that constructs or returns the type must appear in the Files table when the type's required-field shape changed.
3. `MISSING_INTERMEDIARY` — intermediaries needing signature changes
4. `CLOSURE_BREAK` — zero-arg closures wrapping functions gaining params
5. `MISSING_BOUNDARY_MIRROR` — changed runtime contract field appears beside sibling fields in schema/validator/descriptor/structured-output files not in Files table. Grep changed field names, sibling field names, and boundary terms (`z.object`, `outputSchema`, `structuredContent`, `JSON.stringify`, `schema`, `validator`, `payload`, `registerTool`, `descriptor`) independently of the task file.

**Category 2 — Convention probes** ("Create" rows): 6. `NAMING` — kebab-case, `*.interface.ts`, `*.test.ts` 7. `LAYER` — correct directory for declared layer 8. `ISP` — interface methods ≤ 5 9. `MIGRATION`/`DDL` — storage class → migration required 10. `WIRING` — new implementor → wire in `mcp/src/server.ts` 11. `BOUNDARY` — no hexagonal violations 12. `BRANDED` — domain-value params use branded types 13. `UNTESTED` — new class/function → test case in Tests table 14. `DIR_IMPACT` — test files with count assertions on affected dirs 15. `STALE_ASSERTION` — hardcoded counts vs actual disk state 16. `TEST_EXCLUDED` — test files not in `pnpm test` 17. `BUNDLE_TESTS` — recursive copy sources with test files 18. `REDUNDANT_BINDING`/`SHADOW_BINDING` — binding conflicts 19. `MISSING_ASSET_COPY`/`CI_NO_BUILD`/`VITEST_ALIAS_STALE` — non-TS asset pipeline

**Output:** `SUMMARY: PASS (0 findings) | FAIL (N dependency + M convention findings)`

**FAIL:** Fix genuine findings (add to Files table + Steps), document false positives. Re-run C.5 for any rubric check the finding invalidates, then re-spawn C.5c.
**PASS:** Contributes one third of the parallel batch result; proceed to C.6 only when C.5b and C.5d (if triggered) have also returned PASS.

## C.5d Adversarial Re-planning (complexity-gated)

**Trigger (any one):** Files table spans 3+ distinct source directories | 3+ exported signatures change | composition root "Modify" + 2+ other directories modified. None met → skip entirely; do NOT spawn.

**When triggered:** Dispatched **in parallel with C.5b and C.5c** (see `## C.5b / C.5c / C.5d` above). Spawn `generalPurpose` subagent with component goal, project root, `project-plan.md`, `implementation-spec.md`, `.cursor/rules/aic-architect.mdc`. Instruction: "Independent planner — derive Files table from goal and codebase. Do NOT read existing task files."

**Compare:** Both lists = confirmed. Shadow-only = investigate (genuine miss → add). Planner-only = verify justification. Re-run C.5 for changes. No discrepancies → C.6.

## C.5e Handoff accounting

After each verification stage completes (C.5b, C.5c, C.5d), produce a one-line structured summary before proceeding:

- "C.5b: [N] findings ([M] MISMATCH, [K] NOT_FOUND, [J] INVALIDATED). Synthesis-vs-exploration issues: [count]."
- "C.5c: [N] findings ([M] dependency, [K] convention). Overlap with C.5b: [count] shared root causes."
- "C.5d: [N] discrepancies ([M] shadow-only, [K] planner-only). [J] confirmed."

If C.5b and C.5c both flag the same file or interface, note the overlap — shared findings have higher confidence than single-stage findings.

## C.6 Score and act

**Pipeline order:** C.5 → { C.5b ∥ C.5c ∥ C.5d (if triggered) } — the three verification subagents run in parallel after C.5 passes. Each must individually return PASS before §6 runs; fixes propagate back into C.5 rubric checks as in each subagent's own FAIL handling. Later-stage findings feed back into earlier checks.

1. Fix every failing check. Re-run that check to confirm. Iterate until stage passes.
2. N/A only when check's precondition is structurally unmet (e.g. "Wiring accuracy" for non-composition-root). Never N/A to avoid work.
3. **Proceed to §6 immediately** when all stages PASS. Do NOT stop or wait — §6 is mandatory.

### Circuit breaker — re-run budget

Verification loops must terminate. Maintain a per-check counter `attempts[check_id]`. Increment on every re-run of the same check.

- **Soft cap (3 attempts):** If the same check has failed 3 times and is about to be re-run a 4th time, STOP. Do not iterate further. Produce a HALT report containing: (a) the check id (e.g., `AG`, `AN`, `C.5b-predecessor-contract`), (b) the exact failure message across attempts, (c) the diffs applied between attempts, and (d) a hypothesis section naming the root cause — likely one of: ambiguous exploration evidence, predecessor-task contract conflict, architectural premise that is wrong, or a rule that does not fit the task. Escalate to the user with this report and wait for direction. **Never silently mark the check "N/A" to bypass it.**
- **Hard cap (5 attempts total across all checks):** If the task file has undergone 5 full C.5 re-runs without all checks passing, STOP and escalate regardless of which checks are failing. The correct action may be to split the task, change the chosen recipe, or invoke `SKILL-phase-1-recommend` again with new user input. Continuing wastes tokens and usually produces compounding errors.
- **Reset rule:** Counters reset only after the planner ships the task file (§6). They do not reset across stages — C.5 failing twice then C.5b failing twice counts as 4 total attempts toward the hard cap.

The breaker is mandatory. A task that cannot pass verification within the budget is a signal to re-plan, not to retry.

---

## §6. Finalize and offer execution (MANDATORY — never skip)

Task files are gitignored — finalization copies from worktree to main workspace. After verification passes:

1. **Assign sequential task number (NNN).** NOT the epoch value. From **main workspace root**, scan `documentation/tasks/` and `documentation/tasks/done/` for highest existing number:

   ```
   { ls documentation/tasks/ 2>/dev/null; ls documentation/tasks/done/ 2>/dev/null; } | grep -oE '^[0-9]+' | awk 'length <= 4' | sort -rn | head -1
   ```

   Add 1 to result. Zero-pad to 3 digits if under 100. No files → start at `001`. **Guard:** NNN > 9999 or 10+ digits = you used the epoch — redo.

2. **Update heading in worktree file.** Use StrReplace on the worktree task file to change the `# Task $EPOCH:` heading to `# Task NNN:`.

3. **Copy the task file to the main workspace. One command — do NOT split:**

   ```
   cp <worktree>/documentation/tasks/$EPOCH-name.md <main-workspace>/documentation/tasks/NNN-name.md
   ```

   Use absolute paths. Confirm the file exists on main afterwards (`ls <main-workspace>/documentation/tasks/NNN-name.md`) before proceeding to step 4 — the worktree is about to be deleted, so if the copy failed the task file is lost.

4. **Remove the worktree, branch, and stale metadata via the shared script (MANDATORY — non-negotiable).** Always run from the **main workspace root**:

   ```
   bash .claude/skills/shared/scripts/cleanup-worktree.sh remove \
        <main-workspace>/.git-worktrees/plan-$EPOCH
   ```

   The script removes the directory, prunes `git worktree` metadata, deletes the `plan/$EPOCH` branch, removes the parent `.git-worktrees/` if empty, and **verifies all three are gone**. It exits 0 on success and 1 if any residue remains — treat exit 1 as a HARD STOP and report to the user with the script's stderr.

   Do NOT invent your own `rm -rf` / `git worktree prune` / `git branch -D` sequence — past agents have missed a step or skipped verification, leaving orphan directories behind. The script is the single source of truth.

5. **Announce:** "Task saved to `documentation/tasks/NNN-name.md`. Score: N/M (X%). Use the @aic-task-executor skill to execute it."

6. **Final sweep (MANDATORY — last shell command in the session).** Editors may recreate directory stubs for files they were tracking, and prior interrupted runs may still have orphans elsewhere in `.git-worktrees/`. Run the idempotent sweep after the announcement:

   ```
   bash .claude/skills/shared/scripts/cleanup-worktree.sh sweep
   ```

   Script exit 0 means no orphans remain. Exit 1 means a directory could not be removed — stop and report, do not claim the task is finalized.

7. **Emit the `task-finalized` checkpoint.** Run this exactly — substitute `<abs-task-file>` with the absolute path to the task file you just placed in the main workspace (the `<main-workspace>/documentation/tasks/NNN-name.md` from step 3). **Always export `CHECKPOINT_TASK_FILE`** — the variable makes `checkpoint-log.sh` verify that the most recent `planner-gate` success targeted this specific task file, not just any recent task file:

   ```
   echo "CHECKPOINT: aic-task-planner/task-finalized — complete"
   CHECKPOINT_TASK_FILE=<abs-task-file> \
     bash .claude/skills/shared/scripts/checkpoint-log.sh \
     aic-task-planner task-finalized <abs-task-file>
   ```

   `CHECKPOINT_TASK_FILE` must point to an absolute path of a real file (use the main-workspace path from step 3, never the worktree path which was just deleted in step 4). Without the env var the gate falls back to recency-only enforcement and a stale or unrelated `planner-gate` success for a different task can satisfy this checkpoint — a concurrent-agent / replanning hazard. `checkpoint-log.sh` also rejects with exit 3 if fewer than 5 seconds have elapsed since the last `exploration-complete`; do not batch.

---

## Task File Template

**Recipe variations:** release-pipeline → replace Interface/Signature + Dependent Types with "Publish specification" (see SKILL-recipes.md). fix/patch (behavioral only) → replace Interface/Signature with "Behavior Change" section (Before/After format showing exact inputs, old output, new output), omit Dependent Types if unchanged. fix/patch (signature change) → keep Interface/Signature with before/after signatures. All fix/patch tasks must include a "Behavior Change" section with **Before:** and **After:** descriptions showing the same inputs producing different outputs.

````markdown
# Task NNN: [Component Name]

> **Status:** Pending
> **Phase:** [from progress file]
> **Layer:** [core | pipeline | storage | adapter | mcp | cli]
> **Depends on:** [list of components that must be Done]
> **Research:** [path to research doc if one was produced, otherwise omit this line entirely]

## Goal

[One sentence: what this task produces and why.]

## Architecture Notes

- [2–3 bullets: which ADRs apply, layer rules, DI requirements]
- [Reference specific rules, e.g. "ADR-007: UUIDv7 for all IDs"]
- [Record key design decisions from Pass 1]
- **Unit contract:** [MANDATORY if the task binds any numeric value to a named slot (DB column, interface field, config key, wire-format field, JSON response key). Omit entirely if no numeric bindings exist.]
  - `<slot_name>` ∈ [<range>] — [source expression or file:line citation]
  - `<slot_name>` in <units> — [source expression or file:line citation]
- **Predecessor contracts:** [MANDATORY when `Depends on:` lists a task and the current task consumes its outputs. List each consumed contract: column name + nullability, enum value, interface method signature, config key type, null-vs-zero semantics. Omit if no `Depends on:` or no consumed outputs.]
  - `<contract>` from Task NNN — [exact semantics, e.g. "writes `NULL` until Task M populates the classifier"]

## Files

| Action | Path                                      |
| ------ | ----------------------------------------- |
| Create | `exact/path/to/file.ts`                   |
| Create | `exact/path/to/__tests__/file.test.ts`    |
| Modify | `exact/path/to/existing.ts` (what change) |

## Interface / Signature

```typescript
// Interface copied verbatim from core (with imports)
```

```typescript
// Class declaration, constructor with all parameters, every method signature
// Return types MUST match interface
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// Full type definition, copied byte-for-byte from the CURRENT source file.
// Only types the component directly calls methods on or constructs inline.
// When the type itself changes in this task, split into two labeled blocks:
//   ### Tier 0 — verbatim (current)   ← current-state literal
//   ### Tier 0 — target (after task)  ← post-change literal
// Never label a modified after-state block as "verbatim" — AG (existing-
// symbol signature fidelity) checks against the current source, and a
// mislabeled after-state will fail AG on perfectly valid content.
```

### Tier 1 — signature + path

| Type       | Path              | Members | Purpose                         |
| ---------- | ----------------- | ------- | ------------------------------- |
| `TypeName` | `path/to/file.ts` | N       | methodA, methodB + props: propC |

### Tier 2 — path-only

| Type       | Path              | Factory          |
| ---------- | ----------------- | ---------------- |
| `TypeName` | `path/to/file.ts` | `factoryFn(raw)` |

## Config Changes

- **Root `package.json`:** [exact change or "no change"]
- **`shared/package.json`:** [exact change or "no change"]
- **`mcp/package.json`:** [exact change or "no change"]
- **eslint.config.mjs:** [exact config block or "no change"]

## Steps

### Step 1: [action]

[What to do, with exact code if needed]

**Verify:** [actionable verification]

### Step N: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description        | Mock / assert contract                                                                                                                                                                        |
| --------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [name]    | [what it verifies] | [exact mocks (`Clock` → ISO literal, injected store → inline seed), precise assertion (`expect(result.x).toEqual(<literal>)`), any `vi.spyOn(process, "exit")` / `vi.waitFor` pattern needed] |

The **Mock / assert contract** column is mandatory for every row. It carries forward the TEST STRATEGY block from the Exploration Report — never drop to "see step N" or a one-line description. If a test requires no mocks, write `no mocks; <exact assertion literal>`.

## Acceptance Criteria

Every atomic clause of `## Goal` must map to at least one task-specific bullet below — referencing a Tests-table row, a new exported symbol, a specific CLI output string, a JSON field, or a file path. The generic invariants at the end of this list do NOT satisfy goal traceability; they are codebase invariants that every task must already uphold.

**Goal-traceability bullets (MANDATORY — one per Goal clause):**

- [ ] [Goal clause 1 proof: e.g. "Test `persistsSnapshotOnSuccess` asserts the `quality_snapshots` row is inserted with `tokenReductionRatio` equal to `result.meta.tokenReductionPct`"]
- [ ] [Goal clause 2 proof: e.g. "the changed tool/API/CLI entry point is registered at the boundary and returns the exact field or string fixed in Architecture Notes for the named input"]

**Generic invariants (every task inherits these — never the only bullets):**

- [ ] All files created per Files table
- [ ] Interface matches signature exactly
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` outside allowed files
- [ ] No `let` in production code (only `const`; control flags in imperative closures are the sole exception)
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
````
