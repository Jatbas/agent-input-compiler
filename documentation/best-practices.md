# Best Practices for AI-Assisted Coding with AIC

These are best practices for getting the most out of AI-assisted coding. AIC is designed to amplify them — when you follow these patterns, AIC ensures your AI assistant has the best possible context.

---

## One task, one session

**Why:** Dedicate each chat session to a single, focused task. Mixing concerns — "fix the auth bug, then refactor the database layer" — splits the model's attention across unrelated code and fills the context window with files from both tasks. Neither gets the model's full focus, and LLMs show degraded accuracy when context contains irrelevant information (the "Lost in the Middle" effect). When you finish a task or need to switch topics, start a new session. A new session gives the model a clean context window — no stale variable names, no outdated file contents, no prior reasoning that might conflict with the new task.

**How AIC helps:** Each new session triggers a fresh AIC compilation. The compiled context is precisely targeted to the current task — all selected files score high for one concern, not medium for two. Starting fresh also means AIC re-evaluates your codebase's current state, picking up any changes from the previous session.

---

## Be specific with your intent

**Why:** The more specific your intent, the better the model understands what you need. Vague prompts like "fix the bug" give the model nothing to anchor on — it must guess which files matter. Specific prompts like "fix the authentication timeout in src/auth/middleware.ts" let it focus immediately, reducing the need for exploratory file reads that consume tokens.

**How AIC helps:** AIC uses your intent to classify the task and select which files to include. A specific intent produces higher-confidence classification and better file scoring — the model sees the right code from the start instead of a broad, unfocused selection.

---

## Keep sessions short

**Why:** Long conversations accumulate noise. The model's context window fills with previous messages, tool outputs, and intermediate results. When the context window reaches capacity, the editor compacts (summarizes) earlier content, and the model loses details from the beginning of the conversation — including AIC's compiled context. Short sessions avoid this compaction loss entirely.

**How AIC helps:** In a short session, AIC's initial compiled context remains prominent in the context window throughout. Once built, Claude Code's integration will use the `PreCompact` hook to re-compile before compaction, preserving context quality even in longer sessions.

---

## Don't switch models mid-chat

**Why:** When you change the AI model in the middle of a conversation (e.g., switching from Claude to GPT-4o), the editor treats it as the same session. Session-start hooks don't re-fire, so the new model misses the compiled context and architectural instructions that were injected at the beginning. The new model may also lack the tool-use patterns needed to call `aic_compile` on its own, effectively operating without any compiled context for the rest of the conversation.

**How AIC helps — if you start fresh:** Starting a new chat after switching models triggers all session-start hooks again. AIC compiles fresh context, injects it into the new model's system prompt, and the tool gate enforces compilation before any other tool use. The new model gets the same curated context the previous one had.

---

## Review before accepting

**Why:** AI hallucinations happen even with good context. The model might generate plausible-looking code that references APIs that don't exist, uses wrong method signatures, or subtly breaks edge cases. Better context reduces the frequency of hallucinations but cannot eliminate them — the model is still probabilistic.

**How AIC helps:** AIC reduces the hallucination surface by giving the model verified, relevant code rather than noise. Context Guard ensures no secrets leak into the model's view. But AIC doesn't eliminate the need for review — always verify generated code against your actual codebase.
