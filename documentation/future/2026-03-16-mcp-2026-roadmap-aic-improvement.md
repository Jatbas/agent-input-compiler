# Research: MCP 2026 Roadmap — Can It Improve AIC?

> **Status:** Complete
> **Date:** 2026-03-16
> **Question:** Which MCP 2026 roadmap priorities are applicable to AIC's architecture and roadmap, and what concrete improvements or alignment opportunities do they create?
> **Classification:** technology evaluation
> **Confidence:** Medium — roadmap is external and date-free for most items; AIC fit is well evidenced
> **Explorers:** 3 | **Critic:** yes

## Executive Summary

**Yes, the MCP 2026 roadmap can improve AIC, but in targeted ways.** Transport evolution and Server Cards matter mainly when AIC adds HTTP (Phase 2+); today's stdio-only, single-process design is unaffected. Enterprise readiness aligns with AIC's Phase 2–3 plans — AIC already has tool invocation logging in MVP; full audit (principal, outcome, retention) and auth/gateway are Phase 2–3. Adopt Server Card **metadata** and stdio-friendly discovery (e.g. in `initialize` or a well-known file) without adding HTTP; track transport/session SEPs and the MCP Enterprise WG for future alignment. MCP Tasks do not apply today; revisit if AIC adds multi-step agentic workflows that need task lifecycle (retry, expiry).

## Findings

### Finding 1: AIC uses stdio only, single process; transport evolution is low relevance for MVP

**Evidence:** `mcp/src/server.ts:62-63` (StdioServerTransport), `mcp/src/server.ts:567-577` (single `server.connect(transport)`); `documentation/project-plan.md` lines 663, 669 ("single-threaded Node.js process" on 663, "Request serialisation: At most one compilation at a time" on 669); `documentation/project-plan.md:2442` ("stdio only — local IPC" | "Phase 2+: if HTTP transport added, require mutual TLS or token auth").

**Confidence:** High  
**Adversarial status:** Challenged — incorporated: Transport/session evolution could still matter for multi-stdio instances or editor-managed restarts (session resumption) even without HTTP; relevance is "low for MVP" and "track for Phase 2+ and for session/resumption SEPs."

AIC does not horizontally scale today; scaling is many one-per-device instances with a sync layer (project-plan §19, §23). Transport evolution becomes directly relevant if Phase 2+ adds HTTP.

### Finding 2: AIC does not use MCP Tasks; agent communication (Tasks lifecycle) does not apply today

**Evidence:** No `tasks/list`, `tasks/run`, or MCP Tasks API in repo (grep). `mcp/src/server.ts:377-456` registers tools (aic_compile, aic_inspect, aic_projects, aic_status, aic_last, aic_chat_summary); `mcp/src/handlers/compile-handler.ts` runs compilation with `Promise.race([runner.run(request), rejectAfter(30_000)])` and returns a single `CallToolResult` — no task token or polling. `documentation/implementation-spec.md:141` — handler "executes Steps 1–10 … and returns."

**Confidence:** High  
**Adversarial status:** Unchallenged

All tools are request/response. Revisit MCP Tasks if AIC adds multi-step agentic workflows (project-plan §2.7) that need task lifecycle (retry, expiry).

### Finding 3: Server Card metadata can improve AIC; .well-known requires HTTP

**Evidence:** No `.well-known` or Server Card in repo (grep). MCP roadmap: Server Cards are "structured metadata via a `.well-known` URL" (https://modelcontextprotocol.io/development/roadmap); transport blog: "`/.well-known/mcp.json` endpoint" (https://blog.modelcontextprotocol.io/posts/2025-12-19-mcp-transport-future/). Server construction is in `mcp/src/server.ts`; `shared/` has no transport or discovery code.

**Confidence:** Medium  
**Adversarial status:** Challenged — incorporated: True ".well-known" discovery is HTTP. On stdio, AIC can adopt Server Card **metadata** only: (1) return card-like payload in MCP `initialize` response, and/or (2) write a well-known file (e.g. `.aic/server-card.json`) for tools/registries. That can be added in `mcp/` without changing `shared/`. Full .well-known discovery would require HTTP or a separate discovery endpoint.

### Finding 4: Enterprise readiness aligns with Phase 2–3; MVP has invocation logging, not full audit

**Evidence:** `documentation/project-plan.md:91` (RBAC "Phase 2–3"); `documentation/project-plan.md:2307-2313` (Phase 2 semantic + governance); `documentation/project-plan.md:2926`, 3189 (Phase 3 control plane, RBAC, SSO, audit, fleet). `shared/src/storage/migrations/001-consolidated-schema.ts` — `tool_invocation_log` stores `id`, `created_at`, `tool_name`, `session_id`, `params_shape`, `project_id`; no principal, client identity, or response/outcome. `documentation/security.md` — "tool_invocation_log provides audit trail" for invocation logging; formal audit (SOC 2, etc.) in Phase 2–3.

**Confidence:** High  
**Adversarial status:** Challenged — incorporated: Current log is **tool invocation logging** (what, when, session, project, param shapes), not full **enterprise audit** (who, from where, outcome, retention). It is a building block; full audit and enterprise auth/gateway align with MCP enterprise work when that WG exists.

### Finding 5: Official MCP roadmap — transport/Server Cards have tentative timeline; Enterprise WG not yet formed

**Evidence:** https://modelcontextprotocol.io/development/roadmap (updated 2026-03-05); https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/; https://blog.modelcontextprotocol.io/posts/2025-12-19-mcp-transport-future/ — "finalize the required SEPs in the first quarter of 2026 … next specification release tentatively slated for June of 2026." Roadmap: "Enterprise WG does not yet exist"; "We want the people experiencing these challenges to help us define the work." Agent communication (Tasks lifecycle): "Agents WG should close" gaps; no target date.

**Confidence:** Medium  
**Adversarial status:** Challenged — incorporated: Finding depends on external sources (linked above). Dates are tentative; roadmap is priority-based, not commitment-based. Enterprise is explicitly the least defined priority.

### Finding 6: Security and triggers are "on the horizon," not top-four priorities

**Evidence:** https://modelcontextprotocol.io/development/roadmap — "On the Horizon": triggers and event-driven updates, result type improvements, security and authorization (SEP-1932 DPoP, SEP-1933 Workload Identity Federation), extensions. Blog: "We'll happily support a community-formed WG and review SEPs as time permits."

**Confidence:** Medium  
**Adversarial status:** Unchallenged

Useful for AIC when Phase 2+ adds HTTP (security/authorization) or event-driven flows; not blocking for current roadmap.

## Analysis

The four MCP 2026 priorities map cleanly to AIC's lifecycle. **Transport evolution** targets stateful sessions and horizontal scaling — AIC's MVP is single-process stdio by design, so this improves AIC only when we add HTTP or care about session resumption across restarts/multi-stdio. **Agent communication (Tasks)** does not apply: AIC tools are synchronous request/response; no code uses MCP Tasks. **Governance maturation** (SEP review, working groups) helps the ecosystem; AIC benefits indirectly as a consumer. **Enterprise readiness** (audit, auth, gateway, config portability) matches AIC's Phase 2–3 (RBAC, SSO, audit, fleet); AIC's existing `tool_invocation_log` is a foundation, not full enterprise audit — principal, outcome, and retention are Phase 2–3.

The critic correctly tightened two claims: (1) ".well-known" implies HTTP; on stdio, only Server Card **metadata** and stdio-friendly discovery (initialize or file) are applicable. (2) "Audit" in enterprise terms is more than invocation logging; we now distinguish tool invocation logging (MVP) from full audit (Phase 2–3). Tracking transport/session SEPs and the Enterprise WG, and optionally adopting Server Card metadata without HTTP, gives AIC concrete levers without overcommitting.

**Strategic implications.** MCP's move toward stateless transport with cookie-like session mechanisms (from the transport blog) could influence AIC's Phase 1 session tracking design — aligning early avoids rework. The Governance Maturation priority (contributor ladder, WG delegation) is directly relevant to AIC's Phase 1 OSS release — AIC could position itself to contribute requirements to the Enterprise WG from day one, shaping the spec rather than reacting to it. MCP's "Alternatives" dimension (comparing competing protocols) was not applicable to this research, which assessed roadmap fit rather than protocol comparison.

## Recommendations

1. **Track transport and session SEPs** — Follow MCP transport evolution (stateless, session resumption/migration) for Phase 2+ HTTP and for any multi-stdio or editor-restart scenarios. No code change now.

2. **Adopt Server Card metadata on stdio** — When the Server Card format is stable, expose the same metadata via (a) MCP `initialize` response and/or (b) a well-known file (e.g. `.aic/server-card.json`) so registries and tools can discover AIC without connecting. Add only in `mcp/`; no `shared/` change. Track .well-known URL discovery only if/when HTTP transport is in scope.

3. **Align enterprise work with MCP Enterprise WG** — When an MCP Enterprise WG forms, contribute requirements (audit semantics, gateway patterns, config portability) and align Phase 2–3 auth/audit/gateway with MCP extensions or spec. Keep `tool_invocation_log` as the invocation-logging foundation; extend for principal, outcome, and retention in Phase 2–3.

4. **Revisit MCP Tasks only if agentic multi-step is added** — If AIC adds multi-step agentic workflows (project-plan §2.7) that need long-running or async tool semantics, evaluate MCP Tasks for retry and expiry. No action today.

5. **Document roadmap dependency** — Add a short note or link in `documentation/future/` to the official MCP roadmap and blog posts (dates, WGs) so the project can refresh alignment as the roadmap evolves.

## Open Questions

- Whether MCP security/authorization SEPs (e.g. SEP-1932, SEP-1933) will define patterns that AIC should adopt when adding HTTP transport (Phase 2+).
- Whether editors will support Server Card metadata via `initialize` or file-based discovery before .well-known HTTP is available; if not, value of adding metadata early is limited to future registries.

## Sources

- `mcp/src/server.ts` — transport, tool registration, single process
- `mcp/src/handlers/compile-handler.ts` — synchronous tool response, no Tasks
- `documentation/project-plan.md` — MCP server, Phase 2–3, concurrency, enterprise, non-goals
- `documentation/implementation-spec.md` — MCP tools, Phase 2–3 enterprise
- `documentation/security.md` — MCP Server Top 10, transport, audit
- `shared/src/storage/migrations/001-consolidated-schema.ts` — tool_invocation_log schema
- https://thenewstack.io/model-context-protocol-roadmap-2026/ — article summarising roadmap
- https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/ — official 2026 roadmap blog
- https://modelcontextprotocol.io/development/roadmap — official roadmap (2026-03-05)
- https://blog.modelcontextprotocol.io/posts/2025-12-19-mcp-transport-future/ — transport SEP timeline (Q1 2026, June 2026 tentative)

## Roadmap Mapping

| #   | Recommendation                          | Phase   | Category        | Candidate `mvp-progress.md` entry                                                          | Immediate?                           |
| --- | --------------------------------------- | ------- | --------------- | ------------------------------------------------------------------------------------------ | ------------------------------------ |
| 1   | Track transport and session SEPs        | 2+      | MCP / Transport | Track MCP transport and session SEPs for Phase 2+ HTTP and session resumption              | No — tracking only                   |
| 2   | Adopt Server Card metadata on stdio     | 1 or 2  | MCP Server      | Expose Server Card metadata via initialize and/or .aic/server-card.json when format stable | No — depends on MCP format stability |
| 3   | Align enterprise with MCP Enterprise WG | 2–3     | Enterprise      | When MCP Enterprise WG forms, contribute requirements and align auth/audit/gateway         | No — depends on WG formation         |
| 4   | Revisit MCP Tasks if agentic multi-step | 2+      | MCP / Agentic   | Revisit MCP Tasks if AIC adds multi-step agentic workflows (retry, expiry)                 | No — tracking only                   |
| 5   | Document roadmap dependency             | Current | Documentation   | Add note/link in documentation/future/ to official MCP roadmap and blog posts              | Yes — plannable now                  |

> **To add these to the roadmap:** tell me which rows to add to `mvp-progress.md` and I'll write them.
