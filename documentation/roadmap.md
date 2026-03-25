# Roadmap

## What shipped in v0.9.0

- Add rolling time windows for `aic status` aggregates and a `--project` flag on `aic status` and `aic last` so diagnostics can target a workspace root.
- Ship shell commands for status, last, chat-summary, and projects with the same payloads as the MCP tools.
- Accept `toolOutputs` on compile requests so prior tool results can feed session compression; cap the session compressor at the last ten steps.
- Extend MCP compile parameters for multi-turn sessions (conversation linkage and tool attachments).
- Install a conversation id injection hook with the Claude Code plugin; remove AIC state under the user home directory on uninstall.
- Simplify the default `aic status` table for terminals; merge MCP server entries on Claude Code install, strip them on uninstall, and preserve manual `CLAUDE.md` edits outside the managed AIC block.
- Bundle shared Cursor hook helpers (project resolution, conversation id, session markers, logs, edited-file cache, stdin reads).
- Refresh documentation and installation guides for the global database model and technical integration references; align diagnostics copy on exclusion rate terminology.
- Omit resolved editor buffer content from `aic_inspect` traces; key compile cache and session state by conversation when an id is present; honor guard allow patterns from configuration; clear the session start lock on session end in the Claude Code plugin; fix gitignore handling, install layout, and subagent model identification in integrations.
- Validate cache rows on read and sanitize cache-derived identifiers before the pipeline uses them.

## What's next

- Close out the remaining public-documentation audit items on the OSS release preparation track.
- Optional README visual demo when there is bandwidth (not blocking releases).
- Target a stable 1.0.0 once a short 0.9.x stabilization window confirms installs, hooks, and diagnostics in the wild.

## Future direction

- Richer context selection (for example semantic retrieval and governance tooling) remains on the long-term architecture path described in the project plan, with incremental compilation and performance work layered in as design matures.
