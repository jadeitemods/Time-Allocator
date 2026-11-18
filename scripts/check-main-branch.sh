#!/usr/bin/env bash
# Transitional guard for as long as the app lives only on gh-pages and main
# is supposed to stay an empty README. Fails if any file other than
# README.md, LICENSE, .gitignore, or .github/** is present on the current
# tree (intended to run in CI with ref == main).
#
# After the recommended layer-1 fix (move the app onto main and deploy
# Pages from main), DELETE this check — icons and index.html should then
# live on main.
set -euo pipefail
ROOT="${1:-.}"
cd "$ROOT"
# List tracked files if this is a git checkout; otherwise the working tree.
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  mapfile -t files < <(git ls-tree -r --name-only HEAD)
else
  mapfile -t files < <(find . -type f -not -path './.git/*' | sed 's|^\./||')
fi

allowed() {
  case "$1" in
    README.md|LICENSE|LICENSE.md|.gitignore|.gitattributes) return 0 ;;
    .github/*) return 0 ;;
    *) return 1 ;;
  esac
}

bad=()
for f in "${files[@]}"; do
  allowed "$f" || bad+=("$f")
done

if ((${#bad[@]})); then
  echo "main is only supposed to contain README/LICENSE/.github; these files should live on the app branch (or main should become the app, and this check should be removed):" >&2
  printf '  %s\n' "${bad[@]}" >&2
  exit 1
fi
echo "check-main-branch: ok (${#files[@]} allowed file(s))"
