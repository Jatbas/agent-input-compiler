# Model Routing — convention

Some sub-steps are disproportionately consequential: classifying a task into a recipe, deciding HARD vs SOFT severity, judging whether a question is well-framed. If these are wrong, everything downstream is wrong. The fix is to route these specific sub-steps to the strongest available model, regardless of what the orchestrator is using.

## The four routed sub-steps (today)

| Skill                      | Sub-step                               | Schema enum                                                                                                                                        |
| -------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aic-task-planner`         | Recipe classification (Pass 0b)        | `adapter \| storage \| composition-root \| pipeline-transformer \| benchmark \| release-pipeline \| fix-patch \| general-purpose \| documentation` |
| `aic-pr-review`            | HARD vs SOFT severity for each finding | `HARD \| SOFT`                                                                                                                                     |
| `aic-researcher`           | Framing soundness check (Phase 2)      | `sound \| mis-framed \| partially-framed`                                                                                                          |
| `aic-documentation-writer` | Factual claim verdict (Critic 2)       | `confirmed \| contradicted \| unverifiable`                                                                                                        |

Each of these is a **single-answer**, **schema-constrained**, **evidence-required** decision. None requires broad exploration.

## Mechanism

The orchestrator:

1. Reads `.claude/skills/shared/prompts/ask-stronger-model.md`.
2. Substitutes every `{{PLACEHOLDER}}` for the specific decision.
3. Verifies `grep -q '{{' <rendered-prompt>` returns nothing.
4. Spawns a subagent via the `Task` tool with:
   - `subagent_type: "generalPurpose"` (or `"explore"` for read-only decisions).
   - `model: "claude-opus-4-7-thinking-high"` (or the strongest available slug).
   - `prompt: <rendered template>`.
5. Parses the JSON reply against the declared schema.
6. Stores the full reply (including `evidence`) in the phase's artifact.

## HARD rules

- **Never** skip routing for these sub-steps because "the answer seems obvious." The whole point is that wrong obvious answers are the failure mode.
- **Never** paraphrase the template into plain English — render it, or don't use this mechanism.
- **Never** accept a reply that is not valid JSON matching the schema. On first malformed reply: re-dispatch once. On second: fail the phase with reason `stronger-model-returned-invalid-json`.
- **Never** use this mechanism for broad exploration. It is for structured classifications only.

## Guidance

- Keep `{{BUDGET}}` between 5 and 10 tool calls. Decisions should be fast.
- Prefer `subagent_type: "explore"` when the decision is purely read-only — it is cheaper.
- Record the subagent's `evidence` field verbatim in the run state; reviewers can audit the decision trail.
- If the strongest model is unavailable (policy, budget, outage), downgrade explicitly: dispatch to the next-strongest model and append `{"routingDowngraded": true, "downgradeReason": "<why>"}` to the run metadata.

## Composability

Routing is orthogonal to the runner and the eval harness:

- **Runner:** the routing call happens inside a phase. The phase file instructs the agent to dispatch the subagent and store the reply as an artifact before calling `advance`.
- **Eval harness:** a test case can assert that routing happened (by checking the run state for a non-empty `evidence` field on the specific phase) and that the decision matches expected.
- **Examples (`examples/`):** show a fully-rendered routing prompt and a valid JSON reply, so weaker orchestrators can imitate the structure.

## Adding a new routed sub-step

1. Confirm it is a single, schema-constrained decision (not exploration).
2. Add a row to the table above.
3. Cite the decision site in the relevant `SKILL.md` with a HARD rule: "Step X MUST be dispatched via `ask-stronger-model.md` with model `<slug>`."
4. Add an example reply under the skill's `examples/routing-<decision>.json` so the expected shape is visible.
