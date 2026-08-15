---
name: adversarial-review
description: Review a change, a design, or a document by trying hard to break it. Use for any review in this repository — reviews here are adversarial by default, not approval passes.
priority: high
---

# Adversarial review

**Your job is to break it, not to approve it.** A review that returns "looks
good" has produced nothing. This repository's specification was hardened by ten
reviews run in parallel against separate attack surfaces, each told to break the
design and return concrete failure scenarios rather than summaries. They found
83 defects, and three of them overturned claims the author believed.

Approach the work as if you already know it is wrong and your task is to
demonstrate how.

## Where to attack first

Ranked by where this project has actually been wrong before.

**Claims with nothing underneath them.** Search the change for *structurally*,
*impossible*, *cannot*, *guaranteed*, *never*, *always*, *enforced*. For each,
ask which layer enforces it. If the answer is prose, a comment, or "the code
does it correctly", that is a finding. Asserting is not enforcing — it was the
single most repeated defect in the register.

**Arithmetic in examples.** Compute every worked example yourself. Three in this
specification did not compute; one was wrong by a factor of ten, in the example
an implementer would unit-test against.

**The fix itself.** Two defects were found *inside* a correction, one of which
silently cancelled every delete in the system. A patch is not evidence that the
thing it patches now works.

**Failure modes that look like health.** The worst bugs here return success. A
clearing account computing to zero is what correctness looks like *and* what a
transfer crediting no destination looks like. A superuser connection makes every
query succeed and every privilege guarantee meaningless. Ask of any success
path: what would this look like if it were wrong?

**Money, dates, currency.** Floats anywhere near an amount. `Date` arithmetic on
an accounting date. An FX rate taken from the wrong day, or one rate applied
across a range. Rounding applied twice, or at the wrong step. Sign conventions
that differ between a transfer's two legs.

**Concurrency and offline.** A figure classed foldable that actually needs
server state. An operation marked offline-eligible that writes something the
server must arbitrate. Replay of an outbox entry that is not idempotent. Clock
skew between capture and admission.

**Scale on the real hardware.** One Raspberry Pi 4, 25,000 transactions, a
2,100-day calendar. An unindexed scan or an N+1 that is invisible on a laptop.

**Privilege and data leakage.** Anything that widens a database role to make
something work. Anything that could put a real name, amount or payee into a
public artefact — including logs, error messages, fixtures and this review.

## How to report

Use the register's severities so findings can be filed directly:

| | |
|---|---|
| **C** | A stated guarantee is false |
| **H** | Wrong data, silently |
| **M** | Cannot be implemented as written |
| **L** | Correct but under-specified |

Every finding needs a **concrete failure scenario with specific values** — the
inputs, the sequence, and the wrong output. "FX handling looks fragile" is not a
finding. "A transfer on 2024-03-31 between PLN and EUR, where the NBP table for
that date does not exist, takes the rate from the following Tuesday and
overstates the realized rate by 0.4%" is one.

Also state **where enforcement would have to live** — constraint, trigger, role
privilege, registry validation, or type. That is usually the actionable half.

## Verify before you report

Run it. Read the migration and apply it. Compute the example. Query the
database. This repository's checks kept finding what reading had missed, in both
directions — claims that were false, and suspicions that dissolved on contact.

Distinguish **confirmed** from **suspected**, and say which.

## Two failure modes of your own

**Do not manufacture findings.** If you attacked something hard and it held, say
so and say what you tried. That is a real result and it is useful. Padding a
report with style opinions buries the findings that matter.

**Do not stop at the first one.** The interesting defects cluster behind the
obvious one, and several here were found only after the surface problem was
cleared out of the way.
