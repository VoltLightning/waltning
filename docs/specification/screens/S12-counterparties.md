# S12 · Counterparties

**Surface** both · **Journeys** J2, J7, J8 · **Frequency** weekly
**Design** [S12.html](design/S12.html)
**Status** specified · tier 2

> Absorbs the former S26 (Debt overview · web) and the former S37 (People &
> companies). All three were the same list read at different densities and
> with different filters; a switcher says that without three screens to
> navigate between.

---

## 1. Purpose

Who you deal with, and what is outstanding — the saved directory and the open
balances in one place, because the second is a filter over the first.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| Tab bar | Debt | — |
| S01 | `debt` widget | S01 |
| S04 | Unsettled banner → allocation → here | S04 |

**Exits** — a counterparty → S13 · add → S15 · unallocated clearing → the
transaction that needs allocating.

**Open or Everyone, and that switcher is what absorbed S37.** *Open* is the
parties carrying any non-zero per-currency balance; offsetting converted totals
do not hide them, and a balance whose fold failed (P1) still counts as open
rather than vanishing behind a figure nobody could compute. *Everyone* is the
saved directory — every party, grouped **People** and **Companies** by legal
nature, including the ones money has never moved with. A shop saved and not yet
spent at exists only there, which is the gap that used to need a second screen.

Archived parties appear in neither; they are finished, not filtered. Existing
balance rows stay inspectable after settlement, through the party's own detail
(S13).


## 3. Layout

**The hero card is S04's `MonthSummary`, with debt's three figures in it.** Label above the number, the number on its own line, a `FlowBar` whose track is *you lent* and whose fill is *you owe* — so the gap that remains is what comes back to you — then the labelled pair beneath. Every figure carries its currency
(`design-system/04` §4.1). The two screens a person opens daily should not state a net of two figures in two different shapes; this is the same card, holding a different subtraction.

### Mobile — 390pt

```
  ┌───────────────────────────────────┐
  │ ⚠ 340,00 zł unallocated           │   ← only when non-zero
  │   dinner · 6 Aug      [ Allocate ]│
  └───────────────────────────────────┘

  ┌───────────────────────────────────┐
  │ comes back to you                 │   ← the hero: S04's card
  │ 920,20 zł                         │
  │ ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░              │
  │ you lent 1 240,60   you owe 320,40│
  └───────────────────────────────────┘

  [ All ]  [ They owe ]  [ You owe ]

  ┌───────────────────────────────────┐
  │ they owe you · PLN    +1 240,60 zł│
  │ they owe you · EUR       +74,44 € │
  │ you owe · PLN           −320,40 zł│
  └───────────────────────────────────┘   ← no EUR line: nothing owed in it

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
one screen mean opposite things and are too easy to misread. **The hero obeys
this too**: its leading figure is a magnitude and the label above it carries the
direction — *comes back to you* when more is out with people than is yours to
give back, *you owe, on balance* when it is the other way. A hero reading
*comes back to you · −183,49* is this rule broken on the screen it was written
for. Exactly settled points forward: nothing comes back and nothing is owed,
and naming a debt of `0,00` would invent one.

**The hero folds into the pivot, and draws nothing when it cannot.** Every
balance is converted at the rate the replica holds for it; a figure folded from
lines one of those rates is missing for would be a headline with a hole in it,
which is the one thing a headline must not be (P1). So an incomplete fold draws
no hero at all, and the per-currency card below — which states each currency on
its own terms and needs no rate — carries the screen on its own. The same
happens when nothing is owed in either direction: there is no subtraction to
state.

The direction-totals block is a card of grouped rows — a *they owe you* and a
*you owe* line per currency, which is a group, not a single hero figure.
**A direction with nothing in it is not a line.** A currency owed one way only
carries a zero the other way, and *you owe · EUR 0,00* is a label with nothing
under it; the same rule that drops a currency settled in both directions drops
the settled half of a currency owed in one. The lines read as two blocks —
every *they owe you* first, then every *you owe* — because that is how the
question is asked: what is out with people, and what is mine to give back.
The segment control and the counterparty rows stay on the ground. **The card
renders only when there is at least one direction total**; with nothing owed in
either direction there is no group to draw, and an empty card is chrome around
nothing.

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
| `MonthSummary` | The hero, above the segments — S04's own card with debt's three figures in it, taking its labels as a prop (*comes back to you* · *you lent* · *you owe*). Not a second component: a bar whose track is one figure and whose fill is another is the same shape whichever subtraction it holds |
| `Card` | Wraps the direction-totals block — grouped rows (they-owe / you-owe per currency), not a hero figure. Rendered only when a direction total exists, and a settled half draws no line |
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

**Contributions never appear here.** `obligation_role = 'contribution'` is
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
