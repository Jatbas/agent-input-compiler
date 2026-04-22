# CV-LABEL-01: unit mismatch in hero-line fragment

Status: critic-validation — Check 1 (LABEL-01) should emit HARD because the second fragment ends with `%` but its formula column produces a count, not a ratio.

## Goal

Append an excluded-files clause to the aic last hero line.

## Files

| File                                  | Change | Description    |
| ------------------------------------- | ------ | -------------- |
| `mcp/src/format-diagnostic-output.ts` | Modify | Append clause. |

## Steps

1. Change the hero-line template to `"%d of %d files forwarded (%d%% excluded)"`.

## Architecture Notes

- **Label-formula alignment:**

  | label-fragment               | formula                     | denominator | unit  |
  | ---------------------------- | --------------------------- | ----------- | ----- |
  | `"%d of %d files forwarded"` | filesForwarded / filesTotal | filesTotal  | ratio |
  | `"%d%% excluded"`            | filesExcluded               | —           | count |
