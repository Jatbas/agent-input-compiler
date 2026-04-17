# Rubric — 001-change-spec

Verify the documentation-writer produced a valid Change Specification.

## HARD checks

<!-- hard-checks -->

```bash
grep -q "^# Change Specification" "$OUTPUT"
grep -qE "^## Change 1" "$OUTPUT"
grep -qE "\*\*Current.*:\*\*" "$OUTPUT"
grep -qE "\*\*Required.*:\*\*" "$OUTPUT"
grep -qE "\*\*Rationale:\*\*" "$OUTPUT"
grep -qE "\*\*Evidence:\*\*" "$OUTPUT"
grep -q "^## Mechanical gates" "$OUTPUT"
bash .claude/skills/shared/scripts/ambiguity-scan.sh "$OUTPUT"
! grep -iE "\b(might|probably|likely|seems to|appears to)\b" "$OUTPUT"
```

## SOFT checks

<!-- soft-checks -->

```bash
diff -q "$EXPECTED" "$OUTPUT" || true
```
