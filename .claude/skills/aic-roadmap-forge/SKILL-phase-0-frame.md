# Phase 0: Strategic Framing, Current State & Pre-Spawn Setup

## §0. Strategic Framing

**Run before reading any file — including aic-progress.md.** Do NOT skip — prevents convergence on obvious proposals.

Generate **3-5 hypotheses** about where the project should go. Each hypothesis is a possible answer to: _"What should AIC become in the next 6-12 months?"_

**Hypothesis rules:**

- Generate before reading any file. Do not anchor on what is already tracked.
- Each hypothesis is falsifiable and direction-setting, not a list of features. Each must name (1) a specific subsystem or behavior, (2) a specific user pain with observable symptoms, (3) measurable success criteria. A hypothesis applicable to any project unchanged fails this bar. Failing example: "AIC should improve performance because it addresses developer wait-time pain." Passing example: "AIC's context compilation is bottlenecked by synchronous file reads in the guard phase — batched async reads would cut p95 compile time materially, which matters because slow hook responses degrade Cursor's agent responsiveness."
- Cover different angles: growth/adoption, technical depth, ecosystem positioning, developer experience, and market differentiation. At least one hypothesis should feel non-obvious or surprising — specific enough that a reader thinks "that's an unexpected bet."
- One hypothesis MUST argue against the current direction by naming a specific component to simplify, remove, or consolidate. Use the template: "What if [specific component] adds more complexity than value because [specific reason]?" A generic "we should simplify something" hypothesis fails this rule.
- **Self-check:** If any hypothesis would be confirmed by any plausible investigation, rewrite it — too vague.

**Announce hypotheses** before proceeding: "Strategic hypotheses: [list]." These will be tested against the evidence throughout the investigation.

**Hypothesis-driven investigation:** In §3, each explorer uses the hypotheses as a lens. Explorer 1 checks: "which hypotheses are supported or refuted by the documentation gaps?" Explorer 2: "which hypotheses are supported or refuted by the codebase state?" Explorer 3: "which hypotheses are supported or refuted by the external ecosystem?"

---

## §1. Establish Current State

Read these files **before** spawning any explorer:

1. `documentation/tasks/progress/aic-progress.md` (main workspace only) — understand every phase, every component, every status. Build an inventory of what is already tracked (regardless of Done/Not started).
2. The resolved input source(s) from Input Routing above.

**Gap identification:** The core question is: _"What appears in the input source(s) as planned, desired, or architecturally implied — but is absent from every phase table in aic-progress.md?"_

List candidates before proceeding. For each candidate, note that "absent from phase tables" is necessary but not sufficient — a component may be tracked under a different name, or already fully implemented in code. Explorer 1 will verify both.

If there are zero candidates from the input source, ask the user whether to proceed with Tier 2 fallback (if currently on Tier 1) or to focus on Explorer 2 (codebase optimizations) + Explorer 3 (external research) only.

---

## §2. Pre-Spawn Setup (mandatory before §3)

Before spawning any explorer, read `.claude/skills/shared/SKILL-investigation.md` and extract:

- The **Codebase Investigation Depth** section — paste verbatim into Explorer 1's prompt.
- The **Runtime Evidence Checklist** section — paste verbatim into Explorer 2's prompt.

Do NOT instruct subagents to read this file themselves. The parent agent reads it once and injects the content. This matches the protocol stated in the shared file itself.

**Fallback:** If `.claude/skills/shared/SKILL-investigation.md` does not exist or the named sections cannot be found, announce: "SKILL-investigation.md not found — proceeding without section injection. Explorer investigation depth may be reduced." Continue without blocking, but note this in the §6 presentation.

---

Phase complete. Read `SKILL-phase-3-investigate.md` and execute it immediately.
