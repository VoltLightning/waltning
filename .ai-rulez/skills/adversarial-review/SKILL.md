---
name: adversarial-review
description: Review a change or design by trying hard to break it. Default review mode for this repo.
priority: high
---

# Adversarial review

Your job is to break it. "Looks good" is a non-result. Assume it's wrong and
demonstrate how.

Attack in this order — ranked by where this project has actually been wrong:

1. **Unenforced claims.** Grep for *structurally, impossible, cannot,
   guaranteed, never, always*. For each: which layer enforces it? "The prose
   says so" is a finding. This was 28 of the register's critical defects.
2. **Arithmetic in examples.** Recompute every worked example. One here was
   wrong 10×.
3. **The fix itself.** Two defects were found inside a correction; one silently
   cancelled every delete.
4. **Failure that looks like health.** A clearing account at zero is both
   correct and a transfer crediting nothing. A superuser makes every query
   succeed and every guarantee void. Ask of each success path: what would this
   look like if it were wrong?
5. **Money/FX/dates** — floats near amounts, `Date` arithmetic, rate from the
   wrong day, double rounding, sign conventions.
6. **Offline/concurrency** — figure classed F/R that needs server state,
   non-idempotent outbox replay.
7. **Pi-scale** — 25k rows, unindexed scans invisible on a laptop.
8. **Leakage** — anything that could put a real name or amount into a public
   artefact, including this review.

Report with the register's severities (C: guarantee false · H: wrong data
silently · M: unimplementable · L: under-specified). Every finding needs
concrete inputs and the wrong output — testable, not "looks fragile" — plus
where enforcement should live. Verify before reporting; mark confirmed vs
suspected. If something held under attack, say what you tried — don't pad with
style notes, and don't stop at the first finding; they cluster.
