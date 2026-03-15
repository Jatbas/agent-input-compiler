# Research: installation.md — Full-Document Audit

> **Status:** Complete
> **Date:** 2026-03-16
> **Question:** Audit and fix documentation/installation.md with comprehensive scope: factual accuracy, cross-document consistency, parallel section symmetry (Cursor vs Claude Code), completeness, stale content, and voice consistency.
> **Classification:** Documentation analysis
> **Confidence:** High — four explorers with code and doc citations; multiple cross-checks.
> **Explorers:** 4 | **Critic:** Yes — challenges incorporated

## Executive Summary

installation.md is largely accurate and well-structured. The audit found **three factual inaccuracies** (bootstrap step 6 timing, trigger-rule overwrite when version differs, prerequisite package name @jatbas/aic-mcp vs @jatbas/aic), **cross-document inconsistencies** (package name, trigger filename AIC.mdc vs aic.mdc, database location, cursor-integration "never wired" wording, project-plan "Claude Code not yet built"), **completeness gaps** (uninstall wording, Node version, Cursor troubleshooting, verify-installation steps), **one actionable stale marker** ("not yet documented"), and **structural asymmetry** (Claude "How Hooks Are Delivered" shorter; Cursor has no Troubleshooting). The critic confirmed most factual/cross-doc findings (Strong), flagged that some completeness findings are preference-based or absence-of-evidence (Moderate/Weak), and proposed that the main fix could be: correct inaccuracies in installation.md and refresh project-plan/implementation-spec so they do not contradict installation and code. A task should fix inaccuracies and stale marker in installation.md, add high-value completeness (Node version, optional verify step, optional Cursor troubleshooting), align other docs with installation/code where they are stale, and optionally balance parallel sections and voice.

## Findings

### Finding 1: Bootstrap step 6 runs only when roots are listed, not on first aic_compile alone

**Evidence:** mcp/src/handlers/compile-handler.ts:188-198 (ensureProjectInit, installTriggerRule only); mcp/src/server.ts:544-556 (runEditorBootstrapIfNeeded runs inside listRoots() callback on initial connection). Step 6 (install.cjs for Cursor/Claude) is not invoked from the compile-handler init block.

**Confidence:** High
**Adversarial status:** Challenged — incorporated. Critic confirmed step 6 only runs from listRoots; noted that for Cursor the common path is connect → listRoots → bootstrap → first message, so practical impact is lower. Severity: doc is wrong in the strict sense; fix by clarifying "when the server lists roots (e.g. on connect for Cursor) or on first aic_compile."

### Finding 2: Trigger rule — AIC can overwrite existing file when version differs

**Evidence:** mcp/src/install-trigger-rule.ts:170-176 — if file exists and version in file matches currentVersion, return; otherwise falls through and overwrites with fs.writeFileSync(triggerPath, content, "utf8").

**Confidence:** High
**Adversarial status:** Challenged — incorporated. Critic agreed overwrite happens on version bump; framed as doc incomplete (doesn't mention version-based overwrite) rather than purely false. Fix: add exception "unless the installed rule version differs from the current package version."

### Finding 3: Prerequisite package name — @jatbas/aic-mcp vs @jatbas/aic

**Evidence:** mcp/package.json name is "@jatbas/aic". integrations/claude/plugin/.mcp.json:5 uses "args": ["@jatbas/aic-mcp@latest"]. No package named @jatbas/aic-mcp in this repo; installation.md says server must be runnable as npx @jatbas/aic-mcp (also exposed as @jatbas/aic).

**Confidence:** Moderate
**Adversarial status:** Challenged — incorporated. Critic: repo only shows @jatbas/aic; doc/plugin refer to aic-mcp; cannot confirm npm without external check. "No @jatbas/aic-mcp in repo" is true; "therefore doc wrong" assumes no alias. Fix: state canonical name (e.g. npx @jatbas/aic@latest) and clarify if @jatbas/aic-mcp is an npm alias.

### Finding 4: Uninstall section is a documented completeness gap

**Evidence:** installation.md:327-328 — "Uninstall instructions are not yet documented. To stop using AIC..."

**Confidence:** Moderate
**Adversarial status:** Challenged — incorporated. Critic: doc already gives minimal guidance (remove MCP entry, optionally delete .aic/). Gap is "no full per-editor uninstall recipe"; impact depends on audience. Fix: either add full steps or reword to remove "not yet documented" and keep minimal guidance.

### Finding 5: Node/runtime version prerequisite not stated

**Evidence:** installation.md Prerequisite (lines 250-252) does not mention Node. Root package.json has "engines": { "node": ">=20.0.0" }.

**Confidence:** Moderate
**Adversarial status:** Unchallenged. Single source (package.json engines); add Node 20+ to Prerequisite or a short Prerequisites line.

### Finding 6: No Cursor-specific troubleshooting

**Evidence:** installation.md:31 ToC has Troubleshooting under Claude Code only; ### Troubleshooting at line 287 is under Claude Code. Cursor section has no Troubleshooting subsection.

**Confidence:** Moderate
**Adversarial status:** Challenged — incorporated. Critic: "gap" assumes Cursor needs troubleshooting; Cursor flow is simpler; asymmetry may be intentional. Absence-of-evidence: "users need it" not evidenced. Fix: add Cursor troubleshooting only if there are known failure modes worth documenting; otherwise leave as design choice.

### Finding 7: Cross-doc package name inconsistency

**Evidence:** installation.md uses @jatbas/aic (and @jatbas/aic-mcp); cursor-integration-layer.md and implementation-spec mention @aic/mcp. package.json (mcp) has "name": "@jatbas/aic". cursor-integration-layer and implementation-spec say Cursor installer invokable via "npx @aic/mcp init" — not in installation.md or package.json.

**Confidence:** High
**Adversarial status:** Unchallenged. Multiple docs conflict; decide canonical package name and update installation.md then project-plan/implementation-spec/cursor-integration-layer.

### Finding 8: Trigger rule filename AIC.mdc vs aic.mdc

**Evidence:** installation.md and cursor-integration-layer use AIC.mdc; project-plan and implementation-spec use aic.mdc. Code: install-trigger-rule.ts uses "AIC.mdc".

**Confidence:** High
**Adversarial status:** Unchallenged. Code and installation use AIC.mdc; other docs use aic.mdc. On case-insensitive FS no behavioral difference; fix for consistency and case-sensitive environments.

### Finding 9: Database location — global vs per-project

**Evidence:** installation.md, README: global ~/.aic/aic.sqlite. project-plan §19 and implementation-spec §3/§8b: per-project .aic/aic.sqlite. Code: server.ts uses global path.

**Confidence:** High
**Adversarial status:** Unchallenged. Code and installation use global ~/.aic/aic.sqlite; project-plan/implementation-spec have per-project wording; update those docs.

### Finding 10: "How Hooks Are Delivered" depth asymmetry

**Evidence:** Cursor subsection (installation.md:216-225) ~115 words + 2 numbered steps. Claude Code (280-286) ~75 words + "See documentation/..." reference. Same heading and order; Claude Code shorter and delegates to another doc.

**Confidence:** Moderate
**Adversarial status:** Challenged — incorporated. Critic: "consider adding" is preference; Claude Code may intentionally keep installation short and put detail in claude-code-integration-layer. Symmetry not mandatory. Fix: optional — expand Claude "How Hooks Are Delivered" or leave as-is.

### Finding 11: Cursor has no Troubleshooting subsection

**Evidence:** Claude Code has ### Troubleshooting (line 260); Cursor's last subsection is How Hooks Are Delivered (line 198).

**Confidence:** Moderate
**Adversarial status:** Challenged — same as Finding 6; duplicate. Optional: add Cursor Troubleshooting if there are known failure modes; otherwise asymmetry is intentional.

### Finding 12: Known Gap section still accurate

**Evidence:** compile-handler.ts:159 — early return when enabled === false. Grep integrations/cursor/hooks/\*.cjs for enabled/config.json — no matches; Cursor hooks do not read project config.

**Confidence:** High
**Adversarial status:** Unchallenged. No change needed for Known Gap.

### Finding 13: No "verify installation" steps

**Evidence:** installation.md has no section or bullets on how to confirm installation (e.g. run aic_status, send message and see bootstrap, or MCP tools appear).

**Confidence:** Moderate
**Adversarial status:** Challenged — incorporated. Critic: "every AI message gets compiled context" is an implicit success criterion; formal verify step is a preference. Absence-of-evidence: "should add" not evidenced by user failure. Fix: optional one-line or short subsection.

### Finding 14: Voice mix — second person and third person

**Evidence:** installation.md uses "your" / "you" (lines 240, 244, 247, 253, 257, 291, 308, 310, 318, 320, 328) and also "user", "the AI", "AIC", "the server". Not wrong but register is mixed.

**Confidence:** Low
**Adversarial status:** Challenged — rejected as mandatory. Critic: mixed voice is common in technical docs; no evidence of user confusion. Optional style pass only.

### Finding 15: cursor-integration-layer "never wired into MCP server startup"

**Evidence:** cursor-integration-layer says installer is "never wired into the MCP server startup"; same doc and implementation-spec say server runs installTriggerRule + install.cjs on connect (listRoots). Server does run the installer during bootstrap; only the process entrypoint is different.

**Confidence:** Moderate
**Adversarial status:** Challenged — incorporated. Critic: "startup" is ambiguous (process startup vs first listRoots). Server does run installer when client lists roots. Fix: reword to "not run at server process startup; the server runs it when the client lists roots."

### Finding 16: project-plan "Claude Code integration layer not yet built"

**Evidence:** project-plan states Claude Code integration "not yet built"; installation and claude-code-integration-layer describe plugin + direct installer as available.

**Confidence:** High
**Adversarial status:** Unchallenged. project-plan should be updated or sentence removed.

## Analysis

Findings group into: (1) **Factual corrections** — bootstrap step 6 timing, trigger-rule overwrite, prerequisite package name; (2) **Cross-document alignment** — package name, trigger filename, database location, cursor-integration wording, project-plan Claude Code status; (3) **Completeness** — uninstall, Node version, Cursor troubleshooting, verify-installation; (4) **Stale marker** — "not yet documented" in Uninstall; (5) **Structure and voice** — parallel section depth (How Hooks Are Delivered), Cursor Troubleshooting, voice consistency. The four parallel subsections (Trigger Rule, Hooks, Hook Lifecycle, How Hooks Are Delivered) are correctly symmetric in order and names; only depth and Cursor Troubleshooting differ. ToC matches body. Fixing installation.md in isolation is sufficient for the audit task; fixing project-plan, implementation-spec, and cursor-integration-layer may be the same task (comprehensive scope) or follow-up tasks.

## Recommendations

1. **Fix factual inaccuracies in installation.md:** (a) Clarify that step 6 (per-project artifacts) runs when the server lists roots (e.g. on connect for Cursor), not necessarily on the very first aic_compile call if roots were not yet listed. (b) Replace "AIC does not overwrite" with "AIC does not overwrite unless the installed rule version differs from the current package version" (or equivalent). (c) Prerequisite: use the actual package name (e.g. npx @jatbas/aic@latest) and remove or clarify @jatbas/aic-mcp (alias or separate package).
2. **Resolve stale and completeness in installation.md:** (a) Either add full uninstall steps (Cursor, Claude Code, other editors) or reword Uninstall to "To stop using AIC..." without "not yet documented." (b) Add Node version (e.g. Node 20+) in Prerequisite or a short Prerequisites section. (c) Add Cursor Troubleshooting subsection or a short "Troubleshooting (both editors)" with Cursor-specific bullets. (d) Add 1–2 sentences on how to verify installation.
3. **Cross-document consistency:** (a) Decide canonical package name and trigger rule filename; update installation.md as source of truth, then project-plan, implementation-spec, cursor-integration-layer. (b) Update project-plan and implementation-spec: database location global ~/.aic/aic.sqlite; Claude Code integration built. (c) Fix cursor-integration-layer: server does run the Cursor installer during bootstrap (runEditorBootstrapIfNeeded); reword "never wired into MCP server startup."
4. **Parallel section and voice (optional):** (a) Either expand Claude Code "How Hooks Are Delivered" with a short in-doc step list or leave as-is with pointer to claude-code-integration-layer. (b) Optionally add Cursor Troubleshooting to mirror Claude Code. (c) Standardize voice (second person for instructions, third for system).

## Open Questions

- Is @jatbas/aic-mcp a published npm alias for @jatbas/aic, or a separate package? If alias, document it in installation.md; if not, remove from Prerequisite.
- Should the audit task scope include editing project-plan.md and implementation-spec.md (and cursor-integration-layer.md), or only installation.md with a follow-up list for other docs? Critic alternative: fix inaccuracies in installation.md and refresh project-plan/implementation-spec so they do not contradict installation and code.

## Sources

- documentation/installation.md
- documentation/claude-code-integration-layer.md
- documentation/cursor-integration-layer.md
- documentation/project-plan.md (referenced by Explorer 3)
- documentation/implementation-spec.md (referenced by Explorer 3)
- mcp/src/server.ts
- mcp/src/handlers/compile-handler.ts
- mcp/src/install-trigger-rule.ts
- mcp/src/init-project.ts
- mcp/src/editor-integration-dispatch.ts
- shared/src/storage/ensure-aic-dir.ts
- shared/src/storage/ensure-project-id.ts
- integrations/cursor/install.cjs
- integrations/claude/install.cjs
- install/cursor-install.html
- mcp/package.json
- integrations/claude/plugin/.mcp.json
- package.json (root engines)
