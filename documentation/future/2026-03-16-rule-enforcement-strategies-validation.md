# Research: Validation of rule-enforcement-strategies.md

> **Status:** Complete
> **Date:** 2026-03-16
> **Question:** Validate documentation/future/rule-enforcement-strategies.md for factual accuracy against the codebase and project docs, completeness of strategy descriptions, consistency with project-plan/mvp-progress/implementation-spec, and whether the recommendation (Middleware Enforcer) is adequately supported.
> **Classification:** documentation analysis
> **Confidence:** Medium — several inaccuracies and gaps; recommendation is supported with caveats
> **Explorers:** 4 | **Critic:** yes

## Executive Summary

The rule-enforcement-strategies document is substantively correct about the three strategies and the recommendation (Option 1 as the only deterministic path), but it contains **factual inaccuracies** (Cursor hook name, prompt section order, Phase R misattribution), **terminology inconsistencies** (three different proposed MCP tool names; "aic-rules" only vs built-in + project packs), and **completeness gaps** (RulePack sources/merge, Context Guard/Step 5, Strategy 1 implementation details). Correcting these will make the document a reliable base for Phase 2+ design.

## Findings

### Finding 1: Cursor uses preToolUse (camelCase), not PreToolUse

**Evidence:** `integrations/cursor/hooks.json.template` (preToolUse key), `integrations/cursor/hooks/AIC-require-aic-compile.cjs:4` (// preToolUse hook), `documentation/cursor-integration-layer.md` lines 324–326, 355–357. Claude Code uses PascalCase `PreToolUse` in `integrations/claude/settings.json.template` and `integrations/claude/hooks/aic-block-no-verify.cjs:40`.

**Confidence:** Medium
**Adversarial status:** Challenged — incorporated: Doc may use "PreToolUse" as a product-agnostic concept name (matching Claude Code). The inaccuracy is Cursor-specific: the doc says "Cursor's `PreToolUse` gate" but Cursor's schema key is `preToolUse`.

The document should use "PreToolUse" when referring to Claude Code and "preToolUse" when referring to Cursor, or state that "PreToolUse" denotes the concept and Cursor implements it as `preToolUse`.

### Finding 2: Constraints block is not the "bottom" of the prompt; Step 7 does not "append"

**Evidence:** `documentation/implementation-spec.md` lines 465–487 (Step 8 template): order is `## Task` → `## Task Classification` → `## Context` → `## Constraints` → `## Output Format`. So the last section is Output Format, not Constraints. `shared/src/pipeline/prompt-assembler.ts` lines 100–116 build the sections; Constraints appear before Output Format.

**Confidence:** High
**Adversarial status:** Challenged — incorporated: "Bottom" could be read as "bottom of the main content" (after context). Literally "last section" is wrong. Additionally, the doc says "Step 7 … appends" the Constraints block; in the pipeline, Step 7 (Constraint Injector) supplies/deduplicates constraints; Step 8 (Prompt Assembler) places the `## Constraints` block in the prompt. So "Step 7 appends" conflates Step 7 and Step 8.

Recommendation: Replace "appends … at the bottom" with "the assembled prompt includes a `## Constraints` section after context and before `## Output Format` (Step 8 Prompt Assembler)." Clarify that Step 7 produces the constraint list; Step 8 injects it into the prompt.

### Finding 3: Step 8 does not currently require a &lt;rule_check&gt; block

**Evidence:** `shared/src/pipeline/prompt-assembler.ts` lines 100–116; `documentation/implementation-spec.md` lines 489–497 (output format descriptions only). No `rule_check` or similar mandate in code or spec.

**Confidence:** High
**Adversarial status:** Unchallenged

Strategy 3 (Read-Back Mandate) is a **proposed** change to Step 8; the current pipeline does not require a `<rule_check>` block. The document correctly frames it as a future tweak.

### Finding 4: Step 2 produces RulePack; Phase Q/R components and LanguageProvider L1 are accurate

**Evidence:** Step 2: `documentation/implementation-spec.md` lines 169, 180 ("Step 2: Rule Pack Resolver", "Output: Merged RulePack"); `shared/src/core/run-pipeline-steps.ts` lines 124–127. Phase Q: `documentation/tasks/progress/mvp-progress.md` lines 51–62 (CommandInjectionScanner, MarkdownInstructionScanner, Constraints preamble). Phase Q constraints preamble: `shared/src/pipeline/prompt-assembler.ts` lines 54–58, 81, 110 (buildConstraintsPreamble, "## Constraints (key)"). LanguageProvider L1: `shared/src/core/interfaces/language-provider.interface.ts` lines 12–14 (extractSignaturesWithDocs, extractSignaturesOnly); `documentation/implementation-spec.md` lines 395, 407, 423 (L1: Signatures + Docs, JSDoc).

**Confidence:** High
**Adversarial status:** Unchallenged

These claims in the document are accurate and verified against code and spec.

### Finding 5: Phase R is MCP Server Security Hardening; Claude Code hook delivery is Phase T/U

**Evidence:** `documentation/tasks/progress/mvp-progress.md` line 65: "### Phase R — MCP Server Security Hardening"; lines 67–75 list schema hardening, compilation timeout, tool-invocation audit log, aic_last compiledPrompt removal, security.md. Claude Code hooks: `documentation/tasks/progress/mvp-progress.md` lines 105–106 "Phase T — Claude Code Hook-Based Delivery", lines 123–124 "Phase U — Claude Code Zero-Install".

**Confidence:** High
**Adversarial status:** Unchallenged

The document (line 79) states "Claude Code hook delivery (Phase R)". That is incorrect. Phase R is MCP Server Security Hardening; Claude Code hook delivery is Phase T (and zero-install is Phase U). Fix: replace "Phase R" with "Phase T" in that sentence, or rephrase to "depend on … Phase Q guard infrastructure and Claude Code hook delivery (Phase T)."

### Finding 6: Three different proposed MCP tool names for the same concept

**Evidence:** `documentation/future/rule-enforcement-strategies.md` line 21: "`aic_validate_edit` or `aic_check_plan`"; line 29: "`aic_validate_edit`"; line 79: "`aic_validate_action` tool". No such tools exist in `mcp/src/` (grep for aic_validate, check_plan).

**Confidence:** High
**Adversarial status:** Challenged — incorporated: Line 21 uses "e.g." and "or" (naming undecided); line 79 may be the Phase 2+ settled name. Inconsistency remains; recommend picking one canonical name (e.g. `aic_validate_action`) and using it throughout.

### Finding 7: Rule pack sources — doc implies only aic-rules; spec has built-in + project packs

**Evidence:** Doc line 4: "rules defined in `aic-rules/*.json` packs". `documentation/implementation-spec.md` lines 173–186: load built-in:default, task-class built-in (e.g. built-in:refactor), project packs from `./aic-rules/`; merge order project > task-specific > default. `shared/src/core/load-rule-pack.ts` line 36: `aic-rules/${taskClass}.json` for project pack path.

**Confidence:** High
**Adversarial status:** Unchallenged

The document reads as if only `aic-rules/*.json` defines rules. The implementation uses built-in packs as the primary source and `./aic-rules/` as optional project overlay. Add one sentence on sources (built-in + aic-rules) and that merge order is project > task-specific > default. Clarify that `.cursor/rules/` is for trigger/invariants (e.g. AIC.mdc), not RulePack JSON.

### Finding 8: Context Guard (Step 5) and pipeline steps using RulePack are not named

**Evidence:** Doc line 81 mentions "context-level filtering (guard scanners)" and Phase Q guard scanners; it does not name "Context Guard" or "Step 5". `documentation/implementation-spec.md` lines 236–242, 441, 465; Steps 3 (Budget Allocator uses RulePack.budgetOverride), Step 4 (ContextSelector uses include/exclude/boost/penalize) use RulePack but are not mentioned in the doc where discussing rules/constraints.

**Confidence:** Medium
**Adversarial status:** Unchallenged

For completeness, add an explicit reference to Context Guard (Step 5) and its role in context-level filtering. Optionally mention Steps 3 and 4 where RulePack drives budget and selection.

### Finding 9: Strategy 1 (Middleware Enforcer) is underspecified for implementation

**Evidence:** Doc describes hook passing "proposed diff/command" to AIC and cross-referencing RulePack; it does not specify (1) the wire format for validation (unified diff vs edit_file payload with path/oldText/newText), (2) which constraints are machine-checkable vs prompt-only, or (3) how validation obtains the "active RulePack" (same process as compile? Cached? Project root?).

**Confidence:** High
**Adversarial status:** Unchallenged

Recommend adding a short "Implementation notes" for Strategy 1: diff/action format for validation and treatment of machine-checkable vs non-checkable rules; how the hook or MCP tool gets the RulePack (e.g. same project root and compile session).

### Finding 10: Cursor hook system is active; recommendation is supported with caveats

**Evidence:** `.cursor/hooks.json` (or template) registers preToolUse with no matcher so it fires on every tool use; `integrations/cursor/hooks/AIC-require-aic-compile.cjs` receives `tool_name` and `tool_input`. Cursor integration layer doc §7.3: preToolUse fires on all tools. No existing `aic_validate_edit`/`aic_validate_action` tool in mcp/src. Claude Code PreToolUse is documented only for Bash (command string), not for Edit/Write with proposed content.

**Confidence:** Medium
**Adversarial status:** Unchallenged

The claim that "Option 1 (Middleware Enforcer) is the only deterministic path" is supported: blocking non-compliant actions before execution is the only mechanism that does not rely on model compliance. The claim that expanding the preToolUse gate is "a natural next step" is partially supported: the hook system is active and receives tool_name/tool_input, but (1) the shape of tool_input for edit tools is not documented for Cursor; (2) for Claude Code, PreToolUse for Edit/Write is not documented; (3) the proposed MCP tool does not exist. Feasibility therefore depends on confirming that editors pass proposed edit content into the hook.

## Analysis

The findings group into **accuracy** (Findings 1, 2, 5, 6), **completeness** (Findings 7, 8, 9), and **recommendation support** (Finding 10). The Phase R error is a direct fix (replace with Phase T where Claude Code hooks are meant). The "Constraints at bottom" and "Step 7 appends" wording can be fixed with one precise sentence. The three tool names should be unified (e.g. `aic_validate_action` for Phase 2+). Completeness improvements (RulePack sources, Context Guard name, Strategy 1 implementation notes) make the document usable as a design base without requiring readers to infer from implementation-spec. The recommendation stands: Option 1 is the only deterministic enforcement path; implementing it depends on editor payload shape and defining the validation tool and RulePack availability at validation time.

## Recommendations

1. **Priority 1 — Fix Phase R reference:** In "Related Work", replace "Claude Code hook delivery (Phase R)" with "Claude Code hook delivery (Phase T)" or "depend on Phase Q guard infrastructure and Claude Code hook delivery (Phase T)."
2. **Priority 2 — Align prompt and step wording:** Replace "Step 7 … appends a ## Constraints block at the bottom of the prompt" with wording that (a) places Constraints after Context and before Output Format, and (b) attributes placement to Step 8 (Prompt Assembler); Step 7 supplies the constraint list.
3. **Priority 3 — Single canonical tool name:** Pick one name for the Middleware Enforcer MCP tool (e.g. `aic_validate_action`) and use it consistently; add a note that Cursor uses `preToolUse` (camelCase) and Claude Code uses `PreToolUse` (PascalCase) where the gate is mentioned.
4. **Priority 4 — Rule pack sources and Context Guard:** Add one sentence on RulePack sources (built-in + project `aic-rules/`, merge order project > task-specific > default) and that `.cursor/rules/` is for trigger/invariants. Name Context Guard (Step 5) where discussing context-level filtering (guard scanners).
5. **Priority 5 — Strategy 1 implementation notes:** Add a short subsection or "Implementation notes" for Strategy 1: (a) wire format for validation (e.g. unified diff vs edit payload); (b) which constraints are machine-checkable and how non-checkable ones are handled; (c) how the validator obtains the active RulePack (e.g. same project root / compile session).

## Open Questions

- Whether Cursor's preToolUse payload for edit tools includes proposed content (path, diff, or oldText/newText) in a form AIC can validate — not documented in the repo; would require Cursor API or testing.
- Whether Claude Code exposes PreToolUse for Edit/Write with proposed content; current docs describe only PreToolUse (Bash) with command string.
- How the "active RulePack" is available at validation time if validation runs in a different process or before the first compile (assumption: same project root and cached or re-resolved RulePack).
- Whether "deterministic" is intended to mean strictly "block at tool-call time" or whether post-edit validation (allow then revert/fix) could be considered deterministic for some purposes.

## Sources

- `documentation/future/rule-enforcement-strategies.md` — subject document
- `documentation/implementation-spec.md` — Step 2, 7, 8, RulePack, constraints, prompt template, guard
- `documentation/tasks/progress/mvp-progress.md` — Phase Q, R, T, U, guard scanners, constraints preamble, Cursor/Claude hooks
- `documentation/cursor-integration-layer.md` — preToolUse, hooks registration
- `documentation/claude-code-integration-layer.md` — PreToolUse, CLAUDE.md
- `documentation/installation.md` — .cursor/hooks install path
- `shared/src/core/run-pipeline-steps.ts` — pipeline order, RulePack, guard
- `shared/src/pipeline/prompt-assembler.ts` — constraints preamble, section order
- `shared/src/pipeline/rule-pack-resolver.ts` — RulePack resolution
- `shared/src/core/load-rule-pack.ts` — aic-rules path
- `shared/src/core/interfaces/language-provider.interface.ts` — L1, extractSignaturesWithDocs
- `shared/src/bootstrap/create-pipeline-deps.ts` — guard scanners wiring
- `integrations/cursor/hooks/AIC-require-aic-compile.cjs` — preToolUse input shape
- `integrations/cursor/install.cjs` — hook source vs install path
- `integrations/claude/hooks/aic-block-no-verify.cjs` — PreToolUse (Bash)
