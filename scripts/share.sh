#!/usr/bin/env bash
# Syncs this checkout with the shared project folder until a GitHub repo exists.
#   scripts/share.sh push   copy the architecture team's paths out; others' paths only if missing
#   scripts/share.sh pull   copy the other teams' paths in
set -euo pipefail
SHARED="${SPELLDEX_SHARED:-/mnt/project-files/spelldex}"
cd "$(dirname "$0")/.."

MINE=(package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json vitest.config.ts .gitignore .npmrc
      CONTRACTS.md README.md scripts apps/web packages/shared packages/data-build)
# Paths inside MINE that belong to other teams.
FOREIGN_IN_MINE=(packages/shared/src/scan packages/shared/src/rules packages/data-build/src/scan-index)
THEIRS=(packages/design packages/device-3d packages/scanner packages/lore "${FOREIGN_IN_MINE[@]}")
EXCLUDES=(--exclude=node_modules --exclude=dist --exclude=.git --exclude='apps/web/public/data' --exclude='*.tsbuildinfo')

copy() { # copy <from-root> <to-root> <path> [no-clobber]
  local from="$1" to="$2" p="$3" mode="${4:-}"
  [ -e "$from/$p" ] || return 0
  local ex=("${EXCLUDES[@]}")
  if [ "$mode" != keep ]; then
    for f in "${FOREIGN_IN_MINE[@]}"; do [[ "$f" == "$p/"* ]] && ex+=("--exclude=$f"); done
  fi
  mkdir -p "$to/$(dirname "$p")"
  if [ "$mode" = keep ]; then
    [ -e "$to/$p" ] && return 0
  fi
  tar -C "$from" "${ex[@]}" -cf - "$p" | tar -C "$to" -xf -
}

case "${1:-}" in
  push)
    for p in "${MINE[@]}"; do copy . "$SHARED" "$p"; done
    for p in "${THEIRS[@]}"; do copy . "$SHARED" "$p" keep; done
    echo "pushed to $SHARED" ;;
  pull)
    for p in "${THEIRS[@]}"; do
      [ -e "$SHARED/$p" ] || continue
      rm -rf "./$p.pull-tmp"; mkdir -p "./$p.pull-tmp"
      tar -C "$SHARED/$p" "${EXCLUDES[@]}" -cf - . | tar -C "./$p.pull-tmp" -xf -
      rm -rf "./$p"; mv "./$p.pull-tmp" "./$p"
    done
    echo "pulled from $SHARED" ;;
  *) echo "usage: $0 push|pull" >&2; exit 1 ;;
esac
