# S21 · Settings · Recurring

**Surface** both · **Journeys** J13 · **Frequency** monthly review
**Design** none
**Status** specified · tier 3

---

## 1. Purpose

Keep the 24 migrated rules working, and notice when one has stopped.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| Settings | Recurring | Settings |
| S11 | A projected entry → *edit rule* | S11 |

## 3. Layout

### Both surfaces

List sorted **unhealthy first**. Per row: name, next date, amount, account,
health tag, enabled toggle. Editor holds the RRULE picker, account, category,
counterparty and role, end date.

## 4. Components

| Component | Notes |
|---|---|
| `RuleHealthTag` | `never posted` · `overdue` · `ending soon` · **`amount drifted`** · `healthy` |
| `Toggle` | Enabled |
| `DateField` | Next date, end date |
| `UndoToast` | Disable, delete |

## 5. Data

| Reads | Writes |
|---|---|
| `get_recurring_rules` with occurrence history | `create_recurring` · `update_recurring` · `disable_recurring` |
| Health derived from `next_date` versus materialized occurrences | `materialize_occurrence` — *run now* |

## 6. States

| State | Treatment |
|---|---|
| Loading | List skeleton |
| Populated | Sorted unhealthy first |
| Empty | `EmptyState(first-run)` |
| Error | Invalid RRULE → stated before save. Every rule shows a **plain-language restatement** above the next three dates — *"the last day of every month, indefinitely"* — because a mis-specified rule is caught by comparing words against intent, not dates against dates |
| Offline | Read-only. Materialization is server-side |
| Gated | Editing a rule whose account is archived is refused, with the reason |

## 7. Interaction

**`never posted` is the state this screen exists for.** A rule created more than
one cycle ago with zero occurrences is almost always a bad RRULE or an archived
account, and it is otherwise indistinguishable from one working correctly until
you notice the rent is missing.

*Run now* materializes the next occurrence. It cannot double-post: the unique
index on `(recurring_id, occurrence_date)` rejects a second insert (§6.5).

## 8. Rules this screen must obey

- **§14.4** — projections appear in S11 dashed and tagged `scheduled`, and are
  excluded from every total labelled actual.
- **§6.5** — an occurrence fills exactly once, enforced by the database rather
  than by the scheduler.
- A skipped occurrence is simply an absent row — no tombstone, and the calendar
  keeps showing it as projected so it can be posted late.
- **RRULE, not a bespoke repeat enum** — Money Manager's `ZREPEATTYPE` values
  translate on migration.

## 9. Open questions

1. ~~**Is a three-date preview enough to verify an RRULE?**~~ **Decided: keep
   three dates, add a plain-language restatement.** The rule renders back as a
   sentence — *"the last day of every month, indefinitely"* — above the sample
   dates.

   **The restatement works because it puts the rule in the same medium as the
   intent.** The objection to it is that a sentence generated from the rule
   agrees with the rule, so it cannot expose a discrepancy — but the discrepancy
   is never between the rule and the sentence. It is between both of them and
   what you *meant*. If you intended the last working day, the sentence says
   *the last day* and you catch it immediately, where three dates in autumn look
   correct either way.

   Twelve months of dates would demonstrate the same error in February, but only
   if you read to February.
2. ~~**Amount drift.**~~ **Decided: detect the pattern, propose the update.**
   When a materialized row is edited to a different amount on two or three
   consecutive occurrences, the rule gains an `amount drifted` health state and
   offers to adopt the figure you keep typing.

   **The signal is already in the data.** Those edits are in `audit_log` with
   their actor, so this reads something the system already records rather than
   asking you to notice and remember. It **proposes and never adopts silently** —
   a rule that changed what it posts without being asked would undermine the
   only thing a template is for, which is predictability.

   This makes `RuleHealthTag` four states plus one: `never posted` · `overdue` ·
   `ending soon` · `amount drifted` · `healthy`.
