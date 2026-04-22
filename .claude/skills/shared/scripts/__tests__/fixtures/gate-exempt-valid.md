# Task FIX-004: Gate-exempt valid

Status: fixture — BRAND-01 trigger fires but valid exemption declared; gate must pass.

## Goal

Extend the Percentage type docstring example.

## Files

| File                                  | Change | Description     |
| ------------------------------------- | ------ | --------------- |
| `shared/src/core/types/percentage.ts` | Modify | Docstring only. |

## Steps

1. Append a usage example to the Percentage type docstring. No runtime behavior changes.

## Architecture Notes

- **Gate-exempt:** BRAND-01: docstring-reference — the Percentage declaration is unchanged; only its // comment gains an example.
