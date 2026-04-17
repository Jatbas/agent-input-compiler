# Rubric — 001-framing-soundness

Verify the researcher produced a synthesis with explicit framing, citations, disconfirmation, and leverage-ordered recommendations.

## HARD checks

<!-- hard-checks -->

```bash
grep -qE "^\*\*Framing verdict:\*\*" "$OUTPUT"
grep -qE "(sound|mis-framed|partially-framed)" "$OUTPUT"
grep -q "^## Findings" "$OUTPUT"
grep -q "^## Disconfirmation" "$OUTPUT"
grep -q "^## Recommendations" "$OUTPUT"
grep -q "^## Gaps" "$OUTPUT"
bash .claude/skills/shared/scripts/evidence-scan.sh "$OUTPUT"
bash .claude/skills/shared/scripts/ambiguity-scan.sh "$OUTPUT"
! grep -iE "\b(might|probably|likely|seems to|appears to)\b" "$OUTPUT"
```

## SOFT checks

<!-- soft-checks -->

```bash
diff -q "$EXPECTED" "$OUTPUT" || true
```
