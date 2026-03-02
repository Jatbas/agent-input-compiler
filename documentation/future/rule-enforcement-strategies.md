# AIC: Forcing Model Compliance (Discussion Notes)

**Target Editors:** Cursor & Claude Code
**Goal:** Deterministically force probabilistic LLMs to comply with explicit architectural and stylistic rules defined in `aic-rules/*.json` packs.

LLMs, by nature, treat system prompts and appended constraints as "strong suggestions." If the surrounding context or their pre-training heavily points elsewhere, they might ignore a rule. Because AIC sits between the editor and the model, it is uniquely positioned to enforce rules deterministically rather than probabilistically.

Here are the top three strategies for enforcing strict rule compliance through AIC, ranked by viability and architectural fit.

---

## 1. The "Middleware Enforcer" (Expanding the MCP Tool Gate)

_The most powerful and deterministic option. It intercepts and blocks non-compliant code before it is written._

**Concept:**
Currently, AIC's Integration Layer uses hooks (like Cursor's `PreToolUse` gate) to force the model to compile context _before_ acting. We can expand this concept to enforce rules _during_ the model's action phase.

**How it works:**

1. AIC exposes a new validation MCP tool (e.g., `aic_validate_edit` or `aic_check_plan`).
2. When the model attempts to call standard editor tools like `edit_file` or `run_command`, the integration hook intercepts the content.
3. The hook passes the proposed diff/command to AIC locally. AIC cross-references the proposed action against the active `RulePack` (from Step 2 of the pipeline).
4. **The Gate:** If the action violates a rule, the tool execution is hard-blocked. The hook returns an error directly to the model's context: `"Execution Blocked. You violated Rule #3 (Immutability). Rewrite the edit."`

**Editor Alignment:**

- **Cursor:** Extremely viable. Modifying the existing `.cursor/hooks/AIC-*.cjs` pre-tool hook to include a validation step fits perfectly within the current architecture.
- **Claude Code:** Claude relies heavily on MCP tools. We can update `.claude/CLAUDE.md` to mandate: _"Before writing to any file, you MUST pass your proposed changes to the `aic_validate_edit` tool."_

---

## 2. Context Shaping: "In-line" Rule Injection (Expanding the Compiler)

_Manipulates the model's attention mechanism by placing rules adjacent to the relevant code, rather than in a detached list._

**Concept:**
Currently, Step 7 (`Constraint Injector`) appends a `## Constraints` block at the bottom of the prompt. Models suffer from "attention dilution" when rules are clustered together entirely separate from the code they apply to.

**How it works:**

1. AIC moves from a global rules block to **AST-aware localized injection**.
2. Because AIC already uses a `LanguageProvider` to extract signatures and JSDoc (L1 tier), it can identify the structures a rule targets.
3. AIC injects the specific rule _as a comment directly above the relevant code_ in the compiled context.
4. **Example:** If `aic-rules/refactor.json` dictates strict state immutability, AIC finds the state definition in the reduced context and injects: `// AIC CRITICAL RULE: Do not mutate this state directly.`

**Why it works:**
Both Claude 3.5 Sonnet and GPT-4o (defaults for Claude Code and Cursor) exhibit massive attention spikes on lines (especially comments) immediately preceding the code block they are evaluating.

---

## 3. The "Read-Back" Mandate (Prompt Assembly Adjustment)

_Forces the model to acknowledge constraints before acting, leveraging autoregressive consistency._

**Concept:**
The easiest immediate implementation, requiring only a tweak to Step 8 (`Prompt Assembler`). It forces the model into a specific "Chain of Thought" that heavily weights the constraints in its own immediate context window.

**How it works:**

1. AIC's assembled prompt changes from simply listing rules to explicitly mandating a structural output format.
2. **The Mandate:** _"Output Format: Before generating your unified diff, you MUST output a `<rule_check>` block where you quote the 2 most critical constraints from the rules list that apply to this specific edit, and explain exactly how your code will satisfy them."_

**Why it works:**
LLMs are autoregressive. Because the model must generate the rules itself immediately prior to writing the code, the self-attention mechanism weights those rule tokens heavily. This drastically decreases the probability that it will hallucinate a non-compliant solution a few lines later.

---

## Recommendation

If the objective is to **truly force** compliance, **Option 1 (The Middleware Enforcer)** is the only deterministic path.

It stops the LLM from making a mistake before the file is ever touched, removing the probabilistic "will the model listen to the prompt?" gamble entirely. Because the hook system for Cursor is already active, expanding the `PreToolUse` gate to include a fast local rule validation step is a natural next step and a massive differentiator for AIC's integration layer.
