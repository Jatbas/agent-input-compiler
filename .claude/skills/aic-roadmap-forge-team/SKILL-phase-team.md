# Team Phase: Parallel Tracks + Synthesis

**Goal:** Launch Track A (documentation gaps + embedded Critic A) and Track B (technical + external + embedded Critic B) simultaneously. Synthesize across both tracks including cross-track convergence scoring.

This phase replaces §3 Investigate + §4 Synthesize + §4i Self-review + §5 Adversarial Review from the original.

## Pre-conditions (from §0-§2)

Before launching tracks, confirm these are in context from the SKILL-phase-0-frame.md execution:

- §0 strategic hypothesis list (3-5 hypotheses)
- §1 gap candidate list (from project-plan + impl-spec)
- §2 SKILL-investigation.md sections extracted
- Input source tier (1, 2, or 3) and resolved input documents

## Launch Track A and Track B simultaneously (MANDATORY)

Make 2 subagent calls in the same message.

### Track A — Documentation Gaps Track (`generalPurpose` subagent)

**Prompt to pass:**

You are the Documentation Gaps Track for a roadmap generation task. Run Explorer 1, then immediately run Critic A on Explorer 1's output.

§1 candidate list: [CANDIDATE_LIST]
Progress file excerpt (current phases): [AIC_PROGRESS_MD_EXCERPT]

**Step A1 — Run Explorer 1 (Documentation gap analyst):**

Read `../aic-roadmap-forge/SKILL-phase-3-investigate.md` and follow the Explorer 1 specification exactly. Key requirements:

- Investigate only the §1 candidate list; do not add candidates not in §1
- For every candidate: verify it is genuinely absent from aic-progress.md, perform secondary codebase check, run disconfirmation check (mandatory — evidence-against column must be non-empty for every row)
- Score Unblock Potential (UP) per `../aic-roadmap-forge/SKILL-scoring.md` with forced distribution
- Return in the required output format (table) from SKILL-phase-3-investigate.md
- End with STATUS: FINDINGS_COMPLETE, STATUS: FINDINGS_WITH_CONCERNS, STATUS: NEEDS_CONTEXT, or STATUS: BLOCKED

**Step A2 — Immediately after Explorer 1 returns, run Critic A (Feasibility check):**

For each Explorer 1 candidate with status Verified:

- Read the "Surface" field from Explorer 1's table (pipeline step, adapter, storage migration, MCP handler, etc.)
- Search the codebase for the infrastructure required to build this surface type
- Score feasibility: READY (required infrastructure exists — cite file:line), PARTIAL (partial infrastructure exists — cite what exists and what is missing), MISSING (no infrastructure — cite what must be built first)
- Require at least 1 file:line citation per feasibility assessment

**Output:** Explorer 1 table (as returned) + Critic A feasibility table with columns: Candidate | Feasibility (READY/PARTIAL/MISSING) | Infrastructure evidence (file:line) | Missing prerequisites.

---

### Track B — Technical + External Track (`generalPurpose` subagent)

**Prompt to pass:**

You are the Technical + External Track for a roadmap generation task. Run Explorer 2 and Explorer 3 in parallel, then run Critic B on their combined output.

§0 strategic hypotheses: [HYPOTHESIS_LIST]
Progress file excerpt (current phases): [AIC_PROGRESS_MD_EXCERPT]

**Step B1 — Launch Explorer 2 and Explorer 3 in parallel:**

Explorer 2 (Codebase optimizer): Read `../aic-roadmap-forge/SKILL-phase-3-investigate.md` and follow the Explorer 2 specification exactly. Score Implementation Simplicity (IS) and Dependency Reduction (DR) per `../aic-roadmap-forge/SKILL-scoring.md`. Return in the required output format with minimum 5 file:line citations.

Explorer 3 (External research): Read `../aic-roadmap-forge/SKILL-phase-3-investigate.md` and follow the Explorer 3 specification exactly. Use WebSearch and WebFetch. Score User Impact (UI) and Ecosystem Urgency (EU) per `../aic-roadmap-forge/SKILL-scoring.md`. Return in the required output format with minimum 6 URLs across all rows. Run both Strategy A and Strategy B searches — minimum 2 findings from each strategy.

**Step B2 — After Explorers 2 and 3 return, run Critic B (Strategic fit check):**

For each candidate from Explorer 2 with IS ≥ 3, and each candidate from Explorer 3 with UI ≥ 3:

- Check: does this address a confirmed user pain point (from Explorer 3 Strategy B findings)?
- Check: does this align with or contradict the §0 strategic hypotheses?
- Classify: HIGH_FIT (addresses user pain AND aligns with §0 hypotheses — cite both evidence sources), MEDIUM_FIT (addresses user pain OR aligns with §0 hypotheses — cite the one that applies), LOW_FIT (neither — explain why it still merits consideration or exclude it)
- Require at least 1 citation per classification (file:line for Explorer 2 candidates, URL for Explorer 3 candidates)

**Output:** Explorer 2 table + Explorer 3 table + Critic B strategic fit table with columns: Candidate | Fit (HIGH/MEDIUM/LOW) | User pain evidence | §0 alignment evidence.

---

## Collect track outputs and validate

After Track A and Track B return:

1. Validate Explorer status codes — if STATUS: NEEDS_CONTEXT: provide context and re-dispatch (does not count toward re-spawn cap). If STATUS: BLOCKED: narrow scope, accept degraded output with warning, or skip with a note in §6.
2. Track A: verify Critic A feasibility table has at least 1 file:line citation per row
3. Track B: verify Critic B strategic fit table has at least 1 citation per row; verify Explorer 3 has ≥ 3 Strategy A and ≥ 3 Strategy B findings
4. Cross-track candidate detection: scan Track A's candidate names against Track B's candidate names for any exact or near-exact matches (same feature described differently) — list these as convergent candidates with both track names

## Synthesis (§4 + §4i combined)

Read `../aic-roadmap-forge/SKILL-scoring.md` for composite scoring.

**Step 1 — Build unified candidate list** combining Track A and Track B outputs.

**Step 2 — Apply cross-track convergence boost:** for each convergent candidate (identified above), add +1 to its UP score. This is a positive signal — independent tracks found the same candidate without coordination. Note each boost in the scoring rationale.

**Step 3 — Composite scoring:** for each candidate, combine:

- UP from Track A (+ boost if convergent)
- IS and DR from Track B (Explorer 2 candidates only; 0 for documentation-gap candidates)
- UI and EU from Track B (Explorer 3 candidates only; 0 for codebase candidates)
- Feasibility weight from Critic A (READY = no penalty, PARTIAL = -0.5 to composite, MISSING = -1 to composite)
- Strategic fit from Critic B (HIGH_FIT = +0.5, LOW_FIT = -0.5)

**Step 4 — Group into phase proposals:** same grouping rules as original §4 (read `../aic-roadmap-forge/SKILL-phase-4-synthesize.md` for grouping rules, including the mandatory dual-output: Category A Quick Wins + Category B Strategic Phase).

**Step 5 — Apply gates:**

- Evidence density: minimum 2 citations per phase proposal (file:line or URL)
- Escape hatch floor: minimum 1 speculative candidate per phase (score it honestly; do not inflate)
- Second-order implications: for each proposal, identify what else becomes possible if this is built

**§4i Self-review:** Run all checks from §4i in `../aic-roadmap-forge/SKILL-phase-4-synthesize.md` against the unified candidate list.

## Convergence Detection (§5 — inverted check)

**Within-track convergence (problem):** If Track A's top 3 candidates all came only from Explorer 1 with no disconfirmation, or Track B's top 3 candidates from Explorer 2 and 3 are identical to §0 hypotheses with no new angles — re-spawn the relevant explorer with a narrower, disconfirmation-focused prompt. Maximum 1 re-spawn per explorer.

**Cross-track convergence (positive signal):** A candidate appearing in both Track A and Track B is already scored via the +1 UP boost in §4. Note each cross-track convergent candidate in the §6 presentation with: "Cross-track convergence: found independently by both Track A and Track B — strong signal."

---

Phase complete. Read `../aic-roadmap-forge/SKILL-phase-6-present.md` and execute it immediately.
