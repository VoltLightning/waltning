# J12 · Maintain categories

**Frequency** rare, but overdue · **Surface** both
**Screens** S19, S06, S10, S03
**Status** specified

---

## 1. Why this journey exists

Money Manager has **122 categories, 41 of which were never used once**, 15 names
carrying trailing spaces as collision workarounds, 13 documented name
collisions, and self-nesting like `Beauty > Beauty`. Nothing in that app could
fix any of it.

The new taxonomy is 59 leaves across 15 groups, built on one rule that
eliminates most of the old mess: **a category is a group or a leaf, never both**
(`TAXONOMY.md` R1). That rule is now enforced in the database, not merely
stated — which is what makes this journey safe to expose at all.

It also owns `Uncategorized`, which is deliberately **a queue, not a
destination**. It should visibly shrink. Calling it `Other` is how 194 rows
ended up there.

## 2. Preconditions

The taxonomy is seeded. Merges and reparents assume transactions exist, since
otherwise there is nothing to move.

## 3. The path

```
S19 Settings · Categories
        │  tree · usage counts per leaf · archived toggle
        │
        ▸ Rename          → propagates everywhere; history unaffected,
        │                   because names are not keys (§6.1)
        │
        ▸ Merge           → pick the survivor
        │                   PREVIEW: n transactions will move
        │                   confirm — NOT reversible in one step
        │
        ▸ Archive         → hidden from pickers, history keeps working
        │
        ▸ Reparent        → move a leaf to another group
        │                   refused across kinds (income ↛ expense)
        │
        ▸ Find collisions → the 13 documented duplicate names
        │
        ▸ Convert         → leaf ⇄ group
                            refused if it would strand transactions
```

**The agent path.** *"Everything from that shop is groceries"* is
`categorize_batch` — a bulk write, gated by one `DiffCard` stating the affected
count (J9). This is the practical route for the 194 `Uncategorized` rows and for
the misclassified history: rows literally described "Groceries" currently sit
under `Household`, alongside at least one debt settlement.

## 4. Branches

| At | Condition | Goes to |
|---|---|---|
| Merge | Survivor is a group | Refused — only leaves hold transactions |
| Merge | Both have transactions | Preview states the total that will move and from where |
| Reparent | Target group has a different `kind` | Refused. An income leaf under an expense group would be offered by the wrong picker and would sum into the wrong side of every report |
| Convert leaf → group | Leaf still has transactions | Refused, naming the count. Recategorise or merge first |
| Convert group → leaf | Group has children | Refused |
| Archive | Category has transactions | Allowed — history keeps working, the leaf disappears from pickers |
| Usage count | Zero | Safe to archive. 41 of the old 122 were in this state |

## 5. Failure paths

| Failure | Treatment |
|---|---|
| **Merge is not reversible in one step** | Stated before commit, not after. The mapping is recorded in `category_mappings`, so a bad translation is corrected by re-running rather than by editing thousands of rows (`TAXONOMY.md` §4.2) |
| Rename collides with a sibling | Refused by the sibling-uniqueness index on `lower(btrim(name))`, scoped to parent and kind — the same index that lets `Other` legitimately exist under two different groups |
| Reparent orphans a leaf | Impossible: `parent_id` is `ON DELETE restrict` |
| A category is deleted | Not offered. Reference data is archived, never deleted, because history references it (§6.9) |
| Agent proposes a new category | Proposal only, gated (§11.5). The guardrail that stops a dynamic taxonomy becoming 400 junk entries |
| Bulk recategorisation is wrong | One audited write with an actor; reversible by another, and every affected row keeps its history |

## 6. Rules

- **Merge is the screen that matters.** It must state how many transactions move
  **before** it happens, and say plainly that it is not reversible in one step.
- **Names are not identifiers.** Renaming propagates and breaks nothing —
  precisely the defect the UUID keys were introduced to fix.
- **Only leaves are assignable, and the database enforces it.** R1 was stated
  everywhere and enforced nowhere; it is now a trigger on both `transactions`
  and `transaction_lines` (§6.5).
- **`Uncategorized` is a queue.** It should visibly shrink over time, and the
  interface should show its count as a trend rather than a static number.
- **Archive, never delete.** History references it.
- **The old data is genuinely misclassified**, so an agent-assisted
  reclassification pass is the expected route — not an admission of failure
  (`TAXONOMY.md` §6).

## 7. Success

| Measure | Target |
|---|---|
| Collisions | Zero. The 13 documented ones are resolvable from this screen |
| Dead weight | No leaf with zero lifetime transactions survives a year unarchived |
| `Uncategorized` | Trends **down**, and its count is visible enough to nag gently |
| Safety | No merge or reparent can strand a transaction or cross a kind boundary |
| Recovery | A bad bulk recategorisation is undone by another bulk operation, with both in the audit trail |
