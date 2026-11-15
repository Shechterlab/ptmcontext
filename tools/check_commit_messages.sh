#!/usr/bin/env bash
# Fail if a commit message carries an assistant attribution trailer. Checks every commit since BASE (default 8425cba) up to
# HEAD, and the pushed range BEFORE..HEAD when BEFORE is a commit that exists. Usage: tools/check_commit_messages.sh [BASE] [BEFORE]
set -u
base="${1:-8425cba}"
before="${2:-}"
pat='co-authored-by: claude|claude-session:'
ranges=()
git rev-parse --verify --quiet "$base^{commit}" >/dev/null && ranges+=("$base..HEAD")
if [ -n "$before" ] && ! [[ "$before" =~ ^0+$ ]] && git rev-parse --verify --quiet "$before^{commit}" >/dev/null; then
  ranges+=("$before..HEAD")
fi
[ ${#ranges[@]} -eq 0 ] && ranges=("HEAD")
bad=0
for r in "${ranges[@]}"; do
  for c in $(git rev-list "$r"); do
    if git log -1 --format=%B "$c" | grep -Eiq "$pat"; then
      echo "commit $c has an attribution line in its message:" >&2
      git log -1 --format=%B "$c" | grep -Ei "$pat" >&2
      bad=1
    fi
  done
done
exit $bad
