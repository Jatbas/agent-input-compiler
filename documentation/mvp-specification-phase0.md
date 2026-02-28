# Agent Input Compiler — MVP Specification

## Phase 0: MCP Server + Developer Utilities

> This document defines what ships in Phase 0 (MVP). It inherits architecture and definitions from the [Project Plan](project-plan.md). Refer to the Project Plan for the full glossary, enterprise roadmap, and strategic context.
>
> **All implementation must comply with the SOLID principles and design patterns defined in [Project Plan §2.1](project-plan.md).** This is non-negotiable and checked in code review before any other criterion.

---

## Table of Contents

1. [MVP Goal](#1-mvp-goal)
2. [What Ships in MVP](#2-what-ships-in-mvp)
3. [Defaults](#3-defaults)
4. [Core Pipeline — MVP Implementation Detail](#4-core-pipeline--mvp-implementation-detail)
   - [Step 1: Task Classifier](#step-1-task-classifier)
   - [Step 2: Rule Pack Resolver](#step-2-rule-pack-resolver)
   - [Step 3: Budget Allocator](#step-3-budget-allocator)
   - [Step 4: ContextSelector (HeuristicSelector)](#step-4-contextselector-heuristicselector)
   - [Step 5: Context Guard](#step-5-context-guard)
   - [Step 5.5: Content Transformer](#step-55-content-transformer)
   - [Step 6: Summarisation Ladder](#step-6-summarisation-ladder)
   - [Language Support (MVP)](#language-support-mvp)
   - [Step 7: Constraint Injector](#step-7-constraint-injector)
   - [Step 8: Prompt Assembler](#step-8-prompt-assembler)
   - [Step 9: Executor (run mode)](#step-9-executor-run-mode)
   - [Model Context Window Guard](#model-context-window-guard)
   - [Step 10: Telemetry Logger](#step-10-telemetry-logger)
   - 4b. [Rules & Hooks Analyzer](#4b-rules--hooks-analyzer--mvp-implementation)
   - 4c. [Developer Utility Specs](#4c-developer-utility-specs--compare-init-inspect-status)
   - 4d. [MVP Additions](#4d-mvp-additions)
5. [Success Criteria](#5-success-criteria)
6. [Error Handling (MVP)](#6-error-handling-mvp)
7. [Security, Observability & Performance (MVP)](#7-security-observability--performance-mvp)
8. [Multi-Project Behaviour (MVP)](#8-multi-project-behaviour-mvp)
   - 8a. [MVP Test Plan](#8a-mvp-test-plan)
   - 8b. [MCP Server Startup Sequence](#8b-mcp-server-startup-sequence)
9. [Roadmap](#9-roadmap-aligned-with-project-plan)

---

## 1. MVP Goal

Deliver a working **MCP server** that compiles optimal context for AI coding tools — with zero required configuration.

**Success looks like:** A developer registers the MCP server, runs `aic init` in their project, and their AI responses improve measurably — fewer tokens, better file selection, and deterministic, reproducible context compilation. In editors with hook support (e.g. Cursor), the integration layer ensures compiled context is available from the first message of every session.

> **AIC is model-agnostic and editor-agnostic by design.** It detects the active model automatically and adapts. It works with Cursor, Claude Code, and any MCP-compatible editor. No API key, no cloud account, and no config file are required to start.
>
> **Setup:**
>
> ```json
> { "mcpServers": { "aic": { "command": "npx", "args": ["@aic/mcp"] } } }
> ```
>
> Add the above to your editor's MCP config. Done.

---

## 2. What Ships in MVP

### Included ✅

**Primary: MCP Server (`@aic/mcp`)**

| Feature                | Detail                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **MCP Server**         | Primary interface — exposes `aic_compile` tool; called by trigger rule or integration hooks                                                 |
| Editor adapters        | Cursor, Claude Code, Generic MCP fallback                                                                                                   |
| Model adapters         | OpenAI, Anthropic, Ollama, Generic fallback (auto-detected from request)                                                                    |
| Rules & Hooks Analyzer | _(Planned — Phase 0.5+)_ Scans `.cursorrules`, Cursor rules, Claude Code settings; findings via `aic://rules-analysis` MCP resource         |
| Task Classifier        | Heuristic keyword/pattern matching → 6 task classes                                                                                         |
| HeuristicSelector      | File-path, import-graph, recency-based context selection                                                                                    |
| Context Guard          | Scans selected files for secrets, excluded paths, and prompt injection; blocks sensitive content before it reaches the Summarisation Ladder |
| Summarisation Ladder   | 4-tier compression: full → signatures+docs → signatures → names                                                                             |
| Default Rule Packs     | `default.json`, `refactor.json`, `bugfix.json`, `feature.json`, `docs.json`, `test.json`                                                    |
| SQLite Storage         | Local telemetry + cache metadata                                                                                                            |
| Output Caching         | Hash-based, TTL-configurable, auto-invalidating                                                                                             |
| Config System          | `aic.config.json` — all fields optional; zero-config works out of the box                                                                   |

**Secondary: Developer Utilities (`@aic/cli`)**

| Command              | Purpose                                                                              |
| -------------------- | ------------------------------------------------------------------------------------ |
| `aic compile`        | Inspect the compiled prompt for a given intent (stdout)                              |
| `aic run`            | Compile + send to a model endpoint (testing/scripting)                               |
| `aic compare`        | Diff current compilation vs. last cached version                                     |
| `aic init`           | Scaffold `aic.config.json`; adds `.aic/` to `.gitignore`                             |
| `aic init --upgrade` | Migrate `aic.config.json` to current schema; backs up original                       |
| `aic inspect`        | Show full pipeline breakdown without executing                                       |
| `aic status`         | Show project-level summary: compilations, token savings, Guard blocks, config health |
| `aic telemetry log`  | Inspect the anonymous telemetry audit log — see exactly what was sent                |

### Excluded (deferred) ❌

| Feature                             | Phase    |
| ----------------------------------- | -------- |
| VectorSelector / HybridSelector     | Phase 2  |
| Rules auto-fix (`aic fix-rules`)    | Phase 1  |
| Enterprise: RBAC, SSO, audit        | Phase 3  |
| Policy engine / governance adapters | Phase 2  |
| GUI / web dashboard                 | Phase 3  |
| Multi-model orchestration           | Phase 2+ |

> For the full non-goals list (including Windows support, real-time file watching, cloud/SaaS deployment), see [Project Plan §1 Non-Goals](project-plan.md).

---

## 3. Defaults

All defaults apply when no config file exists or a field is omitted. The “MCP override” column applies during normal editor use; the “CLI flag override” column applies only when using `@aic/cli` developer utilities.

| Setting                      | Default                                        | MCP override                        | CLI flag override |
| ---------------------------- | ---------------------------------------------- | ----------------------------------- | ----------------- |
| Project root                 | Git root (walk up from CWD)                    | Auto-detected per request           | `--root`          |
| Config file                  | Auto-discovered (walk up from project root)    | Auto-discovered                     | `--config`        |
| Database                     | `.aic/aic.sqlite` in project root              | Auto-resolved                       | `--db`            |
| Context budget               | 8,000 tokens                                   | `aic.config.json` only              | `--budget`        |
| Output format                | `unified-diff`                                 | `aic.config.json` only              | `--format`        |
| Context selector             | `heuristic`                                    | `aic.config.json` only              | Config only       |
| Model id                     | Auto-detected from editor                      | `aic.config.json` → `model.id` wins | Config only       |
| Model provider               | `null` (required only for `aic run`)           | `aic.config.json` only              | Config only       |
| Model endpoint               | `null` (provider default)                      | `aic.config.json` only              | Config only       |
| Model API key env            | `null` (env var name, not the key)             | `aic.config.json` only              | Config only       |
| Cache enabled                | `true`                                         | `aic.config.json` only              | `--no-cache`      |
| Cache TTL                    | 60 minutes                                     | `aic.config.json` only              | Config only       |
| Telemetry                    | `false` (opt-in)                               | `aic.config.json` only              | Config only       |
| Telemetry anonymous usage    | `false` (opt-in)                               | `aic.config.json` only              | Config only       |
| Guard enabled                | `true`                                         | `aic.config.json` only              | Config only       |
| Guard additional exclusions  | `[]` (empty — built-in patterns always active) | `aic.config.json` only              | Config only       |
| Guard allow patterns         | `[]` (no exemptions)                           | `aic.config.json` only              | Config only       |
| Content transformers enabled | `true`                                         | `aic.config.json` only              | Config only       |
| Strip comments               | `true`                                         | `aic.config.json` only              | Config only       |
| Normalize whitespace         | `true`                                         | `aic.config.json` only              | Config only       |

---

## 4. Core Pipeline — MVP Implementation Detail

> **Pre-step (before Step 1):** `RepoMapBuilder` scans the project root (respecting `.gitignore`), computes per-file token estimates via tiktoken, and produces the `RepoMap` that Step 4 (ContextSelector) consumes. The result is cached in the `repomap_cache` SQLite table and re-used until the file-tree hash (SHA-256 of all in-scope paths + sizes + mtimes) changes.
>
> These steps run inside the `aic_compile` MCP tool handler on every AI request. The handler receives a `CompilationRequest`, executes Steps 1–10 in sequence (including Step 5.5), and returns `{ compiledPrompt: string, meta: CompilationMeta }`. The editor uses `compiledPrompt` as the full context for its model call, replacing the original unfiltered prompt. Steps 1–8 always run; Step 9 (Executor) only runs when `aic run` is invoked directly; Step 10 (Telemetry) only runs when `telemetry.enabled: true`.
>
> **Phase 1+ (agentic workflows):** `CompilationRequest` gains optional session fields (`sessionId`, `stepIndex`, `stepIntent`, `previousFiles`, `toolOutputs`, `conversationTokens`) that enable multi-step agentic compilation with session tracking, file deduplication, and adaptive budgeting. The core pipeline is unchanged; a session layer enriches the input before the pipeline runs. See [Project Plan §2.7 — Agentic Workflow Support](project-plan.md#27-agentic-workflow-support) for full architecture and interfaces.

### Step 1: Task Classifier

**Input:** Raw intent string (e.g., `"refactor auth module to use JWT"`)

**Method:** Heuristic keyword/pattern matching against a built-in dictionary:

| Task Class | Trigger Keywords/Patterns                             |
| ---------- | ----------------------------------------------------- |
| `refactor` | refactor, restructure, reorganize, clean up, simplify |
| `bugfix`   | fix, bug, broken, error, crash, issue, repair         |
| `feature`  | add, create, implement, build, new, introduce         |
| `docs`     | document, readme, jsdoc, comment, explain, describe   |
| `test`     | test, spec, coverage, assert, mock, unit test         |
| `general`  | _(fallback when no keywords match)_                   |

**Output:** `TaskClassification { taskClass: TaskClass, confidence: Confidence, matchedKeywords: string[] }`

**Edge cases:**

- Multiple task classes match → highest keyword-count wins; ties → alphabetical first
- No match → `general` with confidence 0.0

---

### Step 2: Rule Pack Resolver

**Input:** TaskClassification + config

**Method:**

1. Load `built-in:default` (always included)
2. Load task-class-specific built-in pack (e.g., `built-in:refactor`)
3. Load project-level packs from `./aic-rules/` matching task class
4. Merge in priority order: project > task-specific > default (later overrides earlier)

**Output:** Merged `RulePack { constraints: string[], includePatterns: GlobPattern[], excludePatterns: GlobPattern[], budgetOverride?: TokenCount }`

**Example — `aic-rules/refactor.json`:**

See [Project Plan §3.1](project-plan.md) for the full annotated rule pack example and [Project Plan §3.2](project-plan.md) for the authoring guide (constraint writing principles, pattern guidance, and common mistakes). The key fields are: `constraints` (string array), `includePatterns` / `excludePatterns` (glob arrays), optional `budgetOverride` (number), and optional `heuristic.boostPatterns` / `heuristic.penalizePatterns` (glob arrays).

**Merge behavior:** Arrays concatenated + deduplicated; scalar values (`budgetOverride`) use last-wins within the rule-pack layer only (project > task-specific > default). The `--budget` CLI flag is not part of this merge — it is applied later by the Budget Allocator and always takes highest precedence.

**Edge cases:**

- Missing project rule pack → warning, continue with built-ins
- Malformed JSON → error with file path and parse error details

---

### Step 3: Budget Allocator

**Input:** Config + RulePack + CLI flags

**Resolution order (highest priority first):**

1. `--budget` CLI flag
2. `budgetOverride` in resolved RulePack
3. `contextBudget.perTaskClass[taskClass]` in config
4. `contextBudget.maxTokens` in config
5. Formula-derived `suggestedBudget` from model profile (see [Model-Specific Budget Profiles](#model-specific-budget-profiles))
6. Hard-coded default: 8,000 tokens

**Output:** `budget: TokenCount` (in tokens, counted via **tiktoken cl100k_base**)

**Tokenizer:** All token counts in AIC use **tiktoken** with the **cl100k_base** encoding (OpenAI/Claude compatible). Fallback: `word_count × 1.3` if tiktoken is unavailable.

---

### Step 4: ContextSelector (HeuristicSelector)

**Input:** TaskClassification + RepoMap + budget + RulePack (for include/exclude/boost/penalize patterns) + config.contextSelector (injected via `HeuristicSelector` constructor; carries `maxFiles` and scoring weights)

**Heuristic scoring algorithm:**

Final score = weighted sum of four normalised signals (path relevance × 0.4 + import proximity × 0.3 + recency × 0.2 + size penalty × 0.1), always in range `[0.0, 1.0]`. Rule-pack `boostPatterns` add +0.2; `penalizePatterns` subtract −0.2 (clamped 0–1). Import proximity uses BFS depth from task-relevant seed files; scored 0.0 for files with no `LanguageProvider`.

Full scoring detail with normalisation methods: [Project Plan §8](project-plan.md).

**Constraints applied:**

- `includePatterns` from rule pack (whitelist)
- `excludePatterns` from rule pack + config (blacklist)
- `maxFiles` from config (default: 20)

**Language awareness:** Import-graph walking (signal #2) delegates to the registered `LanguageProvider`. For files with no provider, import proximity is scored as 0 and the file relies on the other three signals. File language detection is extension-based with a filename fallback for extensionless files; see [Project Plan §8 — Language Detection](project-plan.md) for the full mapping table.

**Output:** `ContextResult { files: SelectedFile[], totalTokens: TokenCount, truncated: boolean }`

---

### Step 5: Context Guard

**Input:** `ContextResult` from Step 4

**Purpose:** Scans every selected file before it reaches the Summarisation Ladder. Prevents secrets, excluded paths, and prompt injection patterns from entering the compiled prompt.

**Checks run in order (MVP):**

| Scanner                  | Finding type       | Severity | Action                                                                                    |
| ------------------------ | ------------------ | -------- | ----------------------------------------------------------------------------------------- |
| `ExclusionScanner`       | `excluded-file`    | `block`  | File path matches a never-include pattern                                                 |
| `SecretScanner`          | `secret`           | `block`  | File content matches a known secret regex                                                 |
| `PromptInjectionScanner` | `prompt-injection` | `block`  | Suspected instruction-override string detected; file removed from context, finding logged |

**Never-include path patterns (MVP):**
`.env`, `.env.*`, `*.pem`, `*.key`, `*.pfx`, `*.p12`, `*secret*`, `*credential*`, `*password*`, `*.cert`

**Secret patterns (MVP):** 6 regex patterns covering AWS keys, GitHub tokens, Stripe keys, generic named API keys, JWTs, and SSH/TLS private key headers. See [Project Plan §8.4](project-plan.md) for the full pattern table.

**Prompt injection patterns (MVP):** 6 regex patterns covering instruction override, persona hijack, fake system prompt headers, constraint override, and model-specific special token injection (OpenAI chat markup, Llama/Mistral instruction tokens). See [Project Plan §8.4](project-plan.md) for the full pattern table and false-positive mitigation guidance.

**Behaviour on blocking:**

- Blocked files are removed from the file list before it is passed to the Summarisation Ladder
- The pipeline never fails due to Guard findings — it filters and continues
- `GuardResult` is attached to `CompilationMeta.guard`; the editor can surface a warning to the developer
- If all selected files are blocked, the pipeline returns an empty context with a `guard.passed: false` indicator

**Guard allow patterns (false-positive escape hatch):**

Files matching `guard.allowPatterns` globs are exempt from Guard scanning entirely. Use this for test fixtures, documentation, or example files that intentionally contain secret-like strings.

```json
{
  "guard": {
    "allowPatterns": ["test/fixtures/**", "docs/**", "examples/**"],
    "allowFiles": ["src/config/example-keys.ts"]
  }
}
```

- `allowPatterns` — glob array; matched files skip all scanners
- `allowFiles` — exact relative paths; matched files skip all scanners
- Both are empty by default — all files are scanned
- Built-in never-include patterns (`.env`, `*.pem`, etc.) are **not** overridable by allow patterns — they are always excluded

**Output:** `{ result: GuardResult, safeFiles: SelectedFile[] }`

---

### Step 5.5: Content Transformer

**Input:** Filtered `ContextResult` from Step 5 (Guard-passed files only)

**Purpose:** Transforms file content into the most token-efficient representation while preserving semantic meaning. Runs _after_ Guard (which needs raw content to scan for secrets) and _before_ the Summarisation Ladder (which operates on transformed content for accurate token counting).

**Interfaces** (all types from `shared/src/core/types/` — see ADR-010):

```typescript
interface ContentTransformer {
  readonly id: string;
  readonly fileExtensions: FileExtension[];
  transform(content: string, tier: InclusionTier, filePath: RelativePath): string;
}

interface ContentTransformerPipeline {
  transform(files: SelectedFile[], context: TransformContext): TransformResult;
}

interface TransformContext {
  directTargetPaths: RelativePath[];
  rawMode: boolean;
}

interface TransformResult {
  files: SelectedFile[];
  metadata: TransformMetadata[];
}

interface TransformMetadata {
  filePath: RelativePath;
  originalTokens: TokenCount;
  transformedTokens: TokenCount;
  transformersApplied: string[];
}
```

Full interface definition: [Project Plan §8.5](project-plan.md).

**MVP transformers:**

| Transformer                 | Extensions                                                            | What it does                                                                                                             | Savings |
| --------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | :-----: |
| `WhitespaceNormalizer`      | `*` (non-format-specific)                                             | Collapse blank lines (≥3 → 1), normalize indent to 2-space, trim trailing whitespace                                     | ~10-15% |
| `CommentStripper`           | `.ts`, `.js`, `.py`, `.go`, `.java`, `.rs`, `.c`, `.cpp`              | Remove line/block comments. Preserves JSDoc `@param`/`@returns` for L1 signature tier.                                   | ~15-30% |
| `JsonCompactor`             | `.json`                                                               | Collapse simple arrays/objects to single line. Remove formatting whitespace. Preserve readability for nested structures. | ~40-60% |
| `HtmlToMarkdownTransformer` | `.html`, `.htm`                                                       | Convert HTML tags to Markdown equivalents. Strip `<style>`, `<script>` blocks (included separately if selected).         | ~70-80% |
| `SvgDescriber`              | `.svg`                                                                | Replace full SVG with `[SVG: {viewBox}, {elementCount} elements, {bytes} bytes]`                                         |  ~95%   |
| `LockFileSkipper`           | `*-lock.*`, `*.lock`, `shrinkwrap.*`                                  | Replace with `[Lock file: {name}, {bytes} bytes — skipped]`                                                              |  ~99%   |
| `MinifiedCodeSkipper`       | `.min.js`, `.min.css`, `dist/**`, `build/**`                          | Replace with `[Minified: {name}, {bytes} bytes — skipped]`                                                               |  ~99%   |
| `YamlCompactor`             | `.yaml`, `.yml`                                                       | Collapse single-value maps, remove comment lines, normalize indent                                                       | ~30-50% |
| `MarkdownSimplifier`        | `.md`                                                                 | Strip image references, simplify link syntax, collapse excessive formatting                                              | ~30-40% |
| `AutoGeneratedSkipper`      | Detected via header comment (`// Code generated`, `# AUTO-GENERATED`) | Replace with `[Auto-generated: {name} — skipped]`                                                                        |  ~99%   |

**Phase 0.5 transformers (deferred):**

| Transformer                | Extensions             | What it does                                         | Savings |
| -------------------------- | ---------------------- | ---------------------------------------------------- | :-----: |
| `CssVariableSummarizer`    | `.css`, `.scss`        | Extract `:root` variables + key selectors only       | ~70-80% |
| `TypeDeclarationCompactor` | `.d.ts`                | Collapse multi-line type declarations to single-line | ~40-50% |
| `TestStructureExtractor`   | `*.test.*`, `*.spec.*` | Keep `describe`/`it` names, strip test bodies        | ~60-70% |
| `ImportDeduplicator`       | `*` (cross-file)       | Deduplicate identical imports across multiple files  | ~5-10%  |

**Transformer Bypass Policy (Lossless Escapes):**
If a file is the _direct target_ of the user's intent, the model needs to see its exact syntax to output valid code. Lossy transformers (like `HtmlToMarkdownTransformer` or `JsonCompactor`) must be bypassed.

A file is considered a direct target and bypasses all format-specific transformers if:

1. It is explicitly `@`-mentioned in the user's prompt (supplied via editor MCP parameters)
2. Its `HeuristicSelector` score is > 0.90 (meaning it is highly relevant context)
3. The user adds `#raw` to their prompt (bypasses all transformers for all files)
   _Non-format-specific transformers (`WhitespaceNormalizer`, `CommentStripper`) still apply unless `#raw` is present. These are "non-format-specific" because they clean up content rather than converting between formats — but `CommentStripper` still only runs on files with known comment syntax (see its extensions list above)._

**Execution order:** Format-specific transformers run first, followed by non-format-specific transformers (`WhitespaceNormalizer`, `CommentStripper`). A file is processed by at most one format-specific transformer (first match wins by extension). See [Project Plan §8.5](project-plan.md) for the full `ContentTransformerPipeline` interface and orchestrator types.

**Config:**

```json
{
  "contentTransformers": {
    "enabled": true,
    "stripComments": true,
    "normalizeWhitespace": true,
    "htmlToMarkdown": true,
    "compactJson": true,
    "skipMinified": true,
    "skipLockFiles": true,
    "skipAutoGenerated": true
  }
}
```

All transformer flags default to `true`. Set `contentTransformers.enabled: false` to bypass the entire step (raw content passes through unchanged).

**Metadata:** `CompilationMeta.transforms` records per-file: `{ originalTokens, transformedTokens, transformersApplied[] }`. Visible via `aic inspect` and `aic://last-compilation`.

---

### Step 6: Summarisation Ladder

**Trigger:** `totalTokens > budget`

**Tiers applied in order until context fits:**

| Tier                  | Content Included                                | Typical Compression |
| --------------------- | ----------------------------------------------- | ------------------- |
| L0: Full              | Complete file contents                          | 1× (no compression) |
| L1: Signatures + Docs | Function/class signatures + docstrings/comments | ~3–5×               |
| L2: Signatures Only   | Function/class signatures, no bodies            | ~8–12×              |
| L3: Names Only        | File paths + exported symbol names              | ~20–50×             |

**Algorithm:**

1. Sort files by relevance score (ascending — least relevant compressed first). **Tie-breaking:** when two files share the same score, the file with more `estimatedTokens` is compressed first (larger files yield more savings); if tokens also tie, alphabetical path order (ascending) is the final deterministic tiebreaker
2. Compress lowest-scoring file to next tier
3. Recalculate total tokens
4. Repeat until fits or all files at L3
5. If still over budget at L3 → drop lowest-scoring files until fits; emit warning

**Language awareness:** L1 and L2 tiers depend on `LanguageProvider.extractSignaturesWithDocs()` and `extractSignaturesOnly()`. For files without a registered provider, L1 is skipped (falls through to L2), and L2 uses best-effort regex extraction.

**Output:** `SelectedFile[]` — a new array of new `SelectedFile` objects with updated `tier` fields; the input array from Step 4 (and Step 5) is never mutated

---

### Language Support (MVP)

AIC uses a pluggable **`LanguageProvider`** interface for all language-specific operations in Steps 4 and 6. See the [Project Plan §8.1](project-plan.md) for the full interface definition.

**MVP ships with `TypeScriptProvider`:**

| Capability         | Implementation                                          |
| ------------------ | ------------------------------------------------------- |
| **Languages**      | TypeScript (`.ts`, `.tsx`), JavaScript (`.js`, `.jsx`)  |
| **Import parsing** | Regex-based extraction of `import`/`require` statements |
| **L1 extraction**  | TypeScript Compiler API → signatures + JSDoc            |
| **L2 extraction**  | AST walk, signatures only                               |
| **L3 extraction**  | Exported symbol names + kinds                           |

**Fallback for all other languages:**

| Capability             | Fallback                                                         |
| ---------------------- | ---------------------------------------------------------------- |
| Import parsing         | Skipped (0 score for import proximity)                           |
| L0 (Full)              | ✅ Works                                                         |
| L1 (Signatures + Docs) | Skipped → falls to L2                                            |
| L2 (Signatures Only)   | Best-effort regex (`function`, `class`, `def`, `func`, `pub fn`) |
| L3 (Names Only)        | File path + regex-extracted names                                |

Adding new language support post-MVP requires only implementing the `LanguageProvider` interface and registering it — zero core pipeline changes.

---

### Step 7: Constraint Injector

**Input:** Merged RulePack constraints + config constraints

**Deduplication:** Exact string match → keep first occurrence; first occurrence wins.

**Output format (injected into prompt):**

```
## Constraints
- Output unified diff format only
- Do not modify files outside src/
- Preserve existing public API signatures
- Include inline comments for non-obvious changes
```

**Edge cases:**

- Zero constraints (no rule packs or config define any) → `## Constraints` block is omitted from the prompt entirely; no empty section is emitted
- All constraints are duplicates after deduplication → same as zero-constraint case; block omitted
- Constraint list exceeds 20 items → emit all (no truncation); this is a content decision for rule pack authors

---

### Step 8: Prompt Assembler

**Template:**

```
## Task
{intent}

## Task Classification
Type: {taskClass} (confidence: {confidence})

## Context
{for each file in context}
### {filePath} [Tier: {tier}]
{content at appropriate tier}
{end for}

## Constraints
{constraints}

## Output Format
{outputFormat description}
```

**`{outputFormat description}` values by format:**

| `--format` value           | Block rendered                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `unified-diff` _(default)_ | `Respond with a unified diff (--- a/ +++ b/ @@ ... @@). Do not include any text outside the diff blocks.`          |
| `full-file`                | `Respond with the complete contents of each modified file. Begin each file with a header comment: // FILE: {path}` |
| `markdown`                 | `Respond in Markdown. Use headings, code blocks, and bullet lists as appropriate.`                                 |
| `json`                     | `Respond with a single valid JSON object. Do not include any prose, markdown, or explanation outside the JSON.`    |
| `plain`                    | `Respond in plain text.`                                                                                           |

**Output:** The compiled input (a single string, the final prompt)

---

### Step 9: Executor (run mode)

Sends compiled input to the configured model endpoint via the appropriate provider SDK.

**Supported providers (MVP):**

| Provider  | API key required          | Notes                                                                                                                       |
| --------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| OpenAI    | Yes — `OPENAI_API_KEY`    | GPT-4o, GPT-o3, and other OpenAI models                                                                                     |
| Anthropic | Yes — `ANTHROPIC_API_KEY` | Claude Sonnet, Claude Opus, and other Anthropic models                                                                      |
| Ollama    | **No**                    | Free, runs locally; install Ollama and pull a model (e.g. `ollama pull llama3`). Default endpoint: `http://localhost:11434` |

`aic compile` requires no provider at all — it outputs a plain-text prompt usable anywhere.

**Behaviour:**

- `aic compile` → stops after Step 8 (Assembler); outputs the **raw compiled prompt** (no model-specific formatting applied) to stdout. No provider configuration required.
- `aic run` → applies `ModelAdapter` formatting to the compiled prompt, then sends to the configured model endpoint and streams the response to stdout.
- `aic run --dry-run` → applies `ModelAdapter` formatting (same as `aic run`) but skips the model call; outputs the **model-adapted prompt** (as it would actually be sent) to stdout, and prints `[dry-run] Model call skipped.` on stderr. Exit code 0. Cache is still written. When `telemetry.enabled: true`, emits a `compilation:complete` telemetry event (the `model` field is populated from config).

> **`aic compile` vs `aic run --dry-run`:** `aic compile` outputs the prompt _before_ model-specific formatting (useful for inspection, piping, or sharing). `aic run --dry-run` outputs the prompt _after_ model-specific formatting — exactly what the model would receive — making it the right tool for debugging model behaviour.

**Retry policy:**

| Condition               | Retryable | Behaviour                                                            |
| ----------------------- | --------- | -------------------------------------------------------------------- |
| HTTP 429 (rate limit)   | Yes       | Wait for `Retry-After` header value (or 5s default), then retry once |
| HTTP 500, 502, 503, 504 | Yes       | Wait 2s, then retry once                                             |
| Request timeout         | Yes       | Wait 2s, then retry once with same timeout                           |
| HTTP 400 (bad request)  | No        | Fail immediately — likely a prompt or config issue                   |
| HTTP 401 / 403 (auth)   | No        | Fail immediately — check API key                                     |
| HTTP 404 (not found)    | No        | Fail immediately — check model name and endpoint                     |
| All other 4xx           | No        | Fail immediately                                                     |

Maximum retries: **1**. No exponential backoff in MVP (added in Phase 1 if needed). Retry attempt is logged at `info` level; final failure at `error` level.

---

### Model Context Window Guard

The context budget is separate from the model's own context window. AIC enforces both:

```
model_max_tokens (from provider)     e.g., 128,000
  └─ reserved for response           e.g.,   4,000  (configurable)
  └─ = available_for_prompt          e.g., 124,000
      └─ prompt overhead (template)   e.g.,     500
      └─ constraints block            e.g.,     200
      └─ = max_allowed_context        e.g., 123,300
          └─ context_budget (user)    e.g.,   8,000  ← AIC enforces this
```

- `context_budget > max_allowed_context` → clamp + warn
- `compiled_prompt > model_max_tokens` → fatal error with suggestion
- Default `reserved_for_response`: 4,000 tokens (configurable via `model.reservedResponseTokens`)

---

### Step 10: Telemetry Logger

`TelemetryLogger` subscribes to `compilation:complete` and `compilation:cache-hit` events on the `PipelineEventBus` (see [Project Plan §9.1](project-plan.md)). It does not receive direct calls from any pipeline step. When telemetry is disabled (`telemetry.enabled: false`), the logger simply does not subscribe — no `if` checks inside pipeline steps.

**Stored per compilation (opt-in only):**

| Field                  | Type            | Example                                                                                                                                                        |
| ---------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                   | UUIDv7          | `019504a0-7b3c-7def-8a12-3456789abcde`                                                                                                                         |
| `timestamp`            | ISO 8601 UTC ms | `2026-02-22T20:00:00.000Z`                                                                                                                                     |
| `repo_id`              | SHA-256 hash    | `e3b0c4...`                                                                                                                                                    |
| `task_class`           | string          | `refactor`                                                                                                                                                     |
| `tokens_raw`           | int             | 45,000                                                                                                                                                         |
| `tokens_compiled`      | int             | 7,870 (assembled prompt token count = afterLadder + template overhead; matches `aic inspect` "Prompt total" and `--verbose` `token_reduction`)                 |
| `token_reduction_pct`  | float           | 82.5 (`(tokens_raw - tokens_compiled) / tokens_raw`; consistent with `aic inspect` "Reduction" display)                                                        |
| `files_selected`       | int             | 8                                                                                                                                                              |
| `files_total`          | int             | 142                                                                                                                                                            |
| `summarisation_tiers`  | JSON            | `{"L0":3,"L1":4,"L2":1}`                                                                                                                                       |
| `guard_blocked_count`  | int             | 0 (0 = no files blocked; stored even when Guard is clean)                                                                                                      |
| `guard_findings_count` | int             | 0 (total findings across all severities; equals `guard_blocked_count` in MVP since all scanners use `block`; will diverge if warn-severity scanners are added) |
| `cache_hit`            | bool            | false                                                                                                                                                          |
| `duration_ms`          | int             | 320                                                                                                                                                            |
| `model`                | string          | `gpt-4o` (null if compile-only)                                                                                                                                |

---

## 4b. Rules & Hooks Analyzer — MVP Implementation

The analyzer runs after each `aic_compile` call and updates the `aic://rules-analysis` MCP resource.

**Trigger:** Runs once per unique combination of project root + rule file mtimes. Results are cached until a watched rule file changes — it does not re-scan on every compilation unless files have changed.

**Watched sources (MVP):**

| Source         | Path                                | What is checked                                                                     |
| -------------- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| `.cursorrules` | `{projectRoot}/.cursorrules`        | Redundant lines (exact/near-duplicate), conflicting instructions, token-heavy prose |
| Cursor rules   | `{projectRoot}/.cursor/rules/*.mdc` | Conflicting `globs` fields, always-firing rules (no glob = applies to all files)    |
| Claude Code    | `{projectRoot}/.claude/CLAUDE.md`   | Duplicate constraints already covered by AIC rule packs                             |

**`aic://rules-analysis` resource — response format:**

```json
{
  "analyzedAt": "2026-02-22T20:00:00Z",
  "totalErrors": 1,
  "totalWarnings": 2,
  "totalInfos": 1,
  "findings": [
    {
      "severity": "error",
      "source": ".cursorrules",
      "line": 14,
      "message": "Contradicting instructions: line 14 says 'always use TypeScript' but line 31 says 'prefer JavaScript for scripts'",
      "suggestion": "Pick one and remove the other, or scope each with a file-glob rule."
    },
    {
      "severity": "warn",
      "source": ".cursor/rules/team.mdc",
      "line": null,
      "message": "Rule has no 'globs' field — fires on every file in every request",
      "suggestion": "Add a 'globs' field to scope this rule to relevant files."
    },
    {
      "severity": "info",
      "source": ".cursorrules",
      "line": 7,
      "message": "'Output unified diff format only' duplicates the AIC built-in:refactor rule pack constraint",
      "suggestion": "Remove this line — AIC already injects it when task class is 'refactor'."
    }
  ]
}
```

**Exit codes:** Analyzer failures (file read error, parse error) never fail a compilation. Errors are logged at `warn` level and `findings` is set to `[]` in the resource.

Full spec: [Project Plan §2.4](project-plan.md).

---

## 4c. Developer Utility Specs — `compare`, `init`, `inspect`, `status`

### `aic compare <intent>`

`aic compare` recompiles the intent against the current codebase and diffs the result against the most recent cached compilation for that intent. It answers: _"what changed about the context AIC would send?"_

**Diffs shown:** Selected files (added/removed/guard-blocked), tier changes (e.g. L0→L1), token delta (absolute + percentage), constraints (added/removed), and config snapshot changes.

**Cache lookup:** Keyed by `hash(intent + config-snapshot + file-tree-hash)`. If no entry exists, exits with a suggestion to run `aic compile` first. Expired entries are used with a warning.

**Config change detection:** `aic compare` detects config changes via the `config_history` table in SQLite (see [Project Plan §19](project-plan.md)). Each compilation writes a `config_hash` (SHA-256 of the full `aic.config.json` content) and the `config_json` snapshot. When compare runs, it compares the current config hash against the hash stored with the previous compilation. If they differ, a `[config changed]` header is included in the diff output, listing the specific fields that changed.

Full spec with annotated output example and edge cases: [Project Plan §7.1](project-plan.md).

---

### `aic init`

Creates `aic.config.json` with all-default values in the current working directory. Also adds `.aic/` to `.gitignore` (creates the file if it doesn't exist). **Does not install the trigger rule** — trigger rule installation is handled by `npx @aic/mcp init` (the MCP package's own setup command, run once per project from the editor setup flow).

**Behaviour:**

- If `aic.config.json` already exists → exits with: `Config already exists. Use 'aic init --upgrade' to migrate to the current schema version.`
- Writes `.aic/` directory with `0700` permissions
- Prints: `Created aic.config.json. Edit to customise, or run 'aic compile' to use defaults.`

**`--upgrade` flag:**

- Rewrites `aic.config.json` to the current schema version
- Backs up the original to `aic.config.json.bak` before writing
- In-memory upgrade is applied; the new file is written only if `--upgrade` is explicit (AIC never auto-modifies the config on disk)
- Prints: `Config upgraded from schema v{old} to v{new}. Backup saved to aic.config.json.bak.`

---

### `aic inspect <intent>`

Runs Steps 1–8 and shows the full decision trail without executing the model call and without writing to the compilation cache. Designed for debugging context selection. Both `aic inspect` (CLI) and the `aic_inspect` MCP tool invoke the same `InspectRunner` from `shared/` (see [Project Plan §8.6](project-plan.md) for the `InspectRunner` interface and side-effect constraints).

**Shows:** Task classification, rule packs applied, context budget, selected files (with score, tokens, tier, and provider), guard status, token summary (raw → selected → after guard → after ladder → prompt total → reduction %), and constraints.

- Exit code: always `0`
- Does **not** write to `cache_metadata`; `repomap_cache` is still read/updated normally
- Does **not** call the model

Full spec with annotated output example: [Project Plan §13](project-plan.md).

---

### `aic status`

Displays a formatted project-level summary from the local SQLite database. Answers: _"what has AIC been doing for me?"_

**Output:**

```
AIC Status — project: /Users/dev/my-app
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Compilations:     47 (12 today)
Cache hit rate:   68%
Avg reduction:    41.2%
Total tokens saved: 184,300

Guard:            3 files blocked (2 secrets, 1 exclusion)
Top task classes: refactor (18), bugfix (12), feature (9)
Rules health:     2 warnings (run 'aic inspect' for details)

Config:           aic.config.json (schema v1)
Trigger rule:     .cursor/rules/aic.mdc ✓ (up to date)
Database:         .aic/aic.sqlite (1.2 MB)

Last compilation: 4 min ago — "fix auth middleware"
                  142 files → 8 selected (7,200 tokens, 84% reduction)
```

**Data source:** Reads from `compilation_log`, `cache_metadata`, `guard_findings`, and `telemetry_events` tables in `aic.sqlite` (see [Project Plan §19](project-plan.md) for the full table definitions). Does not run a compilation.

**Sections displayed:**

| Section            | Source                                                     | Notes                                                                    |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| Compilations       | `compilation_log` count                                    | Total + today’s count                                                    |
| Cache hit rate     | `cache_metadata` hit/miss ratio                            | Percentage                                                               |
| Avg reduction      | `telemetry_events` `token_reduction_pct` avg               | Requires `telemetry.enabled: true`; shows "telemetry disabled" otherwise |
| Total tokens saved | `telemetry_events` sum of `(tokens_raw - tokens_compiled)` | Same telemetry requirement                                               |
| Guard              | `guard_findings` aggregate                                 | Count by finding type                                                    |
| Top task classes   | `compilation_log` `task_class`                             | Top 3 by frequency                                                       |
| Rules health       | `aic://rules-analysis` last result                         | Finding count from Rules & Hooks Analyzer                                |
| Config             | `aic.config.json` presence + `version` field               | Schema version                                                           |
| Trigger rule       | Checks trigger file exists + matches current template      | ✓ / ✗ / outdated                                                         |
| Database           | `.aic/aic.sqlite` file size                                | File size                                                                |
| Last compilation   | Most recent `compilation_log` entry                        | Intent, file count, tokens, reduction                                    |

**Behaviour:**

- Exit code: always `0`
- If no compilations exist: `No compilations recorded yet. Run 'aic compile' or use AIC via your editor.`
- If telemetry is disabled: token savings sections show `(telemetry disabled — enable in aic.config.json)`
- Requires `.aic/aic.sqlite` to exist; if missing: `No AIC database found. Run 'aic init' or use AIC via your editor first.`

---

## 4d. MVP Additions

### First-Run Message

After the first successful compilation in a project (detected by checking `compilation_count` in `aic.sqlite`), AIC includes a `firstRun` field in `CompilationMeta`:

```json
{
  "firstRun": true,
  "firstRunMessage": "AIC compiled your first request: 142 files → 8 selected (7,200 tokens, 84% reduction). Run 'aic inspect' for details."
}
```

- `firstRun` is `true` only on the very first compilation per project
- The editor can surface this via `aic://last-compilation` — making the value of AIC immediately visible
- On subsequent compilations, `firstRun` is `false` and `firstRunMessage` is omitted

---

### Model-Specific Budget Profiles

AIC auto-detects the model from the editor's MCP request and derives an optimal budget from the model's context window. No user configuration required.

**Budget derivation formula:**

```
suggestedBudget = clamp(maxContextWindow × windowRatio, floor, ceiling)
```

- `windowRatio`: default `0.08` (8% of context window). Configurable via `contextBudget.windowRatio` in `aic.config.json`.
- `floor`: 4,000 tokens. Below this, context is too compressed to be useful.
- `ceiling`: 16,000 tokens. Above this, "Lost in the Middle" effects degrade model attention — research confirms models struggle with information buried in long contexts, and focused context outperforms a stuffed window.

**Design principle:** Budget profiles derive from the model's context window size via formula — never hard-coded per model. When a new model ships with a larger context window, its budget scales automatically without code changes. The `windowRatio` is the single tuning knob: lower values produce more focused context (less noise, risk of missing relevant files), higher values include more context (better coverage, risk of attention degradation).

| Model family                    | `maxContextWindow` | `windowRatio` | Derived `suggestedBudget` | `reservedForResponse` |
| ------------------------------- | ------------------ | ------------- | ------------------------- | --------------------- |
| OpenAI (GPT-4o, GPT-o3)         | 128,000            | 0.08          | 10,240                    | 4,000                 |
| Claude Sonnet                   | 200,000            | 0.08          | 16,000 (ceiling)          | 4,000                 |
| Claude Opus                     | 200,000            | 0.08          | 16,000 (ceiling)          | 4,000                 |
| Ollama (Llama 3+)               | 128,000            | 0.03          | 4,000 (floor)             | 2,000                 |
| Ollama (legacy / unknown model) | 8,192              | 0.03          | 4,000 (floor)             | 1,000                 |
| Generic / unknown               | —                  | —             | 8,000 (hard-coded)        | 4,000                 |

> **Ollama context window note:** Most modern Ollama models (Llama 3, Mistral, Gemma 2, etc.) support 128K+ context windows. AIC queries the Ollama `/api/show` endpoint at startup to read the model's actual `num_ctx` parameter. If the endpoint is unreachable or the model is unrecognised, the conservative 8,192 fallback is used. Ollama models use a lower `windowRatio` (0.03) because local models benefit from smaller, more focused context.

> **Phase 0.5 — Budget utilization feedback.** `aic status` will analyse `compilation_log` history and surface actionable recommendations: _"Last 10 compilations used 38% of budget — consider reducing via `contextBudget.windowRatio: 0.05`"_ or _"8/10 compilations hit L2+ compression — consider increasing via `contextBudget.windowRatio: 0.12`"_. This leverages data already collected in `compilation_log`; no new schema required.

> **Phase 1 — Auto-tuning.** The Adaptive Budget Allocator ([Project Plan §2.7](project-plan.md#27-agentic-workflow-support)) learns the optimal budget per project/model/task-class from compilation history and adjusts automatically — no manual tuning needed.

**Resolution order:** `--budget` CLI flag > `budgetOverride` in rule pack > `contextBudget.perTaskClass` > `contextBudget.maxTokens` > formula-derived `suggestedBudget` from model profile > hard-coded 8,000.

The formula-derived `suggestedBudget` slots in just above the hard-coded default — it is a smarter fallback, not a mandatory cap. Any explicit user configuration always wins. Users can also override `windowRatio` globally to tune the aggressiveness of the formula for their workflow.

**`maxContextWindow` and `reservedForResponse`** are used by the Model Context Window Guard (see §4, Step 9 section). They replace the generic 128,000 / 4,000 defaults when the model is auto-detected.

---

### Trigger Rule Robustness

The trigger rule installed by `npx @aic/mcp init` instructs the editor's AI to call `aic_compile`. The trigger rule is suggestive — compliance depends on the model and editor. In Cursor, the integration layer (hooks) provides stronger enforcement via `preToolUse` gating. In editors without hook support, the trigger rule is the sole mechanism.

**Per-editor trigger formats (MVP):**

| Editor      | Trigger file            | Key attributes                                                                                                                               |
| ----------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Cursor      | `.cursor/rules/aic.mdc` | `alwaysApply: true`, no `globs` restriction — included in every prompt. Integration hooks provide stronger enforcement via `preToolUse` gate |
| Claude Code | `.claude/CLAUDE.md`     | Instruction appended to project-level system context                                                                                         |
| Generic MCP | N/A                     | Relies on editor invoking registered MCP tools; no trigger rule needed                                                                       |

**Trigger rule content pattern:**

```
Before responding to any user request, call the aic_compile MCP tool with the
user's intent as the argument. Use the returned compiled context as your primary
context for generating a response. Do not skip this step.
```

**Resilience measures:**

- `aic://last-compilation` always includes `compilationCount` — if an editor makes 10 requests but only 5 have compilations, the mismatch is visible
- `npx @aic/mcp init` validates the trigger rule format on each run and warns if the installed rule appears outdated or modified
- The trigger rule template is versioned; `npx @aic/mcp init` updates it if a newer version is available (backs up the old one)

---

### Anonymous Telemetry

AIC collects anonymous, aggregate usage statistics to help improve the product. This is **opt-in** and disabled by default.

**Opt-in prompt during `aic init`:**

```
Help improve AIC by sharing anonymous usage statistics?
(No file paths, prompts, or code are ever sent)
Learn more: https://docs.aic.dev/telemetry

Enable? [y/N]
```

If accepted, sets `telemetry.anonymousUsage: true` in `aic.config.json`. Can be changed at any time.

**Payload schema** (sent to `https://telemetry.aic.dev` via HTTPS POST):

```json
{
  "v": "0.1.0",
  "os": "darwin",
  "node": "20.11.0",
  "event": "compilation",
  "data": {
    "task_class": "refactor",
    "primary_language": "typescript",
    "token_reduction_pct": 41.2,
    "files_scanned": 142,
    "files_selected": 8,
    "guard_blocks": 0,
    "guard_block_types": ["secret", "excluded-file"],
    "cache_hit": false,
    "duration_ms": 320,
    "model_family": "gpt-4o",
    "editor": "cursor",
    "heuristic_signals": {
      "path_avg": 0.45,
      "import_avg": 0.62,
      "recency_avg": 0.31,
      "size_avg": 0.78
    }
  }
}
```

`primary_language` is the most common file extension among selected files (e.g. `typescript`, `python`, `go`, `rust`, `java`, `javascript`). `editor` is detected from the MCP connection metadata (e.g. `cursor`, `claude-code`, `unknown`). Both are fixed enums — never free text.

**Privacy rules (mandatory, non-negotiable):**

| Rule                  | Enforcement                                                        |
| --------------------- | ------------------------------------------------------------------ |
| No file paths         | Payload schema enforced at build time — no string fields for paths |
| No file content       | Only numeric aggregates and enum values                            |
| No prompts or intents | `task_class` is a fixed enum, not free text                        |
| No project names      | Not included in schema                                             |
| No persistent user ID | Each payload is independent; no session tracking                   |
| No IP logging         | Telemetry endpoint does not log client IPs                         |
| HTTPS only            | All payloads sent over TLS                                         |

**Batching:** Payloads are queued locally and sent in a single HTTPS request at most once per 5 minutes. If the endpoint is unreachable, payloads are silently dropped (not retried, not stored).

**Local audit log (full transparency):**

Every payload that is sent (or would be sent) to the telemetry endpoint is also stored in the local `aic.sqlite` database in an `anonymous_telemetry_log` table:

```sql
CREATE TABLE anonymous_telemetry_log (
  id TEXT PRIMARY KEY,            -- UUIDv7 (time-ordered, globally unique; see Project Plan ADR-007)
  created_at TEXT NOT NULL,       -- YYYY-MM-DDTHH:mm:ss.sssZ (UTC; see Project Plan ADR-008)
  payload_json TEXT NOT NULL,     -- exact JSON that was (or would be) sent
  status TEXT NOT NULL            -- 'sent' | 'dropped' (endpoint unreachable) | 'queued'
);
```

Users can inspect exactly what AIC sends at any time:

```bash
$ aic telemetry log

Anonymous telemetry log (last 5 entries)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#47  2026-02-23 19:45:00  sent
     task_class: refactor | lang: typescript | reduction: 41.2%
     model: gpt-4o | editor: cursor | guard_blocks: 0

#46  2026-02-23 19:40:00  sent
     task_class: bugfix | lang: python | reduction: 38.7%
     model: claude-sonnet-4 | editor: claude-code | guard_blocks: 1

#45  2026-02-23 19:35:00  dropped (endpoint unreachable)
     task_class: feature | lang: typescript | reduction: 44.1%
     ...

Showing 5 of 47 entries. Use --all for full log, --json for raw payloads.
```

**`aic telemetry log` flags:**

| Flag             | Effect                                                |
| ---------------- | ----------------------------------------------------- |
| `--all`          | Show all entries (not just last 5)                    |
| `--json`         | Output raw JSON payloads (pipe-friendly)              |
| `--since <date>` | Filter entries after a date                           |
| `--clear`        | Delete all log entries (does not affect future sends) |

**Why this matters:** Full transparency builds trust. Users can verify AIC's privacy claims by inspecting the actual payloads. If a user sees something they're uncomfortable with, they can disable anonymous telemetry and file a report. The audit log also serves as the local queue for batching — `status: 'queued'` entries are sent in the next batch.

**Endpoint security:** The `https://telemetry.aic.dev` endpoint is protected by schema validation (reject malformed payloads), rate limiting (10 req/min per IP), and TLS-only transport. The endpoint is append-only and anonymous — if it goes down, AIC continues working normally. Full threat model: [Project Plan §12](project-plan.md).

**What this data enables:**

- Token reduction benchmarks across real-world usage
- Guard effectiveness metrics for the security story
- Heuristic signal analysis to improve context selection
- Error rate monitoring to detect regressions
- Model family and editor distribution to prioritise integrations
- **Language ecosystem focus** — know which languages to add import providers for first
- Adoption and usage frequency tracking

---

## 5. Success Criteria

### Quantitative

| Metric            | Target                                      | Measurement                                    |
| ----------------- | ------------------------------------------- | ---------------------------------------------- |
| Token reduction   | Measurable reduction across canonical tasks | `(tokens_raw - tokens_compiled) / tokens_raw`  |
| Compilation time  | <2 seconds for repos <1,000 files           | Wall clock, cold cache                         |
| Cache hit speedup | <100ms for cached compilations              | Wall clock                                     |
| Stable outputs    | Identical output for identical input        | Byte-for-byte comparison, 100 consecutive runs |

### Qualitative

| Criteria              | Validation                                                                |
| --------------------- | ------------------------------------------------------------------------- |
| First-run experience  | New user: install → first `aic compile` in <5 minutes                     |
| Zero-config usability | `aic compile "fix bug"` works with no `aic.config.json` present           |
| Useful inspect output | `aic inspect` clearly shows _why_ each file was selected and at what tier |
| Meaningful compare    | `aic compare` highlights material differences in context selection        |

### Benchmark Suite

**10 canonical tasks** tested on every build:

| #   | Task Class | Intent                                           | Repo Type               |
| --- | ---------- | ------------------------------------------------ | ----------------------- |
| 1   | refactor   | "refactor auth module to use middleware pattern" | Express.js API          |
| 2   | bugfix     | "fix null pointer in user service"               | TypeScript monorepo     |
| 3   | feature    | "add rate limiting to API endpoints"             | Node.js REST API        |
| 4   | docs       | "add JSDoc to all exported functions"            | Utility library         |
| 5   | test       | "add unit tests for payment processor"           | E-commerce app          |
| 6   | general    | "improve performance of dashboard"               | React + Node fullstack  |
| 7   | refactor   | "split monolith into microservices"              | Large Python Django app |
| 8   | bugfix     | "fix race condition in cache invalidation"       | Go service              |
| 9   | feature    | "add WebSocket support for real-time updates"    | Next.js app             |
| 10  | test       | "add integration tests for database layer"       | Rust CLI tool           |

**Pass criteria per build:**

- No task shows >5% token increase vs. baseline
- No task takes >2× baseline compilation time
- All tasks produce deterministic output (3 consecutive runs compared)

**Benchmark repo provisioning:**

Each canonical task runs against a synthetic fixture repository stored at `test/benchmarks/repos/<task-number>/`. These are version-controlled, deterministic snapshots — not live open-source repos — to ensure reproducibility.

| Property              | Specification                                                                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Source**            | Hand-crafted minimal repos that exhibit the file structures, import graphs, and language mixes each task requires (e.g., task #7 has a Django-style Python project with `models.py`, `views.py`, `urls.py`, `settings.py`) |
| **Size**              | Each repo contains 50–200 files to stay well within the <2s compilation target while exercising the full pipeline                                                                                                          |
| **Language fidelity** | Files contain syntactically valid code with realistic import/export structures so `LanguageProvider` import-graph walking and signature extraction produce meaningful results                                              |
| **Determinism**       | No external dependencies, no network calls, no timestamps. `git log --format="%at"` mtime values are set to fixed dates in the fixture                                                                                     |
| **Maintenance**       | Fixture repos are committed to the AIC repository under `test/benchmarks/repos/` and updated only when a task definition changes. Changes require a justification comment in the PR                                        |

**Baseline establishment:**

- Baseline is recorded on the **first successful CI run** after a task is added to the suite. The benchmark runner writes `token_count` and `duration_ms` to a committed `benchmarks/baseline.json` file in the repo.
- Baseline is updated manually by a maintainer (via `pnpm run bench:update-baseline`) when an intentional improvement changes the expected token count. The PR that updates the baseline must include a justification comment.
- If `baseline.json` has no entry for a task (new task), that task is skipped in the regression check on its first run and its result is automatically written as the new baseline.

---

## 6. Error Handling (MVP)

| Scenario                                     | User-facing message                                                                                                                                                                                                                         | Exit code |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| No config file                               | _(silent, use defaults)_                                                                                                                                                                                                                    | 0         |
| Invalid config JSON                          | `Error: Invalid config at line X: {detail}. Run 'aic init' to create a valid config.`                                                                                                                                                       | 1         |
| Unknown task class                           | _(silent fallback to `general`)_                                                                                                                                                                                                            | 0         |
| Missing rule pack file                       | `Warning: Rule pack '{name}' not found, skipping.`                                                                                                                                                                                          | 0         |
| Zero files selected                          | `Error: No relevant files found. Broaden your intent or check includePatterns in config.`                                                                                                                                                   | 1         |
| Guard blocks all selected files              | `Error: Context Guard blocked all selected files ({N} blocked). Review findings via aic://last-compilation or run 'aic inspect' to see what was excluded. Add 'guard.additionalExclusions' patterns if legitimate files are being blocked.` | 1         |
| Guard blocks some files                      | _(silent — blocked files removed from context, pipeline continues with remaining files; findings attached to CompilationMeta.guard)_                                                                                                        | 0         |
| All files at L3 + still over budget          | `Warning: Heavy truncation applied. {N} files dropped. Consider increasing --budget.`                                                                                                                                                       | 0         |
| Compiled prompt exceeds model window         | `Error: Compiled prompt ({N} tokens) exceeds model limit ({M}). Reduce --budget or use a larger-context model.`                                                                                                                             | 1         |
| `aic run` with no provider configured        | `Error: No model provider configured. Set 'model.provider' in aic.config.json, or use 'aic compile' to generate the prompt without a model.`                                                                                                | 1         |
| Model unreachable                            | `Error: Cannot reach {provider} at {endpoint}. Check your API key ({apiKeyEnv}) and network.`                                                                                                                                               | 1         |
| Model returns error                          | `Error: Model returned {status}: {message}`                                                                                                                                                                                                 | 1         |
| SQLite write failure                         | `Warning: Telemetry write failed ({reason}). Continuing without telemetry.`                                                                                                                                                                 | 0         |
| Corrupt cache                                | `Warning: Cache entry corrupt, recomputing.`                                                                                                                                                                                                | 0         |
| `aic compare` — no previous cache            | `No previous compilation found for this intent. Run 'aic compile' first.`                                                                                                                                                                   | 1         |
| `aic compare` — cache expired                | `Warning: Cache entry expired ({N} minutes ago). Diff may not reflect current config.` + proceeds                                                                                                                                           | 0         |
| `aic init` — config already exists           | `Config already exists. Use 'aic init --upgrade' to migrate to the current schema version.`                                                                                                                                                 | 1         |
| `aic init --upgrade` — `.bak` already exists | Overwrites existing `.bak` silently; backup always reflects the file state immediately before the current upgrade                                                                                                                           | 0         |
| `aic status` — no database                   | `No AIC database found. Run 'aic init' or use AIC via your editor first.`                                                                                                                                                                   | 0         |
| `aic status` — no compilations               | `No compilations recorded yet. Run 'aic compile' or use AIC via your editor.`                                                                                                                                                               | 0         |

Exit codes: `0` = success (may include warnings); `1` = fatal error.

---

## 7. Security, Observability & Performance (MVP)

These topics are specified in full in the [Project Plan](project-plan.md). Below are the MVP-critical highlights:

### Security (see [Project Plan §12](project-plan.md))

- **Context Guard** scans every selected file before it reaches the model — secrets, credentials, excluded paths, and prompt injection patterns are blocked at Step 5
- Guard findings are logged in `CompilationMeta.guard` and visible in `aic inspect`; the pipeline never silently includes sensitive content
- API keys referenced by env var name only — never stored, logged, or cached
- `aic compile` never contacts external services — safe to run on sensitive codebases
- `.aic/` auto-added to `.gitignore` on `aic init`; created with `0700` permissions
- Telemetry stores metrics only — never file contents or prompt text

### Observability (see [Project Plan §13](project-plan.md))

- Four log levels: `error`, `warn`, `info`, `debug`
- `--verbose` prints full decision trail (classification → rules → budget → file selection → scoring → guard → ladder → assembly)
- `aic inspect` shows why each file was selected, at what tier, with what score — without executing

### Performance (see [Project Plan §14](project-plan.md))

- Cold cache compilation: <2s for repos <1,000 files
- Cache hit: <100ms
- Memory: <256MB resident
- Startup: <500ms to first pipeline step
- Max repo: 10,000 files (beyond this, use `includePatterns` to scope)

### Dependencies (see [Project Plan §16](project-plan.md))

- **Runtime:** `typescript`, `tiktoken`, `better-sqlite3`, `commander`, `fast-glob`, `ignore`, `diff`
- **Dev:** `vitest`, `tsx`, `eslint`, `prettier`
- No framework-level HTTP dependencies (Express, Fastify, etc.) — AIC exposes a lightweight MCP-native server interface, not a generic HTTP server

---

## 8. Multi-Project Behaviour (MVP)

```
Project-A/          Project-B/
├── aic.config.json ├── aic.config.json
├── aic-rules/      └── .aic/
│   └── team.json       ├── aic.sqlite
└── .aic/               └── cache/
    ├── aic.sqlite
    └── cache/
```

- Each project is hermetically isolated
- `--root /path/to/Project-B` from inside Project-A works correctly
- No shared state, no global database, no cross-project data leakage

---

## 8a. MVP Test Plan

This section summarizes the test deliverables that ship with Phase 0. Full testing strategy: [Project Plan §17](project-plan.md).

### Unit Tests (per pipeline step)

| Step                         | Key assertions                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Step 1 (TaskClassifier)      | Correct task class for each keyword set; `general` fallback when no match; tie-breaking                                            |
| Step 2 (RulePackResolver)    | Built-in packs load; project packs merge correctly; malformed JSON produces error                                                  |
| Step 3 (BudgetAllocator)     | Resolution order respected (CLI > rulePack > perTaskClass > config > default)                                                      |
| Step 4 (HeuristicSelector)   | Scoring formula verified against fixture repos; `maxFiles` cap respected; include/exclude patterns applied                         |
| Step 5 (ContextGuard)        | Each scanner (Exclusion, Secret, PromptInjection) tested with known-safe and known-flagged fixtures; all-blocked edge case handled |
| Step 6 (SummarisationLadder) | Each tier produces expected compression; over-budget triggers next tier; lowest-score files compressed first                       |
| Step 7 (ConstraintInjector)  | Deduplication; empty list omits block; ordering preserved                                                                          |
| Step 8 (PromptAssembler)     | Template rendered correctly for each output format; token count includes overhead                                                  |
| Step 9 (Executor)            | Retry policy honoured; non-retryable errors fail immediately (mocked endpoint)                                                     |
| Step 10 (TelemetryLogger)    | Events written to SQLite when enabled; no-op when disabled; subscriber errors caught                                               |

### Integration Tests

| Scenario                   | What is validated                                                           |
| -------------------------- | --------------------------------------------------------------------------- |
| Full pipeline (cold cache) | Intent → compiled output matches golden snapshot                            |
| Full pipeline (cache hit)  | Second run returns identical output in <100ms                               |
| Config variations          | Empty config, partial config, invalid config all produce expected behaviour |
| Multi-project isolation    | Two projects in same test run share no state                                |
| Model context window guard | Prompt never exceeds model max; oversized budget clamped with warning       |

### Benchmark Suite

10 canonical tasks (see [§5 Benchmark Suite](#benchmark-suite)) run on every CI build:

- **Pass:** No task shows >5% token increase vs. baseline
- **Pass:** No task takes >2× baseline compilation time
- **Pass:** All tasks produce deterministic output (3 consecutive runs compared byte-for-byte)

### E2E Tests

| Command              | What is validated                                              |
| -------------------- | -------------------------------------------------------------- |
| `aic compile`        | Output format correct; token count within budget               |
| `aic run`            | Mock model endpoint receives expected payload; streaming works |
| `aic run --dry-run`  | Model-adapted prompt output on stdout; model call skipped      |
| `aic compare`        | Source file modification produces meaningful diff              |
| `aic inspect`        | Output includes all pipeline sections; exit code 0             |
| `aic init`           | Config created; `.aic/` added to `.gitignore`                  |
| `aic init --upgrade` | Config upgraded; backup created                                |

---

## 8b. MCP Server Startup Sequence

When the MCP server process starts (via `npx @aic/mcp`), it executes the following steps in order before accepting requests:

```
1. Parse process arguments
         │
         ▼
2. Load config
   └─ Walk up from CWD to find aic.config.json
   └─ If found: validate + apply in-memory schema migration
   └─ If not found: use all defaults
         │
         ▼
3. Open SQLite database (.aic/aic.sqlite)
   └─ Create .aic/ with 0700 if missing
   └─ Run pending schema migrations (MigrationRunner)
   └─ Record server session (insert server_sessions row)
   └─ Mark orphaned sessions as crash (stopped_at IS NULL → stop_reason = 'crash')
         │
         ▼
4. Build shared infrastructure
   └─ Tokenizer (tiktoken cl100k_base)
   └─ SyncEventBus
   └─ SqliteCacheStore + SqliteTelemetryStore
         │
         ▼
5. Register language providers
   └─ TypeScriptProvider (first — handles .ts/.tsx/.js/.jsx)
   └─ GenericProvider (last — catch-all fallback)
         │
         ▼
6. Register editor adapters
   └─ CursorAdapter, ClaudeCodeAdapter, GenericMcpAdapter
         │
         ▼
7. Register model adapters
   └─ OpenAiAdapter, AnthropicAdapter, OllamaAdapter, GenericModelAdapter
         │
         ▼
8. Attach telemetry observer
   └─ TelemetryLogger subscribes to EventBus
   └─ No-op if telemetry.enabled is false
         │
         ▼
9. Register MCP tools + resources
   └─ Tool: aic_compile
   └─ Tool: aic_inspect
   └─ Resource: aic://last-compilation
   └─ Resource: aic://rules-analysis
         │
         ▼
10. Register shutdown handler (SIGINT / SIGTERM)
    └─ On signal: update server_sessions.stopped_at + stop_reason = 'graceful'
         │
         ▼
11. Start MCP transport (stdio)
    └─ Server ready — accepting requests
```

**Timing target:** Steps 1–11 complete in <500ms (see [Project Plan §14](project-plan.md)).

**Error during startup:** If config is invalid → exit with error message. If SQLite cannot be opened → exit with error message. If a provider fails to register → log warning, continue without it. The server never starts in a partially broken state — it either fully initialises or exits with a clear error.

**Runtime error handling:** Once running, the MCP server handles transport errors, malformed requests, and unhandled exceptions at the handler boundary — see [Project Plan §11.1](project-plan.md) for the full MCP transport error table. The server never crashes due to a single bad request.

**Concurrency:** The MCP server processes requests sequentially on a single thread. If the editor sends two `aic_compile` requests in rapid succession, the second is queued and processed after the first completes. See [Project Plan §2.6](project-plan.md) for the full concurrency model and determinism guarantees.

---

## 8c. Input Validation (Zod Schemas)

All MCP handler, CLI parser, and config loader inputs are validated at the boundary using **Zod** (ADR-009). Validation produces branded types for the core pipeline. The core and pipeline never import Zod — they trust the branded types produced by the boundary layer.

### `CompilationRequestSchema`

Validates `aic_compile` MCP tool arguments:

```typescript
const CompilationRequestSchema = z.object({
  intent: z.string().min(1).max(10_000),
  projectRoot: z.string().min(1),
  modelId: z.string().nullable().default(null),
  editorId: z.enum(["cursor", "claude-code", "generic"]).default("generic"),
  configPath: z.string().nullable().default(null),
  sessionId: z.string().uuid().optional(),
  stepIndex: z.number().int().nonnegative().optional(),
  stepIntent: z.string().max(10_000).optional(),
  previousFiles: z.array(z.string()).optional(),
  toolOutputs: z.array(ToolOutputSchema).optional(),
  conversationTokens: z.number().int().nonnegative().optional(),
});
```

On validation failure, the MCP handler returns error code `-32602` (Invalid params) with a sanitised message listing the failing field paths.

### `InspectRequestSchema`

Validates `aic_inspect` MCP tool arguments:

```typescript
const InspectRequestSchema = z.object({
  intent: z.string().min(1).max(10_000),
  projectRoot: z.string().min(1),
  configPath: z.string().nullable().default(null),
});
```

### `AicConfigSchema`

Validates `aic.config.json` at config load time. All fields are optional (AIC works with an empty `{}`):

```typescript
const AicConfigSchema = z
  .object({
    version: z.number().int().positive().default(1),
    contextBudget: z
      .object({
        maxTokens: z.number().int().positive().default(8000),
        windowRatio: z.number().positive().max(1).default(0.08),
        perTaskClass: z.record(z.number().int().positive()).optional(),
      })
      .optional(),
    rulePacks: z.array(z.string()).default(["built-in:default"]),
    output: z
      .object({
        format: z
          .enum(["unified-diff", "full-file", "markdown", "json", "plain"])
          .default("unified-diff"),
        includeExplanation: z.boolean().default(false),
      })
      .optional(),
    guard: z
      .object({
        enabled: z.boolean().default(true),
        additionalExclusions: z.array(z.string()).default([]),
        allowPatterns: z.array(z.string()).default([]),
        allowFiles: z.array(z.string()).default([]),
      })
      .optional(),
    telemetry: z
      .object({
        enabled: z.boolean().default(false),
        anonymousUsage: z.boolean().default(false),
        storage: z.enum(["local"]).default("local"),
      })
      .optional(),
    cache: z
      .object({
        enabled: z.boolean().default(true),
        ttlMinutes: z.number().int().positive().default(60),
        invalidateOn: z
          .array(z.enum(["config-change", "file-change"]))
          .default(["config-change", "file-change"]),
      })
      .optional(),
  })
  .strict();
```

On validation failure, AIC exits with a clear error message listing the failing fields and expected types. Unknown fields are rejected (`.strict()`).

### `RulePackSchema`

Validates user-authored rule pack JSON files:

```typescript
const RulePackSchema = z.object({
  name: z.string().optional(),
  version: z.number().int().optional(),
  description: z.string().optional(),
  constraints: z.array(z.string()).default([]),
  includePatterns: z.array(z.string()).default([]),
  excludePatterns: z.array(z.string()).default([]),
  budgetOverride: z.number().int().positive().optional(),
  heuristic: z
    .object({
      boostPatterns: z.array(z.string()).default([]),
      penalizePatterns: z.array(z.string()).default([]),
    })
    .optional(),
});
```

### `TelemetryPayloadSchema`

Validates outbound anonymous telemetry payloads — acts as a security gate ensuring no paths, PII, or content leaks:

```typescript
const TelemetryPayloadSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  event: z.enum(["compilation", "cache-hit"]),
  payload: z.object({
    taskClass: z.enum(["refactor", "bugfix", "feature", "docs", "test", "general"]),
    tokensRaw: z.number().int().nonnegative(),
    tokensCompiled: z.number().int().nonnegative(),
    reductionPct: z.number().min(0).max(1),
    durationMs: z.number().int().nonnegative(),
    cacheHit: z.boolean(),
    filesSelected: z.number().int().nonnegative(),
    filesTotal: z.number().int().nonnegative(),
    guardFindings: z.number().int().nonnegative(),
    transformSavings: z.number().int().nonnegative(),
  }),
});
```

### Validation boundary enforcement

Zod is imported only in boundary modules (`mcp/src/`, `cli/src/`, `shared/src/adapters/`). ESLint `no-restricted-imports` blocks Zod in `shared/src/core/` and `shared/src/pipeline/`. See [Project Plan ADR-009](project-plan.md) for the full rationale.

---

## 9. Roadmap (aligned with Project Plan)

| Phase                                         | Version | Status     | Key Deliverables                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------- | ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 0: MCP Server + Developer Utilities** | `0.1.0` | 🟡 Current | This specification — all features in Sections 2–4d, including anonymous telemetry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Phase 0.5: Quality Release**                | `0.2.0` | ⬜ Next    | GenericImportProvider (Python/Go/Rust/Java regex), intent-aware file discovery, `aic://session-summary` resource (basic agentic history via `compilation_log`), Guard `warn` severity, `aic report` (static HTML), CSS/TypeDecl/test-structure transformers, **budget utilization feedback** in `aic status` (analyses `compilation_log` to recommend `windowRatio` adjustments)                                                                                                                                                                                                                                  |
| Phase 1: OSS Release                          | `1.0.0` | ⬜ Planned | Public repo, docs, npm package, CI/CD, `postinstall` team deployment, auto-detected dependency constraints, reverse dependency walking, `aic history`, `aic suggest`, optional cost estimation in `aic status` (model-specific pricing, deferred from MVP since AIC is model-agnostic); **agentic support**: Session Tracker + extended `CompilationRequest` fields + **Adaptive Budget Allocator** (conversation-length + utilization-based auto-tuning) + Specification Compiler (`aic_compile_spec` MCP tool + `aic compile-spec` CLI) + session-aware cache keying (see [Project Plan §2.7](project-plan.md)) |
| Phase 2: Semantic + Governance                | `2.0.0` | ⬜ Planned | VectorSelector (Zvec integration), HybridSelector, governance adapters, policy engine, `aic trends`, `extends` config for org-level deployment, centralised config server; **agentic support**: Conversation Compressor + editor-specific conversation adapters                                                                                                                                                                                                                                                                                                                                                   |
| Phase 3: Enterprise                           | `3.0.0` | ⬜ Future  | Control plane, RBAC, SSO, audit logs, fleet management via MDM, live enterprise dashboard, hosted option                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Versioning policy: see [Project Plan §22](project-plan.md).
