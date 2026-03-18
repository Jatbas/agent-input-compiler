# Research: GitHub MCP secret scanning vs AIC Context Guard

> **Status:** Complete
> **Date:** 2026-03-18
> **Question:** How does GitHub’s secret scanning via the GitHub MCP Server (Mar 2026) compare to AIC, what does AIC not do today, and what should we implement?
> **Classification:** Technology evaluation
> **Confidence:** Medium — GitHub feature details come from one changelog post; AIC behaviour verified in source.
> **Explorers:** Consolidated single pass (codebase + article) | **Critic:** Simulated adversarial pass (see §5)

## Executive Summary

GitHub’s feature sends **working-copy code to GitHub’s secret scanning engine** on demand via the GitHub MCP Server and returns structured file/line results for repos with **Secret Protection** ([GitHub Changelog, 2026-03-17](https://github.blog/changelog/2026-03-17-secret-scanning-in-ai-coding-agents-via-the-github-mcp-server/)). AIC stays **local-first**: it never uploads code for scanning; `SecretScanner` uses **six regex patterns** on **context-selected files only** during `aic_compile`, and strips **file paths** from guard findings in the compile response. Gaps worth addressing locally: **(1)** pre-commit-style scanning of **git diff / staged files** (not only selected context), **(2)** richer **secret pattern coverage** or documented pairing with GitHub MCP where available, **(3)** clearer **developer workflow** so users know `aic_inspect` already exposes full guard traces (including paths) when they need “which file, which line.”

## Findings

### Finding 1: GitHub scans via remote engine on user prompt; AIC never sends code to GitHub for secrets

**Evidence:** [GitHub Changelog — Secret scanning in AI coding agents via the GitHub MCP Server](https://github.blog/changelog/2026-03-17-secret-scanning-in-ai-coding-agents-via-the-github-mcp-server/) (“Your AI coding agents send the code to the GitHub secret scanning engine, and the response includes structured results with the locations of and details on any secrets found”); `documentation/security.md:114–115` (“All compilation processing runs on the developer’s machine… No source code, prompts, or file paths are ever transmitted to AIC servers”).
**Confidence:** High
**Adversarial status:** Unchallenged — direct quote vs documented architecture.

### Finding 2: AIC secret detection is six fixed regexes, not GitHub’s full pattern set

**Evidence:** `shared/src/pipeline/secret-scanner.ts:11–27` (`SECRET_PATTERNS`); `documentation/security.md:177–178` (“Secret patterns (6 regex patterns)”).
**Confidence:** High
**Adversarial status:** Challenged — incorporated: GitHub’s engine likely has higher recall; AIC trades recall for zero network and deterministic local rules. Expanding regexes increases false positives (noted in `documentation/security.md:72` Low severity example).

### Finding 3: Context Guard runs only on files selected for that compilation, not on “all current changes”

**Evidence:** `documentation/security.md:164` (“scans every selected file”); pipeline flow in `documentation/implementation-spec.md:242` (Context Guard on selected files). GitHub’s workflow targets “current changes” before commit ([changelog](https://github.blog/changelog/2026-03-17-secret-scanning-in-ai-coding-agents-via-the-github-mcp-server/)).
**Confidence:** Medium
**Adversarial status:** Unchallenged — a file with a secret that is never selected for context is not scanned by `SecretScanner` on that compile.

### Finding 4: `aic_compile` strips file paths from guard findings in the MCP payload

**Evidence:** `mcp/src/handlers/compile-handler.ts:72–91` (`sanitizeGuardForModel` maps findings without `file`); `mcp/src/handlers/__tests__/compile-handler.test.ts:459–505` (`meta_guard_strips_file_paths`).
**Confidence:** High
**Adversarial status:** Challenged — incorporated: Example user prompt in GitHub post is “show me the files and lines” — `aic_compile` alone gives line/type/message but not file path; full paths appear in `aic_inspect` trace (`mcp/src/handlers/inspect-handler.ts:57–59` returns full `trace` including `guard`).

### Finding 5: GitHub capability requires Secret Protection + GitHub MCP setup; not universal for OSS

**Evidence:** [Changelog](https://github.blog/changelog/2026-03-17-secret-scanning-in-ai-coding-agents-via-the-github-mcp-server/) (“public preview for repositories with GitHub Secret Protection enabled”; setup steps for GitHub MCP Server).
**Confidence:** Medium
**Adversarial status:** Unchallenged — AIC’s local guard remains relevant for users without that entitlement.

## Analysis

GitHub and AIC operate at different trust boundaries: **upload-for-scan** vs **filter-before-context**. AIC’s primary job is preventing secrets in **bulk compiled context** to the model; GitHub’s is **credential leak prevention before commit/PR**. Overlap is partial: both aim to catch exposed secrets in code the developer touches, but AIC’s scope is **selector output**, not **git status**. Finding 3 and Finding 4 together explain why a user comparing to the GitHub article may feel AIC “does less”: unselected dirty files are invisible to compile-time guard, and even for selected files the compile meta hides paths. **Second-order implication:** documenting `aic_inspect` as the path-complete guard view avoids new network surface; a dedicated **diff-scoped scan** would close the pre-commit gap without sending code to GitHub.

## Recommendations

1. **[High] Implement optional “changed files” guard pass** — New MCP tool or `aic_inspect` mode: resolve paths from `git diff --cached` / `git diff` (or configurable), read file contents via existing file reader, run the same `GuardScanner` list (at least `SecretScanner`), return structured `{ path, line, type, message }` relative to project root. Keeps local-first; aligns with “before commit” workflow from the GitHub article without duplicating their engine.
2. **[Medium] Expand `SecretScanner` patterns incrementally** — Add high-signal patterns (e.g. additional cloud provider prefixes) with tests; track false-positive rate. Does not replace GitHub for enterprises with Secret Protection but improves baseline OSS users.
3. **[Medium] Documentation** — In installation or security docs (when editorially allowed): recommend **GitHub MCP secret scanning** for eligible repos as a complement; state explicitly that `**aic_inspect`\*\* returns full guard findings with paths when the agent must list files/lines like the changelog example.
4. **[Lower] Do not add GitHub upload to core AIC** — Conflicts with `documentation/security.md` local-first positioning unless introduced as an explicit opt-in adapter later; defer unless product strategy changes.

## Roadmap Mapping

| #   | Recommendation             | Phase   | Category            | Candidate `mvp-progress.md` entry                                      | Immediate?                                |
| --- | -------------------------- | ------- | ------------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| 1   | Git-diff/staged guard scan | 1 / 1+  | MCP / Context Guard | Add MCP tool or inspect mode to run Context Guard on git-changed paths | Yes — plannable (git + existing scanners) |
| 2   | Expand secret regexes      | Current | Context Guard       | Extend SecretScanner patterns + fixtures                               | Yes                                       |
| 3   | Doc: GitHub MCP complement | Current | Documentation       | Note GitHub MCP secret scan for Secret Protection repos                | Yes — doc-only when user requests         |
| 4   | No core GitHub upload      | —       | —                   | —                                                                      | No — strategic deferral                   |

## Open Questions

- Exact GitHub MCP tool name/schema for `run_secret_scanning` and payload limits are not in the changelog; integration design would need official GitHub MCP docs.
- Performance ceiling for scanning entire `git diff` on huge repos (may need caps or path limits).
- Whether relative paths should ever appear in `aic_compile` meta for secret findings without weakening the “minimal leak to model” posture (`compile-handler` currently strips paths deliberately).

## Sources

- [https://github.blog/changelog/2026-03-17-secret-scanning-in-ai-coding-agents-via-the-github-mcp-server/](https://github.blog/changelog/2026-03-17-secret-scanning-in-ai-coding-agents-via-the-github-mcp-server/)
- `shared/src/pipeline/secret-scanner.ts`
- `documentation/security.md`
- `mcp/src/handlers/compile-handler.ts`
- `mcp/src/handlers/inspect-handler.ts`
- `documentation/implementation-spec.md`
- `mcp/src/handlers/__tests__/compile-handler.test.ts`

## §5 Adversarial review (simulated)

| Finding                 | Challenge                                   | Resolution                                                                                           |
| ----------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Implement git-diff scan | Duplicates `git secrets` / pre-commit hooks | Still valuable inside MCP agent loop without extra CLI install; composable with hooks.               |
| Expand regexes          | False positives burden users                | Incremental patterns + allow-list already planned (`security.md:187`).                               |
| aic_inspect for paths   | Heavy full pipeline                         | Acceptable for explicit “scan my changes”; lighter path = dedicated thin tool reusing scanners only. |
