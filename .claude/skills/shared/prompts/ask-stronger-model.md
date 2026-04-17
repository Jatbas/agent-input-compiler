# Ask Stronger Model — subagent template

Use this template when dispatching a _single decisive sub-step_ to a stronger model via the `Task` tool (Cursor) or the Claude Code `agent` spawn mechanism. The parent agent may be weak; this sub-step must be correct.

## When to use

- Classifying a task into a recipe (planner).
- Classifying a PR finding as HARD vs SOFT (pr-review).
- Challenging the framing of a research question (researcher).
- Verifying a factual claim against code (documentation-writer).
- Any sub-step whose wrong answer poisons the rest of the skill.

**Never** use this template for broad exploration, long-form writing, or anything that requires tool access beyond a single read. Those belong in regular explorer/critic subagents.

## Rendering

The dispatcher reads this template, substitutes every `{{NAME}}`, verifies no `{{` remains, then sends the rendered text as the subagent prompt. Spawn with the strongest model slug available in the current runtime — in Cursor, the `claude-opus-4-7-thinking-high` slug from the Task tool's allow-list; in Claude Code, the equivalent slug configured in the agent's model field.

## Subagent prompt template

```
You are a decision subagent. Your job is a single structured classification.
No exploration, no long prose. Return ONLY the JSON object described below.

## Question
{{QUESTION}}

## Inputs (read in full before answering)
{{INPUTS}}

## Decision schema (your ENTIRE response must be valid JSON matching this shape)
{{SCHEMA}}

## Constraints
- Cite the exact {{CITATION_KIND}} in the `evidence` field.
- If the inputs are insufficient to decide, return `{"decision": "INSUFFICIENT_EVIDENCE", "reason": "<why>", "evidence": "<best attempt>"}`.
- Do not invent options outside the schema's `decision` enum.
- Do not include markdown, prose, or commentary — JSON only.

## Budget
Hard cap: {{BUDGET}} tool calls. Exit with `INSUFFICIENT_EVIDENCE` if exceeded.
```

## Required placeholders

| Placeholder         | Meaning                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `{{QUESTION}}`      | One-sentence question, unambiguous, no conjunctions.                                                       |
| `{{INPUTS}}`        | Bullet list of file paths / URLs / prior artifacts the subagent must read.                                 |
| `{{SCHEMA}}`        | JSON schema fragment with `decision` (enum of valid answers), `evidence` (string), optional domain fields. |
| `{{CITATION_KIND}}` | `file:line` or URL or `database row` — the evidence format you expect.                                     |
| `{{BUDGET}}`        | Integer tool-call cap (recommended: 5–10).                                                                 |

## Reply contract

The parent agent must:

1. Parse the JSON response. If it is not valid JSON, reject and re-dispatch once. On second failure, fail the skill phase with reason `stronger-model-returned-invalid-json`.
2. Confirm the `decision` value is one of the schema's enum values. If not, treat as above.
3. Record the full response (including `evidence`) in the phase's artifact so it appears in the run state.

## Example render

Example for planner recipe classification:

```
You are a decision subagent. Your job is a single structured classification.
No exploration, no long prose. Return ONLY the JSON object described below.

## Question
Which recipe fits this task file?

## Inputs (read in full before answering)
- documentation/tasks/<id>-<slug>.md
- .claude/skills/aic-task-planner/recipes/README.md

## Decision schema
{
  "decision": "adapter | storage | composition-root | pipeline-transformer | benchmark | release-pipeline | fix-patch | general-purpose | documentation",
  "evidence": "<task-file:line showing the decisive cue>",
  "closestAlternative": "<recipe name or null>",
  "whyNotAlternative": "<one sentence>"
}

## Constraints
- Cite the exact file:line in the `evidence` field.
- If the inputs are insufficient to decide, return INSUFFICIENT_EVIDENCE.
- Do not invent recipe names outside the enum.
- JSON only.

## Budget
Hard cap: 6 tool calls.
```

The subagent reads the two files, decides, and returns a one-object JSON reply.

## Why this works

- **Model routing is concentrated** where correctness matters most, not spread across every step.
- **The output is structured** — the parent doesn't have to parse free-form prose.
- **The context is minimal** — the subagent reads 1–3 files, not the whole codebase.
- **Cost is bounded** — 5–10 tool calls per decision, not a full skill run.
