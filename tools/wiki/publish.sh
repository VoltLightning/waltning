#!/bin/sh
#
# Publish docs/wiki/ to the GitHub wiki.
#
# A GitHub wiki is a separate git repository with no hooks, no review and no
# gate — and this one is attached to a public repo whose examples are
# placeholders for a real ledger. Writing pages in the wiki UI would put text
# on a public surface that nothing had swept.
#
# So the pages live in docs/wiki/, where the pre-commit hook covers them, and
# this mirrors them out. The sweep below is deliberately repeated here rather
# than trusted to have run at commit time: this script can publish a working
# tree that was never committed, which is exactly when the gate is absent.
#
#   sh tools/wiki/publish.sh [--dry-run]
#
# Requires push access to <repo>.wiki.git, which exists only after the wiki has
# been initialised once through the web UI.

set -eu

RED='\033[31m'
GREEN='\033[32m'
DIM='\033[2m'
OFF='\033[0m'

root=$(git rev-parse --show-toplevel)
src="$root/docs/wiki"
terms="$root/.githooks/private-terms.txt"
remote=$(git -C "$root" remote get-url origin | sed 's/\.git$//').wiki.git

dry=no
[ "${1:-}" = "--dry-run" ] && dry=yes

fail() {
  printf "\n${RED}✗ wiki: %s${OFF}\n" "$1" >&2
  [ $# -gt 1 ] && printf "${DIM}  %s${OFF}\n" "$2" >&2
  exit 1
}

[ -d "$src" ] || fail "no docs/wiki/ to publish."

# ── 1 · Personal data sweep ──────────────────────────────────────────────────
#
# Same mechanism as the commit hook: whole-word matching against a gitignored
# term list. Absent, the sweep is *refused* rather than skipped — the hook can
# skip it because a fresh clone by someone else has nothing to sweep for, but
# publishing is an act of publication and the person doing it is the person
# with the list.
if [ ! -f "$terms" ]; then
  fail "no $terms — refusing to publish without the personal-data sweep." \
       "the vault note 'Real to abstract mapping' is the source."
fi

cleaned=$(mktemp)
trap 'rm -f "$cleaned"' EXIT
grep -vE '^[[:space:]]*(#|$)' "$terms" > "$cleaned" || true
if [ -s "$cleaned" ]; then
  hits=$(grep -rinwFf "$cleaned" "$src" || true)
  if [ -n "$hits" ]; then
    fail "a wiki page contains a term from the private list." \
         "$(printf '%s' "$hits" | head -3 | cut -c1-100)"
  fi
fi

# ── 2 · Links ────────────────────────────────────────────────────────────────
#
# Relative links are valid in the repository and broken once published, and
# they render identically either way. tests/wiki.test.ts is where that lives.
if ! pnpm exec vitest run tests/wiki.test.ts --silent; then
  fail "wiki link checks failed."
fi

printf "${GREEN}✓${OFF} sweep and link checks passed\n"

# ── 3 · Mirror ───────────────────────────────────────────────────────────────
#
# Clone, replace the page set wholesale, commit. Replacing rather than copying
# over the top is what makes a *deleted* page actually disappear — a page left
# behind stays public and stays wrong.
work=$(mktemp -d)
trap 'rm -f "$cleaned"; rm -rf "$work"' EXIT

if ! git clone --quiet --depth 1 "$remote" "$work/wiki" 2>/dev/null; then
  # In a dry run this is not fatal: the sweep and the link checks still ran and
  # still mean something. Say plainly that drift is *unknown* rather than
  # letting a green tick imply the published wiki is current.
  if [ "$dry" = yes ]; then
    printf "${DIM}  could not reach %s — drift not checked${OFF}\n" "$remote"
    exit 0
  fi
  fail "cannot clone $remote" \
       "the wiki repository does not exist until the first page is created in the web UI."
fi

find "$work/wiki" -maxdepth 1 -name '*.md' -delete
cp "$src"/*.md "$work/wiki/"

# Nothing else notices a stale wiki. The published copy is the one no test can
# reach, so a page edited in docs/wiki and never published stays wrong where
# people actually read it — indefinitely, and silently. `--dry-run` therefore
# reports drift rather than only validating the source.
if [ -z "$(git -C "$work/wiki" status --porcelain)" ]; then
  printf "${GREEN}✓${OFF} published wiki matches docs/wiki\n"
  exit 0
fi

if [ "$dry" = yes ]; then
  printf "\n${RED}✗ the published wiki is out of date${OFF}\n" >&2
  git -C "$work/wiki" status --porcelain | sed 's/^/    /' >&2
  printf "${DIM}  run: pnpm wiki:publish${OFF}\n" >&2
  exit 1
fi

sha=$(git -C "$root" rev-parse --short HEAD)
git -C "$work/wiki" add -A
git -C "$work/wiki" commit --quiet -m "Publish docs/wiki at $sha"
git -C "$work/wiki" push --quiet origin HEAD

printf "${GREEN}✓${OFF} published %s pages at %s\n" "$(ls "$src"/*.md | wc -l | tr -d ' ')" "$sha"
