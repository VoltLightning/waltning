# J13 · Recurring

**Frequency** monthly review · **Surface** both
**Screens** S21, S11, S09, S05
**Status** specified

---

## 1. Why this journey exists

24 rules migrate from Money Manager — rent, salary, subscriptions, utilities.
They serve two purposes here, and the second is new: they save typing, **and
they let the calendar show the future**.

`recurring_transactions.next_date` projects forward, so *"what is coming"* is
answerable from the same surface as *"what happened"* (§14.4). Money Manager
could repeat a transaction; it could not show you next month.

## 2. Preconditions

Accounts and categories exist. Rules may be migrated or created by hand.

## 3. The path

```
S21 Settings · Recurring
        │  rule list · next date · amount · enabled
        │
        ▸ Edit     → RRULE picker · account · category · counterparty
        ▸ Disable  → stops projecting; existing rows untouched
        ▸ Run now  → materialize this occurrence immediately
        │
   PROJECTION
        │  rules project forward into S11
        │  rendered DASHED, tagged `scheduled`
        │  EXCLUDED from any total labelled actual
        │
   MATERIALIZATION
        │  a projection becomes a transaction EXACTLY ONCE
        │
        │  posted row carries:  recurring_id + occurrence_date
        │  UNIQUE (recurring_id, occurrence_date)
        │
        │  ▸ already entered by hand?  → rule's insert REJECTED by the database
        │  ▸ not yet posted?           → posts, advances next_date
        │  ▸ deliberately skipped?     → no row; stays projected
```

## 4. Branches

| At | Condition | Goes to |
|---|---|---|
| S21 | Rule is cross-currency | Both amounts stored, realized rate derived — same shape as any transfer (§7.5) |
| S21 | Rule has a counterparty | The role is part of the rule, not asked at post time |
| S21 | End date reached | Stops projecting; the rule stays for its history |
| S21 | Run now | Posts the next occurrence, which then cannot post again |
| Calendar | Projection tapped | Read-only preview with *post now* and *skip*. A projection is not a transaction until it posts |
| Calendar | Projection has passed its date unposted | Still projected, visually distinct from a future one — an overdue rent is worth noticing |
| S09 | A materialized row is deleted | Soft delete leaves `recurring_id` set, so the occurrence stays filled and the rule does not re-fire into the gap |

## 5. Failure paths

| Failure | Treatment |
|---|---|
| **Double-posting** | **Structurally impossible.** The unique index on `(recurring_id, occurrence_date)` rejects the second insert — the same mechanism `external_id` uses for migration idempotency. Previously this was left to a scheduler remembering what it had done, which is the classic way a ledger acquires two rents in one month |
| Amount changed since the rule was written | Rules carry an amount; a materialized row is editable afterwards like any other. The rule is a template, not a contract |
| Rule fires while offline | Materialization is server-side; nothing is lost, and the calendar shows the projection until it posts |
| Clock or timezone slip | Occurrences key on a **bare date** (§7.0a), not an instant, so a device in another zone cannot re-fire or skip one |
| Account archived under a live rule | Rule disabled with the reason stated, rather than failing silently each month |
| **A rule that has never posted** | `RuleHealthTag` on every row in S21, so a broken rule cannot look like a working one: **`never posted`** (created more than one cycle ago with zero occurrences — almost always a bad RRULE or an archived account), **`overdue`** (next date passed, nothing materialized), **`ending soon`** (end date within one cycle), **`healthy`**. The list sorts unhealthy first. A rule silently failing for two months is indistinguishable from one working correctly until you notice the rent is missing |

## 6. Rules

- **A projection is never counted as actual.** Dashed, tagged `scheduled`, and
  excluded from every total claiming to be actual. A total that silently mixes
  posted and projected amounts is a bug, not a feature (§6.4).
- **An occurrence fills exactly once**, enforced by the database rather than by
  the scheduler.
- **A skipped occurrence is simply an absent row.** No tombstone, no status
  column — the calendar renders it as still-projected, and you can post it late.
- **Disabling stops projection, never history.** Rows already posted are
  ordinary transactions.
- **RRULE, not a bespoke repeat enum.** Money Manager's `ZREPEATTYPE` values
  translate on migration (§8.2), and RRULE covers what people actually want —
  last working day of the month, every second Tuesday — without a schema change
  per case.

## 7. Success

| Measure | Target |
|---|---|
| Correctness | **Never two rents in one month**, under any sequence of manual entry, rule firing, and retry |
| Foresight | The calendar shows what is coming, distinguishably from what happened |
| Effort | Recurring items require no monthly typing |
| Recovery | A missed occurrence is postable late, and an unwanted one is skippable without disabling the rule |
