# Best Practices for AI-Assisted Coding with AIC

These are best practices for getting the most out of AI-assisted coding. AIC is designed to amplify them by supplying task-focused context — when you follow these patterns, AIC ensures your AI assistant has the best possible context. This doc assumes AIC is installed and enabled; see [Installation](installation.md). Terms used here are defined in the [Glossary](#glossary) or in context.

---

## Glossary

| Term                    | Definition                                                                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AIC**                 | AI Context Compiler — compiles project code and rules into task-focused context for the AI assistant. See [Architecture](architecture.md).                                                    |
| **Compilation**         | The process of classifying your intent, selecting relevant files, and assembling context for the model. Runs at session start and (in some editors) before each message or before compaction. |
| **Compiled context**    | The output of compilation: the files, rules, and metadata injected into the model's view so it sees the right code for the current task.                                                      |
| **Context window**      | The fixed-size input the model sees — your messages plus any injected content. When it fills up, the editor may compact (summarize) earlier content.                                          |
| **Context Guard**       | AIC component that blocks secrets and excluded files from compiled context so they never reach the model. See [Architecture](architecture.md) and [Security](security.md).                    |
| **Session-start hooks** | Scripts the editor runs when a new chat session begins. AIC uses them to run compilation and inject context into the model's system prompt.                                                   |
| **Tool gate**           | A mechanism (in Cursor and Claude Code) that blocks other tool use until `aic_compile` has run, so the model always has compiled context before acting.                                       |
| **PreCompact**          | A hook (in Claude Code) that runs before the editor compacts the context window, so AIC can re-compile and keep context relevant in long sessions.                                            |

---

## One task, one session

**Why:** Dedicate each chat session to a single, focused task. Mixing concerns — "fix the auth bug, then refactor the database layer" — splits the model's attention across unrelated code and fills the context window with files from both tasks. Neither task gets the model's full focus. LLMs show degraded accuracy when context contains irrelevant information (the "Lost in the Middle" effect — a research finding that models pay less attention to the middle of long context). When you finish a task or need to switch topics, start a new session. A new session gives the model a clean context window — no stale variable names, no outdated file contents, no prior reasoning that might conflict with the new task.

**How AIC helps:** Each new session triggers a fresh AIC compilation. The compiled context is precisely targeted to the current task — all selected files score high for one task, not medium for two. Starting fresh also means AIC re-evaluates your codebase's current state, picking up any changes from the previous session.

---

## Be specific with your intent

**Why:** The more specific your intent, the better the model understands what you need. Vague prompts like "fix the bug" give the model nothing to anchor on — it must guess which files matter. Specific prompts like "fix the authentication timeout in src/auth/middleware.ts" or "add null checks to parseRequest in src/server.ts" let it focus immediately, reducing the need for exploratory file reads that consume tokens.

**How AIC helps:** AIC uses your intent to classify the task and select which files to include. A specific intent produces higher-confidence classification and better file scoring — the model sees the right code from the start instead of a broad, unfocused selection.

---

## Keep sessions short

**Why:** Long conversations accumulate noise. The model's context window fills with previous messages, tool outputs, and intermediate results. When the context window reaches capacity, the editor compacts (summarizes) earlier content, and the model loses details from the beginning of the conversation — including AIC's compiled context. Short sessions avoid this compaction loss entirely.

**How AIC helps:** In a short session, AIC's initial compiled context remains prominent in the context window throughout. Once that context is built, editors that support it (e.g. Claude Code via the `PreCompact` hook) can re-compile before compaction, preserving context quality even in longer sessions; behavior varies by editor. AIC's token reduction also means the context window fills less often, so the editor triggers compaction less frequently — and in some editors, compaction is a slow, resource-heavy process that can cause lag.

---

## Don't switch models mid-chat

**Why:** When you change the AI model in the middle of a conversation (e.g., switching from Claude to GPT-4o), the editor treats it as the same session. Session-start hooks don't re-fire, so the new model misses the compiled context and architectural instructions that were injected at the beginning. The new model may also lack the tool-use patterns needed to call `aic_compile` on its own, effectively operating without any compiled context for the rest of the conversation.

**How AIC helps:** Start a new chat after switching models so that session-start hooks run again. That triggers a fresh compilation, injects context into the new model's system prompt, and the tool gate enforces compilation before any other tool use. The new model gets the same curated context the previous one had.

---

## Review before accepting

**Why:** AI hallucinations happen even with good context. The model might generate plausible-looking code that references APIs that don't exist, uses wrong method signatures, or subtly breaks edge cases. Better context reduces the frequency of hallucinations but cannot eliminate them — the model is still probabilistic.

**How AIC helps:** AIC reduces the hallucination surface by giving the model verified, relevant code rather than noise. Context Guard ensures no secrets leak into the model's view.

AIC doesn't eliminate the need for review — always verify generated code against your actual codebase (e.g. run tests or diff the change).

---

## See also

- [Installation & Delivery](installation.md) — how to install AIC, prerequisites, how to verify it's working (e.g. the "show aic status" prompt command), and when to use each prompt command (status, last, chat summary, projects).
- [Architecture](architecture.md) — how AIC compiles context, which editors are supported (Cursor, Claude Code, and others), and how they integrate.
