#!/usr/bin/env bash
set -euo pipefail

# checkpoint-log.sh — append a single JSON line to .aic/skill-log.jsonl.
# Lets a skill record "I finished phase X and produced artifact Y" in a
# machine-readable log. The agent can re-read the log to recover state after
# a pause, and operators can measure which skills actually complete.
#
# Usage: checkpoint-log.sh <skill> <phase> <artifact> [status]
#   skill    — skill name, e.g. aic-task-planner
#   phase    — phase name, e.g. A.2 or phase-3-investigate
#   artifact — path or short description of what was produced
#   status   — optional (default: complete). Allowed: complete, blocked, skipped.
# Exit codes: 0 = logged, 2 = usage error.

if [[ $# -lt 3 || $# -gt 4 ]]; then
  echo "Usage: $0 <skill> <phase> <artifact> [status]" >&2
  exit 2
fi

SKILL="$1"
PHASE="$2"
ARTIFACT="$3"
STATUS="${4:-complete}"

mkdir -p .aic
TS=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)

# Escape double quotes in artifact for JSON safety.
ART=$(printf '%s' "$ARTIFACT" | sed 's/\\/\\\\/g; s/"/\\"/g')

printf '{"ts":"%s","skill":"%s","phase":"%s","artifact":"%s","status":"%s"}\n' \
  "$TS" "$SKILL" "$PHASE" "$ART" "$STATUS" >> .aic/skill-log.jsonl

echo "logged: ${SKILL} ${PHASE} ${STATUS}"
exit 0
