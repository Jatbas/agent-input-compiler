# Phase 2: Reconciliation + Apply

**Goal:** Two critics review Track A's draft against Track B's verification requirements. The orchestrator applies the reconciled final text to the target document.

## Launch 2 critics in parallel (MANDATORY)

Make 2 subagent calls in the same message. Pass both Track A's draft and Track B's Verification Report to Critic 1. Pass only a one-sentence description of the proposed changes to Critic 2 (not the full draft).

### Critic 1 — Editorial + Track B reconciliation (`generalPurpose` subagent)

**Prompt to pass:**

You are reviewing a Change Specification against an independent Verification Report.

Change Specification (from Track A):
[PASTE TRACK A DRAFT]

Verification Report (from Track B):
[PASTE TRACK B REPORT]

Writing standards: read `../aic-documentation-writer/SKILL-standards.md`.

Checks to perform:

1. For each Track B structural requirement: is it satisfied in the Change Specification? Report SATISFIED or GAP with location.
2. For each Track B quality requirement: does the writing match the required audience level and tone? Report MATCHES or DEVIATION with specific sentences.
3. For each Track B stale marker: does the Change Specification address it or explicitly defer it? Report ADDRESSED, DEFERRED, or MISSED.
4. Editorial quality: passive voice frequency, sentence length variance, heading hierarchy — flag violations against `SKILL-standards.md`.

Return: structured findings list (SATISFIED/GAP/MATCHES/DEVIATION/ADDRESSED/DEFERRED/MISSED with evidence), revised sentences for each issue, overall verdict (PASS = zero unresolved gaps; FAIL = list of gaps).

---

### Critic 2 — Independent factual verification (`explore` subagent)

**CRITICAL:** Do NOT pass Track A's Change Specification or Track B's Verification Report to this subagent. Critic 2 verifies facts independently (double-blind).

**Prompt to pass:**

You are performing independent factual verification. You do not have access to any draft or prior analysis — this is intentional.

The proposed documentation update involves: [ONE_SENTENCE_SUMMARY — describe what changed, e.g. "updating the session-start lock documentation to reflect that the lock TTL is now 30 seconds instead of 10 seconds"]

For each technical claim implied by the proposed change:

- Grep the codebase to verify it independently
- Return: `[claim] — [source file:line] — VERIFIED / NOT FOUND / CONTRADICTED`
- Minimum 1 file:line citation per claim

Do not reference any findings from other agents. Start from scratch.

---

## Reconcile critic outputs

After both critics return:

1. For each CONTRADICTED claim from Critic 2: remove the corresponding sentence from the Change Specification and replace it with the verified fact from Critic 2's source citation
2. For each GAP in Critic 1's output: revise the relevant section of the Change Specification to satisfy the Track B requirement
3. For each DEVIATION in Critic 1's output: revise the sentence to match the audience level and tone requirement
4. For each MISSED stale marker in Critic 1's output: either address it in the Change Specification or add it to a Follow-up Items section

If Critic 1 returns FAIL (unresolved gaps): fix each gap before applying. If Critic 2 returns 2+ CONTRADICTED claims: re-read Track B's Verification Report and Track A's draft together before applying the fix — the contradiction may indicate a misunderstood requirement.

## Apply final text

Apply the reconciled Change Specification directly to the target document file(s).

**Verify:**

- Read the modified target document — confirm each Track B structural requirement is present
- Confirm Critic 2 found zero CONTRADICTED claims in the applied text (re-check the final file against Critic 2's verified facts)
- Confirm Critic 1 returned PASS (zero unresolved gaps) after reconciliation
