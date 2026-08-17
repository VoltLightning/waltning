# Money and FX

Specified in `SPEC.md` §7. This page is the part you need before reading any
other document.

## There is no main currency

Most finance apps pick a home currency and convert everything into it. This one
does not (§7.0). Balances are held in the currency they are actually in, and
conversion happens only for *display*, at a rate you can name.

That is not a preference — it is what makes the numbers auditable. A stored
figure that has already been converted has lost the rate that produced it, and
you cannot reconstruct it later when the rate has moved.

## Representation

**`numeric(20,8)` in Postgres. Decimal strings in TypeScript. Arithmetic only
through `money.ts`.**

A JavaScript number holding an amount is a bug, and this is treated as one
rather than discouraged. Floats do not represent `0.1`, and the error is not
theoretical: it accumulates over a five-year ledger and shows up as a balance
that is *nearly* right, which is the worst kind of wrong because nothing alerts
on it.

`money.ts` uses a **cloned** decimal.js instance rather than configuring the
global one. With a global configuration, any dependency anywhere in the tree
could change the rounding mode of the ledger by calling `Decimal.set()` — and
the observable symptom would be `1.005` rounding to `1.00` in a report, six
months later, with nothing in the diff to point at.

## Accounting dates are strings

Bare `YYYY-MM-DD`, with no `Date` arithmetic and no timezone conversion. A
transaction dated the 1st is on the 1st in every timezone; a `Date` makes it the
31st for anyone east of you, and period boundaries are exactly where that
matters most. When the capture timezone is genuinely interesting it is stored
separately as `capturedTz`.

## Two kinds of rate

The distinction that most of §7 rests on (§7.3):

| | |
|---|---|
| **Reference rate** | What a currency was worth on a date — from ECB, NBP, and others per currency |
| **Realized rate** | What *you* actually got, implied by the two sides of a transfer you made |

Cross-currency transfers store **both legs** (§7.5), so the realized rate is a
fact rather than an assumption. The gap against the reference rate is then not a
rounding mystery — it is the spread your bank charged, and it surfaces as a
visible `FX Cost` figure instead of quietly disappearing into the balance.

Rates are fetched per date, not "latest". A transaction gets the rate on *its*
date, which is why the FX backfill exists and why a missing rate is an explicit
state rather than a fallback to the nearest one.

`SPEC.md` §7.6 covers manual override, and §7.7 covers the sources, including
one currency whose published rate holds only about half a percent of its actual
range — a data problem with a designed remedy rather than an undesigned state.

## Every figure has exactly one definition

[`computations.md`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/computations.md)
defines every derived number the interface promises: account balance, net worth
in both *mine* and *ours* senses, period spend, spend by category, counterparty
balances, FX margin, confidence, and the rest.

Each figure is classed **F / R / S** — which decides where it can be computed:

| Class | Means |
|---|---|
| **F** | Computable from the phone's own data. Works offline, always |
| **R** | Needs the replica — the server checkpoint the phone holds |
| **S** | Server only. Shows as unavailable offline rather than as a stale number |

Classing a figure wrong is the failure mode that looks like health: it renders,
it looks plausible, and it is computed from data the phone does not have. §15
of `computations.md` lists what deliberately has *no* definition, which is
usually the more interesting list.
