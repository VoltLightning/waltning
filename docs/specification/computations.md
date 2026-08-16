# Computations

Every figure the interface promises, defined well enough to implement without
asking a question. The adversarial completeness review found 24 that were not —
this closes them.

**The test each definition must pass:** could someone write the function from
this alone, and would two people write the same one?

Notation: `T` is `transactions` filtered to `deleted_at IS NULL` throughout.
Every amount is `numeric`; nothing here is ever a JS number (§7.1).

---

## 0 · Where each figure may be computed

`SPEC.md` §14.3 lets the phone compute some of these and forbids others. The
class is part of each figure's definition, not a separate table to drift from:

| Class | Meaning |
|---|---|
| **F** — foldable | A server-issued checkpoint plus the device's own unacknowledged outbox entries, using `signed()` / `debtDelta()` from `money.ts` |
| **R** — replica-computable | Derivable from replicated rows, **only over a date range the replica covers completely** |
| **S** — server-only | Has a documented way to be subtly wrong, or depends on state the device holds staler than it knows |

| Figure | Class | Why |
|---|---|---|
| §2 Account balance | **F** | A checkpoint plus signed entries |
| §3 Net worth, mine and ours | **F** | A sum of account checkpoints |
| §4 Display conversion | **R** | The replica carries each row's already-converted display amount |
| §4a FX margin | **S** | Needs both reference rates; a stale one makes the margin identically zero |
| §5 Period spend | **R** for the base figure · **S** for shared-boundary netting | Netting needs `to_amount_pivot`, and getting it wrong silently uses the source amount |
| §6 Spend by category | **S** | Two `UNION ALL` branches; a `LEFT JOIN … COALESCE` counts a four-line transaction four times |
| §7 Counterparty balances | **F** per currency · **S** for ageing | Ageing is FIFO over the full history |
| §8 Clearing and `find_unsettled` | **F** for the balance · **S** for allocation | Largest-remainder allocation must not be reimplemented |
| §9 Duplicate and transfer detection | **S** | Runs server-side on commit, for every path |
| §10 Recurring materialization | **S** | The occurrence date is resolved under a row lock |
| §11 Targets | **S** | Period-to-date with capital excluded |
| §12 Headline figures | **S** | Every one |
| §13 Search | **R** | Substring over the replica, and it says so — SQLite has no `pg_trgm` |
| §14 Confidence | **S** | Retrieval agreement over the full ledger |
| §16 Subscription costs | **R** | Enabled rules plus today's rates, both in the replica; totals are ≈ estimates by definition |
| Every tax figure (§13.x) | **S**, permanently | Depends on period locks, residency and rates the device may hold staler than it knows |

**The S list is not timidity.** Each entry has a defect in
[`defects.md`](defects.md) behind it. A second implementation in TypeScript is a
permanent drift surface in exactly the place where drift is invisible.

---

## 0a · Representation and rounding

Every figure below is a **decimal string**, never a JS number, at
`numeric(20,8)` — scale 8 because crypto balances need it.

**Rounding is half away from zero** (`ROUND_HALF_UP`): `1.005 → 1.01`,
`−1.005 → −1.01`. Not banker's rounding. The difference is systematic rather
than random — half-even pulls totals toward even cents across a five-year
ledger — so it is a decision, and it was implemented before it was written
down here, which is the wrong order. This document's own test is *"would two
people write the same function from this alone?"*, and rounding mode is
precisely where two people diverge.

**Round once, at the boundary.** Intermediate values keep full precision;
rounding is applied when a figure is stored or displayed, never between steps
of a sum. Rounding each term and then adding differs from adding and then
rounding, by up to half a unit per term.

`money.ts` owns this and holds a **private** decimal.js constructor: the
library's configuration is global and process-wide, so a dependency calling
`Decimal.set` would otherwise change the rounding of every amount in the
ledger from outside this module, silently. A test asserts it cannot.

---

## 1 · Signing, and the two legs

```
signed(t, 'from') =  −amount_original   for expense and the source leg of a transfer
                     +amount_original   for income and adjustment
signed(t, 'to')   =  +to_amount         destination leg of a transfer only
```

**A transfer contributes to two accounts with two different amounts** (§7.2).
Every aggregate below that spans accounts must sum both legs, and no aggregate
may use `amount_original` for a destination.

`adjustment` carries its own sign, so `amount_original` may be negative for that
type and only that type.

---

## 2 · Account balance

```sql
balance(a) =
    a.opening_balance
  + (SELECT coalesce(sum(-t.amount_original), 0) FROM T t WHERE t.account_id    = a.id)
  + (SELECT coalesce(sum( t.to_amount),       0) FROM T t WHERE t.to_account_id = a.id)
```

In the **account's own currency**, always — the currency trigger (§6.5)
guarantees every contributing row is denominated in it, which is what makes this
a plain sum.

**Not** `SUM(amount_pivot)`: that column exists only on the source leg (§7.4).

---

## 3 · Net worth — *mine* and *ours*

The review found `Mine` defined two incompatible ways. Resolved:

```
mine(d) = Σ balance_display(a, d)  over accounts where ownership = 'own'
ours(d) = Σ balance_display(a, d)  over ALL accounts
```

**Business accounts are included in `mine`.** The scope *partition* (§6.7) is a
transaction-level filter — `own AND NOT is_business` — and is a different thing
from the balance-level split. A balance cannot be partitioned by a transaction
flag at all, because one account's balance is composed of rows on both sides of
it.

Therefore **`DualTotal` is scope-invariant**: the shell's scope segment filters
lists and period figures, and never the hero (S01, S04).

Receivables are **excluded** — lending is an expense and repayment an unearned
inflow (§6.6). Net worth is money you hold.

---

## 4 · Display conversion

```
balance_display(a, d) = balance(a) × rate_to_display(a.currency, d)
```

where `d` is *today* for a balance and **the row's own date** for a transaction
(§7.0). Rates are stored one way only — `(base = pivot, quote = X)`, meaning
units of X per one pivot — so:

```
to_pivot(x, ccy, date)     = x ÷ rate(pivot, ccy, date)
from_pivot(p, ccy, date)   = p × rate(pivot, ccy, date)
convert(x, from, to, date) = from_pivot(to_pivot(x, from, date), to, date)
```

`transactions.fx_rate` stores **pivot per unit** — the reciprocal of the
`fx_rates` direction — because `amount_pivot` is generated as
`amount_original × fx_rate`. The two are reciprocals and both are called *rate*;
treat that as a known hazard and name variables accordingly.

**Tax outputs never use this path** (§13.6): they take the direct
jurisdiction-currency rate from the jurisdiction's own source, not a
triangulation through pivot.

---

## 4a · FX margin on a transfer

```
margin_pivot(t) = amount_pivot − to_amount_pivot
margin_pct(t)   = margin_pivot ÷ amount_pivot
realized_rate(t)= to_amount ÷ amount_original      -- derived, never stored
```

`to_fx_rate` is the **reference** rate for `to_currency`, in the same
pivot-per-unit direction as `fx_rate` (§7.5). Storing the *realized* rate there
makes both legs value to the same pivot amount and the margin identically zero
for every transfer in the ledger — the feature would report nothing while
appearing to work.

A negative margin means you beat the reference rate. Render it, never clamp it.

`FX Cost` (§12.2) reports margin and stated `fee` as **separate lines**, grouped
by `account_groups.institution`. They are different kinds of cost: a fee is
avoidable by choosing another route, a margin is not.

---

## 5 · Period spend, net, and the shared boundary

For period `p` and scope `s`:

```
spend(p, s)  = Σ amount_pivot over T where type = 'expense'  ∧ in(p) ∧ in(s)
inflow(p, s) = Σ amount_pivot over T where type = 'income'   ∧ in(p) ∧ in(s)
net(p, s)    = inflow − spend
```

`net` is **all inflows minus all outflows**, not earnings-only. *Earned* is a
separate figure using `categories.is_earnings` (§6.7).

**Capital rows are included here and excluded from comparison** (§6.8). Any
figure presented as a comparison, trend or target excludes `is_capital` and
**states the exclusion inline**. Any figure presented as a record includes it
and breaks it out when present (S10).

**My spending nets the shared boundary** (§6.7):

```
shared_net(p) = Σ amount_pivot     where to_account is shared ∧ account is own
              − Σ to_amount_pivot  where account is shared ∧ to_account is own
my_spend(p)   = spend(p, mine) + shared_net(p)
```

This requires `to_amount_pivot` as a second generated column. Without it the
destination leg has no pivot value and the netting silently uses the source
amount — which for a cross-currency round trip understates the true cost by the
spread.

`shared_net` may be negative and is shown that way.

---

## 6 · Spend by category

Three forks, all decided:

**Lines win where they exist.**

```sql
-- rows WITH a breakdown: attribute to the lines
SELECT l.category_id, sum(l.amount * t.fx_rate)
FROM T t JOIN transaction_lines l ON l.transaction_id = t.id
GROUP BY 1
UNION ALL
-- rows WITHOUT: attribute to the transaction's own category
SELECT t.category_id, sum(t.amount_pivot)
FROM T t
WHERE NOT EXISTS (SELECT 1 FROM transaction_lines l WHERE l.transaction_id = t.id)
GROUP BY 1
```

**Never a `LEFT JOIN` with a coalesced amount** — a transaction with four lines
would contribute its own amount four times.

**Transfers are excluded** — they carry no category by constraint. The
shared-boundary net line (§5) is therefore reported as its own named row, not
inside any category.

**Category rollup sums leaves into their group.** Only leaves are assignable
(R1), so a group's figure is always the sum of its children and never has an own
amount.

---

## 7 · Counterparty balances

```sql
balance(c, ccy) = Σ −signed(t, side) over T
                  where counterparty_id = c
                    ∧ counterparty_role = 'debt'
                    ∧ coalesce(debt_currency, currency) = ccy
```

**The negation is the whole rule** (§6.6): the ledger signs by cash flow, a debt
signs by obligation, and they are exact opposites.

`side` is the leg carrying the counterparty. For a transfer that is not always
`from` — a repayment out of a receivable is a transfer *into* your bank, and
using the source leg inverts the sign. **`debtDelta` must take the side.**

`debt_currency` and `debt_amount` exist so a settlement can discharge a balance
in a currency other than the one that changed hands (S14). Where null, the
transaction's own currency and amount apply.

Ageing, **companies only** (O15): FIFO — settlements consume the oldest open
`debt` row first; the age is the date of the oldest still-unconsumed row.
Buckets 0–30 / 31–60 / 61–90 / 90+. Without a `payment_terms_days` field this
means *old*, never *overdue*, and the label must say so.

---

## 8 · Clearing and `find_unsettled`

```
clearing_balance(a) = balance(a)              -- an ordinary balance
```

Attribution: allocations consume clearing inflows **FIFO**, so

```
find_unsettled() → (account_id, balance, oldest_unconsumed_transaction_id)
```

That third field is what lets the banner name a transaction (S01, S04, S12)
rather than a number. A non-zero clearing balance is a **prompt**, never a
defect (§6.4).

**Allocation is total-preserving by construction.** Largest-remainder: floor each
share at the currency's scale, then distribute the remainder one minor unit at a
time by descending fractional part. Never `amount × (1/n)` — three ways on 185,00
leaves dust in the same direction every time, and the clearing invariant would
never clear again.

---

## 9 · Duplicate and transfer detection

Two different strictnesses, previously conflated (§9.3):

| | Window | Amount | Effect |
|---|---|---|---|
| **Tier 1 auto-skip** | same date | exact, same currency | Skipped silently |
| **Review flag** | ±3 days | ±1% or exact | `duplicate` pill, three resolutions (S02) |

**Cross-currency transfer detection cannot use equal magnitude** — that was the
defect. Both candidate legs convert to pivot at *their own* dates and match
within **±3%**, wide enough for a bank spread:

```
|to_pivot(debit) − to_pivot(credit)| ÷ to_pivot(debit) ≤ 0.03
    ∧ |date_debit − date_credit| ≤ 3 days
    ∧ account_debit ≠ account_credit
```

Same-currency exact magnitude stays as the fast path. On confirmation the
**realized rate is derived from the two observed amounts** — which is why the
match must happen before any rate is applied (§7.5).

Detection runs against committed rows **plus every open batch** (§9.3), and is
suppressed for date ranges where a device reports unsynced writes.

---

## 10 · Recurring materialization

**Manual.** A projection posts only when you press *run now* (S21) or *post now*
on a calendar projection (S11). Nothing runs on a schedule.

That resolves the contradiction the review found: `RuleHealthTag = overdue` is
only reachable if posting is not automatic, and a deliberate skip is only
expressible if nothing posts behind your back. **Overdue is the ordinary state
of a projection you have not yet posted**, not an error.

The client never computes the occurrence date. `materialize_occurrence(rule_id)`
sends **no date**; the server resolves it from the RRULE and `next_date` under a
row lock and returns what it posted. A device in another timezone therefore
cannot re-fire or skip one.

---

## 11 · Targets

```
progress(target, p) = spend_to_date(p, scope=mine, capital excluded)
                    ÷ target.amount
```

**Period-to-date actual, never pro-rated by elapsed days.** Pro-rating answers a
question nobody asks; the bar shows what you have spent against what you allowed.

Converted at each row's own date into `target.currency`. Over-target goes
`negative` ink and states the overage (§14.7).

---

## 12 · The remaining headline figures

| Figure | Definition |
|---|---|
| `spent` | §5 `spend(p, s)`, capital included and broken out |
| `net` | §5 — all inflows minus all outflows |
| `business share` | business expense ÷ total expense, over the hero's period and scope |
| `revenue_ytd` | `tax_ledger` filtered to `type = 'income' AND is_earnings` — the broad view includes business *expenses*, which are not reportable under ryczałt |
| `income_vs_expense` | Per bucket of the chosen granularity: `Σ signed(t) where type='income'` and `Σ |signed(t)| where type='expense'`, both in display currency, **capital excluded** and transfers excluded entirely — a transfer is not income to one side and expense to the other |
| `FX cost` | margin + fee, **as two lines** (§7.5) |

```
margin_dest  = (reference_rate − realized_rate) × amount_original   -- destination currency
fee          = transactions.fee                                     -- stated by the bank
```

**This is §4a's figure in a different unit, not a second definition.** The
register's M-class list recorded *"the margin formula is never written down and
three candidates disagree"*, so it is worth showing that these two agree:

```
margin_pivot = amount_original × to_fx_rate × (reference_rate − realized_rate)
             = margin_dest × to_fx_rate
```

Use `margin_dest` when reporting a single transfer — you want the number in the
currency you received. Use `margin_pivot` when totalling across currencies, which
is what `FX Cost` does. **Never mix them in one total.**

Totalled by period and by `account_groups.institution` (added in `0004`).

---

## 13 · Search

Trigram (`pg_trgm`) over `payee`, `note`, `receipts.merchant` and
`transaction_lines.description`. Ranked by similarity, then date descending.

Trigram rather than `tsvector` **because the archive is permanently mixed.**
Capture is overwhelmingly English now, and imported statement text is almost
entirely Polish — but five years of history carries a large Cyrillic tail that
never goes away, and no single text-search configuration stems English, Polish
and Russian. Trigram similarity needs to know none of that: it is
language-agnostic by construction, which is the property that matters here and
the reason this choice survives the language mix changing again.

An amount token matches `amount_original` exactly, in any currency. A match
inside a receipt names the line that matched. Offline search is substring-only
over the cache, and says so.

---

## 14 · Confidence

**Not self-reported.** A model asked for its own confidence produces a number
that injected text can steer, and the review showed 0.99 clearing a 0.90
threshold on a poisoned row.

```
confidence = agreement(retrieved neighbours) adjusted by rule proximity
```

— the share of the *k* retrieved prior payees that carry the proposed category.
The model's own figure is a tiebreak only. `model_id` is persisted on
`import_rows` beside it, so a threshold stays interpretable after §11.4's model
config changes.

Per-field display threshold for extraction: below **0.85** renders the marker.

---

## 15 · What deliberately has no definition

**Property is not an asset** (§6.7), so net worth is money and nothing values a
house. **Investment performance is not tracked** (N6) — the `Crypto` account is a
balance. **Envelope budgets do not exist** (N7); §11's targets are the whole of
it.

Each is a decision recorded so its absence reads as intent.

## 16 · Subscription costs

Over enabled rules with `is_subscription` (S34, §14.4a). Class **R** — inputs
are the rules and today's rates, both in the replica.

**Monthly equivalent** of a rule, from its RRULE — exact rationals, rounding
only at display:

| FREQ | monthly equivalent |
|---|---|
| `MONTHLY;INTERVAL=n` | `amount / n` |
| `YEARLY;INTERVAL=n` | `amount / (12 × n)` |
| `WEEKLY;INTERVAL=n` | `amount × 52 / (12 × n)` |
| `DAILY;INTERVAL=n` | `amount × 365 / (12 × n)` |

**Totals** sum monthly equivalents converted to the display currency at
**today's** rate (§4 triangulation), and are therefore estimates — rendered
with **≈**, like every cross-currency aggregate. Annual total is the monthly
total × 12, never an independent sum: two formulas for one figure is how the
margin got defined twice (§4a), and this figure gets one.

A paused rule contributes nothing. A rule whose currency has only a
carried-forward rate today still converts — the ≈ already covers it.
