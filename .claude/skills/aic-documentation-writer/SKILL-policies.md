# Documentation Writer — Editorial Policies

Reference file for the documentation-writer skill. Read this before writing target text (Phase 2) or evaluating content decisions during review (Phase 3). These policies govern _what_ to write and _what not to write_ — content-level decisions that are separate from the formatting and voice rules in `SKILL-standards.md`.

Policies are cumulative. New policies are appended; existing policies are never silently removed. When a policy is retired, it is moved to a "Retired" section at the bottom with the reason.

---

## Cross-editor references

AIC supports multiple editors (Cursor, Claude Code, and potentially others). Documentation must handle cross-editor mentions with care.

### When to name another editor

Name the other editor when it **adds clarity for the reader**:

- Vendor URIs or install identifiers that include the editor name (e.g. `cursor:extension/anthropic.claude-code`)
- File paths or directories specific to an editor (`~/.claude/hooks/`, `.cursor/rules/`)
- Explaining which product exposes or lacks a specific hook, capability, or API
- Deployment tables that list supported install targets by editor
- Factual capability differences the reader needs to understand behavior (e.g. "Cursor does not support per-prompt context injection — `beforeSubmitPrompt` does not accept `additional_context` output")

### When NOT to reference another editor

- Subjective rankings or quality judgments ("Cursor is more mature", "Claude Code is better")
- Comparisons that do not help the reader with setup, behavior, or troubleshooting
- Parity maps or side-by-side tables that exist only to compare editors rather than to explain a specific mechanism
- Cross-links to the other editor's integration doc from Purpose sections, unless the reader genuinely needs to navigate there
- Sentences structured as "unlike X, Y does..." when the contrast does not clarify Y's behavior

### The test

Before writing a sentence that names another editor, ask: _Does this help the reader understand the document they are reading right now?_ If the answer is no, remove the reference.

### Canonical reference

This policy is also summarized in `documentation/best-practices.md` under "Integration docs — Cursor and Claude Code (maintainers)." The two locations must stay in sync. This file is the authoritative source; `best-practices.md` is the reader-facing summary.

---

## Integration document self-containment

Each editor's integration-layer document (`cursor-integration-layer.md`, `claude-code-integration-layer.md`) must stand alone. A reader of the Cursor doc should not need to open the Claude doc to understand Cursor's integration, and vice versa.

Concretely:

- No "For the other editor, see [sibling doc]" links in Purpose or introduction sections
- No cross-editor parity maps (side-by-side tables mapping one editor's hooks to the other's)
- No "**Cursor:**" / "**Claude Code:**" callout paragraphs inside the other editor's doc, unless the callout explains a factual difference that affects the document's own editor (e.g. noting that a hook event is unique to this editor because the other editor handles it differently — but only when the reader needs that context)
- Each doc describes its own bootstrap, deployment, hooks, and known bugs without delegating explanation to the sibling

Cross-references to `architecture.md`, `installation.md`, `best-practices.md`, or `security.md` are fine — those are shared docs, not the other editor's integration doc.

---

## No editorial rankings between editors

Never write sentences that rank one editor above another in quality, maturity, completeness, or preference. This applies to all documentation, not just integration docs.

Prohibited patterns:

- "X is more mature than Y"
- "X has a better integration"
- "Y is less capable"
- "X is preferred / recommended over Y"
- "Unlike the limited Y, X supports..."

Permitted patterns:

- "X supports hook event Z; Y does not expose this event" (factual capability statement)
- "X uses global hooks at `~/...`; Y uses per-project hooks at `.cursor/...`" (factual mechanism difference)
- "Cursor capability gap" (in a Known Bugs table — describes a limitation, not a ranking)

The distinction: describe **what each editor does**, not **how it compares** on a value scale.

---

## Document regime classification

Documents fall into two regimes that affect how discrepancies between docs and code are handled. This policy is also codified in `SKILL.md` Cardinal Rule 7; it is repeated here for quick reference.

### Prescriptive documents (docs are source of truth)

- `documentation/project-plan.md`
- `documentation/implementation-spec.md`
- `documentation/architecture.md`
- `documentation/security.md`

When these disagree with code: STOP and ask the user. Never change the document or the code without explicit direction.

### Normal documents (code is source of truth)

Everything else — guides, integration layers, best-practices, installation docs.

When these disagree with code: change the document to match the code. The code wins, even if it looks buggy. Note suspected bugs as follow-up items.

---

## No marketing or hedge language

Technical documentation states facts. Marketing language ("powerful," "seamless," "robust") and hedge words ("leverage," "best-in-class," "cutting-edge") erode trust and add no information. This policy complements the prohibited patterns in `SKILL-standards.md` §Prohibited patterns (which covers indecision hedges like "if needed," "consider"); this policy covers promotional tone.

### Prohibited words and phrases

- "powerful," "seamless," "robust," "elegant," "best-in-class," "cutting-edge," "next-generation"
- "leverage" (use "use"), "utilize" (use "use"), "facilitate" (use "enable" or describe the mechanism)
- "world-class," "industry-leading," "state-of-the-art"
- "simple" or "easy" when describing something the reader has not yet done (what feels simple to the writer may not be simple to the reader)
- "just" as a minimizer ("just run this command") — it dismisses complexity the reader may face

### Permitted alternatives

- Describe what happens: "AIC selects files based on intent classification" — not "AIC powerfully selects the right files"
- Describe measurable outcomes: "achieves 8.5% budget utilization on a 470-file repo" — not "dramatically reduces tokens"
- State capabilities directly: "supports 8 hook events" — not "provides robust hook support"

---

## Examples must be verifiable

Code snippets, commands, file paths, and configuration examples in documentation must reflect the current codebase. Illustrative-but-wrong examples mislead readers and erode trust.

### Rules

- Every command example must work if copy-pasted (assuming prerequisites are met)
- File paths in examples must exist in the repository or be clearly marked as user-specific (e.g. `~/your-project/`)
- Interface names, type names, and function signatures in examples must match the current source
- When code changes, update or remove affected examples — stale examples are worse than no examples
- JSON and config examples must parse cleanly (no trailing commas, no comments in JSON)

### Verification

During Phase 3, Critic 2 (factual re-verification) must grep-verify every code example against the codebase, not just prose claims. During Phase 4, Dimension 2 (factual accuracy) covers this mechanically.

---

## No secrets in examples

Documentation must never contain real API keys, tokens, credentials, or user-specific data. This applies to inline examples, code blocks, configuration snippets, and screenshots.

### Placeholder conventions

| Secret type         | Placeholder                               |
| ------------------- | ----------------------------------------- |
| API keys            | `YOUR_API_KEY` or `sk-...`                |
| Tokens              | `YOUR_TOKEN`                              |
| Passwords           | `YOUR_PASSWORD`                           |
| User-specific paths | `~/your-project/`, `/path/to/project`     |
| Project names       | `your-project` or a generic like `my-app` |
| URLs with auth      | `https://api.example.com/...`             |

### Rules

- Config file examples that reference env var names are fine (`apiKeyEnv: "OPENAI_API_KEY"`) — the env var _name_ is not a secret
- Never embed actual values even in "example" context — readers copy-paste
- If a screenshot shows terminal output, redact any tokens or paths that reveal user identity

This policy aligns with the project-wide secrets rule in `.cursor/rules/AIC-architect.mdc`.

---

## External links

Prefer stable, official sources when linking to external resources. Unstable links create maintenance burden and broken reader experiences.

### Link hierarchy (prefer higher)

1. Official vendor documentation (e.g. `docs.cursor.com`, `code.claude.com/docs`)
2. GitHub repositories or specific file permalinks
3. RFCs, specs, or standards documents
4. Well-established reference sites (MDN, Wikipedia for non-controversial facts)

### Avoid

- Blog posts or tutorials that may be taken down or go stale
- Medium articles, dev.to posts, or similar aggregator content
- Links to specific GitHub issues (they get closed and context decays) — prefer linking to the docs that resulted from the issue
- URL shorteners

### When linking

- Use descriptive link text: `[IDE integrations docs](https://...)` — not `[click here](https://...)`
- If a link may move (vendor docs reorganize), note the section title so readers can search: `([IDE integrations docs](https://...) — "Configure settings" section)`

---

## Mirror document structure

For documents that cover the same domain from different angles — specifically `cursor-integration-layer.md` and `claude-code-integration-layer.md` — maintain parallel heading structure so readers familiar with one can navigate the other.

### Rules

- Use comparable `##` section titles where the same concept is documented in both (e.g. both have "Deployment scope," "Hook events — details," "Registration payload," "Known bugs tracker," "Verification checklist")
- Heading numbering and ordering should follow the same logical flow
- Content within each section is independent — no shared text, no cross-references between the two (see §Integration document self-containment)
- When adding a new section to one mirror doc, evaluate whether the other needs a corresponding section. If it does, add a placeholder or the content. If it genuinely does not apply, skip it — parallel structure is a guide, not a straitjacket

### Does not apply to

- Documents that are not structural mirrors (e.g. `installation.md` and `architecture.md` have no reason to share heading structure)
- Prescriptive documents — their structure follows their own internal logic

---

## Acronyms and key terms

Define acronyms and key terms on first use. Use a single canonical term per concept across all documentation.

### Rules

- Spell out an acronym on first use in each document: "AI Context Compiler (AIC)" — then use "AIC" thereafter
- Do not assume the reader has read other documents — each document must be self-sufficient for term definitions
- If a document has a Glossary section, acronyms defined there still need first-use expansion in the body (the reader may skip the Glossary)
- Use the same term for the same concept everywhere: if `installation.md` calls it "bootstrap," do not call it "initialization" in `architecture.md` for the same process
- When two terms exist for the same concept, pick one and update all documents to use it. Note the deprecated term in the Glossary if one exists

### Canonical terms (maintained list)

| Concept                               | Canonical term    | Not these                          |
| ------------------------------------- | ----------------- | ---------------------------------- |
| First compile + hook install          | bootstrap         | initialization, setup, first-run   |
| AIC configuration file                | `aic.config.json` | config file, settings file         |
| Compiled output injected into context | compiled context  | compiled prompt, context payload   |
| MCP tool for compilation              | `aic_compile`     | compile tool, compilation endpoint |

This list grows as term decisions are made. When a new term conflict is discovered, resolve it and add the canonical choice here.

---

## Deprecation handling

When a feature, command, API, or behavior is deprecated, document it clearly so readers can migrate.

### Rules

- Mark deprecated items with a bold **Deprecated** label and the version or date of deprecation
- State what replaces the deprecated item: "**Deprecated:** `oldCommand` — use `newCommand` instead"
- Keep deprecated items in documentation for at least one major version cycle or until no user could reasonably encounter them
- Never silently remove documentation for a deprecated feature — remove it explicitly with a note pointing to the replacement
- If a deprecated feature has no replacement (it was just removed), say so: "**Removed:** `featureName` — no longer supported. Remove references from your configuration."

### Where to document

- In the section where the feature was originally documented, add the deprecation notice inline
- In `CHANGELOG.md`, note the deprecation under the relevant version

---

## Breaking changes

When documenting changes that break existing behavior, call them out explicitly so readers can take action.

### Rules

- Use a bold **Breaking change** label at the start of the relevant paragraph or list item
- Describe what changed, what breaks, and how to migrate: "**Breaking change:** `hookInput.session_id` is no longer passed. Use `hookInput.transcript_path` instead — extract the conversation ID with `path.basename(transcriptPath, '.jsonl')`."
- In procedural docs (installation, upgrade guides), breaking changes must appear before the step that triggers them — never after
- If a breaking change requires code modifications, show the before and after

### Where to document

- In the affected section of the relevant document
- In `CHANGELOG.md` under a dedicated "Breaking Changes" subsection for the version

---

## Omit ambient / obvious knowledge

Do not document what the intended audience already knows from ordinary professional practice, unless this repository does something non-standard or the document explicitly targets newcomers outside that audience.

### Do not document (noise)

- High-level editor mechanics for contributors: how to invoke Agent Skills, slash commands, @-mentions, or “attach a skill” — readers who develop on this stack already use those patterns.
- Generic Git tutorials (clone, branch, merge, commit basics) unless the project mandates a workflow that differs from the usual.
- Ambient tooling literacy (open a file, use the terminal) with no AIC-specific twist.

### Do document

- Commands with **project-specific** arguments, env vars, paths, or script names (`pnpm run dev:mcp`, `.git-worktrees/` naming, `AIC_DEV_MODE`).
- **Repository-specific** procedures: skill order, task file locations, verification gates, gitignored paths.
- Behavior that **differs** from the default assumption a senior developer would make.

### Test

Before keeping or adding a sentence: _Does it state something unique to this repo or to this document’s contract?_ If it only restates universal developer knowledge, omit it. Task walkthroughs and command examples stay in scope even when steps feel familiar — they anchor the **exact** project invocation.

---

## Future policy template

When adding a new policy, use this structure:

```
## [Policy title]

[1-2 sentence summary of the policy and why it exists.]

### [Sub-heading for specifics]

[Concrete rules with examples of permitted and prohibited patterns.]
```

Include at least one "permitted" and one "prohibited" example so the policy is actionable, not vague.
