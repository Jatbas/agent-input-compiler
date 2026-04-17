# Recipe: Fix / patch (correct existing behavior)

Full detail: `../SKILL-recipes.md` lines 418–518.

## Quick Card

- **When to use:** Fix a bug, correct a broken pattern, change deployment/installation behavior, or patch incorrect logic. Task does NOT create a new component.
- **Files:** Typically zero Create rows; Modify every file containing the broken pattern plus every affected test file.
- **Template:**
  - If the fix purely changes behavior (same API, different implementation), replace Interface/Signature with a **Behavior Change** section:
    ```
    ## Behavior Change
    **Before (broken):** <input> → <wrong output>
    **After (fixed):** <input> → <correct output>
    ```
  - Architecture Notes MUST include: root cause with `file:line`, why this approach over alternatives, blast-radius summary.
- **Mandatory exploration additions:**
  1. **Root cause identification** with citations.
  2. **Pattern exhaustiveness scan** — grep the ENTIRE codebase for the broken pattern; list every instance; classify each as same-cause / different-issue / already-correct. The fix MUST cover every same-cause instance.
  3. **Test impact analysis** — grep all test files that reference each modified file; recompute expected values; rename functions/tests encoding stale counts.
  4. **Fix verification test** — at least one assertion that FAILS on the broken code and PASSES after the fix.
  5. **Idempotency check** for deployment/installation fixes.
- **Steps ordering:** (1) fix the code, (2) update affected tests, (3) add fix-verification test, (4) final verification.
- **Acceptance criteria — HARD:** Must include "Fix-verification test passes (test that would fail without the fix)." Must NOT say "existing tests pass" without also including test-update steps for every identified affected test.

## Mechanical checks (elevated)

U (Acceptance criteria achievability) — CRITICAL. V (Existing test compatibility) — CRITICAL. A (Ambiguity), F (Files — no Create without justification), G (Self-contained — no "see issue #123"), N (Consumer completeness), S (Code block API extraction).

## Common subagent failure modes

- Narrow scope (fixes 2 of 8 affected files) — countered by pattern-exhaustiveness scan.
- Self-contradicting acceptance criteria ("tests pass" while fix breaks tests) — countered by check U.
- Missing test updates — countered by items 15 + 15b + check V.
- No fix verification — countered by fix exploration item 4.
- Magic-number blindness — countered by item 15b.
- Forward-effect blindness — countered by A.4 forward effect simulation.
