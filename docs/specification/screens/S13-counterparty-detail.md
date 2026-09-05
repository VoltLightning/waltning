# S13 · Counterparty detail

**Surface** both · **Journeys** J7, J8 · **Frequency** weekly
**Design** none
**Status** specified · tier 2

---

## 1. Purpose

One person's full position, across every currency at once.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| S12 | Tap a counterparty | S12 |
| S09 | Counterparty field | S09 |
| S03 | An agent result | S03 |

**Exits** — S14 settle · S15 edit · S05 prefilled · S10 filtered to their
history.

## 3. Layout

### Both surfaces

```
  ┌─────────────────────────────────────┐
  │  (A)  Nina                          │
  │       person · settles in EUR       │
  │                                     │
  │  PLN      +840,00      owes you     │
  │  EUR      −120,00      you owe      │
  │  ─────────────────────────────────  │
  │  net in EUR   +74,44   @ 4,3200     │
  │  net in PLN  +321,60                │
  └─────────────────────────────────────┘

        [ Add transaction ]   [ Settle ]

  HISTORY                    [ debts only · 3 other rows ]
   6 Aug   dinner, split four ways      +210,00 zł
   2 Aug   repaid                       −150,00 zł
  28 Jul   lent for tickets             +780,00 zł
```

**History defaults to `debt` rows**, so every visible row explains a number in
the ledger above it. `reference` and `contribution` rows are one tap away — and
the toggle **states the count it is hiding**, because a default filter that
silently omits real data is the failure mode, and naming the count is the
cheapest guard against it (`design-system/08` §8.1).

**One card holds `CounterpartyCard` and `BalanceLedger` together** — the person
and their position are one thing to read, and the card is the group. *Settle*
and *Add transaction* sit under it on the ground, in a row with the primary on
the right (`design-system/03` §3.1).

**This card is what justifies the model change.** Two currencies, opposite
directions, one person — the account model could only show unrelated balances in
`Loan · PLN` and `Loan · EUR (my)` with nothing connecting them.

Neither derived total is stored; both recompute from `fx_rates`, so a corrected
rate fixes every counterparty at once.

Web adds the ageing bar inline for companies and shows history as a table.

## 4. Components

| Component | Notes |
|---|---|
| `Card` | Wraps `CounterpartyCard` + `BalanceLedger` — one group, the person and their position. Settle and Add transaction sit under the card, on the ground: `[ Add transaction ]` secondary, `[ Settle ]` primary on the right |
| `CounterpartyCard` | Name, kind, settlement currency, monogram |
| `BalanceLedger` | One row per currency. **Direction in words**, sign never alone |
| `AgeingBar` | Companies only |
| `TransactionRow` | History, with role markers |
| `BrandIcon` | `TransactionRow`'s own leading mark — same component and catalogue as S04/S10 (§14.4b) |
| `EmptyState` | All settled — a success state, not a blank |

## 5. Data

| Reads | Writes |
|---|---|
| `counterparty_balances` for this id, per currency | — |
| Both derived totals — theirs and display | — |
| `search_transactions(counterparty_id)` | — |

## 6. States

| State | Treatment |
|---|---|
| Loading | Skeleton ledger rows |
| Populated | Outstanding · fully settled · **mixed direction** |
| Empty | All settled — states it plainly, keeps the history, keeps the counterparty |
| Error | `ErrorState(recoverable)` |
| Offline | Cached with age |
| Gated | n/a |

## 7. Interaction

### Mobile
Settle is the primary action. History scrolls; tapping a row → S09.

### Web
Same, with history as a sortable table and both actions in a fixed header.

## 8. Rules this screen must obey

- **§6.6** — one counterparty holds one balance per currency plus two derived
  totals. Neither total is stored.
- **P5** — direction in words on every row.
- **P1** — the derived totals carry the rate and its date.
- **O15** — ageing for companies only.
- **§6.7** — contributions are excluded from the ledger entirely; if this person
  has contributed to a shared account, that shows in history with a
  `contribution` marker and **never in a balance**.

## 9. Open questions

1. ~~**Should history include `reference`-role rows?**~~ **Decided: available
   behind a toggle, debts only by default.** The primary read stays clean —
   every visible row explains a number in the ledger above it — and the full
   picture is one tap away.

   **The toggle states what it is hiding**, which is what keeps it from being a
   default where things go unseen: `debts only · 3 other rows`. That is the same
   rule `EmptyState(filtered)` follows (`design-system/08` §8.1) — never report
   absence without naming its cause — applied to a filter that is on by default
   rather than one you set. A control whose off-state silently omits real data
   is the failure mode here, and naming the count is the cheapest possible guard
   against it.
2. ~~**Is the settlement currency actually used?**~~ **Decided: no action — it
   earns its place as a default.** S14 preselects the balance in the
   counterparty's settlement currency, so the field does real work at the moment
   it matters rather than only labelling the card.

   Whether the preference matches reality is measurable once there are
   settlements to measure; building a usage indicator now would be instrumenting
   a guess.
