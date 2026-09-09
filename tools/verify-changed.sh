#!/bin/sh
#
# The commit-time gate: everything the full one runs, over what changed.
#
# `pnpm verify` stays the whole suite and moves to pre-push, which is the last
# thing standing between an edit and the remote. This one has to be fast enough
# that it is never worth skipping, and honest enough that pre-push is a
# formality rather than the first real check.
#
# **Two things are always run whatever changed**, and they are the reason this
# is safe:
#
#   `tests/` and `conformance.test.ts` read source off disk with `readFileSync`
#   rather than importing it, so `vitest --changed` cannot see an edge to them
#   and silently leaves them out. They are the repo-wide rules — the scroller
#   census, the `unknown` budget, the spacing scale, the module boundaries —
#   and they cost five seconds. Selection that skips the rules that catch
#   category errors is selection that catches nothing.
#
# The visual half is `tools/affected/stories.mjs`, which explains why
# Playwright's own `--only-changed` cannot answer this.

set -eu

DIM='\033[2m'
OFF='\033[0m'

say() { printf "${DIM}  %s${OFF}\n" "$1"; }

pnpm check
pnpm typecheck

# `--changed` compares the working tree to HEAD, which is what a commit is.
pnpm exec vitest run --changed
say "always: the repo-wide rules, which no import graph can reach"
pnpm exec vitest run "tests/" "conformance"

stories=$(node tools/affected/stories.mjs)
case "$stories" in
  NONE)
    say "nothing under packages/ui changed — no screenshots"
    ;;
  ALL)
    say "a token, theme, locale or config changed — every story"
    pnpm --filter @waltning/ui build-storybook
    pnpm --filter @waltning/ui test:visual
    ;;
  *)
    say "stories reached by this change: $stories"
    pnpm --filter @waltning/ui build-storybook
    ( cd packages/ui && pnpm exec playwright test -g "$stories" )
    ;;
esac
