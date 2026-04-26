# Phase 3: Adversarial Review (3-5 Parallel Critics)

**Goal:** Fresh agents with zero prior commitment challenge the draft. Each critic receives the target text (write/modify) or existing document (audit) but NOT the explorer findings — preventing anchoring bias.

### 3a. Pre-read critic templates

Read `SKILL-dimensions.md` for the critic prompt templates. Use the **standard critic templates** for write/modify mode, or the **audit-mode critic templates** for audit mode. Each critic's prompt is built from the template plus the specific document and target text (or audit report).

### 3b. Spawn critics in parallel (MANDATORY — HARD RULE 1)

**You MUST make 3-5 Task tool calls here.** Do NOT perform critic analysis yourself — that violates HARD RULE 1 (Dispatch the critics). **In write/modify mode:** spawn 3-4 critics (Critics 1-4) scoped to edited sections. **In deep audit mode:** spawn 4-5 critics (Critics 1-5) scoped to the full document. **In broad triage or internal working-doc audit mode:** spawn Critics 1-3 with the scope chosen in Phase 1; spawn Critic 4 only for user-facing sections; skip Critic 5 unless the user explicitly requested a full audit.

**Critic 1 — Editorial quality** (`generalPurpose` subagent):

- **Write/Modify scope:** Read the document with the target text applied. Check: voice/tone match with surrounding text, sentence structure variety (not monotonous), paragraph cohesion (one idea per paragraph, smooth transitions), detail level consistency with neighboring sections, ambiguous pronouns or dangling references, heading hierarchy. Parallel section symmetry: if the edited section has a structural sibling, compare ordering, naming, content parity, information density. Audience awareness: verify the text uses appropriate language for the document's audience. Report each issue with the exact line or paragraph. Apply the **anti-agreement mandate** from the Critic 1 template in `SKILL-dimensions.md` — "No editorial issues found" without exhaustive per-section justification will be rejected.
- **Deep audit scope:** Read the ENTIRE document. Perform the same checks across ALL sections, not just edited ones. Use the audit-mode Critic 1 template from `SKILL-dimensions.md`. Report issues per section.
- **Triage/internal audit scope:** Review only the Phase 1 scoped sections and high-risk findings. Treat journal shorthand and historical wording in internal working docs as observations, not corrections, unless it creates a factual ambiguity about current code.

**Critic 2 — Factual re-verification** (`explore` subagent, `fast` model for inventory/grep; per-claim verdict routed to strongest model per SKILL.md HARD RULE 8):

- **Model routing:** The `fast` model handles the bulk grep/inventory work (listing every technical claim, running searches, collecting candidate source hits). The **per-claim verdict** — emitting the `VERIFIED / NOT FOUND / CONTRADICTED / UNCERTAIN` label for each claim — MUST be produced via `.claude/skills/shared/prompts/ask-stronger-model.md` on the strongest available model (see `.claude/skills/shared/SKILL-routing.md`). The critic can either (a) return candidate evidence and let the main agent run the verdict sub-step, or (b) spawn the stronger-model sub-step itself before emitting each verdict. HARD RULE 8 in `SKILL.md` overrides the `fast`-model hint for the verdict step specifically.
- **Write/Modify scope:** Read the target text. For every technical claim — interface names, type names, file paths, ADR references, component descriptions, commands, package names — grep the codebase to verify. This is INDEPENDENT of Explorer 1's work. The critic has NOT seen Explorer 1's findings. **Priority targets:** If Phase 2 produced a Critical Claims List (§2b½), verify those claims first — they are the highest-risk items. Return: `[claim] — [source file:line] — VERIFIED / NOT FOUND / CONTRADICTED / UNCERTAIN`. Check every claim, not a sample. If 1+ claims are UNCERTAIN (ambiguous grep results, multiple candidates, or source/deployed divergence), flag them for escalation — the main agent routes these to `aic-researcher` before finalizing the Change Specification.
- **Deep audit scope:** Read the ENTIRE document. Verify every technical claim in ALL sections against the codebase. Use the audit-mode Critic 2 template from `SKILL-dimensions.md`. This is the double-blind pass against Explorer 1 — same principle, full-document scope.
- **Triage/internal audit scope:** Verify high-risk claims, edited claims, and claims used as evidence. Do not inventory every historical journal line in internal working docs.

**Critic 3 — Cross-document consistency** (`explore` subagent, `fast` model):

- **Write/Modify scope:** Read the target text and Phase 1 sibling documents. For every key term, component name, status claim, and architecture description in the target text, check that the same term/concept is used consistently in sibling documents. **Term registry:** If Phase 2 produced a Term Registry (§2b½), use it as the canonical reference — flag any term in the target text that diverges from the registry's canonical definition. If a mirror document exists, compare section structure and content parity. Return: `[term] — [this doc says X] vs [sibling says Y] — CONSISTENT / DIVERGENT`.
- **Deep audit scope:** Same checks, but extract terms from the ENTIRE document, not just edited sections. Use the audit-mode Critic 3 template.
- **Triage/internal audit scope:** Check only key terms surfaced by Phase 1 and terms in public or prescriptive sibling docs.

**Critic 4 — Reader simulation** (`generalPurpose` subagent, **conditional**):

Spawn for user-facing documents (installation guides, getting started docs, user-facing READMEs) and for **mixed-audience documents** (Explorer 3 classified as "Mixed"). Skip only for pure developer references (implementation specs, project plans, architecture docs).

For mixed-audience documents, use Explorer 3's section-level classification to scope the review — focus Reader Simulation on the user-facing sections only, not developer-reference sections.

- **Write/Modify scope:** Read the document from top to bottom as a first-time reader with zero project knowledge. Report: undefined terms (used without prior definition), unclear prerequisites (steps that assume prior context), missing context (points where the reader would ask "what does this mean?"), jargon without explanation (technical terms a first-time user would not know), dead ends (instructions that stop before the task is complete). Focus on the edited sections but note issues in surrounding context that affect comprehension.
- **Deep audit scope:** Same checks, full-document scope. Read every section with equal attention. Use the audit-mode Critic 4 template.
- **Triage/internal audit scope:** Review only user-facing sections identified by Phase 1. Skip for internal working docs.

**Critic 5 — Audit completeness** (`generalPurpose` subagent, **deep audit mode only**):

Spawn ONLY in deep audit mode. This critic receives the Structured Audit Report from Phase 2 and challenges it. The critic has NOT seen the explorer findings — only the report and the document.

Investigation mandate:

- Re-read the document section by section. For each section, check whether the audit report has findings. Flag sections with zero findings — the audit may have skimmed them.
- For claims the report marked ACCURATE, spot-check a sample by grepping the codebase. Flag any that appear wrong.
- Check whether the report missed obvious gaps (topics the document should cover but does not).
- Verify the severity classifications: are critical issues classified as critical? Are moderate issues genuinely moderate?
- Challenge the executive summary verdict: does the evidence support PASS / ADVISORY / FAIL?

Return: `[section or finding] — [issue type: MISSED_SECTION / WRONG_CLASSIFICATION / MISSED_GAP / SEVERITY_MISMATCH / VERDICT_CHALLENGE] — [description with evidence]`. End with: "Audit completeness issues: N."

### 3c. Anti-agreement enforcement

If any critic reports zero issues ("No problems found", "All claims verified", "All terms consistent"), evaluate whether this is genuine or the critic was too shallow:

- If the document is short (< 50 lines) and the changes are minor, zero issues may be genuine. Accept.
- If the document is substantial and the changes are significant, re-spawn the critic with a strengthened mandate: "Your previous review found no issues, which is unlikely for a document of this size. For each section, describe the strongest possible concern. If you genuinely cannot find a concern after exhaustive search, explain exactly what you searched for."

### 3d. Evaluate critic outputs

Read all critic outputs. For each reported issue:

- **Editorial issues (Critic 1):** In write/modify mode: fix the target text. In audit mode: add to the Corrections Required section of the Audit Report. Re-read context around each fix to ensure the fix itself does not introduce new problems.
- **Factual issues — NOT FOUND or CONTRADICTED (Critic 2):** Investigate. Read the source file to determine whether the document or the codebase is correct. For normal documents: fix the target text (write/modify) or add to Corrections Required (audit) to match the code (never change code; see HARD RULE 5). For prescriptive documents (project-plan, implementation-spec, architecture, security): STOP, report the incongruency to the user with both locations, and ask how to proceed per HARD RULE 5.
- **Consistency divergences (Critic 3):** Fix the target text (write/modify) or add to Corrections Required (audit) to align with the authoritative source. If the sibling document is wrong, note as a follow-up item (do not edit sibling documents outside scope).
- **Reader simulation findings (Critic 4):** In write/modify mode: for issues in the edited sections, fix them (add definitions, clarify prerequisites, simplify jargon); for issues in surrounding context, note as follow-up items. In audit mode: all findings go into the Section-by-section Assessment or Corrections Required.
- **Audit completeness findings (Critic 5, deep audit mode only):** For each finding, investigate: re-read the document section, re-check the audit report. If the critic is correct (section was missed, classification is wrong, gap was overlooked), update the Audit Report accordingly. If the critic is wrong (the audit did cover it), note the false positive for transparency.

### 3e. Double-blind factual reconciliation

Compare Explorer 1's factual findings against Critic 2's factual findings:

- **Both ACCURATE/VERIFIED:** Strong confidence. No action needed.
- **Explorer 1 ACCURATE but Critic 2 NOT FOUND:** Critic may have searched differently. Re-read the source file. If the claim is correct, note the discrepancy for transparency.
- **Explorer 1 ACCURATE but Critic 2 CONTRADICTED:** Serious discrepancy. Read the source file to resolve. The more specific citation wins. If unresolvable, flag in Open Questions.
- **Explorer 1 INACCURATE and Critic 2 CONTRADICTED:** Strong agreement — the document claim is wrong. For normal documents: fix the target text to match the code (never change code). For prescriptive documents: STOP and ask the user how to proceed per HARD RULE 5.
- **Either UNCERTAIN:** The claim needs manual verification. Do not include it in target text without resolution.

### 3f. Backward feedback loop

If Phase 3 found issues that require rewriting target text (not just minor fixes):

1. Apply all fixes to the target text
2. Re-run ONLY Critic 2 (factual re-verification) on the revised text — the other critics' concerns were addressed by the fixes
3. Maximum 2 revision loops. "Still failing" means Critic 2 reports 1+ NOT FOUND or CONTRADICTED claims after the revision. UNCERTAIN claims that existed before revision are not blocking — move them to Open Questions. If still failing after 2 loops, flag unresolvable issues in a Blocked section

---

Phase complete. Read `SKILL-phase-4-verify.md` and execute it immediately.
