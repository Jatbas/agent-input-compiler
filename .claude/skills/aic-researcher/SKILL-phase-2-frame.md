# Phase 2: Frame the Investigation

## §2. Frame the Investigation

**Goal:** Before reading any code, reason about what the answer might be and design a systematic investigation.

### 2a. Restate the question

Write a precise, unambiguous restatement. If the original question is vague ("how can we improve X?"), narrow it: "What are the specific weaknesses in X's current implementation, and what concrete changes would address each one?"

### 2b. Generate hypotheses (gap/improvement and technology evaluation only)

Generate 3-5 hypotheses BEFORE reading any code. Each hypothesis is a possible answer to the question.

**Hypothesis generation heuristics:**

For gap/improvement analysis:

- "The problem might be in [layer]" — one hypothesis per plausible layer
- "The problem might be caused by [pattern]" — one hypothesis per suspect pattern (performance, architecture, missing feature, wrong abstraction)
- "Improvement X might work because [reason]" — one hypothesis per approach

For technology evaluation:

- "Technology X is the best fit because [reason]"
- "Technology Y is better despite being less popular because [reason]"
- "Neither X nor Y — the real solution is [alternative approach]"

**Write each hypothesis as a falsifiable claim.** Not "X might be slow" but "X's token counting is O(n^2) due to [suspected reason], causing latency above [threshold] for large files."

### 2c. Design the investigation plan

For each hypothesis (or each dimension for codebase/documentation analysis), define:

1. **What to investigate** — specific files, directories, patterns
2. **What evidence would confirm** — concrete observations that would make the hypothesis more likely
3. **What evidence would disconfirm** — concrete observations that would make the hypothesis less likely
4. **Assigned explorer** — which subagent handles this

**Explorer assignment rules:**

- Each explorer gets a focused, non-overlapping investigation area
- Maximum 4 explorers (tool limit for parallel subagents)
- Each explorer's prompt includes: the specific hypothesis/dimension, what to search for, what evidence to collect, and the evidence format to return
- Explorers do NOT see each other's assignments (prevents anchoring)

### 2d. Classification-specific framing

Read the `SKILL-protocols.md` sibling file for the detailed protocol matching this question's classification. It contains investigation dimensions, explorer assignments, and evidence collection patterns specific to each type.

### 2e. Framing challenger gate (MANDATORY — HARD RULE 3 + HARD RULE 7)

Before Phase 3 dispatches any explorer, dispatch the framing challenger. This is a single subagent rendered from `.claude/skills/shared/prompts/framing-challenger.md` with the strongest available model (routed via `.claude/skills/shared/prompts/ask-stronger-model.md` — see `.claude/skills/shared/SKILL-routing.md`).

**Input to the challenger:** ONLY the §2a restatement and §2b hypotheses. It does NOT see the investigation plan, explorer assignments, or any code evidence — this keeps it anchored to framing, not findings.

**Prompt task (verbatim from template):** "For each hypothesis: (1) identify the unstated assumption, (2) propose a counter-hypothesis that could be true, (3) name a blind spot. Return a JSON verdict: `{ verdict: 'sound' | 'mis-framed' | 'partially-framed', table: [...] }`."

**Gate behavior:**

- `sound` — proceed to Phase 3. The challenger's table is stored for the Phase 4 critic.
- `partially-framed` — update the §2c investigation plan to cover the called-out blind spots (add/restructure explorer assignments), then proceed to Phase 3.
- `mis-framed` — **STOP.** Summarise the reframing options to the user and wait. Do NOT dispatch explorers.

Record the verdict JSON under `.aic/runs/<run-id>/framing-challenger.json` and checkpoint `framed` only after a `sound`/`partially-framed` verdict is recorded (or the user has approved a reframing).

---

Phase complete. Read `SKILL-phase-3-investigate.md` and execute it immediately.
