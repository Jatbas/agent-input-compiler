# Shared subagent prompt templates

Every multi-agent skill (researcher, documentation-writer, pr-review, roadmap-forge) dispatches subagents by **reading a template file, substituting placeholders, and passing the result as the subagent prompt**. Do not paraphrase a template into English.

## Placeholder convention

All placeholders use `{{NAME}}`. The dispatcher substitutes them **before** sending the prompt. Unsubstituted placeholders in a launched prompt are a bug — the dispatcher must verify `grep -q "{{" <rendered-prompt>` returns nothing before dispatch.

Common placeholders across templates:

| Placeholder           | Meaning                                                  |
| --------------------- | -------------------------------------------------------- |
| `{{PROJECT_ROOT}}`    | Absolute path to the project root                        |
| `{{TARGET}}`          | File path, URL, or symbol the subagent investigates      |
| `{{SCOPE}}`           | What is in scope and what is out of scope (bullet list)  |
| `{{EVIDENCE}}`        | Citation format required in the reply                    |
| `{{DISCONFIRMATION}}` | Specific conjecture the subagent must try to disprove    |
| `{{OUTPUT_PATH}}`     | Where the subagent must write its report (relative path) |
| `{{BUDGET}}`          | Max tool calls / minutes / lines in the reply            |

## Subagent reply contract

Every subagent reply must start with a two-line header:

```
CHECKPOINT: {{skill}}/{{phase}}/{{role}} — complete
EVIDENCE: N citations | BUDGET: used/total
```

Then the body with findings. This header is parsed by the orchestrator to verify completion and by any operator reading `.aic/skill-log.jsonl`.

## When to add a new template

Add a template when a skill dispatches a subagent with more than three lines of instructions. Two-line task prompts (e.g. "read file X and list exports") stay inline.
