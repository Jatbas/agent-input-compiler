# AIC Documentation Review — Multi-Persona Analysis

**Created:** 2026-02-28
**Purpose:** Identify gaps, confusion points, and improvement opportunities in AIC's public-facing documentation by reading it through four distinct professional lenses.
**Documents reviewed:** `README.md`, `documentation/implementation-spec.md`, `documentation/project-plan.md`

---

## Methodology

Each persona reads the documentation cold — no prior context, no conversations with the author. The question for each is: "What would I think, what would I appreciate, what would confuse me, and what's missing?"

**Important note:** `aic-rules/` (custom rule packs authored per project) is internal to AIC's pipeline. It is not a user-facing customization surface. Several documentation sections present it as a user feature — this is flagged under the cross-cutting gaps.

---

## 1. Developer (Individual Contributor)

### What they'd appreciate

- **Setup is dead simple.** One JSON entry in the editor's MCP config (or a one-click deeplink for Cursor), and AIC auto-bootstraps on first use. A developer could be running in under 5 minutes.
- **`aic_inspect` is a standout feature.** Being able to see exactly which files were selected, why, and how they were transformed — without executing anything — is exactly the kind of transparency developers want. The worked pipeline example in the project plan (section 13.1) is excellent.
- **Best practices section is useful.** Unlike most "best practices" docs, these explain _why_ with technical reasoning (attention degradation, compaction loss). Trustworthy advice.
- **The architecture is clean.** Hexagonal approach, branded types, immutability constraints, SOLID enforcement — this is a codebase a developer would enjoy contributing to.

### What would concern or confuse them

**DR-01: The `aic_inspect` output in the README is synthetic.**
The first thing a developer would try after installing is using `aic_inspect`. If their real output looks nothing like the polished example, trust erodes immediately.
_Fix:_ Replace the synthetic example with real output captured from an actual project.

**DR-02: No "verify your setup" section.**
The README setup says "Done." after registering the MCP server, but there's no way to verify it's actually working. Did it compile? Did it select files? The "First-Run Message" exists in the MVP spec but isn't mentioned in the README.
_Fix:_ Add a "Verify your setup" section with something like `aic compile "hello world" --verbose` and explain what to expect in the output.

**DR-03: No example of actual compiled output.**
The README shows the `aic_inspect` breakdown but never shows an example of the actual compiled prompt — the thing the model receives. A developer would want to see what calling `aic_compile` with "fix the login bug" outputs to the model.
_Fix:_ Add a brief example of the assembled prompt showing the task, context, and constraints sections the model sees.

**DR-04: Token reduction claims are vague.**
"Significant reduction" appears multiple times. The one data point (303K raw to ~8K compiled) is in `gaps.md`, not in the README. A developer wants a rough sense of savings.
_Fix:_ Even a range like "typically 80–95% reduction" with a caveat that formal benchmarks are in progress would be better than no number at all.

**DR-06: Contributing section is too thin.**
"For the full guide — see Project Plan" is a redirect. Most developers won't click through to a 3,000-line architecture document to learn how to contribute.
_Fix:_ Include the key requirements inline (SOLID compliance, commit format, test requirements) or create a standalone `CONTRIBUTING.md`.

---

## 2. Team Lead

### What they'd appreciate

- **Shared config via git.** `aic.config.json` committed to the repo means every team member gets the same budget, guard exclusions, and transformer settings. This is the "consistency" problem team leads are trying to solve.
- **Context Guard.** Secrets excluded from compiled context gives confidence for compliance conversations with security.
- **Deterministic behavior.** Same input = same output means the team lead can reproduce what team members see, debug their issues, and trust the tool in code review.

### What would concern them

**DR-07: No team deployment story.**
How does a team lead roll this out to a team of 10? The README describes individual setup. There's no mention of team-wide MCP config, onboarding automation, or recommended practices for teams. The project plan mentions `postinstall` team deployment in Phase 1, but nothing for today.
_Fix:_ Add a "Team Setup" section to the README: "Commit `aic.config.json` to your repo. Each developer registers the AIC MCP server once (deeplink for Cursor, plugin for Claude Code). Config is shared via git — all team members get the same context selection, budget, and guard settings."

**DR-08: No guidance on measuring impact.**
A team lead needs to justify adoption to their director. "It reduces tokens" isn't enough. How do they measure whether the team's AI output quality improved? The "show aic status" prompt command shows compilation stats, but there's no way to track whether hallucinations decreased or code review rejections dropped.
_Fix:_ Add a "Measuring Impact" section. Acknowledge AIC measures compilation efficiency. Suggest complementary external metrics: code review rejection rate, model re-prompt frequency, time-to-first-useful-output.

**DR-09: Telemetry data can't cross project boundaries.**
"show aic status" shows stats for one project. A team lead managing 5 repos wants a cross-project view. ADR-005 explicitly excludes this (per-project isolation).
_Fix:_ Acknowledge this limitation in the documentation. Suggest a workaround (using "show aic status" per project). Note that a Phase 2 aggregation layer is planned.

**DR-10: No guidance on config precedence across team members.**
What happens if a developer has local config that conflicts with the shared `aic.config.json`? Is there a personal config layer? A precedence order?
_Fix:_ Clarify in the README or MVP spec that AIC uses project-level `aic.config.json` only — there is no personal config override. If personal overrides are planned, document the precedence.

**DR-11: No CI/CD integration guidance.**
Can the team lead use `aic_compile` or `aic_inspect` in CI to validate that context selection isn't regressing? This would be hugely valuable for teams.
_Fix:_ Add a brief CI integration paragraph. Suggest `aic_inspect` as a CI validation step, or note it's planned.

---

## 3. Software Development Director

### What they'd appreciate

- **Security model is thorough.** Context Guard, no-secrets-in-telemetry, local-first, `.aic/` directory security, supply chain controls — this is the kind of security documentation that makes InfoSec reviews go smoothly.
- **Zero-config means low adoption friction.** No engineering time required for setup. Developers can try it, and configuration grows organically.
- **Enterprise roadmap is realistic.** Phase 0 through 3 progression from solo dev to enterprise makes sense. The non-goals section is refreshingly honest.

### What would concern them

**DR-12: No ROI framework.**
A director manages engineering budgets. "Reduces tokens" means "reduces AI API cost," but they need: How much cost reduction per developer per month? How does this compare to the developer time spent learning and configuring AIC? There is no quantified value proposition.
_Fix:_ Add an "ROI Considerations" section that frames the value: token reduction equals API cost savings, reduced hallucination rework equals developer time savings, deterministic outputs equals fewer review cycles. Include the formula even if the numbers require benchmarks to fill in.

**DR-13: No failure mode documentation.**
The error handling table is good, but there's no "what if AIC silently produces bad context?" section. If the heuristic selector has a bug and starts excluding critical files, developers might not notice.
_Fix:_ Add a "Failure Modes & Mitigations" section covering silent failures: bad file selection (verify via `aic_inspect`), over-aggressive Guard (check `aic_last` tool findings), stale cache serving wrong results (clear cache).

**DR-14: Privacy compliance story is incomplete.**
The security documentation covers "no PII in telemetry" but doesn't address GDPR, SOC 2, or HIPAA readiness. When the director goes to Legal, they'll ask. The project plan has a "Compliance Readiness" section (section 24) but the README doesn't link to it.
_Fix:_ Add a brief compliance paragraph to the README: "AIC processes code locally, never transmits source code, and anonymous telemetry is opt-in. See `security.md` for compliance readiness details."

**DR-15: Competitive positioning isn't framed as a buying decision.**
Section 20 of the project plan compares technical approaches. A director wants to know: why not just use Cursor's built-in context engine? Why add another tool to the stack? The answer exists in the architecture section (editor-agnostic, deterministic, inspectable) but it's not framed as a decision.
_Fix:_ Add a "Why AIC alongside your editor" FAQ entry that directly addresses "doesn't my editor already do this?" The answer: AIC is deterministic (your editor's context engine isn't), inspectable (you can see exactly what was selected), secure (Context Guard runs before anything reaches the model), and portable (switch editors without losing your context compilation setup).

**DR-16: Model-agnostic claim needs qualification.**
The documentation says AIC works with any model, but the tokenizer is hardcoded to `cl100k_base`. If the team uses Gemini, Mistral, or a fine-tuned model, how accurate is token counting? The "less than 5% variance" claim in ADR-003 isn't backed by data.
_Fix:_ Acknowledge which models have been tested. State expected variance for non-OpenAI/Anthropic models. Note that model-specific tokenizers are planned via `ModelAdapter`.

---

## 4. CTO

### What they'd appreciate

- **Architecture is enterprise-grade.** The layering (core to enterprise), SOLID discipline, per-project isolation, and pluggable interfaces show this was designed to scale, not just to demo.
- **Local-first is the right default for IP protection.** No code leaves the machine unless `aic_compile` is explicitly invoked by the model. This is the correct posture for enterprise adoption.
- **Integration layer model is clever.** Making AIC editor-agnostic via MCP while supporting deep integration through per-editor hooks is a good architectural bet. If MCP becomes the standard, AIC is well-positioned.

### What would concern them

**DR-17: No business model or sustainability signal.**
The project plan describes Phase 3 enterprise features (RBAC, SSO, fleet management, dashboard, hosted option) but never mentions how this becomes a product. Apache 2.0 is great for adoption but makes monetization harder. A CTO needs to know whether this will be maintained long-term.
_Fix:_ Add a one-paragraph "Sustainability" section: "Phase 0–1 are open-source. Enterprise features (Phase 3) may be offered under a commercial license. The architecture deliberately separates the open core from enterprise extensions."

**DR-18: The "Lost in the Middle" thesis is a moving target.**
AIC's core value proposition relies on the claim that large context windows hurt model performance. But model architectures are improving rapidly (extended attention, better retrieval, recurrence). If a future model perfectly attends to 1M tokens, does AIC's core thesis still hold?
_Fix:_ Add a "Future-proofing" section. The answer is compelling: even with perfect attention, token reduction saves money, deterministic selection is still valuable, security scanning is always needed, and inspectability doesn't become less useful. But this argument needs to be stated explicitly.

**DR-19: No adoption metrics or social proof.**
How many developers or teams use this? Any testimonials? Any public repos using AIC? For a CTO evaluating adoption risk, an unused-but-well-documented tool is still risky.
_Fix:_ Add a "Status" or "Adoption" section. Even "AIC is used internally by the author's team on N projects" provides signal.

**DR-20: MCP protocol dependency is a strategic risk.**
AIC bets heavily on MCP becoming and remaining the standard for AI editor extensions. If a major editor abandons MCP or creates a competing protocol, AIC's integration layer needs rewriting.
_Fix:_ Acknowledge this in a risk section. The mitigation is solid — the core pipeline is protocol-agnostic, only the thin integration layer is MCP-specific — but it should be stated explicitly.

**DR-21: Missing operational guidance for scaled deployment.**
If a CTO is running AIC across 200 developers: How much disk does `.aic/aic.sqlite` grow to? What's the retention policy? What's the CPU and memory impact during compilation? Can compilations affect IDE responsiveness (they run on the same thread)?
_Fix:_ Add operational guidance: expected database size growth, cache pruning mechanisms, and impact on editor performance. The performance constraints section mentions less than 256MB and less than 2s, but there's no guidance on sustained long-term usage.

**DR-22: Single-maintainer risk.**
The governance model is "benevolent dictator (founder) during Phase 0–1." If the maintainer becomes unavailable, the project stalls. There's no succession plan, no core committer group, and no funded organization behind it.
_Fix:_ Address this in the licensing section — even a statement like "The project is structured to support a transition to community governance at Phase 2" would help.

---

## 5. Summary of All Findings

| ID    | Finding                                       | Severity | Personas      | Fix Complexity |
| ----- | --------------------------------------------- | -------- | ------------- | -------------- |
| DR-01 | Synthetic `aic_inspect` output in README      | High     | Dev           | Low            |
| DR-02 | No "verify your setup" section                | Medium   | Dev           | Low            |
| DR-03 | No example of actual compiled output          | Medium   | Dev           | Low            |
| DR-04 | Token reduction claims are vague              | High     | Dev, Dir, CTO | Medium         |
| DR-06 | Contributing section too thin                 | Low      | Dev           | Low            |
| DR-07 | No team deployment story                      | High     | Lead          | Low            |
| DR-08 | No impact measurement guidance                | Medium   | Lead          | Low            |
| DR-09 | No cross-project visibility                   | Low      | Lead          | Low            |
| DR-10 | No config precedence clarity                  | Low      | Lead          | Low            |
| DR-11 | No CI/CD integration guidance                 | Low      | Lead          | Low            |
| DR-12 | No ROI framework                              | High     | Dir, CTO      | Medium         |
| DR-13 | No failure mode documentation                 | Medium   | Dir, CTO      | Medium         |
| DR-14 | Privacy compliance story incomplete           | Medium   | Dir           | Low            |
| DR-15 | Competitive positioning not a buying decision | Medium   | Dir           | Low            |
| DR-16 | Model-agnostic claim needs qualification      | Low      | Dir           | Low            |
| DR-17 | No business model or sustainability signal    | Medium   | CTO           | Low            |
| DR-18 | "Lost in the Middle" thesis future-proofing   | Medium   | CTO           | Low            |
| DR-19 | No adoption metrics or social proof           | Medium   | CTO           | Low            |
| DR-20 | MCP protocol dependency risk not stated       | Low      | CTO           | Low            |
| DR-21 | No operational guidance for scaled deployment | Low      | CTO           | Medium         |
| DR-22 | Single-maintainer risk                        | Low      | CTO           | Low            |

### Priority tiers

**Tier 1 — Fix before any external reader sees the docs:**

- DR-01: Replace synthetic inspect output with real output
- DR-04: Add quantified token reduction range
- DR-07: Add team deployment section

**Tier 2 — Fix before Phase 1 (OSS release):**

- DR-02: Add "verify your setup" section
- DR-03: Add compiled output example
- DR-12: Add ROI framework
- DR-13: Add failure modes section
- DR-14: Add compliance paragraph to README
- DR-15: Add "why alongside your editor" FAQ
- DR-17: Add sustainability signal
- DR-18: Add future-proofing section
- DR-19: Add adoption metrics

**Tier 3 — Nice to have:**

- DR-06: Expand contributing section
- DR-08: Add impact measurement guidance
- DR-09: Note cross-project limitation
- DR-10: Clarify config precedence
- DR-11: Add CI guidance
- DR-16: Qualify model-agnostic claim
- DR-20: State MCP dependency risk
- DR-21: Add operational guidance
- DR-22: Address single-maintainer risk

---

## Overall Assessment

The documentation is exceptionally strong for a project at this stage. The technical depth, architectural rigor, and attention to edge cases surpass most open-source projects at Phase 0. The primary gaps are not in technical completeness but in **framing for different audiences**: a developer needs to verify it works, a team lead needs to justify it, a director needs to assess risk, and a CTO needs to evaluate strategic fit. The technical content is there; it needs to be surfaced and framed differently for each persona.
