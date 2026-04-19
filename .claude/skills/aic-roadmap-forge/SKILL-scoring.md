Reference material for the roadmap-forge skill. Read this when scoring candidates in §3 or §4.

---

## Value Scoring Rubric

Each explorer scores candidates on the dimensions in its mandate. Scores use a **1-5 integer scale** with forced distribution to prevent clustering.

### Dimensions

| Dimension              | Code | Definition                                      | Scored by                        |
| ---------------------- | ---- | ----------------------------------------------- | -------------------------------- |
| User Impact            | UI   | Direct effect on end-user experience            | Explorer 3, Critic B (challenge) |
| Unblock Potential      | UP   | Downstream work this enables                    | Explorer 1                       |
| Strategic Alignment    | SA   | Fit with AIC's core thesis                      | Critic B (exclusive)             |
| Ecosystem Urgency      | EU   | External competitive pressure                   | Explorer 3                       |
| Debt Reduction         | DR   | Maintenance or simplification improvement       | Explorer 2                       |
| Implementation Surface | IS   | Effort and risk (higher = harder — denominator) | Explorer 2, Critic A (challenge) |

### Composite Formula

`Value = MC × (UI × 3 + UP × 2 + SA × 2 + EU × 1.5 + DR × 1) / (IS × 1.5)`

Higher composite = higher priority. User Impact is weighted highest because features users need drive adoption. Implementation Surface is in the denominator because harder work must clear a higher value bar. **MC** is the Meta-Capability Multiplier (see below); default `1.0` when not a meta-capability, so omitting it leaves composite scores unchanged.

### Meta-Capability Multiplier (MC)

Some candidates are **meta-capabilities**: shipping them makes **other capabilities** measurably better, tunable, or observable. The canonical example is a **feedback / tuning substrate** — once it exists, every downstream feature can be measured against it. Treating a meta-capability with only UP:5 (capped, and weighted ×2) understates its leverage because UP counts only **directly** unblocked components, not the quality improvement of all future work.

**MC values:**

- **1.0 (default)** — Not a meta-capability. Applies to the vast majority of candidates.
- **1.25** — Cross-cutting infrastructure that enables other work but is not itself a measurement / tuning / observability primitive. Example: the extensions framework (item 0 in the memory spec) — all extensions depend on it, but it doesn't improve the **quality** of extensions, only enables their delivery.
- **1.5** — Measurement / tuning / observability primitive: once shipped, the **quality** of every subsequent feature in its class can be evaluated or tuned against it. Example: a feedback-loop extension (`feedback_events` store + decorators over selector/ladder/assembler) — every future selector, summariser, or memory extension gains a signal for whether it actually helped.

**MC eligibility criteria (all three must hold for MC ≥ 1.25):**

1. **Class-level impact.** The candidate enables or improves an **entire class** of future work — not one specific downstream component, not a small set listed by name. If you can enumerate the beneficiaries in a single short list, it's UP, not MC.
2. **Directional asymmetry.** Shipping the meta-capability second (after its beneficiaries) would require retrofitting each beneficiary individually, and that retrofit cost scales with the number of beneficiaries. Shipping it first means each beneficiary picks it up naturally.
3. **Evidence in the input source.** The input document (Tier 2 or 3) or an explorer finding explicitly identifies the candidate as an unlock for a class of work — not just one feature. Self-serving "this is strategic" claims without explicit evidence in the source default MC back to 1.0.

**MC = 1.5 additionally requires:** the candidate provides a **measurement or tuning signal**, not just a delivery vehicle. Delivery-only infrastructure (extensions framework, new composition root wiring, shared adapters) gets 1.25; primitives that let you **evaluate** whether other work is helping get 1.5.

**Anchor examples:**

| Candidate                                            | MC   | Rationale                                                                          |
| ---------------------------------------------------- | ---- | ---------------------------------------------------------------------------------- |
| Extensions framework (memory spec item 0)            | 1.25 | Delivery vehicle for all extensions; no measurement signal                         |
| Feedback-loop extension (memory spec §A.10, item 12) | 1.5  | Tuning substrate for selector / ladder / memory / assembler                        |
| Task boundary detection (memory spec §A.11, item 13) | 1.0  | Cross-cutting quality improvement but single-layer; not a primitive for other work |
| Fix-history extension (memory spec §A.8, item 10)    | 1.0  | Standalone memory source; beneficiaries are enumerable (not class-level)           |
| Memory extension MVP (memory spec item 1)            | 1.0  | High-value feature, but not a meta-capability                                      |

**MC assignment during forge:**

- Explorer 4 (specific document deep-read) proposes MC for each candidate based on the document's own framing and build-order signals. Default: 1.0.
- Critic B (strategic fit) must explicitly challenge any MC ≥ 1.25 that does not meet all three eligibility criteria, and must flag any candidate that **should** have MC ≥ 1.25 but was assigned 1.0 (see Phase 5 §Critic B task 7a).
- After adjudication, the parent agent applies the adjudicated MC in the final composite recalculation alongside the SA update.

**Guard against inflation:** In any proposal, at most **one** candidate may carry MC = 1.5 and at most **two** may carry MC ≥ 1.25. If more are proposed, the parent agent re-reads the eligibility criteria and demotes the weakest to 1.0 until the cap holds. Meta-capability is by definition rare — if the proposal claims three of them, the framing is wrong.

### Score Justification (mandatory)

Every score must include a one-line justification in the explorer's output table. The justification names the specific evidence that produced the score. Examples:

- "UP: 4 — unblocks memory extension (item 1) and editor memory (item 2) in the roadmap mapping"
- "UI: 2 — improves internal code quality but no user-visible behavior change"
- "EU: 5 — Cursor removed cross-session memory in v0.48; users actively requesting alternatives (GitHub issue #1234)"
- "IS: 3 — requires new adapter + interface + test file, no migration"

A bare number (e.g., "UP: 4") without justification is treated as an invalid score. The parent agent will set unjustified scores to the conservative default of 2.

### Forced Distribution (per explorer, per dimension)

Each explorer must enforce across all candidates they score on a given dimension:

- At most 2 scores of 5
- At least 1 score of 1 or 2 when scoring 4+ candidates
- No dimension where all candidates score 3 or 4 — if this occurs, re-rank relative to each other

### Anchor Examples

| Score | UI                                                            | UP                                                | EU                                                    | IS                                                                       |
| ----- | ------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| **5** | Users are leaving tools without this capability               | Unblocks 3+ tracked components or an entire phase | Competitors shipped it; users expect it within months | New pipeline step + storage migration + 3+ interfaces + composition root |
| **3** | Improves workflow for a subset of users in specific scenarios | Unblocks 1 tracked component                      | Industry trend, no direct competitive pressure yet    | New adapter + interface + tests                                          |
| **1** | No user-visible change; internal-only                         | Standalone; nothing depends on it                 | Academic/theoretical; no production adoption          | Single file change, config addition                                      |

### Score Inflation Detection

If the §4d aggregated scores show **more than 40% of candidates with composite above 8.0**, scores are inflated. Re-examine the highest-scored dimension across all candidates and apply forced distribution more strictly — at least one candidate must score 1 on that dimension.

### Disconfirmation Strength (DS)

After adversarial review (§5), apply a disconfirmation adjustment to the post-critic composite score:

- **Strong disconfirmation with evidence:** If Explorer 1 reported disconfirming evidence against a candidate AND neither critic refuted the disconfirmation, apply −0.5 to the composite score.
- **Survived disconfirmation:** If a candidate had strong disconfirming evidence but both critics found it insufficient or wrong, note "Survived disconfirmation" in the §6 presentation. This is a positive signal — the candidate was stress-tested and held.
- **No disconfirmation attempted:** No adjustment. Candidates that were never challenged by disconfirming evidence are neither penalized nor rewarded — note their absence from disconfirmation in §6 as an advisory caveat.
