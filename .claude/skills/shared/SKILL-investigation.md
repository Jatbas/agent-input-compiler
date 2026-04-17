# Shared Investigation Protocols

Single source of truth for runtime verification and codebase investigation depth. All AIC skills reference this file instead of duplicating these protocols. When improving a check, update it here — every skill benefits automatically.

## How skills use this file

- **Planner** (§0b): reads and applies the Runtime Evidence Checklist during analysis-only requests and Pass 1 exploration.
- **Executor** (§2.5): reads and applies the Runtime Evidence Checklist to verify task assumptions before implementing.
- **Researcher** (§3a): reads both sections and includes them in explorer prompts when spawning runtime-evidence and codebase-investigation subagents.
- **Documentation-writer** (Phase 1a pre-read): reads both sections; injects Runtime Evidence Checklist into Explorer 1 and Critic 2 prompts for runtime behavior claims, and Codebase Investigation Depth into any explorer prompt that traces code paths.

When a skill spawns subagents, the parent agent reads this file and includes the relevant content in the subagent's prompt. Subagents do not need to read this file separately.

---

## Runtime Evidence Checklist

When investigating claims about runtime behavior, collect actual evidence for each applicable item. Do not assume state — verify it.

- **Database state:** Query `~/.aic/aic.sqlite` for relevant rows, counts, and column values. Show concrete data. Do not assume what the database contains.
- **Deployed files:** Read actual deployed copies (e.g., `.cursor/hooks/`, `.claude/hooks/`), not just source files in `integrations/`. Diff source vs deployed to catch stale deployment.
- **Bootstrap/lifecycle:** Trace the actual code path (e.g., `runEditorBootstrapIfNeeded`, `oninitialized`) and read the relevant functions. Do not assume bootstrap behavior from documentation alone.
- **Cache and file system state:** Read actual cache files (e.g., `.aic/.claude-session-model`) and check file system state (permissions, symlinks, directory structure).
- **Documentation cross-check:** Check `documentation/` for docs that describe the mechanism under investigation. Compare doc claims against code evidence. Report discrepancies.
- **External system behavior:** When depending on what an external system sends (Cursor stdin payload, MCP client capabilities, editor settings), inspect actual runtime data (database rows, cache files) rather than relying on documentation or assumptions.
- **External API/library shapes:** Read actual `.d.ts` files under `node_modules/`, not documentation or memory. Report exact method signatures.

**Precedence rule:** Runtime evidence (database rows, deployed files, actual code paths) takes precedence over documentation when they conflict. If documentation says "X happens" but the database or deployed files show otherwise, the runtime evidence wins.

---

## Codebase Investigation Depth

When investigating the AIC codebase, apply these depth requirements. These are read-only — read, query, and trace, but never modify files.

1. **Full code path tracing:** Do not stop at the first grep match. Trace from entry point (MCP handler, hook, CLI command) through every function call to the target behavior. Read each intermediate file. Report the full chain with file:line citations.
2. **Interface and type verbatim reads:** Read implemented interfaces and consumed types from `core/interfaces/` and `core/types/` verbatim. Do not paraphrase or summarize type signatures — cite exact definitions.
3. **Library API verification:** Read the actual installed `.d.ts` files under `node_modules/`, not documentation or memory. Report exact constructor and method signatures.
4. **Deployed vs source artifact diffing:** When the investigation involves files copied/installed at runtime (hooks, configs, templates), read BOTH the source file AND the deployed copy. Report any differences.
5. **Database evidence:** Query `~/.aic/aic.sqlite`. Show concrete rows, counts, and column values. Do not speculate about what the database contains.
6. **Sibling and consumer analysis:** Grep for all importers and string-literal references across the codebase. Report the component's full footprint — not just its own code.
7. **Stale marker scan:** In every file read during investigation, note `TODO`, `FIXME`, `HACK` markers and phase heading references (`Phase (?:[A-Z]{1,2}|[0-9]+(?:\.[0-9]+)?)\b` — documentation-writer Dimension 9). Cross-reference those references against `documentation/tasks/progress/aic-progress.md` (main workspace only — gitignored). Report actionable markers.
8. **Documentation cross-reference:** Check `documentation/` for docs describing the mechanism under investigation. Compare doc claims against code evidence. Report discrepancies.

These depth requirements do NOT activate for technology evaluations involving only external technologies (no AIC codebase code).

---

## Shared Scripts and Prompt Templates

The `.claude/skills/shared/` directory holds deterministic enforcement scripts and reusable subagent prompt templates. Every skill references them directly; do not copy/paraphrase the content into individual phase files.

### Deterministic gates (`shared/scripts/`)

Every script exits 0 on pass and non-zero on fail. Invoke them as `bash .claude/skills/shared/scripts/<script> <args>`. If a script exits non-zero, stop — do not proceed past the gate.

| Script                                                  | Purpose                                                                                                                        | When                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `ambiguity-scan.sh <file.md>`                           | Grep for banned ambiguity patterns in instructional prose.                                                                     | Before declaring any SKILL / phase / task / doc file ready. |
| `validate-exploration.sh <report.md>`                   | Verify an Exploration Report is fully filled (no `<…>` placeholders, definitive method-behavior language).                     | End of planner Pass 1 and documentation-writer Phase 1.     |
| `validate-task.sh <task.md>`                            | Mechanical checks on a generated task file (empty parens, punctuation fragments, internal codes, section presence, step size). | End of planner Pass 2 / 3.                                  |
| `changelog-format-check.sh CHANGELOG.md`                | Keep-a-Changelog structure, section names, hedging / internal-code detection.                                                  | `aic-update-changelog` + `aic-release` gates.               |
| `git-clean-plan-validate.sh <plan.tsv>`                 | Commit-message format, length, banned patterns, conventional type.                                                             | `aic-git-history-clean` before rewrite.                     |
| `evidence-scan.sh <synth.md>`                           | Every finding cites `file:line`, URL, or `Evidence:` tag.                                                                      | End of any synthesis, review, or audit phase.               |
| `checkpoint-log.sh <skill> <phase> <artifact> <status>` | Append JSONL to `.aic/skill-log.jsonl` for state recovery and telemetry.                                                       | At every phase exit.                                        |

### Checkpoint discipline

Every phase exit produces two outputs:

1. A one-line checkpoint message printed to stdout: `CHECKPOINT: <skill>/<phase> — <status>`.
2. A `checkpoint-log.sh` call recording the same state to `.aic/skill-log.jsonl`.

The checkpoint name for each phase is specified in the parent `SKILL.md`'s "Process overview" table. If a phase fails, emit `CHECKPOINT: <skill>/<phase> — failed` and call `checkpoint-log.sh` with status `failed` before stopping.

### Subagent prompt templates (`shared/prompts/` + skill-local `prompts/`)

Multi-agent skills dispatch subagents by rendering a template file, not by paraphrasing English instructions. Templates use `{{PLACEHOLDER}}` syntax. The orchestrator must:

1. Read the template file.
2. Substitute every `{{NAME}}` placeholder with a concrete value.
3. Verify `grep -q '{{' <rendered-prompt>` returns nothing before dispatch — any remaining placeholder is a bug.
4. Pass the rendered text as the subagent prompt.

Generic templates live in `shared/prompts/` (`explorer-generic.md`, `critic-generic.md`, `framing-challenger.md`). Skill-specific templates live under `<skill>/prompts/`. Every subagent reply starts with the two-line header defined in `shared/prompts/README.md`:

```
CHECKPOINT: <skill>/<phase>/<role> — complete
EVIDENCE: <N> citations | BUDGET: used/total
```

---

## Canonical Examples — HARD

Every skill that produces a structured artifact has at least one canonical example under `<skill>/examples/`. The index lives at `.claude/skills/shared/examples/README.md`.

Before writing any output, the agent MUST:

1. Read the matching canonical example for the operation mode / recipe / classification.
2. Imitate its structure — headings, section order, label vocabulary, acceptance-criteria style.
3. Where the example is a structural template (not a near-identical case), adapt the content, not the shape.

Deviation from an example's structure is a HARD finding in review unless the skill file explicitly authorises variation. "My output is different" is not a justification — the example _is_ the shape.

## Runner and Eval — GUIDANCE

Two deterministic harnesses live under `shared/`:

- `shared/SKILL-runner.md` — phase sequencer (`skill-run.cjs`). Use it for multi-phase skills with a `## Process overview (phase dispatch)` table. It prevents phase skipping and gives you resumable runs.
- `shared/SKILL-eval.md` — golden-test harness (`skill-eval.cjs`). Use it to measure whether a skill change improved or degraded output against approved test cases.

Single-phase skills (`aic-update-changelog`, `aic-update-progress`) run inline without the runner. Every skill with at least one canonical example can have a test case.

## Model Routing — HARD for listed sub-steps

`shared/SKILL-routing.md` lists the four decisive sub-steps that MUST be dispatched to a stronger model via `shared/prompts/ask-stronger-model.md`:

- `aic-task-planner` — recipe classification.
- `aic-pr-review` — HARD/SOFT severity for each finding.
- `aic-researcher` — framing soundness check.
- `aic-documentation-writer` — factual claim verdict.

These sub-steps never run inline in the orchestrator, regardless of which model the orchestrator is using. Adding a new routed sub-step requires an entry in `SKILL-routing.md` and an example JSON reply in the skill's `examples/` directory.

## Scratch & cleanup — HARD

Artifacts a skill produces fall into two classes:

- **Deliverables** — the user-facing output the skill exists to produce (edited doc, task file, research note, CHANGELOG edit, progress-file edit, posted PR review). These live at stable user paths and survive the run.
- **Scratch** — every intermediate artifact (Change Specifications, explorer reports, critic reports, proposal drafts, rendered subagent prompts, cached diffs, per-dimension notes). These MUST live under `.aic/runs/<run-id>/` (gitignored via the repository `.gitignore` entry for `.aic/`) and are removed on run-complete.

Rules:

1. No skill writes scratch under `documentation/`, `.aic/reviews/`, `.aic/roadmap-forge/`, or any other long-lived path. Only `.aic/runs/<run-id>/` is permitted.
2. Under the runner, `advance` on the final phase removes `.aic/runs/<run-id>/` and the state file automatically. Pass `--keep-artifacts` to retain them for debugging, then run `skill-run.cjs cleanup <run-id>` when done.
3. Inline skills (no runner) pick a scratch slug at start (`.aic/runs/<skill>-<utc-timestamp>/`), write everything there, and `rm -rf` the directory once the user accepts the deliverable.
4. Each SKILL.md's output checklist MUST include a "scratch removed on run-complete" item; drift is a HARD failure.
