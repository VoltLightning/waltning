---
priority: high
---

# How work is done here

## Asserting a guarantee is not enforcing it

This is the single most repeated finding in the defect register — 28 critical
defects, and almost every one was a sentence containing *structurally*,
*impossible*, *cannot* or *guaranteed* with nothing underneath it.

So: when you write that something cannot happen, name the layer that stops it.
The pattern that held was **enforcement at the database** — constraints,
triggers, role privilege — because that layer holds when application code is
wrong. Prose does not enforce anything, and neither does a comment.

## Verify by execution, not by reading

Every important claim in this repository was checked by running something, and
the checks kept finding things reading had missed. Migration `0004`'s trigger
looked correct and silently cancelled every delete. A probe heuristic looked
sound and was ambiguous on 17% of rows. Three worked examples did not compute,
one by a factor of ten.

**A gate never seen to fail is not a gate.** When you add a check, break
something on purpose and confirm it fails.

## Write down why, not just what

Commit messages and specification changes record the reasoning, what was
rejected, and what it cost. Six months later the *why* is the part that is hard
to reconstruct and the part that stops a settled question being re-litigated.

A one-line message for a one-line change is fine. A one-line message for a
design decision is not.

## Money and dates have rules

- Amounts cross every boundary as **decimal strings**, never JS numbers.
  `numeric(20,8)` in Postgres, `decimal.js` in code. `0.1 + 0.2` is the wrong
  answer in a ledger and a five-year history compounds it.
- Accounting dates are **bare dates** and must never go through `Date`
  arithmetic. Timezone work is `capturedTz` resolution, which is a different
  concern.
- Every transaction stores its FX rate **on its own date**. There is no
  reporting currency and no global rate.

## Say what you did not do

Report honestly: if tests fail, show the output; if a step was skipped, say so.
If you could not verify something, say that rather than implying you did. An
overstated result is worse than a missing one, because it stops the next person
checking.
