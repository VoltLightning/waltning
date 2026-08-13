# J5 · Find and fix

**Frequency** several times a week · **Surface** both
**Screens** S10, S11, S09, S06, S07c, S15
**Status** specified

---

## 1. Why this journey exists

Everything created must be findable and fixable. This is the journey that makes
every other one recoverable — a mis-keyed amount, a wrong category from the
import queue, a receipt attached to the wrong row.

It is also where the audit trail earns its place. When you are your own
accountant, *"why is this categorized this way?"* needs an answer eighteen
months later, and the answer belongs on the transaction rather than in a
settings screen nobody opens (`SPEC.md` §6.1).

## 2. Preconditions

Transactions exist. Nothing else.

## 3. The path

Two entry points, because there are two genuinely different ways people look for
a transaction.

```
"I remember something"              "what happened around then"
        │                                    │
   S10 Transactions list             S11 Calendar (both surfaces)
   search · filter · scroll          day / week / month / year
   running total for the filter      continuous | stepped
        │                                    │
        └──────────────────┬─────────────────┘
                           │
                  S09 Transaction detail
                     amount + FX basis · account · category · date
                     scope · note · counterparty + role
                     receipt · line splits · audit history
                           │
                      ▸ Edit          → inline, save
                      ▸ Split         → line editor
                      ▸ Attach receipt → J3
                      ▸ Change scope  → business / personal, audited
                      ▸ Delete        → soft, recoverable
```

## 4. Branches

| At | Condition | Goes to |
|---|---|---|
| S10 | Filter by counterparty | Same list, scoped — the bridge into J7 |
| S10 | Row is a transfer | `TransferRow` — both accounts, one row, never two |
| S11 | Tap a day | Day scale, **anchor preserved** — switching scale never resets to today |
| S11 | Cell is projected only | Read-only. A projection is not a transaction until it posts (J13) |
| S09 | Has a receipt | Viewer with the extraction beside it, both retained permanently |
| S09 | Add a breakdown | Line editor, available with or without a receipt (§6.10). The parent keeps the total, so balances cannot move |
| S09 | Flip to business | Refused if the account is `shared` (`SPEC.md` §6.7); otherwise written to `audit_log` with the actor |
| S09 | Edit the FX rate | Marks the row `manual`, amber, travelling with it into every list (P1, P4) |
| S09 | Delete | Soft. `deleted_at` set; recoverable, and every read path filters it out |

## 5. Failure paths

| Failure | Treatment |
|---|---|
| **No results** | `EmptyState(filtered)` — and it **names the excluding filter with the count it is hiding**: *Scope · Business is excluding 1,284 rows*, with one tap to clear that filter and a separate one to clear all. A stale scope segment is the usual cause, and a bare "no results" sends you hunting through the filter bar. Distinct from `EmptyState(first-run)`, which means nothing has ever existed here (`design-system/08` §8.1) |
| **Offline** | Reads serve the local cache behind a page-level `Banner(neutral)` stating **freshness rather than failure** — *showing data as of 14:06*. Edits queue to the outbox and the row carries a `pending` marker, reading as saved because it is. The detail screen's audit history is the one region that states it may be incomplete offline, since it is the thing you consult precisely when you distrust a row |
| Edit conflicts with another device | Last-write-wins, but **the outbox carries a client UUID** so a retried write cannot become a second row (`SPEC.md` §14.3) |
| Edit fails server-side | The draft is retained; the row is not left half-saved |
| Deleting a transaction with a receipt | Receipt survives the soft delete — the evidence outlives the row it was attached to |
| Category was archived after the row was written | Still renders; archiving hides from pickers and never breaks history (§7.0) |

## 6. Rules

- **The calendar complements the list; it never replaces it** (Q9). The list
  answers *"find the thing I remember"* — search, payee, amount. The calendar
  answers *"what happened then"* — a period you can point at but not name. Both
  are entry points to the same detail screen.
- **Audit history is on the detail screen**, not hidden in settings. Who changed
  what, when, and as which actor — `user`, `agent`, `import`, or `migration`.
- **Every amount carries its basis** (P1). The detail screen is where
  `local · rate · display` is fully expanded, including which source the rate
  came from and whether it was synced, manual, or estimated.
- **Deletion is soft, always.** A hard delete in a financial ledger is rarely
  the right default, and Money Manager carried 253 deleted rows it never purged
  — the same escape hatch is wanted (§6.9).
- **Editing a machine-classified row does not erase how it got there.** The
  import reason and the rule that fired stay visible in the audit trail after
  the category is corrected; that is how you learn the rule was wrong.

## 7. Success

| Measure | Target |
|---|---|
| Recall path | A half-remembered transaction found in **under 15 seconds** from either entry point |
| Scale switching | Month → day lands on the day you were looking at, never on today |
| Explicability | Any row's category can be explained from its own detail screen, eighteen months later |
| Safety | No edit or delete is unrecoverable; every one is attributable to an actor |
