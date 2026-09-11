# S31 · Transfer

**Surface** both · **Journeys** J2, J10, J14 · **Frequency** weekly
**Design** [S31.html](design/S31.html) — the deck's frame
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
┌─────────────────────────────────────────────────┐
│  Move money                                  ✕  │  ← the name, and what it does under it
│  Between two of your own accounts               │
│                                                 │
│  ┌─────────────────────────────────────────────┐│
│  │ LEAVES                                   ⇅  ││  ← swap, one control
│  │ 500,00  zł                                  ││  ← you type this
│  │ ┌─────────────────────────────────────────┐ ││
│  │ │ From                          12 480,20 │ ││  ← the leg, and what it holds
│  │ │ Bank A · PLN                            │ ││
│  │ │ To                             1 240,00 │ ││
│  │ │ Bank B · EUR                            │ ││
│  │ │ More details                          › │ ││  ← fee · date · note, folded
│  │ └─────────────────────────────────────────┘ ││
│  └─────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────┐│
│  │ ARRIVES                   NBP · 3 September ││  ← the reference's provenance
│  │ 115,96  €                                   ││  ← prefilled, EDITABLE
│  │ ┌ Rate used ┐  ┌ Costs you ┐                ││
│  │ │ 4,3120    │  │ −8,40 zł  │                ││  ← updates as you type
│  │ └───────────┘  └───────────┘                ││
│  │ reference 4,3120 · NBP · 3 September        ││  ← once the realized rate exists
│  │ The spread against the reference rate…      ││
│  └─────────────────────────────────────────────┘│
│                                                 │
│  ┌─────────────────────────────────────────────┐│
│  │                 Move money                  ││  ← full width, primary, at the bottom edge
│  └─────────────────────────────────────────────┘│
│   One entry on each side, linked — neither is   │
│                    income                       │
└─────────────────────────────────────────────────┘
```

**Two cards, one per leg.** *Leaves* holds the amount you type and the two
accounts as rows — each with what it holds, because which account has the
money is half of why you are here. *Arrives* holds the destination amount, the
rate used and what it costs, and is drawn only across currencies.

**Both amounts are typed on the system keyboard**, folded onto the draft's one
shape the way S05's amount is (`sanitizeAmount`). A drawn keypad was the earlier
answer and the deck does not draw one.

**The destination amount is pre-filled from the reference rate and left
editable.** Typing over it sets the realized rate, and the spread against the
reference updates as you type — so the bank's margin is visible while you are
looking at it (§14.1).

**The rate is never the input.** Two amounts are, because two amounts are what a
statement shows and a rate is not (§7.6). The realized rate is derived and
displayed, never typed.

**Which is why *Rate used* shows the reference until both amounts are.** A rate
derived from a figure nobody has typed is not a reading — `realized 0,0000` on
an untouched screen is the absence of one wearing a figure's clothes. Until
both sides hold a non-zero amount the tile states the reference, which is a
fact the ledger already holds; once the realized rate exists the tile shows
it, *Costs you* appears beside it, and the reference moves to the line under
them so the comparison is still on the page (§6 — with its source, its date
and its staleness in the card's own kicker row, and a *Manual* tag when either
leg is a person's own correction).

**Costs you is the margin and the stated fee, summed, in the source
currency** — the currency the money left in, which is the fee's (§9.1) and
the margin's own pivot leg, so the two add without a conversion. Drawn as
money that left, in words and in ink; a transfer that beat the reference reads
`+` under *Saves you* (§7.5: never clamped). `FX Cost` (§12.2) still reports
the two apart.

**Rate used states its unit** — *PLN per USD*, destination per source, the
direction `RateTable` uses — because a bare figure says nothing about which
way it reads, and the artboard's own figure is drawn the other way round.

Same-currency transfers collapse: one card, no rate, no spread — and one
figure. The destination is not drawn, so it follows the source whatever was
typed or swapped, the write restates it, and
`transactions_transfer_same_currency_equal` refuses a row whose two legs in one
currency disagree.

**The fee, the date and the note wait behind one row** in the *Leaves* card,
which summarises what they hold when folded (*Fee 5 · 1 September*) and carries
a folded field's refusal, so nothing filled is ever invisible.

### Web — ≥1024px

Same fields on one row rather than stacked, with the rate panel beside them
instead of beneath. The width buys nothing conceptual — this is a five-field
form, and a wider version of it is not a better one.

## 4. Components

| Component | Notes |
|---|---|
| `ComposerHeader` | *Move money* over *Between two of your own accounts*, the ✕. Clears the top inset itself |
| `TransferComposer` | The two cards — *Leaves* and *Arrives* — and everything in them (§4.3) |
| `ComposerRow` | The legs, with the account's balance at the right in place of the caret; *More details*, which unfolds *Fee* · *Date* · *Note* |
| `Amount` | Every balance and the cost. Tabular, comma decimal |
| The tiles | *Rate used* and *Costs you*, on the inset fill — the one figure each that the screen exists to make visible |
| `Banner` | `neutral`, under the rows, when the source currency has no rate (§6) |
| The footer | A full-width primary *Move money* over *One entry on each side, linked — neither is income* |

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
| Gated | **The source account's currency has no rate** — the same §14.6 gate S05 §6 states, reached here from S16's *Transfer from here* on the very account that is blocked. Save is disabled and a `neutral` `Banner` says so, carrying the one action that ends it: *Set a ‹CUR› rate*, opening S18 scoped to that currency. One refusal, one treatment, on both composers |

## 7. Interaction

### Mobile
Source and destination are rows opening an account picker. The destination
amount is a field; typing into it replaces the pre-filled figure. Swap
direction with the one control in the *Leaves* card's kicker row rather than
re-picking both accounts.

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
