# J14 · Accounts

**Frequency** rare · **Surface** both
**Screens** S16, S17, S01, S04
**Status** specified

---

## 1. Why this journey exists

52 active accounts across seven institutions and three countries — where
consumer apps assume three to eight wallets (`SPEC.md` §1.3). The register has
to stay legible at that count, which is mostly a grouping and archiving problem.

Two decisions make this journey carry more weight than "CRUD for accounts":

**Opening balance is what makes migrated balances reconcile** (§8.4). It is
derived during migration as `reported balance − Σ(imported rows)`, not typed —
which is what lets a balances-only migration be accurate without importing five
years of history.

**Ownership is set here**, and it determines which of the two headline totals an
account feeds (§6.7). That is a one-field decision with consequences on every
screen showing money.

## 2. Preconditions

Currencies exist. Nothing else — the first account is created during J1.

## 3. The path

```
S16 Accounts
        │  grouped by kind · balance per account · archived toggle
        │  foreign accounts render FxAmount — local · rate · display (P1)
        │  SharedGroup for ownership = shared, distinct but NOT diminished
        │
        ▸ Add     → name · kind · currency · group
        │           · ownership (own | shared)
        │           · opening balance + date
        │
        ▸ Edit    → all of the above
        ▸ Archive → never deleted; history references it
        ▸ Reorder → within a group

   kinds: cash · bank · card · loan_receivable · loan_payable
          · clearing · investment · deposit · other
```

`loan_receivable` and `loan_payable` survive **only for migration fidelity**.
New debt is recorded against counterparties (J7), because direction is a
property of the balance, not of the account it sits in (O14).

## 4. Branches

| At | Condition | Goes to |
|---|---|---|
| Add | Kind is `clearing` | Gains the trend-to-zero invariant and the unsettled banner (J8) |
| Add | Ownership is `shared` | Cannot be marked business — refused by constraint, and by a second constraint at transaction level (§6.7, §13.1) |
| Add | Currency is archived | Re-pinned. An account's currency cannot be hidden |
| Edit | Currency change with transactions present | **Refused.** Every amount is denominated in the account's currency and enforced by trigger (§6.5); changing it would silently reinterpret every row |
| Edit | Ownership change | Allowed, audited, and stated as retroactive — it moves the account's whole history between *mine* and *ours* |
| Archive | Balance is non-zero | Allowed with the balance stated. A closed account with a residue is a real situation |
| Balance | Account is `shared` and negative | Shown plainly. A jointly-owned account being overdrawn is a real fact and gets **no warning treatment** |

## 5. Failure paths

| Failure | Treatment |
|---|---|
| Name collides | Refused by the unique index on `lower(btrim(name))` — the defect that produced accounts split across Polish `ł` and plain `l` |
| Opening balance typed wrong | Editable, and every balance downstream recomputes. Nothing is stored that depends on it |
| Account deleted | Not offered. `ON DELETE restrict` on every transaction reference, and archiving is the intended path |
| Ownership changed by mistake | Audited with before/after, and reversible — but the two headline totals will have moved, which is why the confirmation states it |
| **No accounts** | `EmptyState(first-run)` on S16 itself, not only inside the wizard. S16 is reachable directly from the tab bar, and someone who skipped or abandoned J1 lands here — so it carries both actions the wizard offered: create an account, or import from Money Manager (`design-system/08` §8.1) |

## 6. Rules

- **Archive, never delete.** History references accounts, and a deleted account
  makes five years of rows unreadable.
- **Opening balance is derived on migration, entered by hand only for accounts
  created afterwards.** It is the mechanism the verification gate rests on.
- **Shared accounts are ordinary accounts.** They have balances, take
  transactions and receipts, and can go negative. They belong to a different
  total, which is not the same as being lesser — `SharedGroup` is visually
  distinct but **not diminished**.
- **Shared is never business.** Ownership and tax scope are independent fields,
  but that combination is invalid and constrained against at both levels.
- **A foreign account's balance never travels without its rate** (P1).
- **Kind is not decoration.** `clearing` buys an invariant, `loan_*` marks
  migration heritage, and the rest drive grouping — Money Manager left `ZTYPE`
  at 0 on all 68 accounts, which is why its taxonomy had to be reverse-engineered
  from group names and memo text (§6.3).

## 7. Success

| Measure | Target |
|---|---|
| Legibility | 52 accounts remain scannable — grouping and archiving carry it, not search |
| Reconciliation | Opening balances make every migrated account match **to the cent** |
| Frames | Every account's contribution to *mine* versus *ours* is unambiguous |
| Safety | No edit can silently reinterpret existing amounts |
