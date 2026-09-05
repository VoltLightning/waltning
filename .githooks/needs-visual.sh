#!/bin/sh
#
# Decides whether a diff can move a rendered pixel, from a list of changed
# paths (one per line, on stdin) — the same list `git diff --cached
# --name-only --diff-filter=ACMRD --no-renames` gives the pre-commit hook.
#
# The full trigger set — read this list, don't reconstruct it elsewhere:
#
#   packages/ui/**              — renders every screenshot: components, this
#                                  suite's own config (playwright.config.ts),
#                                  Storybook's config (.storybook/**), the
#                                  spec and its committed baselines
#                                  (visual/**, visual/__screenshots__/**), and
#                                  packages/ui's own package.json (a
#                                  react-native-web bump alone can move a
#                                  pixel).
#   packages/core/src/**        — the only @waltning/core subpaths
#                                  packages/ui imports — capture/*, date, id,
#                                  money, random, registry/* — all resolve
#                                  here per that package's own `exports` map.
#                                  tests/verify-visual-gate.test.ts fails
#                                  loudly the day either stops being true.
#   packages/core/package.json  — its `exports` map is what "resolves under
#                                  src/" means, and decimal.js — on Amount's
#                                  render path — is declared there.
#   pnpm-lock.yaml               — the one file a `pnpm update` always
#                                  touches; a bump to react-native-web,
#                                  Storybook, Playwright, or decimal.js can
#                                  move a pixel without a line of source
#                                  changing.
#
# Exit code is the whole contract, and it is asymmetric on purpose:
#
#   0   needed — run the suite.
#   1   not needed — the *only* code a caller may treat as a skip.
#   *   anything else (a bad regex, this script missing or unreadable,
#       whatever) also means "needed". A caller that cannot tell why this
#       script failed cannot safely skip, so an undecidable answer runs the
#       suite — it never skips it. This script's own `case` below converts
#       a `grep` error into exit 0 for that reason; the missing-script case
#       cannot be handled here (there is no script left to run), so
#       `.githooks/pre-commit` and this repo's tests are the ones that must
#       treat "exit 1" as the only skip signal, never "not exit 0".
grep -qE '^packages/ui/|^packages/core/src/|^packages/core/package\.json$|^pnpm-lock\.yaml$'
case $? in
  1) exit 1 ;;
  *) exit 0 ;;
esac
