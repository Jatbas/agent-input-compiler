#!/usr/bin/env bash
set -euo pipefail

# evidence-scan.sh — verify every finding in a synthesis document has a citation.
# Usage: evidence-scan.sh <document-path>
# A "finding" is any bullet under headings "## Findings", "## Confirmed findings",
# "### Findings", "### Confirmed findings", "## Critical", "## Important",
# "## Minor", "## Nit", or any Phase BUGS table row. Each finding must cite at least one of:
#   - file:line (e.g. shared/src/foo.ts:42)
#   - URL (http:// or https://)
#   - explicit "Evidence: [...]" tag
# Exit codes: 0 = all findings cited, 1 = uncited findings found, 2 = usage error.

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <document-path>" >&2
  exit 2
fi

FILE="$1"
[[ -f "$FILE" ]] || { echo "error: not found: $FILE" >&2; exit 2; }

UNCITED=$(awk '
  /^## (Findings|Confirmed findings|Critical|Important|Minor|Nit)/    { in_find = 1; next }
  /^### (Findings|Confirmed findings|Critical|Important|Minor|Nit)/   { in_find = 1; next }
  /^## Phase BUGS/ { in_bugs = 1; next }
  /^## / && !/^## (Findings|Confirmed findings|Critical|Important|Minor|Nit)/ { in_find = 0; in_bugs = 0 }
  in_find && /^- / {
    if ($0 ~ /[a-zA-Z0-9_.\/-]+:[0-9]+/) next
    if ($0 ~ /https?:\/\//) next
    if ($0 ~ /Evidence:/) next
    printf "%d: %s\n", NR, $0
  }
  in_bugs && /^\| BUGS-[0-9]/ {
    if ($0 ~ /[a-zA-Z0-9_.\/-]+:[0-9]+/) next
    printf "%d: %s\n", NR, $0
  }
' "$FILE")

if [[ -n "$UNCITED" ]]; then
  echo "findings without citations (need file:line, URL, or Evidence: tag):"
  echo "$UNCITED"
  exit 1
fi

echo "evidence-scan: ${FILE} all findings cited"
exit 0
