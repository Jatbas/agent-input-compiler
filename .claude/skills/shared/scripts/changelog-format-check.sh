#!/usr/bin/env bash
set -euo pipefail

# changelog-format-check.sh — verify CHANGELOG.md structure and entry quality.
# Usage: changelog-format-check.sh [<path-to-CHANGELOG.md>]
# Default path: CHANGELOG.md in current working directory.
# Exit codes: 0 = clean, 1 = issues, 2 = usage error.

FILE="${1:-CHANGELOG.md}"
[[ -f "$FILE" ]] || { echo "error: not found: $FILE" >&2; exit 2; }

ISSUES=0

# 1. [Unreleased] exists
if ! grep -qE "^## \[Unreleased\]" "$FILE"; then
  echo "missing [Unreleased] section"
  ISSUES=$((ISSUES + 1))
fi

# 2. No placeholder/future versions
HITS=$(grep -nE "^## \[[0-9]+\.[0-9]+\.[0-9]+\] - YYYY-MM-DD" "$FILE" || true)
if [[ -n "$HITS" ]]; then
  echo "placeholder-date release section(s):"
  echo "$HITS"
  ISSUES=$((ISSUES + 1))
fi

# 3. Allowed ### headings only (Added, Changed, Deprecated, Removed, Fixed, Security)
BAD=$(grep -nE "^### " "$FILE" |
  grep -vE "^[0-9]+:### (Added|Changed|Deprecated|Removed|Fixed|Security)\b" || true)
if [[ -n "$BAD" ]]; then
  echo "unexpected ### headings:"
  echo "$BAD"
  ISSUES=$((ISSUES + 1))
fi

# 4. No empty category under [Unreleased]: category heading followed directly by another heading
EMPTY=$(awk '
  /^## \[/ { in_release = /Unreleased/ ? 1 : 0; next }
  in_release && /^### / {
    last_cat = $0; last_line = NR; has_bullet = 0; next
  }
  in_release && /^- / { has_bullet = 1; next }
  in_release && (/^## / || /^### /) && last_cat != "" && has_bullet == 0 {
    printf "%d: empty category %s\n", last_line, last_cat
    last_cat = ""
  }
' "$FILE")
if [[ -n "$EMPTY" ]]; then
  echo "empty category headings in [Unreleased]:"
  echo "$EMPTY"
  ISSUES=$((ISSUES + 1))
fi

# 5. Banned hedging / prose patterns in bullets (subset of ambiguity-scan focused on changelog register)
BAN=$(grep -nE "^- .*\b(might|possibly|potentially|perhaps|e\.g\.|for example|such as|something like|or similar|etc\.|and so on|consider|you could|you might|appropriate|suitable|reasonable)\b" "$FILE" | grep -viE "\bmay fail\b|\bmay be expired\b" || true)
if [[ -n "$BAN" ]]; then
  echo "hedging language in bullets:"
  echo "$BAN"
  ISSUES=$((ISSUES + 1))
fi

# 6. Temporal references
TEMP=$(grep -nE "^- .*\b(recently added|just added|new in this release|now supports|currently|still|will be available)\b" "$FILE" || true)
if [[ -n "$TEMP" ]]; then
  echo "temporal references (entries should be timeless):"
  echo "$TEMP"
  ISSUES=$((ISSUES + 1))
fi

# 7. Task IDs / phase letters
CODES=$(grep -nE "\bTask [0-9]+\b|\bPhase [A-Za-z]{1,2}\b|\b[A-Z]{1,2}[0-9]{2,3}\b" "$FILE" || true)
if [[ -n "$CODES" ]]; then
  echo "internal codes (task IDs / phase letters):"
  echo "$CODES"
  ISSUES=$((ISSUES + 1))
fi

if [[ $ISSUES -gt 0 ]]; then
  echo ""
  echo "changelog-format-check: ${ISSUES} issue group(s)"
  exit 1
fi

echo "changelog-format-check: ${FILE} clean"
exit 0
