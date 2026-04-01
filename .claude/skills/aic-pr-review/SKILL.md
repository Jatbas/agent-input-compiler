---
name: aic-pr-review
description: Review pull requests against AIC architectural conventions, type safety, security, and style rules. Use when reviewing PRs, examining branch diffs, or when a community contribution needs evaluation.
---

# PR Review

## Purpose

Systematically review pull requests against AIC's architectural invariants, security rules, and conventions. Produces a structured report with severity-classified findings that cite specific checklist items.

**Announce at start:** "Using the pr-review skill."

## Editors

- **Cursor:** Attach the skill with `@` or invoke via Task tool. Where this skill says to dispatch subagents for large PRs, use the **Task tool** with `subagent_type="generalPurpose"`. You MUST use the Task tool for subagent work — never do it inline.
- **Claude Code:** Invoke with `/aic-pr-review`. Where this skill references multi-agent work, spawn separate agents. Never perform reviewer work inline.

## Autonomous Execution

Run §1 through §4 as a single continuous flow. Do NOT pause between sections to report status or explain what you will do next. Completing one section means immediately starting the next — not sending a message and waiting.

**Legitimate user gates (the ONLY points where you stop and wait):**

- §5 step 1: ask "Post this review to the PR?" before posting (Mode A only)

**Everything else runs without pausing.** Context gathering, review (inline or parallel), synthesis, and severity classification all run as one continuous flow. Present the complete review report at §3 and then ask about posting.

## When to Use

- User says "review PR", "review this PR", "check PR #N"
- User provides a GitHub PR URL or number
- User says "review branch" or "review my changes"
- Before merging a community contribution
- After task-executor completes work (self-review)
- User attaches this skill and references a diff

## Modes

### Mode A — GitHub PR

Input: PR URL, PR number, or `gh pr view` output.

### Mode B — Branch Diff

Input: current branch vs base (defaults to `main`). Use when reviewing local work before opening a PR.

## Process

### §1 — Gather Context

**Batch-read in parallel:**

1. The diff (method depends on mode):
   - **Mode A:** `gh pr diff <number> --repo <owner/repo>`
   - **Mode B:** `git diff main...HEAD`
2. The list of changed files:
   - **Mode A:** `gh pr view <number> --json files --jq '.files[].path'`
   - **Mode B:** `git diff main...HEAD --name-only`
3. PR metadata (Mode A only): `gh pr view <number> --json title,body,author,labels,commits`
4. Commit messages: `git log main..HEAD --oneline` (Mode B) or from PR metadata
5. The checklist: read `SKILL-checklist.md` (sibling file in this skill directory)
6. `CONTRIBUTING.md` at the repo root — the contribution rules the PR must satisfy

**Check CONTRIBUTING.md process gates first** (dimension P in the checklist):

- Branch name matches `(kind) name/short-slug` convention (**P1**)
- If the change affects architecture, pipeline behavior, rule enforcement, guardrails/security, editor integration, or public config/workflow → verify `RFC.md` exists on the branch (**P2**)
- PR description explains motivation and scope (**P6**)
- Changes are narrowly scoped — no unrelated changes bundled (**P3**)

These are checked upfront because a missing RFC or wildly scoped PR may warrant early feedback before a full code review.

**Classify the PR scope** from the file list:

| Changed files touch…                         | Review dimensions to emphasize   |
| -------------------------------------------- | -------------------------------- |
| `shared/src/core/` or `shared/src/pipeline/` | A (full), T, D, E                |
| `shared/src/adapters/`                       | A9, T, E                         |
| `shared/src/storage/`                        | S (full), D2, D1                 |
| `mcp/src/`                                   | E3, E4, X, A8                    |
| `**/*.test.ts` or `__tests__/`               | V (full)                         |
| `shared/src/core/interfaces/`                | A2, A4, T                        |
| `integrations/` or `.cursor/rules/`          | C, X                             |
| `package.json` or dependency files           | C7, C8                           |
| Mixed / large                                | All dimensions                   |
| Any PR (always)                              | P (process & contribution gates) |

**Determine review scale:**

- **Small** (1–5 files, < 200 diff lines): review inline — no subagents
- **Medium** (6–15 files, 200–800 diff lines): review inline with the full checklist
- **Large** (> 15 files or > 800 diff lines): dispatch parallel review subagents (§2b)

### §2a — Inline Review (Small / Medium)

Walk through each relevant checklist dimension from `SKILL-checklist.md`. For every finding:

1. Identify the file and line(s)
2. Cite the checklist ID (e.g. **A3**, **T7**, **X1**)
3. Classify severity (see §4)
4. Write a concise explanation with the fix

**Mechanical checks** — run these commands and report failures (**P9**):

```bash
pnpm lint          # ESLint — covers most A, T, D, C rules
pnpm typecheck     # TypeScript strict — covers T rules
pnpm test          # Vitest — covers V rules
pnpm knip          # Unused exports/deps — covers C7, C8
pnpm lint:clones   # Duplicate-code scan (jscpd)
pnpm check:headers # SPDX license headers
```

If the PR is on a remote fork and cannot be checked out locally, skip mechanical checks and note this in the report.

### §2b — Parallel Review (Large PRs)

Dispatch three review subagents in parallel. Each receives: the full diff, the file list, the relevant checklist dimensions, and the PR description. Each subagent's prompt must include: "The author's PR description may be optimistic. Read the actual diff, not just the description. Verify independently — do not accept claims at face value."

**Anti-agreement enforcement:** If any subagent returns zero findings on a PR with 200+ diff lines, re-spawn with a strengthened mandate: "Your previous review found no issues on a substantial diff. For each file, describe the strongest possible concern. If you genuinely cannot find a concern after exhaustive analysis, explain exactly what you checked."

**Subagent 1 — Architecture & Safety:**

- Dimensions: A, T, E, D
- Focus: layering violations, type safety, error patterns, immutability

**Subagent 2 — Storage, Security & Dependencies:**

- Dimensions: S, X, C7, C8
- Focus: SQL placement, migration integrity, secrets, telemetry, dependency policy

**Subagent 3 — Testing & Conventions:**

- Dimensions: V, C (excluding C7/C8)
- Focus: test adequacy, naming, comments, commit messages, file layout

Each subagent returns a list of findings in this format:

```
- [SEVERITY] CHECKLIST_ID: file:line — description
```

After all subagents complete, proceed to §3.

### §3 — Synthesis

Merge findings from all sources (inline review or subagents + mechanical checks). Deduplicate — same root cause appearing in multiple files counts as one finding with multiple locations.

**Produce the report** using this structure:

```
## PR Review: <title or branch name>

**Scope:** N files changed, M lines added, K lines removed
**Author:** <author> (community | maintainer)
**Verdict:** APPROVE | APPROVE_WITH_NITS | REQUEST_CHANGES | BLOCK

### Critical (must fix before merge)
- [A1] `shared/src/pipeline/foo.ts:42` — imports from `adapters/` violating hexagonal boundary

### Important (should fix before merge)
- [T7] `shared/src/core/bar.ts:18` — non-null assertion `!` — use optional chaining

### Minor (recommended)
- [C2] `shared/src/adapters/baz.ts:5` — narrating comment "// Get the config"

### Nits (optional)
- [C3] consider renaming `myHelper.ts` → `my-helper.ts` for kebab-case

### Strengths
- Good test coverage for edge cases in X
- Clean separation of concerns in Y

### Mechanical Check Results
- ESLint: PASS / FAIL (N errors)
- TypeScript: PASS / FAIL (N errors)
- Tests: PASS / FAIL (N failed)
- Knip: PASS / FAIL (N unused)
```

### §4 — Severity Classification

| Severity      | Criteria                                                                                                                                                                                     | Merge gate                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Critical**  | Security vulnerability, data loss risk, architectural boundary violation (A1, A8), bare secrets (X1), missing RFC for architectural change (P2)                                              | Blocks merge                        |
| **Important** | Type safety gap (T1–T9), missing error handling (E1–E2), no tests for new logic (V4, P8), mutability violation (D3–D5), unrelated changes bundled (P3), no docs for user-visible change (P7) | Should fix; maintainer may override |
| **Minor**     | Convention deviation (C1–C6), naming inconsistency, missing edge-case test, branch naming (P1), PR description clarity (P6)                                                                  | Recommended fix                     |
| **Nit**       | Style preference, alternative approach suggestion, readability improvement                                                                                                                   | Optional                            |

**Verdict rules:**

- Any **Critical** finding → `BLOCK`
- Any **Important** finding → `REQUEST_CHANGES`
- Only **Minor** or **Nit** → `APPROVE_WITH_NITS`
- No findings → `APPROVE`

### §5 — GitHub Interaction (Mode A only)

After producing the report:

1. **Post the review** on the PR:

   ```bash
   gh pr review <number> --comment --body "<report>"
   ```

   Use `--approve`, `--request-changes`, or `--comment` matching the verdict.

2. **Post inline comments** for Critical and Important findings:

   ```bash
   gh api repos/{owner}/{repo}/pulls/{number}/comments \
     --method POST \
     -f body="[CHECKLIST_ID] description + suggested fix" \
     -f path="<file>" -F line=<line> -f side="RIGHT" \
     -f commit_id="$(gh pr view <number> --json headRefOid --jq '.headRefOid')"
   ```

3. **Wait for author response** — do not auto-merge. If the author pushes fixes, re-review the updated diff (re-run from §1).

**Ask the user before posting** — never auto-post reviews without confirmation. Present the report first, then ask: "Post this review to the PR?"

## Receiving External Reviews

When an external reviewer (community or GitHub Actions bot) posts review comments on an AIC PR, apply these principles:

1. **Read the full review** before reacting
2. **Verify against the codebase** — reviewer may lack full context of AIC conventions
3. **Evaluate technically** — is this correct for THIS codebase?
4. **If the suggestion conflicts with AIC rules** — push back with the specific rule reference (e.g. "AIC uses branded types per ADR-010, so raw `string` is intentional here")
5. **If the suggestion is valid** — fix it, citing the review comment
6. **If unclear** — ask for clarification before implementing
7. **Reply in the comment thread** — not as top-level PR comments:
   ```bash
   gh api repos/{owner}/{repo}/pulls/{number}/comments/{id}/replies \
     --method POST -f body="<response>"
   ```

**Never:** performative agreement ("Great point!"), blind implementation without verification, or ignoring valid feedback.

## Community PR Extra Checks

When the PR author is external (not a maintainer), add these checks:

- **Secrets scan:** grep the diff for patterns like API keys, tokens, passwords, private keys (**X1**)
- **Rule bypass scan:** grep for `eslint-disable`, `@ts-ignore`, `@ts-nocheck`, `--no-verify` (**C5**)
- **Dependency audit:** any new dependency? Check: exact pin, MIT/Apache-2.0, justification present, only one per PR (**C7**, **C8**)
- **Scope check:** does the PR match its description? No unrelated changes bundled? (**P3**)
- **Contribution type:** is this a welcomed contribution type per CONTRIBUTING.md? (bug fixes, editor integrations, language providers, content transformers, test coverage, benchmarks, documentation)
- **RFC check:** if the change touches architecture, pipeline behavior, rule enforcement, guardrails/security, editor integration, or public config → verify `RFC.md` on the branch (**P2**)
- **Determinism:** does the change weaken local-first guarantees, guardrails, or logging boundaries? (**P4**)
- **Editor neutrality:** no editor-specific assumptions in core pipeline (**P5**)
- **CI status:** verify all checks pass before approving (**P9**)

## Integration

- **aic-task-executor:** after completing a task, attach this skill for self-review before merge
- **aic-systematic-debugging:** if a finding reveals a deeper issue, use the debugging skill to investigate
- **aic-task-planner:** if review findings require substantial work, create a task file for the fixes

## Critical Reminders

- Always run the full checklist regardless of diff size, author, or PR description claims.
- Tests verify behavior, not architecture — checklist dimensions A, T, D, C are not covered by tests.
- Always read the actual diff — PR descriptions may be optimistic.

## Red Flags

**Never:**

- Approve a PR with Critical findings
- Skip the checklist because "the diff looks small"
- Auto-post reviews without user confirmation
- Merge on behalf of the author
- Ignore mechanical check failures
- Soften Critical findings to Important to avoid blocking

**If the reviewer (you) is uncertain:**

- State the uncertainty explicitly
- Provide the rule reference and let the author decide
- Ask the maintainer for guidance on ambiguous cases
