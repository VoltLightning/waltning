# S12 · Debt

**Surface** both · **Journeys** J7, J8 · **Frequency** weekly
**Design** none
**Status** specified · tier 2

> Absorbs the former S26 (Debt overview · web). Portfolio scale and counterparty
> list are the same concept at different densities.

---

## 1. Purpose

Who owes you, and whom you owe, across every currency.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| Tab bar | Debt | — |
| S01 | `debt` widget | S01 |
| S04 | Unsettled banner → allocation → here | S04 |

**Exits** — a counterparty → S13 · add → S15 · unallocated clearing → the
transaction that needs allocating.

## 3. Layout

### Mobile — 390pt

```
  ┌───────────────────────────────────┐
  │ ⚠ 340,00 zł unallocated           │   ← only when non-zero
  │   dinner · 6 Aug      [ Allocate ]│
  └───────────────────────────────────┘

  [ All ]  [ They owe ]  [ You owe ]

  ┌───────────────────────────────────┐
  │ they owe you      +1 240,60 zł    │
  │ you owe             −320,40 zł    │
  └───────────────────────────────────┘

  ┌─────────────────────────────────────┐
  │ (A)  Nina              owes you     │
  │      person · settles EUR           │
  │                   +74,44 € · 321,60 │
  ├─────────────────────────────────────┤
  │ (M)  Marek             you owe      │
  │      person             −120,00 zł  │
  ├─────────────────────────────────────┤
  │ (AC) Acme Sp. z o.o.   owes you     │
  │      company · 62 days  ▓▓▓▓▓░░     │
  │                       +4 200,00 zł  │
  └─────────────────────────────────────┘
```

**Direction is stated in words, never by sign alone** (P5). `+840` and `−120` on
one screen mean opposite things and are too easy to misread.

The direction-totals block is the screen's hero figure and sits in a `Card`;
the segment control and the counterparty rows stay on the ground.

Each row shows the net in **their** settlement currency with the display-currency
equivalent beneath — the first is what you discuss with them, the second is what
appears in your reports.

### Web — ≥1024px

Two regions. The counterparty register left as a sortable table (name, kind,
per-currency positions, net, age). Right: **totals by direction and currency**,
an **ageing table** for companies, and **unallocated clearing** — the pot that
has not been split yet, which is the entry point into J8.

The width is what makes per-currency positions visible without opening each
person, which is the whole reason the old account model failed.

## 4. Components

| Component | Notes |
|---|---|
| `Card` | Mobile — wraps the direction-totals block (they-owe / you-owe), the screen's hero figure |
| `CounterpartyRow` | Monogram on a ramp tint, derived deterministically from the name (Q10) |
| `DebtDirectionTag` | `owes you` / `you owe` — text, not colour |
| `AgeingBar` | **Companies only** (O15). A 60-days-overdue badge on a friend's share of dinner is absurd |
| `SegmentControl` | All · They owe · You owe |
| `EmptyState` | `first-run` (no counterparties) and a distinct *all settled* |

## 5. Data

| Reads | Writes |
|---|---|
| `counterparty_balances` — **`debt` role only** (§6.6) | — |
| Per-currency positions and both derived totals | — |
| `find_unsettled` — clearing accounts ≠ 0 | — |

**Contributions never appear here.** `counterparty_role = 'contribution'` is
excluded by the view itself, so a co-owner's house payment cannot be read as
money owed (§6.7).

## 6. States

| State | Treatment |
|---|---|
| Loading | Skeleton rows; totals resolve last rather than showing a wrong number |
| Populated | As drawn |
| Empty | `first-run` — no counterparties. Distinct from **all settled**, which is a success and says so |
| Error | Query failed → `ErrorState(recoverable)` |
| Offline | Cached with age. Balances are derived, so a stale balance is a stale *input*, and the age matters more here than on most screens |
| Gated | n/a |

## 7. Interaction

### Mobile
Tap → S13. Swipe is not used — settling is consequential and belongs behind a
screen.

### Web
Sortable columns; `J`/`K`/`Enter`. Ageing sorts descending by default, because
the oldest unpaid invoice is the reason you opened it.

## 8. Rules this screen must obey

- **§6.6** — positive means they owe you: the **negation** of the ledger's
  cash-flow sign, computed once in `BalanceLedger`.
- **Receivables sit outside net worth.** This screen is where that gap is
  legible; it does not reconcile to S01's hero and is not meant to.
- **Never net across people.** The two direction totals stay two figures. S13
  nets across currencies for one person because that is settleable in one
  conversation; nothing discharges one person's debt with another's, so a
  portfolio net would describe an action that does not exist.
- **O15** — ageing for companies only.
- **P5** — direction in words.

## 9. Open questions

1. ~~**Should the two direction totals be summed anywhere?**~~ **Decided: never
   at portfolio scale. Netting happens per person only.**

   **The line is whether a net figure corresponds to something you could
   actually do.** S13 nets across currencies for one counterparty because that
   is a real position, settleable in one conversation at one agreed rate. S12
   would be netting across *people*, and there is no transaction that discharges
   Nina's debt using what you owe Marek — so the figure would describe nothing.

   It would also invite reading receivables as an asset offsetting payables,
   when receivables sit outside net worth by decision (§6.6).
2. ~~**Unallocated clearing sits on the web layout only.**~~ **Decided: both
   surfaces, same region.** An unallocated pot is the debt question in its
   rawest form — money owed by people not yet named — so it belongs on the
   screen you open when thinking about who owes what.

   The S04 banner and this are not redundant: the banner catches you
   **passively**, while walking past; S12 answers the question when you have
   come **looking**. And keeping the two surfaces containing the same regions is
   the point of one-doc-per-concept — a mobile screen missing its most
   actionable item is a different screen, not a narrower one.
