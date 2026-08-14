# J7 · Lend and settle

**Frequency** weekly · **Surface** both
**Screens** S05, S15, S12, S13, S14, S09
**Status** specified

---

## 1. Why this journey exists

**Previously impossible to express.** Money Manager has no concept of a person.
Debt lived in eleven accounts sliced by currency and direction — `Loan · PLN`,
`Loan · PLN (my)`, `Loan · BYN` — which is a large part of why there were 68
accounts at all, and the names of the actual people lived as free text in
transaction notes.

That structure cannot answer the question you actually have. It knows the total
owed to you in PLN. It does not know that **one person owes you PLN and you owe
them EUR**, because the person is not a record anywhere.

## 2. Preconditions

An account to move money through. Counterparties are created in place (S15), so
nothing has to exist first.

## 3. The path

```
RECORD
  S05 Quick add → attach counterparty → CHOOSE THE ROLE
        │            ▸ new person/company → S15 Counterparty editor
        │                name · kind · THEIR settlement currency
        │
        │   role = debt      → enters the ledger below
        │          category defaults: Debt & giving › Lent out
        │                         or Other inflows › Borrowed
        │   role = contribution → J8 / §6.7, NOT a debt
        │   role = reference    → recorded, no obligation
        │
        Save

TRACK
  S04 → Debt   or   S12 Debt · counterparties (both surfaces)
        │  name · kind · net position in THEIR currency
        │  display-currency equivalent beneath
        │
   S13 Counterparty detail
        │  BalanceLedger — one row per currency
        │    PLN  +840,00   owes you
        │    EUR  −120,00   you owe
        │    ─────────────
        │    net in EUR  +74,44   @ 4,3200
        │    net in PLN +321,60
        │  history · ageing (companies only, O15)

SETTLE
   S14 Settle sheet
        │  amount · currency · which balance it discharges
        │  rate — defaults to reference, EDITABLE
        │  spread against reference, shown as typed
        │  RESIDUAL stated before commit
        │
        ▸ exact     → balance clears, counterparty stays
        ▸ partial   → remainder outstanding, stated plainly
        ▸ over      → becomes a balance in the other direction
```

## 4. Branches

| At | Condition | Goes to |
|---|---|---|
| S05 | Counterparty unknown | S15, created in place, returns to the draft |
| S15 | Name resembles an existing one | `MatchWarning` — §5. This is where a balance gets corrupted |
| S13 | Counterparty is a company | `AgeingBar` appears. **Persons never age** — a 60-days-overdue badge on a friend's share of dinner is absurd; on an unpaid invoice it is the point (O15) |
| S13 | Position is mixed | Two rows, opposite directions, both stated in words |
| S14 | Settlement currency ≠ debt currency | Rate field opens, defaulting to the reference rate for the date |
| S14 | Amounts do not reconcile | Residual shown before commit; **never absorbed** |
| S13 | Allocating a group expense | J8 |

## 5. Failure paths

| Failure | Treatment |
|---|---|
| **Possible duplicate counterparty** | `MatchWarning` on save in S15, fired by a normalized near-match against existing names. It shows the candidate **with its balance and transaction count** — that is what makes the risk legible, because an abstract "similar name found" does not convey that accepting it merges two ledgers. Two explicit actions and **no default**: *This is the same person* merges; *These are different* proceeds and **records the decision**, so the pair is never queried again. Never auto-merges, never silently allows (`design-system/08` §8.4). The same component guards J15's counterparty proposal review, which has the identical failure mode at higher volume |
| Settlement leaves a residual | Not a failure. Stated, and the balance stays open — **a settlement never implicitly clears** |
| Over-settlement | Becomes a balance in the other direction, stated as such rather than clamped to zero |
| No FX rate for the settlement date | Reference defaults to the nearest, flagged `estimated`. The rate is editable regardless, which is the point |
| Counterparty archived with an open balance | Refused. Archiving is for settled relationships |
| Deleting a settled transaction | Soft delete reopens the balance, and the debt screens reflect it immediately — balances are derived, so they cannot drift from history |

## 6. Rules

- **A settlement never implicitly clears a balance.** If the amounts do not
  reconcile, the remainder stays outstanding and is stated. This is the single
  most important rule here: an implicit clear silently invents a payment.
- **The rate is editable**, because a debt is discharged at the rate the two of
  you agreed, not the rate a central bank published (§6.6). `<SettleSheet>`
  follows `<TransferAmount>`: two amounts, derived rate, spread shown.
- **Direction is always stated in words.** `+840` and `−120` on the same card
  are too easy to misread when they mean opposite things (P5).
- **The debt balance is the negation of the cash-flow sign** (§6.6), computed
  once in `<BalanceLedger>` so no screen has to remember it. Lending (cash −200)
  is a receivable of +200; being repaid (+200) is −200.
- **Receivables sit outside net worth.** Lending is a real outgoing and
  repayment a real inflow, so net worth is money you hold, not money you are
  owed. The debt screens are where that gap is legible — and the cost is stated
  rather than hidden: **period spending includes money you expect back.**
- **Contributions are not debts.** `counterparty_role` keeps them out of
  `counterparty_balances` structurally, so ageing and `find_unsettled` cannot
  see them (§6.7).
- **One counterparty, one settlement currency, many balances.** The currency
  they prefer to settle in is a property of the person, not of the system.

## 7. Success

| Measure | Target |
|---|---|
| Expressiveness | *"One person owes me PLN and I owe them EUR"* is a single card, correctly signed |
| Honesty | No balance ever clears without the arithmetic being shown |
| Recall | *"Who owes me money"* is answerable in one screen, across every currency |
| Safety | Two spellings of one person cannot silently become one balance |
| Ageing | Companies age; friends do not |
