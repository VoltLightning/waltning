# J8 · Group expense

**Frequency** weekly · **Surface** mobile
**Screens** S31, S36, S12, S13, S14, S01, S04
**Status** specified

---

## 1. Why this journey exists

The clearing-account journey (`SPEC.md` §6.4). `Clearing · PLN` is the **third
most active account in the system** — 678 transactions, 636 of them transfers,
with notes reading *"dinner, split four ways"* or *"weekend trip — total"*.
`Clearing · BYN` does the same in a second currency.

You pay for a group, then allocate each person's share out to them. The account
is a wash account, which buys a genuinely useful invariant: **a clearing account
should trend to zero.** A persistent non-zero balance means a group expense was
paid and never allocated.

**This is the capability the account model could not provide.** Previously the
clearing balance told you *that* something was unallocated. Now it tells you
*who*.

## 2. Preconditions

A clearing account exists (`kind = 'clearing'`), and the money you laid out has
been transferred into it. Counterparties are created in place, so nobody needs
to exist first.

## 3. The path

```
you pay for the group
        │
   S31 Transfer → Bank A · PLN  ──400,00──▶  Clearing · PLN
        │          the full amount, one ordinary transfer
        │          the pot is FUNDED, and allocation spends it down
        │
        └─ the balance is now non-zero → S01/S04 unsettled banner
                       "a group expense was paid but never allocated"
                       one action: allocate
        │
   S36 ALLOCATE
        │
        │   split mode:  ▸ Even        n ways, remainder to the payer
        │                ▸ Shares      weights, e.g. 2·1·1
        │                ▸ Custom      per-person amounts
        │
        │   each person's share → an EXPENSE out of the pot,
        │                         counterparty + role = DEBT
        │   YOUR OWN share      → an EXPENSE out of the pot,
        │                         a category, NO counterparty
        │   UNALLOCATED REMAINDER ALWAYS VISIBLE
        │
   every share written → the clearing balance is ZERO
        │
        ├─ zero      → done, and the banner is gone
        └─ non-zero  → the banner stays; shares are still missing
        │
   CHASE   → S12 shows WHO has not settled
        │
   SETTLE  → S14, per person (J7) — into any account, and the
             pot is not touched again
```

**The pot is funded, not drained, and that is forced rather than chosen.** A
share cannot both credit the clearing account and create a receivable in one
row: on any account, money in means debt down (§6.6's `signed_amount`), so a row
returning money to the pot necessarily says *you* owe *them*. So the money goes
**in** first, as a transfer, and each share takes its portion back out. The old
ledger did the same thing for the same reason — 636 of `Clearing · PLN`'s 678
rows are transfers.

**Which is what makes §6.4's invariant literally true.** The pot reaches zero
exactly when every share has been written, yours included. A non-zero clearing
balance means shares are missing, and nothing else — not a payment waiting to be
repaid, not a rate, not a rounding. Settlement happens later and elsewhere: when
someone repays, the money lands in whatever account you name and their debt
clears. The pot is already at zero and stays there.

## 4. Branches

| At | Condition | Goes to |
|---|---|---|
| Allocate | Person unknown | S15, created in place |
| Allocate | Your own share | An expense out of the pot with a category and **no** counterparty — you do not owe yourself. Removing the row entirely is allowed and means you are owed the whole bill |
| Allocate | Shares do not sum to the total | Remainder shown; commit allowed, balance stays non-zero, banner persists |
| Allocate | Someone paid you back immediately | Allocate then settle in one pass — the balance opens and closes, and the history records both |
| Banner | Tapped | S36, opened on that pot — the balance that is left to allocate, not a list of transactions |
| S12 | Filtered to a clearing account | Who owes against that pot specifically |

## 5. Failure paths

| Failure | Treatment |
|---|---|
| Allocation does not sum to the total | **The commonest way a clearing balance quietly stops meaning anything.** The unallocated remainder is always on screen during allocation, not computed after commit |
| Rounding on an even split | Remainder assigned to the payer explicitly, never distributed silently — three ways on 100,00 is 33,34 / 33,33 / 33,33 and the interface says which is which |
| Clearing balance non-zero for another reason | The banner states the amount and the oldest unallocated transaction, so a genuine long-running pot is distinguishable from a forgotten dinner |
| Someone settles in a different currency | J7's settle sheet — two amounts, editable rate, residual stated |
| **Contribution mistaken for a debt** | Prevented by role: a co-owner's inflow to a shared account is `contribution` and never enters `counterparty_balances` (§6.7). The two journeys look similar and mean opposite things |

## 6. Rules

- **The unallocated remainder is always visible during allocation.** An
  allocation that does not sum is the commonest failure, and it is silent unless
  the interface refuses to be.
- **A clearing account trends to zero, and a non-zero balance is a warning with
  one action.** Not a number on a dashboard — a banner naming what it means and
  what to do (`Banner variant=warn`, P4).
- **Each share is a debt, not a note.** Role `debt` (§6.6), so it appears in the
  counterparty ledger, ages if the counterparty is a company, and can be
  settled. The old model could only record the name in free text.
- **Your own share is not a debt.** It is written out of the pot as an ordinary
  expense with a category and no counterparty — the last row of the split, and
  the one that takes the balance to zero. Modelling it as a receivable against
  yourself would make the account never reach zero; leaving it unwritten would
  leave the banner firing after a correctly-split dinner.
- **Amber here means unsettled**, which is one instance of the single meaning P4
  now carries: not finished, or not fully observed.

## 7. Success

| Measure | Target |
|---|---|
| Allocation | A four-way dinner split in **under 20 seconds**, from the paid transaction |
| Invariant | The clearing balance returns to zero the moment a group expense is fully **allocated** — before anyone has repaid a grosz |
| Attribution | *"Who hasn't paid me back for the trip"* is answerable by name, not by amount |
| Visibility | No allocation is ever committed with a hidden remainder |
