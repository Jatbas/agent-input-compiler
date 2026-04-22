# Task FIX-008: LABEL-01 trigger

Status: fixture — LABEL-01 must fire (formatter + hero-line string edit); bullet absent; gate must fail.

## Goal

Update the hero-line wording.

## Files

| File                                  | Change | Description     |
| ------------------------------------- | ------ | --------------- |
| `mcp/src/format-diagnostic-output.ts` | Modify | Hero-line copy. |

## Steps

1. Change the hero-line template to `"%d of %d files forwarded (%d%% of budget)"`.
