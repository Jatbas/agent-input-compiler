#!/usr/bin/env bash
# Ensure a Node.js major supported by AIC (>= 22) is active on PATH before
# running toolchain commands.
#
# Why: package.json/mcp/package.json/shared/package.json pin engines.node=">=22",
# .npmrc has engine-strict=true, and better-sqlite3's prebuilt binary is
# ABI-pinned to the running Node major. If the active shell's Node is < 22,
# `pnpm install` aborts with ERR_PNPM_UNSUPPORTED_ENGINE and any better-sqlite3
# load aborts at runtime.
#
# Cursor's bundled helper Node (v22.22.0) already satisfies this floor, so under
# normal Cursor shells this script is a no-op. The fallbacks exist for
# environments where only older Node is on PATH, or for mixed-agent setups
# where a second tool has pushed a different Node onto PATH.
#
# If you have multiple agents running concurrently on the same repo, keep them
# on the same Node major — better-sqlite3 rebuilds its native binary for the
# active major every time `pnpm install` runs, so cross-major agents will fight
# over that single `.node` file.
#
# Usage (source, do not execute — PATH changes must persist):
#   source .claude/skills/shared/scripts/ensure-supported-node.sh

_aic_node_major() {
  local v
  v="$("$1" -v 2>/dev/null)" || return 1
  case "$v" in
    v[0-9]*) v="${v#v}"; printf '%s\n' "${v%%.*}"; return 0 ;;
  esac
  return 1
}

_aic_ensure_supported_node() {
  local min=22
  local cur

  if command -v node >/dev/null 2>&1; then
    cur="$(_aic_node_major node 2>/dev/null)"
    if [ -n "$cur" ] && [ "$cur" -ge "$min" ] 2>/dev/null; then
      return 0
    fi
  fi

  local dir
  for dir in \
    /opt/homebrew/opt/node@22/bin \
    /opt/homebrew/opt/node@24/bin \
    /usr/local/opt/node@22/bin \
    /usr/local/opt/node@24/bin
  do
    if [ -x "$dir/node" ]; then
      cur="$(_aic_node_major "$dir/node" 2>/dev/null)"
      if [ -n "$cur" ] && [ "$cur" -ge "$min" ] 2>/dev/null; then
        export PATH="$dir:$PATH"
        return 0
      fi
    fi
  done

  if command -v nvm >/dev/null 2>&1; then
    local v
    for v in 22 24; do
      if nvm use "$v" >/dev/null 2>&1; then
        cur="$(_aic_node_major node 2>/dev/null)"
        if [ -n "$cur" ] && [ "$cur" -ge "$min" ] 2>/dev/null; then
          return 0
        fi
      fi
    done
  fi

  echo "ensure-supported-node: Node >= ${min} required but not found." >&2
  echo "                       Current: $(command -v node >/dev/null 2>&1 && node -v || echo 'none')" >&2
  echo "                       Install: brew install node@22  (or: nvm install 22)" >&2
  return 1
}

_aic_ensure_supported_node || return 1 2>/dev/null || exit 1
