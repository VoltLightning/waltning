# Context

**A router, not a description.** The domain is defined in
[`SPEC.md`](SPEC.md) and [`docs/specification/`](docs/specification/); this file
exists so that a tool looking for `CONTEXT.md` by name finds the way in instead
of finding nothing. Anything restated here would be a second copy that drifts.

Waltning is a self-hosted personal finance system: a multi-currency PostgreSQL
ledger on hardware you own, an offline-capable phone app, a web dashboard, and
an LLM agent whose every write goes through the same validated registry the
screens use.

## Where each part of the domain is defined

| Concept | Defined in |
|---|---|
| Entities, constraints, ownership, debt, clearing | `SPEC.md` §6 |
| Money, currencies, the two kinds of rate, FX cost | `SPEC.md` §7 |
| Statement import, receipts, migration from the old app | `SPEC.md` §8–§10 |
| The agent: typed tools, approval gating, memory | `SPEC.md` §11 |
| Tax: the business-only view, adapters, schemes | `SPEC.md` §13 |
| **Every write in the system** | `docs/specification/operations.md` |
| **Every derived figure**, with where it may be computed | `docs/specification/computations.md` |
| Containers, components, sequences, deployment, code structure | `docs/specification/architecture/01–10` |
| What the user is trying to do · what each screen does | `docs/specification/flows/` · `screens/` |
| Category tree | `TAXONOMY.md` |
| Known-wrong things | `docs/specification/defects.md` |
| Decisions that are hard to reverse, and why | `docs/adr/` |

Orientation, with diagrams and plainer language, is in
[`docs/wiki/`](docs/wiki/) — published to the GitHub wiki.

## Vocabulary

The glossary is `SPEC.md` Appendix B, mirrored in `docs/wiki/Glossary.md`. Eight
terms carry more weight than their length suggests:

- **Complete / authoritative** — two properties that are routinely conflated and
  are not the same. *Complete* means holding the whole ledger and working with no
  network: the phone. *Authoritative* means admitting writes and hosting the
  guarantees: the server. The phone is complete and **not** authoritative, and
  most of `architecture/14` follows from refusing to collapse the two.
- **Brick** — a layer that improves the product without requiring the next one.
  Brick 1 is the phone alone, Brick 2 adds a backend, Brick 3 adds the web
  dashboard. Not phases of one build; each is usable on its own.
- **`version`** — the conflict token: *did this field change under me since I
  read it?* A `bigint` the database advances, never a timestamp, because a
  timestamp can be ranked and ranking is how an older edit overwrites a newer
  one. Distinct from `updated_at`, which means "last edited" and is for display.

- **Operation** — a named, Zod-validated, audited write in the registry. The
  only way anything in the ledger changes. Not "an endpoint", not "a mutation".
- **F / R / S** — where a figure may be computed: from the phone's own data,
  from its replica of the server, or on the server only. A correctness
  property, not a caching hint.
- **Reference rate / realized rate** — what a currency was worth on a date,
  versus what you actually got. The gap between them is `FX Cost`, and it is
  shown rather than absorbed.
- **`tax_ledger`** — the business-only view every tax adapter reads. Personal
  rows are unreachable from it, enforced by a database role rather than a
  `WHERE` clause.
- **Rule 0** — a 200 is not a success. A response must authenticate as ours
  before its status code is trusted.

## The constraints that shape most decisions

- Money is `numeric(20,8)` **strings** end to end. A JS number holding an
  amount is a bug.
- Accounting dates are bare `YYYY-MM-DD` strings — no `Date` arithmetic, no
  timezone conversion.
- Guarantees live in PostgreSQL — constraint, trigger, role grant — not only in
  application code.
- A feature is a vertical slice, built schema → operation → service → procedure
  → screen. Never starting at the screen.
- **Public repo, private ledger.** Every name, bank and balance in this
  repository is a placeholder.
