# Phase 5: Adversarial Review & Convergence Detection

## §5. Adversarial Review

**Always run — no skip condition.**

Spawn **2 critic subagents in parallel** (`fast` model for both). Each critic has a distinct and non-overlapping mandate.

**Inline criticism is prohibited.** You MUST spawn critics via Task tool — never write "Critic A findings:" inline. The adversarial value of critic review depends on the critic having a different context than the proposal author — it evaluates only the output, not the synthesis reasoning that produced it. An inline critic has seen all that reasoning and cannot genuinely challenge it.

---

### Critic A — Feasibility & Implementation

Include verbatim in Critic A's prompt:

> "You are an independent feasibility critic. Your only job is to find implementation flaws, challenge technical assumptions, and propose scoping reductions. If you agree with all proposals without challenge, your review will be rejected and you will be re-spawned. A genuine review proposes at least one removal and one scope reduction."

Critic A receives:

- The original input source(s) summary
- The draft phase proposals from §4 (including name normalization notes)
- The full aic-progress.md phase inventory
- The raw explorer output tables from §3 (structured findings, not synthesis prose)

Critic A's tasks:

1. **Duplication check:** Does any proposed component duplicate or significantly overlap an existing tracked entry (even a Done one)?
2. **Feasibility challenge:** For each proposed component, challenge whether the codebase supports it. **You MUST search the codebase** — read relevant source files and report which files you read and what you found. A feasibility challenge without a file:line citation is rated "Unevaluated" and given lower weight.
3. **Priority challenge:** Is the ordering defensible? Would a different order deliver more value faster?
4. **Scope challenge:** Are any components too vague to be actionable? A component must be executable by `aic-task-planner` — if a human couldn't scope it in one session, it is too broad.
5. **External research validity:** For Explorer 3 findings — are cited sources credible? Is the relevance to AIC genuine or speculative?
6. **Task detail specificity:** For each task detail, verify that at least 50% of steps contain a concrete anchor — a file path, an interface name, a command, or a search pattern — rather than abstract descriptions or pure escape hatch annotations. Flag any task detail where the majority of steps are escape hatch annotations. A task detail that is entirely escape hatches is not a task detail — it is a deferred scope note and should be marked as such.
7. **Documentation impact completeness:** For each proposed code component, verify that all documentation files describing the affected subsystem are included in the documentation update rows. Specifically: does the proposal affect the core pipeline? If yes, is `documentation/implementation-spec.md` in the doc impact rows? Does it affect the architecture model? If yes, is `documentation/architecture.md` included?
8. **Synthesis-vs-evidence check:** Compare §4 proposals against the raw explorer output tables. For each proposal, verify it accurately represents explorer evidence. Flag: claims the synthesis overstates (explorer evidence was low-confidence but synthesis treats as established), claims the synthesis understates (explorer evidence was strong but synthesis hedges), and explorer findings the synthesis omits entirely.

**Critic A quality check:** Re-spawn with the stricter prompt if ANY of the following apply:

- Critic A accepts all proposals without removing or reducing scope of anything.
- Every challenge is scope-reduction only with no recommended removals.
- No challenge cites a file:line — all challenges are treated as "Unevaluated."
- The number of challenged components is fewer than 25% of proposed components.

Re-spawn prompt: "Your previous review was too agreeable. For each component, describe the strongest reason NOT to include it in this phase. You MUST recommend at least one complete removal (not a scope reduction) and at least one scope reduction. Both must cite file:line evidence from the codebase."

---

### Critic B — Strategic Fit

Include verbatim in Critic B's prompt:

> "You are an independent strategic critic. Your only job is to challenge whether these proposals are the right things to build at all — not whether they are technically feasible, but whether they serve AIC's purpose and its users. If you agree with all proposals without challenge, your review will be rejected and you will be re-spawned. A genuine review identifies at least one proposal that should be dropped or deferred on strategic grounds."

Critic B receives:

- The draft phase proposals from §4
- The §4d ranked candidate table with composite value scores
- The §0 strategic hypotheses and which were supported/refuted by explorer evidence
- The full aic-progress.md phase inventory
- The README.md "Why developers use AIC" and "What it helps with" sections (Critic B reads these to ground strategy in stated user pain)
- The raw explorer output tables from §3 (structured findings, not synthesis prose)

Critic B's tasks:

1. **AIC positioning alignment:** Does each proposal advance AIC's core purpose (deterministic context compilation for AI coding tools)? Reject proposals that expand AIC's scope beyond this without strong user pain evidence.
2. **Real user pain evidence:** For each proposal, challenge whether it addresses a real, documented user pain. Does any explorer finding cite actual user pain (issue tracker, user feedback, observable behavior)? A technically interesting proposal with no user pain evidence should be flagged as "speculation risk."
3. **Opportunity cost:** Given finite development capacity, does including this phase crowd out higher-value work? If a proposal is lower value than what is already Not started in aic-progress.md, recommend deferral.
4. **Simpler alternative test:** For each proposal, ask: "Is there a simpler intervention that solves 80% of the same problem in 20% of the work?" If yes, propose the simpler alternative as a replacement.
5. **Hypothesis alignment:** Cross-reference each proposal against the §0 strategic hypotheses. Proposals that are not supported by any hypothesis AND were not identified by disconfirmation evidence should be challenged as hypothesis-free additions — either reject or require the forge to state which hypothesis they serve.
6. **Coherence check:** Do the proposals as a set tell a coherent story about where AIC is going? Or is it a grab-bag of independent improvements? If the latter, recommend a coherence edit — removing the least coherent proposal to strengthen the narrative.
7. **Value score challenge + Strategic Alignment scoring:** Review the §4d composite scores. For each candidate, assign a **Strategic Alignment (1-5)** score — this is Critic B's exclusive dimension. Challenge any composite score that seems inflated: if a candidate ranks top-3 by composite but Critic B rates its Strategic Alignment at 1-2, flag the discrepancy. Challenge any User Impact score above 3 that lacks cited user pain evidence. Return updated SA scores — these replace the default-2 in the final composite recalculation after §5.
   7a. **Meta-Capability Multiplier (MC) challenge:** Review every MC ≥ 1.25 assignment in the §4d table against the three eligibility criteria in `SKILL-scoring.md` (class-level impact, directional asymmetry, evidence in the input source). For each MC ≥ 1.25: - If any of the three criteria fails, recommend demotion to 1.0 and cite the failing criterion. - If MC = 1.5 is assigned to a delivery-only vehicle (no measurement / tuning / observability signal), recommend demotion to 1.25.
   Also scan candidates assigned MC = 1.0 and identify any that **should** have MC ≥ 1.25 — candidates the input source frames as class-level unlocks or tuning substrates but synthesis missed. For each missed candidate, recommend promotion with the document citation.
   Return updated MC values alongside SA. These replace the Explorer 4 defaults in the final composite recalculation after §5.
   7b. **Document-internal build-order departures:** If Explorer 4 reported a non-`—` Build-order rank set (document declared an order), verify every departure from that order in the §4 proposal carries an inline "Departure reason: [cited evidence]" note. Flag missing or weak reasoning: a note citing only "composite score higher" is insufficient — the evidence must be a specific explorer finding (file:line or URL) that overrides the document's framing. Recommend restoration of the document's order for any departure that fails this bar.
8. **Synthesis-vs-evidence check:** Compare §4 proposals against the raw explorer output tables. For each strategic candidate, verify it accurately represents the explorer's evidence and scoring justifications. Flag proposals where the synthesis narrative diverges from what the explorers actually reported.

**Critic B quality check:** Critic B's output is acceptable only if ALL of the following are true:

1. At least one proposal is recommended for **removal or deferral** — not just flagged with a caveat. "Speculation risk: flag for monitoring" is not a removal recommendation.
2. At least one "simpler alternative test" finding proposes a concrete replacement by name, not just notes the risk.
3. The hypothesis cross-reference explicitly names which §0 hypothesis supports which proposal — if all proposals map to the same hypothesis, challenge that mapping. All proposals cannot be supported by a single hypothesis.

If Critic B fails any of these criteria, re-spawn with: "Your previous review was too conservative. You are a product manager who must cut scope by 30%. You MUST recommend removal or deferral of at least one full component (not a doc update row), name it explicitly, and propose what to do instead: defer to a later phase, replace with a simpler alternative, or drop entirely. Caveats do not count."

---

### Adjudication

**Before adjudicating:** Verify both Critic A and Critic B returned output. If either is missing (silent subagent failure), re-spawn the missing critic before proceeding. Do not adjudicate with one critic's input only.

**Post-critic structured report (required before adjudicating):**

- "Critic A: proposed [N] removals, [M] scope reductions, [K] caveats."
- "Critic B: proposed [N] removals/deferrals, [M] simpler alternatives, [K] hypothesis misalignments. SA scores: [range]. Score challenges: [N]."

If Critic A removals = 0 AND scope reductions = 0 simultaneously, trigger the Critic A quality check re-spawn regardless of other outputs.

After both critics return, adjudicate each challenge. Critic A and Critic B findings are independent — a component challenged by both critics requires stronger justification to retain.

Evaluate each challenge:

- **Valid with codebase evidence (Critic A) or strategic argument (Critic B):** Incorporate — remove, split, reorder, or add dependency
- **Valid but minor:** Add a caveat in the Description column
- **Reasoning-only (no file:line for A / no user pain anchor for B):** Add as a caveat only; do not remove a component based on unevidenced reasoning alone
- **Invalid:** Reject with explanation; keep the proposal unchanged

Record adjudication results: "Incorporated: [N]. Rejected: [M]. Summary: [one line]." This feeds into the §6 presentation.

**Per-category protection:** Critics may challenge individual items within each category, but cannot eliminate an entire category. If Critic A or Critic B recommends removing all items from Category A (Quick Wins) or all items from Category B (Strategic Phase), the adjudicator must retain the highest-scoring item from the threatened category and note: "Retained [item] — category minimum." This prevents the pattern where critics kill all strategic work and leave only trivial fixes, or kill all fixes and leave only ambitious proposals that cannot be started immediately.

**Post-adjudication score recalculation:** Replace the default SA=2 values in the §4d composite table with Critic B's actual Strategic Alignment scores, and replace Explorer 4's proposed MC values with Critic B's adjudicated MC values (demotions from task 7a applied; promotions from task 7a applied only when Critic B cited the document's framing). Recalculate composites using `Value = MC × (UI × 3 + UP × 2 + SA × 2 + EU × 1.5 + DR × 1) / (IS × 1.5)`. Re-enforce the MC cap after adjudication: at most one MC = 1.5, at most two MC ≥ 1.25 across the full table. If the recalculated ordering differs from the pre-critic ordering, note which candidates moved and why (SA change, MC change, or both) — this feeds the "Score disputes resolved" line in §6.

**Build-order respect after adjudication:** If Critic B (task 7b) recommended restoring document-internal order for any candidate, apply the restoration before §6 presentation. Note restorations in the §6 output as "Build-order restored: [candidate] per [document:line]."

---

## §5b. Convergence Detection

Before presenting to the user, run this mechanical check to catch the most common subagent failure: all agents converged on the same safe subset of obvious candidates.

**Convergence is flagged if ANY of the following are true:**

1. All explorer findings overlap by > 70% — every explorer identified the same top candidates with no unique finds.
2. Zero disconfirming evidence was reported by Explorer 1 for any candidate — no candidate was challenged as "should NOT be built."
3. All proposals are additive (no interface-requiring or breaking candidates) AND the project has been active for more than 6 months — a mature project should surface some interface evolution work.
4. No hypothesis from §0 was refuted by any explorer — if all hypotheses were confirmed, the investigation was not thorough enough to falsify anything.
5. Critic B found no strategic misalignments — if Critic B raised zero challenges, re-run Critic B with stricter framing before proceeding. **Note:** If the §5 Critic B quality check already triggered a re-spawn and that re-spawn also found no misalignments, skip condition 5 and add a convergence warning to the §6 presentation rather than spawning a third time.
6. No explorer finding contradicts or complicates a finding from another explorer — if all findings are mutually compatible and reinforcing with no tension, genuine independent investigation almost certainly did not occur. Before proceeding, identify at least one cross-explorer tension point (a case where Explorer A's finding creates a question or caveat for Explorer B's conclusion). If none can be identified, flag convergence and note it in §6.

**If convergence is flagged:**

- Announce: "Convergence detected: [which condition triggered]. Re-spawning Explorer [most relevant] with disconfirmation focus."
- Re-spawn the flagged explorer with explicit instruction: "Your previous findings overlapped too heavily with other explorers. Specifically investigate: [what was missed]. Your goal is to find DIFFERENT candidates — not confirm existing ones."
- After re-spawn, merge new unique findings into the proposal. If the re-spawn still returns no unique findings, proceed but note in the §6 presentation: "Convergence warning: explorers found high agreement — proposals may underrepresent non-obvious candidates. User may want to provide a specific document (Tier 3) for a more targeted analysis."

**If no convergence is flagged:** proceed to §6 without note.

---

Phase complete. Read `SKILL-phase-6-present.md` and execute it immediately.
