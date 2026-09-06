# S31 · Transfer

**Surface** both · **Journeys** J2, J10, J14 · **Frequency** weekly
**Design** none
**Status** specified · tier 2

> Added after the S05 type-selector decision. `SPEC.md` §14.1 lists Transfer as
> a mobile screen and nothing specified it — a transfer is a different shape
> from an expense, which is exactly why it does not belong in Quick add's chip
> row.

---

## 1. Purpose

Move money between two of your own accounts, and make the FX cost visible at the
moment of entry rather than in a report months later.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| Any tab | `+` long-press → Transfer | The tab you came from |
| S16 | An account row → *Transfer from here* | S16, source prefilled |
| S09 | Editing an existing transfer | S09 |

**Quick add's kind menu offers Expense and Income only** (S05 §9.1). A transfer
is two accounts, two amounts and a live rate; the one entry point that offers
all three kinds is `+`, because that is the choice made *before* a draft
exists rather than in the middle of one.

## 3. Layout

### Mobile — 390pt

```
  ✕                              Transfer

  From   [ Household · USD ]
                  ↓
  To     [ Cash · PLN ]

           150,00 $                    ← you type this
              ↓
           565,20 zł                   ← prefilled, EDITABLE

  realized   3,7680
  reference  3,8100 · NBP · 12 Aug
  margin     6,30 zł                   ← updates as you type
  fee      [ 5,00 ] zł                 ← optional, stated by the bank
  total     11,30 zł

  [ Today ]  [ + note ]

  ┌──────────── keypad ─────────────┐
  │              Save               │
  └─────────────────────────────────┘
```

**The destination amount is pre-filled from the reference rate and left
editable.** Typing over it sets the realized rate, and the spread against the
reference updates as you type — so the bank's margin is visible while you are
looking at it (§14.1).

**The rate is never the input.** Two amounts are, because two amounts are what a
statement shows and a rate is not (§7.6). The realized rate is derived and
displayed, never typed.

**Which is why the realized figure is absent until both amounts are.** A rate
derived from a figure nobody has typed is not a reading — `realized 0,0000` on
an untouched screen is the absence of one wearing a figure's clothes, on the
screen whose whole purpose is making the real rate visible. The realized rate
and the margin appear together, once both sides hold a non-zero amount.

**The reference rate is the opposite case and stays.** It is not derived from
anything typed — it is a fact the ledger already holds — so it shows from the
moment a pair is chosen, on its own line, with its source, its date and its
staleness (§6). Withholding it while the destination amount is being retyped
would hide the figure at exactly the moment §7 calls primary: backspacing
`565,20` to type what the bank actually gave is the whole interaction, and the
reference is what it is compared against.

Same-currency transfers collapse: one amount, no rate panel, no spread.

### Web — ≥1024px

Same fields on one row rather than stacked, with the rate panel beside them
instead of beneath. The width buys nothing conceptual — this is a five-field
form, and a wider version of it is not a better one.

## 4. Components

| Component | Notes |
|---|---|
| `TransferAmount` | Two accounts, two amounts, derived rate, spread (§4.3) |
| `AmountField` | Both sides. Tabular, comma decimal |
| `RateField` | Read-only here — it is derived. Shown with its reference for comparison |
| `Chip` | Date, note |
| `Keypad` | Mobile |

## 5. Data

| Reads | Writes |
|---|---|
| `get_accounts` | **`create_transaction`** with `type = 'transfer'` |
| Reference rate for the date and pair | — |

Writes **one row** carrying `account_id`, `to_account_id`, `amount_original`,
`to_amount` and `to_currency` — never two rows to be re-paired (§6.1).

`to_fx_rate` is **not** among them, and this screen is where that is easiest to
get wrong. §14.6 resolves it server-side at commit; what this screen sends is the
two amounts, and the realized rate is derived from them (§7.5) rather than
asserted alongside them. The `RateField` below says the same thing in the other
direction — read-only, because it is derived.

## 6. States

| State | Treatment |
|---|---|
| Loading | Opens instantly; accounts from cache |
| Populated | Entering · same-currency (collapsed) · cross-currency (rate panel) · saving |
| Empty | n/a |
| Error | Same account both sides → refused inline (`transactions_transfer_distinct`). Save failed → draft retained |
| Offline | Works. Reference rate from cache, marked stale; the destination amount stays editable, which is the point — the rate you actually got does not depend on the feed |
| Gated | **The source account's currency has no rate** — the same §14.6 gate S05 §6 states, reached here from S16's *Transfer from here* on the very account that is blocked. Save is disabled and a `neutral` `Banner` says so, carrying the one action that ends it: *Set a ‹CUR› rate*, opening S18 scoped to that currency and this screen's date. One refusal, one treatment, on both composers |

## 7. Interaction

### Mobile
Source and destination are chips opening an account picker. Tapping the
destination amount replaces the pre-filled figure. Swap direction with one
control rather than re-picking both accounts.

### Web
Tab through: from · to · amount · destination amount · date. `Enter` saves.

### Shared
**Editing the destination amount is the primary interaction**, not an advanced
one. It is how a statement gets recorded faithfully.

## 8. Rules this screen must obey

- **§7.5** — both amounts stored; the realized rate is derived and never stored
  as truth. Deriving `to_amount` from the reference rate instead would erase the
  spread silently, and making FX cost visible is **G8**.
- **§6.10** — one payment event, one row.
- **§6.5** — `to_currency` and `to_fx_rate` are required on a transfer; a
  destination leg that cannot be valued is a balance that comes out wrong.
- **P1** — the converted figure never appears without its rate.
- **§7.4** — the two legs are valued at different rates on a cross-currency
  transfer and deliberately do not net to zero. The residue is the spread.

## 9. Open questions

1. ~~**Should a transfer record its fee separately from the spread?**~~
   **Decided: yes — an optional `fee` amount on the transaction.** `FX Cost`
   then reports margin and fees as **distinct lines** rather than one blended
   figure.

   **They are different kinds of cost and only one is negotiable.** A stated fee
   is avoidable by choosing another route; a rate margin is not. Blending them
   makes the total look like something you cannot act on, when part of it is
   exactly what you would act on. G8 is *make FX cost visible*, and one number
   containing two unrelated costs is less visible than two.
2. ~~**Is `Transfers out` the right category home?**~~ **Decided: rename it to
   `Debt & giving`.** The group holds `Lent out`, `Repayment made` and
   `Charity` — none of which are transfers in this system's sense, since a
   transfer carries no category at all by constraint
   (`transactions_category_shape`).

   One word meaning two things is precisely the collision class the taxonomy
   rebuild exists to eliminate (`TAXONOMY.md` R3), and it is cheapest to fix
   before any history is translated through it.
