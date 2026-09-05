#!/bin/sh
#
# Decides whether a diff can move a rendered pixel, from a list of changed
# paths (one per line, on stdin) — the same list `git diff --cached
# --name-only` already gives the pre-commit hook.
#
# `packages/ui` renders every screenshot the visual suite takes. The only
# other workspace it imports from is `packages/core`, and only through six
# subpaths — `capture/*`, `date`, `id`, `money`, `random`, `registry/*` — that
# all resolve under `packages/core/src/` per that package's own `exports` map.
# So `packages/core/package.json`, its README, or its tsconfig cannot move a
# pixel and are deliberately outside this pattern, even though they live next
# to files that can.
#
# Exit 0 (visual suite needed) if any path matches; exit 1 otherwise — this
# is the exit status `grep` already gives, nothing more to add.
grep -qE '^packages/ui/|^packages/core/src/'
