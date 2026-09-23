# S36 · Allocate

**Surface** both · **Journeys** J8, J7 · **Frequency** weekly
**Design** [S36.html](design/S36.html)
**Status** specified · tier 2

> J08 was the one journey with a screen in its path and no screen document.
> `money.allocateLargestRemainder` has shipped §8's split since E1 and nothing
> called it; `read-unsettled-clearing` and `UnsettledBanner` state that a pot
> is unallocated and offer *Allocate*, which led nowhere. This is where it
> leads.

---

## 1. Purpose

Turn a pot of money you laid out for other people into the debts they each owe
you, and return the clearing account to zero.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| S04 | The unsettled banner's *Allocate* | S04 |
| S01 | The unsettled widget's *Allocate* · desk | S01 |
| S09 | The funding transfer's own *Allocate* | S09 |
| S16 | A clearing account's row | S16 |

**Exits** — S15 for a counterparty created in place · S06 for the category ·
back to the caller on commit or cancel.

**The banner opens the pot, not a list** (J08 §4). A clearing account holds one
pot at a time as far as this screen is concerned: the balance is what is left to
allocate, whatever number of transfers built it up.

## 3. Layout

### Mobile — 390pt

```
  Clearing · PLN
  400,00 zł to allocate              ← the pot, from the account's balance

  [ Even ]  [ Shares ]  [ Custom ]

  ┌───────────────────────────────────┐
  │ You              100,00           │
  │ Eating out                    ›   │  ← a category, never a counterparty
  ├───────────────────────────────────┤
  │ (N)  Nina        100,00   owes you│
  ├───────────────────────────────────┤
  │ (M)  Marek       100,00   owes you│
  ├───────────────────────────────────┤
  │ (P)  Piotr       100,00   owes you│
  └───────────────────────────────────┘
                     [ + Add someone ]

  ┌───────────────────────────────────┐
  │ left to allocate        0,00 zł ✓ │
  └───────────────────────────────────┘

  [ Allocate 400,00 zł ]
```

**The remainder is on screen the whole time, not computed after commit** (§6).
An allocation that does not sum is the commonest way a clearing balance quietly
stops meaning anything, and it is silent unless the interface refuses to be. It
reads *left to allocate* while there is something left, and carries a check when
there is not — never a bare `0,00`, which is the same glyph as an empty field.

**You are a row in the split, and your row picks a category instead of a
person.** §4 — your own share is not a debt, because a receivable against
yourself would keep the account from ever reaching zero. It is an ordinary
expense out of the pot, and it is the only row that becomes spending, so it is
the only row that shows what it was spent on.

**Direction is stated in words on every counterparty row** (P5). *owes you* —
never a `+` against a bare figure, which on this screen sits directly above a
figure that means something else.

### Web — ≥1024px

One column, centred, at the same width the phone uses. The split is a short
list and a total; width buys it nothing, and a table would invite the
per-person history this screen deliberately does not carry — that is S13.

## 4. Components

| Component | Notes |
|---|---|
| `SegmentControl` | The three split modes. `Even` and `Shares` compute every amount; `Custom` leaves them typed |
| `CounterpartyRow` | Same monogram ramp as S12 (Q10), with the amount as an editable field rather than a read figure |
| `Amount` | Every figure, including the remainder — §4.1's currency affix, tabular numerals |
| `Select` | *+ Add someone*, searchable, with S15's *+ New person or company* in its footer |
| `Chip` | Your row's category, opening S06 |
| `Button(primary)` | *Allocate* — states the amount it will write, because the figure is the point |
| `Banner(warn)` | Shown when the shares do not sum: the remainder stays on the pot and the banner will still be there tomorrow. **Commit is allowed** (§4) |
| `ConfirmDialog` | Not used. Allocation writes debts that are all individually editable afterwards, and a confirm on a screen whose whole job is stating the arithmetic would be asking twice |

## 5. Data

| Reads | Writes |
|---|---|
| `get_balances` — the clearing account's own | `allocate_shares` |
| `get_counterparties` | `create_counterparty` — in place (S15) |
| `find_unsettled` — which pot, and since when | |

**One operation, not N captures.** `allocate_shares` writes every row in one
transaction, so a split is a single audited event rather than four rows that
might half-exist. §8's largest-remainder arithmetic runs inside it, over the
weights the mode produced, never over amounts a client rounded.

**The payer is first in the weights**, which is what makes §5's *"remainder
assigned to the payer explicitly"* true rather than incidental: 100,00 three
ways is 33,34 / 33,33 / 33,33, and the extra grosz lands on the row that is
yours because that row is index 0.

## 6. States

| State | Treatment |
|---|---|
| Loading | The pot's own figure resolves first; it is the number every other figure is measured against |
| Populated | Editing · committing |
| Empty | A clearing account at zero has nothing to allocate, and this screen says so rather than drawing an empty split. Reached only by opening it directly — the banner cannot lead here |
| Error | A refused commit writes nothing. The draft is retained and the reason lands on the row that caused it |
| Offline | The whole screen works. `allocate_shares` is `offlineEligible` — J08 is a restaurant on a Friday night, which is precisely where there is no signal |
| Gated | A share in a currency the pot does not hold is refused: every row of an allocation is denominated in the clearing account's own currency (§6.5). Settling in another currency is S14's job, later, per person |

## 7. Interaction

### Mobile
Pick the mode, then the people. *Even* re-splits on every add and remove, so
adding a fourth person to a three-way split is one tap rather than four edits.
Typing an amount on any row switches the mode to *Custom* and keeps every other
amount where it was — an edit is a statement about one row, never a re-split of
the others behind your back.

*Shares* puts a weight stepper on each row, defaulting every weight to 1, so it
starts as *Even* and diverges only where you say so.

### Web
`Tab` runs down the rows. `Enter` on the last row adds another. The mode
segments take `1` `2` `3`.

### Shared
**Removing your own row is allowed**, and it means the whole pot goes out to
other people — a bill you covered and are owed in full. The remainder then has
to reach zero through the counterparty rows alone, and the screen does not
invent a share for you to make the arithmetic close.

## 8. Rules this screen must obey

- **§6.4** — a clearing account trends to zero. Every row this screen writes
  moves the pot toward zero, and the pot reaching zero is what tells you the
  split is complete.
- **§6.6** — every counterparty row is written with `counterparty_role = 'debt'`,
  set at write time and never inferred. That is what puts it in the debt ledger,
  ages it if the counterparty is a company, and makes it settleable in S14.
- **§6.7** — a contribution is not a debt. This screen writes no contributions:
  money arriving *into* a shared account is J08's other half and belongs to the
  role, not to the split.
- **P4** — amber here means unsettled: not finished, or not fully observed.
- **P5** — direction in words on every row.

## 9. Open questions

1. ~~**What does a share write?**~~ **Decided: an expense out of the clearing
   account, carrying the counterparty and the `debt` role.**

   The alternatives were ruled out by arithmetic rather than by taste. A share
   cannot both credit the pot and create a receivable in one row: on any
   account, money in means debt down (§6.6's `signed_amount`), so a row that
   returns money to the clearing account necessarily says *you* owe *them*.
   Which means the pot has to be **funded first and spent down**, never paid
   from and topped up — and that is what the old ledger did, with 636 of
   `Clearing · PLN`'s 678 rows being transfers.

   Modelling a share as a **transaction line** (§6.10) reads well and was
   rejected for what it drags: `counterparty_balances` folds `transactions` and
   never `transaction_lines`, so §7's balance and its Postgres differential test
   would both have to learn lines to see a share at all. Modelling it as a
   **transfer** was how the old ledger did it, into per-person `Loan` accounts —
   and a person is no longer an account, which is the whole point of §6.6.

2. ~~**Does the pot need its own capture flow?**~~ **Decided: no.** Paying for
   a group is an ordinary transfer into `Clearing · <currency>`, which S31
   already does. A fourth capture mode would be a second way to write a row the
   ledger already has a way to write, and the banner is what turns the transfer
   into a prompt.

3. **Should an allocation be reversible as one act?** A split is one audited
   event and reads as one, but undoing it is four soft deletes. `operations.md`
   has no `restore_transaction` either (S09 §7), so the honest answer today is
   that each row is deleted on its own. Worth revisiting with the restore
   operations, not before.

4. **Does a pot built from several transfers need to name them?** The balance
   is the pot, and `find_unsettled` already names the oldest unconsumed leg for
   the banner. Whether this screen should list *what the pot is made of* is a
   question about a habit nobody has yet — a trip paid for in three
   instalments — and is better answered after the first one.
