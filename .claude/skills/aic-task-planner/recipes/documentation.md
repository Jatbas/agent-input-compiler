# Recipe: Documentation (writing / editing `.md` files)

Full detail: `../SKILL-recipes.md` lines 868–1005.

## Quick Card

- **When to use:** Task creates a new `.md` file, edits existing doc content, or improves doc quality (accuracy, completeness, consistency, clarity). Code-adjacent docs (JSDoc, inline comments) are NOT covered — those follow the code recipe for the relevant layer.
- **Files:**
  - Create/Modify: `documentation/<name>.md` or `README.md` or `.claude/*.md` or `.cursor/rules/*.mdc`
  - No test files. No source files.
- **Pass 1 — exploration delegated to `aic-documentation-writer`:**
  1. Read `.claude/skills/aic-documentation-writer/SKILL.md` and `SKILL-dimensions.md`.
  2. Spawn 4 parallel explorers (accuracy / completeness / consistency / readability) using `prompts/explorer.md`.
  3. Run gap check and evidence-density check.
  4. Populate the documentation-specific Exploration Report fields with explorer findings.
- **Deep-investigation escalation:** If explorers surface many inaccuracies or fundamental structural problems, delegate to `aic-researcher` for a documentation-analysis investigation before Phase 2.
- **Task file format (replaces Interface/Signature and Dependent Types):**
  1. **Change Specification** per edit: current text + required change + rationale.
  2. **Writing Standards reference:** cite `SKILL-standards.md` sections used.
- **Pass 2 (Writing) delegated to `aic-documentation-writer` Phase 2.**
- **Pass 3 (Verification) delegated to `aic-documentation-writer` Phase 3** — 3-4 critics in parallel (editorial, factual re-verification, cross-doc consistency, reader simulation). Beats single-pass self-review.
- **Step granularity:** One step per edit target; doc steps always come LAST (after code steps in mixed tasks).

## When to delegate to `aic-researcher`

- Task is "analyze document X for problems" → documentation analysis classification.
- Task requires cross-referencing against external standards / best practices → technology evaluation.
- Task requires understanding how code actually works before documenting it → codebase analysis.
- Phase 1 explorers find 3+ UNCERTAIN claims.

## When NOT to delegate

- Mechanical changes (status update, add a row, fix a typo).
- Structural changes (reorder sections, fix heading hierarchy).

## Mechanical checks

A (Ambiguity scan on the final doc), C (Link validity), E (Structural coherence via grep for heading patterns), G (Completeness against gap analysis), H (Change-spec compliance), I (Cross-doc term ripple coverage). B, F (factual and writing-quality) covered by documentation-writer critics.
