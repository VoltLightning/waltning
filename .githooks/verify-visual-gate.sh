#!/bin/sh
#
# The one place `pnpm verify` and the pre-commit hook agree on whether the
# Playwright visual suite runs — a shared gate rather than two copies of the
# same condition, one of which goes stale.
#
# `VERIFY_VISUAL` unset or `1` (the default `pnpm verify` runs with, no env
# needed): the gate exits 1, so `verify:visual` falls through to the real
# `pnpm test:visual`. `VERIFY_VISUAL=0` — set by the pre-commit hook once it
# has decided, from staged paths, that nothing under `packages/ui/` or
# `packages/core/src/` changed — prints one line saying why the suite was
# skipped and exits 0, so `verify:visual` never reaches Playwright.
#
# `VERIFY_VISUAL_REASON` is optional and only changes the wording: the hook
# sets it to the staged-path finding; a developer setting `VERIFY_VISUAL=0`
# by hand at the shell gets a generic line instead, which is honest — the
# script has no staged-path reason to report in that case.
if [ "${VERIFY_VISUAL:-1}" = "0" ]; then
  echo "verify: skipping the visual suite (${VERIFY_VISUAL_REASON:-VERIFY_VISUAL=0})"
  exit 0
fi
exit 1
