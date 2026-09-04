# S14 · Settle sheet

**Surface** both · **Journeys** J7, J8 · **Frequency** weekly
**Design** none
**Status** specified · tier 2

---

## 1. Purpose

Discharge a debt — possibly in a different currency, at a rate the two of you
agreed.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| S13 | Settle | S13, balance updated |
| S12 | Swipe-free row action | S12 |

## 3. Layout

### Both surfaces — sheet on mobile, modal on web

```
  Settling with Nina

  Amount        [ 50,00 ]  [ EUR ▾ ]

  Discharges                           every balance, one preselected
   (•) EUR   −120,00   you owe         ← their settlement currency
   ( ) PLN   +840,00   owes you
   ( ) GBP    +60,00   owes you

  Into          [ Cash · PLN ▾ ]       where the money lands

  Rate          [ 4,2810 ]             editable
                reference 4,3120 · spread 1,55 zł

  ┌ result ─────────────────────────────┐
  │  discharges        214,05 zł        │
  │  remaining         625,95 zł        │  ← RESIDUAL, before commit
  └─────────────────────────────────────┘

                        [ Cancel ]  [ Settle ]
```

**The residual is shown before commit, always.** A settlement never implicitly
clears a balance — if the amounts do not reconcile, the remainder stays
outstanding and is stated. An implicit clear silently invents a payment.

**The rate is editable and defaults to the reference.** A debt is discharged at
the rate the two parties agreed, not the rate a central bank published (§6.6).
The spread against the reference is shown **as it is typed**, so the cost is
visible at the moment of entry rather than discovered in a report.

## 4. Components

| Component | Notes |
|---|---|
| `SettleSheet` | Follows `TransferAmount` (§4.3) — two amounts, derived rate, spread |
| `RateField` | 4dp, shows the synced value beside the override |
| `AmountField` | Tabular, comma decimal |
| `TransferAmount` | The result preview |

## 5. Data

| Reads | Writes |
|---|---|
| `counterparty_balances` for this person | **`settle_debt`** — the amount that changed hands and the debt it discharges, never the residual (`architecture/08` H9) |
| Reference rate for the settlement date | — |

Settlement is an ordinary transaction, not a special entity — `settle_debt`
writes exactly one, with `counterparty_role = 'debt'`. That is what keeps
balances derived and unable to drift from history.

**Not `create_transaction`.** `operations.md`'s `settle_debt` row already says
so: that call was the defect H9 fixed — `create_transaction` has no notion of
a residual and no channel to return a corrected one, so a client stuck with it
would either compute the residual itself against a balance that could be
stale, or silently drop the check this screen exists to make.

## 6. States

| State | Treatment |
|---|---|
| Loading | Rate resolves; the form is usable meanwhile |
| Populated | Entering · **partial** (residual shown) · exact · **over-settlement** |
| Empty | n/a |
| Error | Save failed → the draft is retained with its rate |
| Offline | Works, with the **balance** stamped, not just the rate — see below |
| Gated | n/a |

#### Offline, the balance is an estimate and says so

This screen can cost real money offline, and until now it did not say so. The
scenario: the phone last synced Tuesday; the counterparty repaid €80 on the
laptop on Wednesday; on Thursday, offline, this sheet shows `EUR −120,00 you
owe` and you hand over €120 in cash. The ledger self-corrects on drain — they
now owe *you* €80 — but you handed over money you did not owe, on a figure the
screen presented without qualification.

So, offline and whenever the checkpoint is older than the session:

- **Every row in the Discharges picker carries its own stamp:**
  `(•) EUR  −120,00  you owe · as of Tue 11 Aug`.
- Past ~24 h the result card relabels to `remaining (estimated)` with
  *from a balance as of Tue 11 Aug* beneath it, amber — P4's *not fully
  observed* is literally this case.
- **The settlement sends the amount, never the residual** (`architecture/08`
  H9). The server derives the remainder from live data and returns it.
- When the drain finds a **different sign** — you settled against a balance that
  had already been cleared — that is not a line in a drain report. It is a card
  on S13 naming the counterparty and stating both figures, because this is the
  one drain outcome that means money moved wrongly.

**The rate is a derived figure, not an input.** §4 already says this sheet
follows `TransferAmount` — *two amounts, derived rate, spread* — while §3's
layout showed a rate field and one amount. Two amounts are observable from a
statement; a rate is not (§7.6). You enter what changed hands **and** the debt it
discharges; the rate falls out. Offline this becomes *exact* rather than
approximate, because both inputs are facts the two of you agreed and neither
depends on a feed.

**Over-settlement is a state, not an error.** Paying more than owed becomes a
balance in the other direction, stated as such rather than clamped to zero.

## 7. Interaction

### Mobile
Bottom sheet, keypad-driven. Settle is full-width primary.

### Web
Modal, Tab through fields, `Enter` commits. Rate accepts paste.

### Shared
Typing over the rate marks it `manual` on the resulting transaction, amber, and
it travels with the row (P1, P4).

## 8. Rules this screen must obey

- **A settlement never implicitly clears.** The residual is the screen's whole
  reason for existing.
- **§7.5** — both amounts stored, rate derived, spread visible.
- **§6.6** — the rate is editable because the parties agreed it.
- **P1** — the converted figure never appears without its rate.
- **Q11** — documentation is optional but **prompted**. An undocumented
  settlement is precisely the one that gets disputed later.

## 9. Open questions

1. ~~**Which balance does a settlement discharge?**~~ **Decided: an explicit
   picker, defaulted to their settlement currency.** Every balance is listed
   with its amount and direction, one pre-selected — the counterparty's own
   settlement currency, already recorded on them and the one you most likely
   discussed.

   The default is therefore **a suggestion you can see past**, not a guess you
   would have to detect. Oldest-first auto-allocation was rejected outright: it
   spreads a payment across balances without being asked, and *silently
   allocating* is precisely what the residual rule exists to prevent.
2. ~~**Should a settlement that exactly clears offer to archive the
   counterparty?**~~ **Decided: no.** A cleared balance is the normal resting
   state of a person you split dinners with, not the end of a relationship.
   Prompting to archive would read the most ordinary event on this screen as a
   conclusion.

   Archiving stays a deliberate act on S15, and is refused while a balance is
   open — which is the only rule the two states actually need between them.
