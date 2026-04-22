# Architectural-invariants reference

Authoritative list of the 8 defect-class triggers enforced by `architectural-invariants.sh`. Planner and executor cite this file; they do not re-derive rules from memory.

## Scope disclaimer

This gate catches **8 named defect patterns**. It is NOT a measurement-correctness guarantee. New measurement-bug shapes that do not match one of these 8 triggers pass the gate silently — a new trigger or a new critic is required to catch them. Do not treat a clean gate as proof the task has no measurement defects.

## The 8 triggers

Each trigger has three parts: precondition (what makes it fire), required bullet (what the planner must add), and optional exemption (when the bullet is not required).

### DRY-01 — constants reuse

- **Precondition:** task text contains any numeric literal matching `\b\d{1,3}(_\d{3})+\b` (underscore-separated) OR `\b\d{6,}\b` (bare 6+ digit).
- **Required bullet:** `**Source-of-truth probe:**` — names the single module that owns each constant, or declares the task creates that module.
- **Exemption:** none — add the bullet even if short (`"one-off at <file:line>; no reuse expected"`).

### SRP-01 — display-layer compute

- **Precondition:** `## Files` Modify row on `mcp/src/format-*.ts`, `mcp/src/diagnostic-*.ts`, or `*-formatter.ts` AND `## Steps` contain arithmetic verbs (`divide | multiply | percentage of | ratio of | sum of | total of | compute | derive | accumulate | reduce | aggregate | subtract | average | mean | count of | min of | max of`) or arithmetic operators on two numeric literals.
- **Required bullet:** `**Computation source:**` — names the upstream module that computes the metric; the formatter reads the result verbatim.
- **Exemption:** `test-fixture-only`.

### LABEL-01 — label/formula alignment

- **Precondition:** same formatter file pattern as SRP-01 AND `## Steps` contain a user-visible string (quoted text containing `%`, or the tokens `hero-line | label | string | CLI output | report line | status line`).
- **Required bullet:** `**Label-formula alignment:**` followed by a table with columns `label-fragment | formula | denominator | unit`.
- **Exemption:** `test-fixture-only`, `docstring-reference`.

### BRAND-01 — brand invariant cite

- **Precondition:** task text mentions any type declared in `shared/src/core/types/` via `export type <Name> = Brand<`.
- **Required bullet:** `**Brand invariant cite:**` — quotes byte-for-byte the single-line `//` comment that sits directly above the matching declaration.
- **Exemption:** `mention-only`, `test-fixture-only`, `docstring-reference`, `interface-signature-only`.

### DIP-01 — new outside composition root

- **Precondition:** any fenced code block contains `new <PascalCase>(` AND `## Files` does not Modify `mcp/src/server.ts`.
- **Required bullet:** `**DIP exception:**` — names the `server.ts` call site by line number or exported function name, or explains why the construction is legitimately outside the root.
- **Exemption:** `test-fixture-only`.

### OCP-01 — pipeline class mutation

- **Precondition:** `## Files` Modify row on `shared/src/pipeline/*.ts` excluding `__tests__/` and `*.interface.ts` AND the first non-empty line of `## Goal` does not start with `Add`, `Introduce`, or `Create`.
- **Required bullet:** `**OCP exception:**` — contains at least one of: `single-line | regex | enum literal | string constant | type narrowing | null check | no new polymorphism | callers unchanged | signature unchanged`.
- **Exemption:** none — if the change is genuinely additive, rephrase the Goal with `Add/Introduce/Create`.

### SCOPE-01 — query scope

- **Precondition:** `## Files` Modify row on `shared/src/storage/*.ts` excluding tests AND `## Steps` contain `SELECT | INSERT INTO | UPDATE | DELETE FROM`.
- **Required bullet:** `**Query scope:**` — states exactly one of: `project-scoped (WHERE project_id = ?)`, `global`, or `session`.
- **Exemption:** `test-fixture-only`.

### PERSIST-01 — persisted/displayed parity

- **Precondition:** `## Files` table contains BOTH a formatter file (SRP-01 pattern) AND a storage/migration file (`shared/src/storage/migrations/*.ts`, `shared/src/storage/*-store.ts`, or `shared/src/storage/*-snapshot*.ts`).
- **Required bullet:** `**Persistence-display parity:**` naming a single exported function both sides import, OR `**Recompute-from-log note:**` naming a migration step that rewrites historical rows from `compilation_log`.
- **Exemption:** `test-fixture-only`.

## Exemption grammar

Format: `**Gate-exempt:** <CHECK-ID>: <reason>`

- `<CHECK-ID>` must be one of `DRY-01 | SRP-01 | LABEL-01 | BRAND-01 | DIP-01 | OCP-01 | SCOPE-01 | PERSIST-01`.
- `<reason>` must be one of `mention-only | test-fixture-only | docstring-reference | interface-signature-only`.
- Trailing text after `<reason>` is allowed and is reviewed by the measurement-consistency critic (SOFT). Use it for the one-line justification of why the exemption applies.

Any other wording — unknown check-id, unknown reason, reason not in the per-check allowlist — fails the gate with a grammar error.

## Mechanical critic dispatch

The script appends to `.aic/gate-log.jsonl` on every run:

```
{"gate":"architectural-invariants","target":"<path>","status":"ok|fail",
 "triggers_fired":[...],"missing_bullets":[...],"exempted":[...],
 "critic_required":true|false}
```

The `critic_required` field is `true` whenever `triggers_fired` is non-empty. Planner and executor read this field directly — no LLM decision about dispatch. If `true`, render `.claude/skills/shared/prompts/critic-measurement-consistency.md` via the independent-verification subagent. If `false`, do not. The critic prompt internally gates each of its 8 checks on the specific trigger being present in `triggers_fired`, so a cheap early-exit still holds when only one trigger fires.

## What the gate does NOT cover

- Numeric literals below 6 digits with no underscore separator, including values like `30000` — these may be local timeouts, counts, or ports that do not need deduplication.
- Measurement bugs in files outside the matched formatter, storage, and pipeline globs — a bug in `mcp/src/handlers/` or `mcp/src/schemas/` or `integrations/` passes the gate cleanly.
- Semantic correctness of the bullet content — that is the measurement-consistency critic's job.
- Correctness of the underlying source code — ESLint and the type-checker do that.

When a defect shape appears that these 8 checks miss, add a new trigger + a new bullet + a new fixture under `__tests__/fixtures/`. Do not widen an existing check to cover unrelated patterns.
