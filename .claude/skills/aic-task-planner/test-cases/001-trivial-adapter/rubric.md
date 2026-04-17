# Rubric — 001-trivial-adapter

Verify the planner produced a valid adapter-recipe task file.

## HARD checks

<!-- hard-checks -->

```bash
grep -q "^\*\*Recipe:\*\* adapter" "$OUTPUT"
grep -q "^## Goal" "$OUTPUT"
grep -q "^## Interface / Signature" "$OUTPUT"
grep -q "^## Files" "$OUTPUT"
grep -q "^## Steps" "$OUTPUT"
grep -q "^## Acceptance criteria" "$OUTPUT"
grep -q "eslint.config.mjs" "$OUTPUT"
grep -q "fast-fnv" "$OUTPUT"
grep -q "string-hasher.interface.ts" "$OUTPUT"
bash .claude/skills/shared/scripts/ambiguity-scan.sh "$OUTPUT"
bash .claude/skills/shared/scripts/validate-task.sh "$OUTPUT"
! grep -iE "\b(might|probably|likely|seems to|appears to)\b" "$OUTPUT"
! grep -iE "eslint-disable|@ts-ignore|@ts-nocheck" "$OUTPUT"
```

## SOFT checks

<!-- soft-checks -->

```bash
diff -q "$EXPECTED" "$OUTPUT" || true
wc -l "$OUTPUT"
```
