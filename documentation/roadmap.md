# Roadmap

## What shipped in v0.9.1

- Enforce SQLite foreign keys when opening the global database and register the homedir scope in the projects catalog so project-scoped rows stay consistent with schema constraints.
- Forward the configured AIC config path into the MCP compilation runner so custom `aic.config.json` locations are honored.

## What's next

- Close out the remaining public-documentation audit items on the OSS release preparation track.
- Optional README visual demo when there is bandwidth (not blocking releases).
- Target a stable 1.0.0 once a short 0.9.x stabilization window confirms installs, hooks, and diagnostics in the wild.

## Future direction

- Richer context selection (for example semantic retrieval and governance tooling) remains on the long-term architecture path described in the project plan, with incremental compilation and performance work layered in as design matures.
