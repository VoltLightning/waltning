# Architecture

The engineering view. `SPEC.md` says *what the system is and why*; the rest of
`docs/specification/` says *what it looks like and how it behaves*. This folder
says **how it is built** — the structure an implementer needs before writing the
first module, and the boundaries that must not be crossed while writing the rest.

**Read in this order.** Each assumes the one before it.

| | | Answers |
|---|---|---|
| 1 | [`01-context-and-containers.md`](01-context-and-containers.md) | What talks to what, which arrows are trust boundaries, what each dependency's absence costs — **and the physical layer**: the bill of materials and what each part costs when it fails |
| 2 | [`02-components.md`](02-components.md) | Inside the API: the operation registry, the domain services, and where the loop/pipeline choice is fixed |
| 3 | [`03-domain-model.md`](03-domain-model.md) | 33 tables by aggregate, and **where each rule is enforced** |
| 4 | [`04-sequences.md`](04-sequences.md) | The five interactions where wrong ordering produces a wrong number |
| 5 | [`05-deployment.md`](05-deployment.md) | Environments, boot order, **how the web dashboard is served**, roles, backup/restore runbook, cutover |
| 6 | [`06-quality-attributes.md`](06-quality-attributes.md) | Budgets an implementation can fail against |
| 7 | [`07-test-strategy.md`](07-test-strategy.md) | What to test, at which layer, and what this project learned about tests that do not work |
| 8 | [`08-offline-and-concurrency.md`](08-offline-and-concurrency.md) | What an outbox entry *is*, idempotency, ordering, and surviving an app update |
| 9 | [`09-connectivity.md`](09-connectivity.md) | That "online" is not a boolean — twelve states, a probe contract, and why a 200 is not a success |

**Sequence of work** is [`../build-order.md`](../build-order.md) — the single
plan reconciling `SPEC.md` §16 with the component order, including the Phase 0.5
perimeter gate. This folder is structure; that one is order.

---

## The three ideas everything else follows from

**1 · One operation registry, two consumers.** The tRPC router and the agent's
tools are *generated from the same declaration*. There is no operation the UI can
perform that the agent cannot, and they cannot drift because they are the same
thing. Adding a screen action adds an agent tool for free.

**2 · Loops where you are present; pipelines where you are not.** Not a
per-feature judgement — a positional rule. One transaction with you standing
there is a loop; three hundred rows reviewed in bulk is a deterministic pipeline,
because a pipeline can be scored against fixtures and a loop cannot. *Retrieval
is not agency.*

**3 · The database is the layer that holds when the code is wrong.** Every
guarantee this system makes about tax isolation, closed periods, currency
matching and leaf-only categories is a trigger, a `CHECK`, a view predicate or a
role privilege — not a convention. This is not defensive style; it is the direct
lesson of [`../defects.md`](../defects.md), where seventy-five critical and
high defects reduced to one sentence: **this specification asserts guarantees, and asserting
is not enforcing.**

A fourth idea earns its place once you go offline: **an outbox entry is one user
intention, not one row change** ([`08`](08-offline-and-concurrency.md)). Eight
H-class defects were the same gap seen from eight angles, and all eight follow
from getting that one definition right.

---

## Status

| | |
|---|---|
| Open questions across 30 screens and 15 flows | **0** — all decided, decisions recorded in place |
| Template conformance | 30/30 screens, 15/15 flows |
| Operations referenced by a screen but missing from the registry | **0** |
| Defects | **C 20 · H 31 · M 24 — all closed.** L triaged, two items remain as scheduled implementation work |
| Migrations | 10, all verified to apply cleanly from empty |
| Database guarantees driven to refusal in test | period lock (7 cases), T1 (3 breaches), memory `CHECK`, reassignment invariant |

**The one input still outstanding** is 52 account balances typed off the Money
Manager UI into `accounts.expected_balance` — the §8.4 gate's independent
right-hand side. Two substitutes were tried and neither works: `ZASSET.ZLEFTMONEY`
is `0.00` on all 52 accounts, and the bank statements cover 2 accounts over 4
months, enough to corroborate the sign map but not to gate 52 balances over five
years.

**And one property to carry into the build rather than fix:** the ledger is
faithful and **partial**. 169 of 246 real transactions on `Bank A · PLN` are not in
Money Manager at all (C19). No balance check can see that, every downstream
figure inherits it, and it is why the statement sync tooling is permanent rather
than a migration step.
