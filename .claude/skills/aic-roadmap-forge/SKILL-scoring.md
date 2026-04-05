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

`Value = (UI × 3 + UP × 2 + SA × 2 + EU × 1.5 + DR × 1) / (IS × 1.5)`

Higher composite = higher priority. User Impact is weighted highest because features users need drive adoption. Implementation Surface is in the denominator because harder work must clear a higher value bar.

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
