# Diagnostic CLI output format

## When to update this document

Update this document when:

- You add or remove a row in any of the five diagnostic commands (`status`, `last`, `chat-summary`, `quality`, `projects`).
- You change a label width (`w=` constant) in any of the five format functions.
- You add a new diagnostic command and expose it via the CLI.
- You change the session-time scope for any command — which sessions are counted, the cap, or the underlying store method.
- You change the behavior of `padRow`, `padMultiCol`, or `renderStandardReport` in `mcp/src/format-diagnostic-output.ts`.
- You change the `SEP` constant or the frame structure (title → SEP → hero → SEP → body → SEP → footnote).
- You add, remove, or restructure a sub-section (header row + indented sub-rows) in any command.
- You change which duration formatter applies to which row (`formatElapsedDurationMs` vs `formatCompileDurationMs`).

## Scope

This document describes the layout and design patterns for the diagnostic CLI output produced by `mcp/src/format-diagnostic-output.ts`. It covers the shared render frame, the two row-building primitives, label widths per command, the sub-section pattern, section separators, the per-command body structure for all five commands, session-time scope differences, and duration formatting.

Tool contracts and payload fields live in [implementation-spec.md — Diagnostic stdout layout](../implementation-spec.md#diagnostic-stdout-layout-cli-and-prompt-commands).

Source of truth: [`mcp/src/format-diagnostic-output.ts`](../../mcp/src/format-diagnostic-output.ts).

## Shared render frame

All five commands use `renderStandardReport`, which assembles lines in this order:

```
title
SEP
hero (one or more lines)
SEP
...body rows (may contain embedded SEP lines between logical groups)
[SEP]         ← omitted when footnote is absent
[footnote]    ← omitted when footnote is absent
```

`SEP` is a fixed 78-character rule:

```
──────────────────────────────────────────────────────────────────────────────
```

The `projects` command passes no `footnote`, so its output ends after the body rows with no trailing `SEP` or footnote line.

## Row-building primitives

### `padRow(label, value, w)`

Single-value row. Label is left-aligned and padded to `w` characters; value follows two spaces after.

```
label.padEnd(w, " ") + "  " + value
```

Example with `w=30`: `"Session time                    3h 12m"`

### `padMultiCol(label, values, w, valueWidths)`

Multi-column row. Label is left-aligned and padded to `w`; columns follow two spaces after the label. Each column value is right-aligned (padStart) to its entry in `valueWidths`; consecutive columns are separated by a single space.

```
label.padEnd(w, " ") + "  " + values[0].padStart(valueWidths[0]) + " " + values[1].padStart(valueWidths[1]) + ...
```

Example with `w=30`, `valueWidths=[5,6]`: `"Top request types               count  share"`

## Label widths

| Command        | Width        | Note                                                                       |
| -------------- | ------------ | -------------------------------------------------------------------------- |
| `status`       | `w=32`       | All `padRow` and `padMultiCol` calls in `formatStatusTable`                |
| `last`         | `w=30`       | All rows in `formatLastTable` and `LAST_EMPTY_DETAIL`                      |
| `chat-summary` | `w=30`       | All rows in `formatChatSummaryTable`                                       |
| `quality`      | `w=30`       | All rows in `formatQualityReportLines`                                     |
| `projects`     | fixed roster | Column widths: ID=38, path=32, last-seen=14, compilations=12, gap=2 spaces |

The `projects` roster does not use `padRow` or `padMultiCol` when projects are present; it builds each line by padding cells to the fixed roster column widths. When the project list is empty, it falls back to four `padRow` rows at `w=30`.

## Sub-section pattern

A sub-section is a header row followed by indented data rows. The header uses `padRow` or `padMultiCol` with the column label(s) on the same line as the section label. Each data row uses the same primitive with `"  " + value` as its label (two-space indent), at the same `w`.

```
padMultiCol("Guard scans (lifetime)", ["count"], w, [10])  ← header when no status time window
padMultiCol("Guard scans (7d)",       ["count"], w, [10])  ← example when window active — N matches CLI `Nd` / `--window`
padMultiCol("  command-injection",    [count],   w, [10])  ← sub-row
padMultiCol("  secret",               [count],   w, [10])  ← sub-row
```

No SEP line separates the header row from its sub-rows, or one sub-section from the next adjacent sub-section.

Sub-sections in the current commands:

| Command        | Sub-section label | Column header(s)       | Indent                                                  |
| -------------- | ----------------- | ---------------------- | ------------------------------------------------------- |
| `status`       | Guard scans       | `count`                | `"  "` + guard type                                     |
| `status`       | Top request types | `count  share`         | `"  "` + task class                                     |
| `quality`      | Tier mix          | `share`                | `"  "` + tier name (`full`, `sig+doc`, `sigs`, `names`) |
| `quality`      | Task class mix    | `count  share  budget` | `"  "` + task class                                     |
| `chat-summary` | Top request types | `count  share`         | `"  "` + task class                                     |

## Section separators

`SEP` lines appear in the body at logical group boundaries within a command. They do not appear between a sub-section header and its data rows, nor between two adjacent sub-sections.

The frame adds one `SEP` after the title, one after the hero, and (when a footnote is present) one before the footnote. Body-level `SEP` lines are additional separators embedded in the `rows` array.

## Per-command body structure

The structure below lists body rows in order. `SEP` denotes a body-level separator; `[optional]` marks rows that are conditionally present.

### `status` (w=32, footnote present)

```
[Time range]                         ← only when --window / time range flag is passed
Context builds (total)
Context builds (today, UTC)
Cumulative raw → sent tokens
Tokens excluded
SEP
Context window used (last run)
Cache hit rate
Context precision (weighted)
SEP
Guard scans (…)                      ← sub-section header; sub-rows: one per guard type
Top request types                    ← sub-section header; sub-rows: one per task class
Sessions total time
Last compilation
SEP
Installation (global MCP server)
[Notes]                              ← only when installationOk === false and notes is non-empty
```

### `last` (w=30, footnote present)

```
Context builds
Intent
Files
Tokens compiled
Compiled in
Context window used
Compiled
Editor
Session time
Cache
[Guard (this run)]                   ← only when guard data is present in the compilation
[Top files]                          ← only when a selection trace is available
[Excluded by]                        ← only when a selection trace is available
Compiled prompt
```

No body-level `SEP` lines in `last`.

### `chat-summary` (w=30, footnote present)

```
Project path
Context builds
Cumulative raw → sent tokens
Tokens excluded
SEP
Cache hit rate
Context precision (weighted)
SEP
Last compilation
Session time
Top request types                    ← sub-section header; sub-rows: one per task class
```

### `quality` (w=30, footnote present)

Empty-window variant (zero compilations):

```
Time range
Compilations
```

Normal variant (compilations > 0):

```
Time range
Compilations
SEP
Median context precision
Median selection ratio
Median budget used
Cache hit rate
Tier mix                             ← sub-section header; sub-rows: full, sig+doc, sigs, names
Task class mix                       ← sub-section header; sub-rows: one per TASK_CLASS value
[Classifier mean]                    ← only when classifier confidence data is available
[Daily compilations]                 ← sparkline row; only when window data is present
[weekday abbreviation row]           ← blank-label row; only when sparkline is present
```

No `SEP` between the Tier mix group and the Task class mix group — they are adjacent.

### `projects` (fixed roster, no footnote)

When the project list is empty, four `padRow` rows at `w=30`:

```
Project ID
Path
Last seen
Compilations
```

When projects are present, one fixed-column header row followed by one roster row per project:

```
Project ID  Path  Last seen  Compilations   ← header, columns at fixed widths
<id>        <path>  <relative time>  <n>    ← one row per project
```

No body-level `SEP` lines. No trailing `SEP` or footnote.

## Session time scope

Three commands expose a session-time row. They measure different things:

| Command        | Label                 | Scope                                                                      | Source                                                                                      | Cap                                                                            |
| -------------- | --------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `status`       | `Sessions total time` | Sum over project `session_state` rows of per-session elapsed time          | `StatusAggregates.sessionTimeMs` from `SqliteStatusStore` (`SUM` of capped per-row elapsed) | 4 h per session before sum (`SESSION_TIME_CAP_MS` in `sqlite-status-store.ts`) |
| `last`         | `Session time`        | Active session elapsed time for the session of the most recent compilation | `getSessionElapsedMsForId(activeConversationId)`                                            | 4 h (`SESSION_TIME_CAP_MS`)                                                    |
| `chat-summary` | `Session time`        | Active session elapsed time for the current conversation                   | `getSessionElapsedMsForId(activeConversationId)`                                            | 4 h (`SESSION_TIME_CAP_MS`)                                                    |

`getSessionElapsedMsForId` uses `last_activity_at` for closed sessions and `clock.now()` for the active session, then clamps to the cap.

## Duration formatting

Two formatters in `mcp/src/format-diagnostic-output.ts` handle durations. They are not interchangeable:

| Formatter                     | Produces                                                       | Used for                              |
| ----------------------------- | -------------------------------------------------------------- | ------------------------------------- |
| `formatElapsedDurationMs(ms)` | `Xh Ym` when hours ≥ 1; `Xm Ys` when hours = 0; `—` when null  | Session time rows across all commands |
| `formatCompileDurationMs(ms)` | `X ms` when < 1 000 ms; `X.Y s` when ≥ 1 000 ms; `—` when null | `Compiled in` row in `last` only      |

`formatElapsedDurationMs` clamps negative values to 0 before formatting.

## Related documentation

- [MCP server and shared CJS boundary](mcp-and-shared-cjs-boundary.md)
