# Phase 4: Revise + Verify (Direct Invocation Only)

**Goal:** Apply the verified target text to the document and run mechanical verification. This phase runs only during direct invocation — when called by the planner or executor, they handle verification through their own protocols.

### Write/Modify mode

#### 4a. Apply changes

For each change in the Change Specification:

1. Use targeted edits (StrReplace) to apply the target text
2. After each edit, re-read the edited section plus 5 lines before and after
3. Verify: target text applied correctly, smooth transitions, no formatting inconsistencies

#### 4b. Run mechanical verification

Run all 13 dimensions from the executor's `4-doc-c` table:

| #   | Dimension                       | Method                                               |
| --- | ------------------------------- | ---------------------------------------------------- |
| 1   | Change specification compliance | Re-read Change Spec vs actual document               |
| 2   | Factual accuracy                | Grep codebase for every technical claim              |
| 3   | Cross-document consistency      | Grep sibling docs for key terms                      |
| 4   | Link validity                   | Glob for every markdown link target                  |
| 5   | Writing quality                 | Critic 1 output — all issues resolved                |
| 6   | No regressions                  | git diff — only intended sections changed            |
| 7   | ToC-body structure match        | Parse ToC and body headings, verify match            |
| 8   | Scope-adjacent consistency      | Grep full document for key concepts                  |
| 9   | Pre-existing issue scan         | Grep for GAP, TODO, FIXME, stale phases              |
| 10  | Content format compliance       | Tables for definitions, ToC entries for new sections |
| 11  | Cross-doc term ripple           | Grep all documentation/ for old terms replaced       |
| 12  | Intra-document consistency      | Grep full document for same-mechanism descriptions   |
| 13  | Blockquote integrity            | Grep for disconnected blockquotes and note density   |

Dimensions 1-7, 10, 12, and 13 must be clean. Dimensions 8-9 are informational. Dimension 11 is blocking within scoped files only.

#### 4c. Present results

Report to the user:

- What was changed (section-by-section summary)
- Explorer findings (Phase 1 highlights)
- Critic results (Phase 3 — issues found and resolved)
- Mechanical verification results (Phase 4b — dimension-by-dimension)
- Follow-up items (issues outside scope noted by critics)
- Open questions (unresolved factual discrepancies)

### Audit mode

#### 4d. Present the Audit Report

Present the Structured Audit Report to the user as a formatted dashboard:

1. **Executive summary first** — the verdict (PASS / ADVISORY / FAIL) and severity counts
2. **Section-by-section assessment** — status per document section with key findings
3. **Corrections required** — each correction with its Change Specification and severity
4. **Observations** — informational findings
5. **Open questions** — unresolved claims

Do not present the full factual accuracy inventory or structural integrity details unless the user asks — these are available on request. Lead with what matters: verdict, corrections, and observations.

#### 4e. Apply approved corrections

After presenting the report:

1. Apply all corrections from the Corrections Required section. If the user requests selective application, apply only the approved subset.
2. For each applied correction, re-read the edited section plus 5 lines before and after to verify correct application.
3. Run mechanical verification (dimensions 1-7, 10, 12, 13 from 4b) on the applied corrections only.

#### 4f. Re-present with applied status

After applying corrections, update the report:

- Mark each applied correction as APPLIED
- Update the executive summary verdict if corrections changed the outcome (FAIL with all critical corrections applied becomes ADVISORY or PASS)
- List any corrections that were not applied and why
