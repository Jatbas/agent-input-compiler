#!/usr/bin/env bash
# Ensure Node 24 is active on PATH before running toolchain commands.
#
# Why: package.json pins engines.node=24.x, .npmrc has engine-strict=true,
# and better-sqlite3's prebuilt binary is ABI-pinned to the Node major. Cursor
# ships a bundled Node 22 at /Applications/Cursor.app/.../helpers which wins
# over the user's login shell PATH, so `pnpm install` aborts with
# ERR_PNPM_UNSUPPORTED_ENGINE inside skills without this shim.
#
# Usage (source, do not execute — PATH changes must persist):
#   source .claude/skills/shared/scripts/ensure-node24.sh

_aic_ensure_node24() {
  if command -v node >/dev/null 2>&1; then
    case "$(node -v 2>/dev/null)" in
      v24.*) return 0 ;;
    esac
  fi

  local dir
  for dir in /opt/homebrew/opt/node@24/bin /usr/local/opt/node@24/bin; do
    if [ -x "$dir/node" ]; then
      case "$("$dir/node" -v 2>/dev/null)" in
        v24.*)
          export PATH="$dir:$PATH"
          return 0
          ;;
      esac
    fi
  done

  if command -v nvm >/dev/null 2>&1; then
    nvm use 24 >/dev/null 2>&1 && case "$(node -v 2>/dev/null)" in
      v24.*) return 0 ;;
    esac
  fi

  echo "ensure-node24: Node 24 required but not found." >&2
  echo "               Current: $(command -v node >/dev/null 2>&1 && node -v || echo 'none')" >&2
  echo "               Install: brew install node@24  (or: nvm install 24)" >&2
  return 1
}

_aic_ensure_node24 || return 1 2>/dev/null || exit 1
