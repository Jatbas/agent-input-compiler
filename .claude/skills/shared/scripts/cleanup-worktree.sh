#!/usr/bin/env bash
set -euo pipefail

# cleanup-worktree.sh — AIC worktree cleanup utility.
#
# Single source of truth for removing ephemeral planner / executor worktrees.
# Two modes — both idempotent, both verify, both exit non-zero if anything
# remains. Any agent (smart or dumb) that calls this exactly as documented
# cannot leave a half-cleaned state behind.
#
# Modes:
#   remove <worktree-path> [<branch-name>]
#     Removes one worktree directory, prunes git metadata, deletes the
#     associated branch, and removes the parent .git-worktrees/ if empty.
#     If <branch-name> is omitted it is derived from the directory basename:
#       plan-<epoch>         -> plan/<epoch>
#       task-<NNN>-<epoch>   -> feat/task-<NNN>-<epoch>
#       <epoch>              -> feat/<epoch>
#     Exits 1 if the dir, branch, or worktree registration still exists
#     after cleanup.
#
#   sweep [<repo-root>]
#     Removes EVERY orphaned .git-worktrees/<name> directory that is not in
#     `git worktree list`, prunes stale metadata, deletes any
#     plan/<epoch>, feat/<epoch>, or feat/task-<NNN>-<epoch> branch whose
#     worktree directory is missing, and removes the parent .git-worktrees/
#     if it ends up empty. Normal feature branches are never touched.
#     Exits 1 if any orphan directory remains.
#
# Usage examples:
#   bash .claude/skills/shared/scripts/cleanup-worktree.sh remove \
#        /abs/path/to/.git-worktrees/plan-1776597651
#   bash .claude/skills/shared/scripts/cleanup-worktree.sh sweep
#   bash .claude/skills/shared/scripts/cleanup-worktree.sh sweep /abs/repo/root
#
# Exit codes: 0 = clean, 1 = residue remains, 2 = usage error.

usage() {
  cat >&2 <<'EOF'
Usage:
  cleanup-worktree.sh remove <worktree-path> [<branch-name>]
  cleanup-worktree.sh sweep [<repo-root>]
EOF
  exit 2
}

resolve_repo_root() {
  local start="${1:-$PWD}"
  # Follow symlinks, then ask git for the toplevel.
  if [[ -d "$start" ]]; then
    git -C "$start" rev-parse --show-toplevel 2>/dev/null || true
  else
    git -C "$(dirname "$start")" rev-parse --show-toplevel 2>/dev/null || true
  fi
}

derive_branch() {
  local base="$1"
  case "$base" in
    plan-*)
      printf 'plan/%s' "${base#plan-}"
      ;;
    task-[0-9]*-[0-9]*)
      printf 'feat/%s' "$base"
      ;;
    [0-9]*)
      printf 'feat/%s' "$base"
      ;;
    *)
      printf ''
      ;;
  esac
}

is_ephemeral_branch() {
  # Matches planner/executor naming: plan/<digits>, feat/<digits>,
  # feat/task-<digits>-<digits>. Nothing else is auto-deleted.
  [[ "$1" =~ ^plan/[0-9]+$ ]] && return 0
  [[ "$1" =~ ^feat/[0-9]+$ ]] && return 0
  [[ "$1" =~ ^feat/task-[0-9]+-[0-9]+$ ]] && return 0
  return 1
}

mode="${1:-}"
shift || true

case "$mode" in
  remove)
    target="${1:-}"
    branch="${2:-}"
    [[ -z "$target" ]] && usage

    # Resolve to an absolute path without requiring the directory to still
    # exist (readlink -f is GNU-only; this handles macOS too).
    case "$target" in
      /*) ABS="$target" ;;
      *)  ABS="$PWD/$target" ;;
    esac

    REPO=$(resolve_repo_root "$(dirname "$ABS")")
    if [[ -z "$REPO" ]]; then
      REPO=$(resolve_repo_root "$PWD")
    fi
    if [[ -z "$REPO" ]]; then
      echo "cleanup-worktree: not inside a git repo" >&2
      exit 1
    fi

    if [[ -z "$branch" ]]; then
      branch=$(derive_branch "$(basename "$ABS")")
    fi

    # Remove directory first, then prune, then delete branch. Every step
    # tolerates "already gone" so the script stays idempotent.
    rm -rf "$ABS" 2>/dev/null || true
    git -C "$REPO" worktree prune 2>/dev/null || true
    if [[ -n "$branch" ]]; then
      git -C "$REPO" branch -D "$branch" 2>/dev/null || true
    fi
    rmdir "$REPO/.git-worktrees" 2>/dev/null || true

    fail=0
    if [[ -e "$ABS" ]]; then
      echo "cleanup-worktree: directory still exists: $ABS" >&2
      fail=1
    fi
    if [[ -n "$branch" ]] && git -C "$REPO" show-ref --verify --quiet "refs/heads/$branch"; then
      echo "cleanup-worktree: branch still exists: $branch" >&2
      fail=1
    fi
    if git -C "$REPO" worktree list --porcelain 2>/dev/null | grep -qxF "worktree $ABS"; then
      echo "cleanup-worktree: worktree still registered: $ABS" >&2
      fail=1
    fi

    if [[ $fail -eq 0 ]]; then
      echo "cleanup-worktree: removed $ABS${branch:+ and branch $branch}"
      exit 0
    fi
    exit 1
    ;;

  sweep)
    REPO=$(resolve_repo_root "${1:-$PWD}")
    if [[ -z "$REPO" ]]; then
      echo "cleanup-worktree: not inside a git repo" >&2
      exit 1
    fi

    wt_dir="$REPO/.git-worktrees"
    if [[ ! -d "$wt_dir" ]]; then
      echo "cleanup-worktree: no .git-worktrees/ directory — nothing to sweep"
      exit 0
    fi

    # Registered worktree absolute paths, one per line.
    registered=$(git -C "$REPO" worktree list --porcelain 2>/dev/null \
                 | awk '/^worktree / { sub(/^worktree /, ""); print }')

    removed_dirs=0
    for d in "$wt_dir"/*/; do
      [[ -d "$d" ]] || continue
      abs="${d%/}"
      if ! grep -qxF "$abs" <<<"$registered"; then
        echo "cleanup-worktree: removing orphan dir $abs"
        rm -rf "$abs"
        removed_dirs=$((removed_dirs + 1))
      fi
    done

    git -C "$REPO" worktree prune 2>/dev/null || true

    # Branches still registered against a worktree (guarded by the active
    # `git worktree list`) are skipped; only branches whose worktree dir is
    # gone get deleted, and only when they match the ephemeral naming.
    active_branches=$(git -C "$REPO" worktree list --porcelain 2>/dev/null \
                      | awk '/^branch / { sub(/^branch refs\/heads\//, ""); print }')

    removed_branches=0
    while IFS= read -r branch; do
      [[ -z "$branch" ]] && continue
      if grep -qxF "$branch" <<<"$active_branches"; then
        continue
      fi
      if is_ephemeral_branch "$branch"; then
        echo "cleanup-worktree: deleting orphan branch $branch"
        git -C "$REPO" branch -D "$branch" 2>/dev/null || true
        removed_branches=$((removed_branches + 1))
      fi
    done < <(git -C "$REPO" branch --format='%(refname:short)' 2>/dev/null)

    rmdir "$wt_dir" 2>/dev/null || true

    echo "cleanup-worktree: swept ${removed_dirs} orphan dir(s), ${removed_branches} orphan branch(es)"

    fail=0
    if [[ -d "$wt_dir" ]]; then
      registered=$(git -C "$REPO" worktree list --porcelain 2>/dev/null \
                   | awk '/^worktree / { sub(/^worktree /, ""); print }')
      for d in "$wt_dir"/*/; do
        [[ -d "$d" ]] || continue
        abs="${d%/}"
        if ! grep -qxF "$abs" <<<"$registered"; then
          echo "cleanup-worktree: STILL ORPHAN $abs" >&2
          fail=1
        fi
      done
    fi
    exit $fail
    ;;

  ""|-h|--help|help)
    usage
    ;;
  *)
    echo "cleanup-worktree: unknown mode: $mode" >&2
    usage
    ;;
esac
