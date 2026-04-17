# Skill Runner — convention and usage

The skill runner is a deterministic phase sequencer that refuses to let an agent skip steps. Any skill with a `## Process overview (phase dispatch)` table in its `SKILL.md` can be executed under the runner. Skills with inline phases (no table) are not runner-compatible — run them inline.

## Why this exists

Weaker models compress, reorder, and drop phases when given a long rubric. The runner removes that degree of freedom: the agent only sees one phase at a time, and cannot advance until its artifacts exist on disk.

## Files

| File                               | Purpose                                               |
| ---------------------------------- | ----------------------------------------------------- |
| `shared/scripts/skill-run.cjs`     | CLI entry point.                                      |
| `shared/scripts/render-prompt.cjs` | `{{PLACEHOLDER}}` substitution for subagent prompts.  |
| `shared/runner/phase-parser.cjs`   | Parses `## Process overview` table out of `SKILL.md`. |
| `shared/runner/run-state.cjs`      | Persists run state to `.aic/skill-runs/<uuid>.json`.  |
| `.aic/skill-runs/<uuid>.json`      | Run-state file (gitignored; owner-only).              |
| `.aic/skill-log.jsonl`             | Append-only checkpoint log (already present).         |

## Commands

Run from the project root. `AIC_PROJECT_ROOT` overrides the project root when not set to `cwd`.

| Command                                                       | Effect                                                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `node skill-run.cjs init <skill>`                             | Create a new run, write state file, emit phase 1's prompt. Prints `run-id` to stderr.                                    |
| `node skill-run.cjs next <run-id>`                            | Re-emit current phase's prompt (idempotent).                                                                             |
| `node skill-run.cjs advance <run-id> [--artifact <path> ...]` | Verify artifacts exist, mark phase complete, emit next phase's prompt. Exits non-zero if any listed artifact is missing. |
| `node skill-run.cjs fail <run-id> <reason>`                   | Explicitly mark the current phase failed.                                                                                |
| `node skill-run.cjs resume <run-id>`                          | Reopen a failed run at the current phase and re-emit its prompt.                                                         |
| `node skill-run.cjs status <run-id>`                          | Print the full state JSON (pipe to `jq`).                                                                                |

The full script path is `.claude/skills/shared/scripts/skill-run.cjs`.

## Agent protocol under the runner

1. The orchestrator calls `init <skill>` and captures the `run-id`.
2. For each phase printed by the runner:
   a. Execute the phase as described in its body.
   b. Produce the expected artifacts (paths are listed in the phase file; common cases below).
   c. Emit the `CHECKPOINT: <skill>/<phase> — complete` line (the runner also logs it via `checkpoint-log.sh`).
   d. Call `advance <run-id> --artifact <path> [...]` passing every produced artifact.
3. If `advance` rejects: inspect the reason, correct the gap, run `advance` again. Do not paper over.
4. When the runner prints `run <id> complete`, the skill run is over.

## Typical artifact paths by skill

| Skill                      | Common artifacts                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `aic-researcher`           | `documentation/research/<slug>/synthesis.md`, per-explorer reports under `.aic/runs/<run-id>/explorers/*.md` |
| `aic-documentation-writer` | target `.md` file(s), `.aic/runs/<run-id>/critics/*.md`                                                      |
| `aic-task-planner`         | `documentation/tasks/<id>-<slug>.md`, `.aic/runs/<run-id>/exploration.md`                                    |
| `aic-task-executor`        | modified source files (list them as `--artifact`), `.aic/runs/<run-id>/verification.log`                     |
| `aic-roadmap-forge`        | `documentation/tasks/progress/<target>.md`                                                                   |

## State file schema

```json
{
  "runId": "<uuid>",
  "skill": "aic-researcher",
  "skillRoot": ".claude/skills/aic-researcher",
  "createdAt": "<iso>",
  "updatedAt": "<iso>",
  "status": "in_progress | complete | failed",
  "currentPhase": 0,
  "metadata": {},
  "phases": [
    {
      "label": "2. Frame + classify",
      "file": "SKILL-phase-2-frame.md",
      "checkpoint": "framed",
      "status": "pending | in_progress | complete | failed",
      "artifacts": ["<path>", "..."],
      "startedAt": "<iso|null>",
      "completedAt": "<iso|null>",
      "failures": [{ "at": "<iso>", "reason": "<text>" }]
    }
  ]
}
```

## Failure modes the runner prevents

- **Phase skipping:** `advance` refuses to move forward if the declared artifacts do not exist.
- **Silent compression:** each phase's prompt is emitted verbatim from the file; the agent sees it in full, one at a time, not a paraphrase.
- **Lost state between messages:** the run-state file survives new conversations; pass the `run-id` to resume.
- **Ambiguous completion:** "run complete" is a deterministic output of the runner, not a claim by the agent.

## When NOT to use the runner

- Single-phase skills (`aic-update-changelog`, `aic-update-progress`) — overhead > benefit.
- Ad-hoc one-off investigations that do not match any skill.
- Debugging or interactive sessions where the phase sequence is not known in advance.

## Extensibility

To add gate scripts that run automatically on `advance`, extend `skill-run.cjs` with a `gates` array per phase (future work). The current implementation delegates gate execution to the phase file — the phase file tells the agent which `bash .claude/skills/shared/scripts/<gate>.sh` to run before emitting the checkpoint. This is deliberate: gates are authored as part of the skill, not the runner.
