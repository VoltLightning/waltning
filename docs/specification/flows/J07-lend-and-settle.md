# J7 · Lend and settle

> Migrated from `FLOWS.md`. **Not yet expanded** — see the flow template.

**Frequency:** weekly. **New in this spec** — previously impossible to express.

```
RECORD
  S05 Quick add → attach counterparty
        ▸ new person/company → S15 Counterparty editor
                                  name · kind · THEIR settlement currency
        │
        Save → the transaction now carries counterparty_id

TRACK
  S04 Today → Debt  or  S12 Debt · counterparties
        │  list: name · kind · net position in THEIR currency
        │        display-currency equivalent beneath
        │
   S13 Counterparty detail
        │  one row per currency — direction stated in words, not by sign
        │  PLN  +840,00  owes you
        │  EUR  −120,00  you owe
        │  net in EUR · net in main
        │  history · ageing (companies only)

SETTLE
   S14 Settle sheet
        │  amount · currency · which balance it discharges
        │  rate — defaults to reference, EDITABLE
        │  spread against reference shown
        │  RESIDUAL stated before commit
        │
        ▸ fully settled  → balance clears, counterparty stays
        ▸ partial        → remainder stays outstanding, stated plainly
```

**Design rules**

- A settlement **never implicitly clears** a balance. If the amounts do not
  reconcile, the remainder is shown, not absorbed.
- The rate is editable because a debt is discharged at the rate the two parties
  agreed, not the one a central bank published (`SPEC.md` §6.6).
- Direction is always stated in words. `+840` and `−120` on the same card are
  too easy to misread when they mean opposite things.
