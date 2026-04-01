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

---

Phase complete. Read `SKILL-phase-3-investigate.md` and execute it immediately.
