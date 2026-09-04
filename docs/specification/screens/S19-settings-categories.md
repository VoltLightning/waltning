# S19 · Settings · Categories

**Surface** both · **Journeys** J12 · **Frequency** rare
**Design** none
**Status** specified · tier 3

---

## 1. Purpose

Rename, merge, archive and reparent the taxonomy — safely.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| Settings | Categories | Settings |
| S06 | *Manage categories* | S06 |
| S03 | An agent category proposal | S03 |

## 3. Layout

### Both surfaces

Tree — 15 groups, 59 leaves — with usage counts per leaf and an archived toggle.
A collision finder sits above it. Web shows the tree and the merge preview side
by side; mobile pushes the preview to a sheet.

**`Uncategorized` sits apart, with its count as a trend and one action:**

```
  Uncategorized    194   ↓ from 212 last month
                         [ Review with agent ]
```

The action opens an S03 session pre-seeded with the batch; proposals return
through the ordinary `DiffCard` gate. The entry point lives here rather than
only in S03 because a maintenance job nothing prompts is one that never begins —
and the count is visibly sitting there not shrinking.

## 4. Components

| Component | Notes |
|---|---|
| `SearchField` | Across leaves and groups |
| `Tag` | Usage count · `archived` · `unused` |
| `ComparisonTable` | Merge preview — how many transactions move, and from where |
| `MatchWarning` | The collision finder, reused. Looks for **near**-duplicates (`Groceries` / `Grocery`), since exact ones are already refused by the uniqueness index |
| `ConfirmDialog` | Merge only. It is **not reversible in one step** |
| `UndoToast` | Rename, reparent — both undo by calling the same operation again with the prior value. Archive shows a plain `Toast`: no `restore_category` (or any `restore_*`) operation exists yet, so there is nothing for an undo to call |

## 5. Data

| Reads | Writes |
|---|---|
| `get_category_tree` with usage counts | `rename_category` · `merge_categories` · `archive_category` · `reparent_category` |
| Collision candidates | `convert_leaf_group` |
| `Uncategorized` count, and its trend | opens `categorize_batch` via S03 — gated as any bulk write |

## 6. States

| State | Treatment |
|---|---|
| Loading | Instant from cache |
| Populated | Tree, archived hidden by default |
| Empty | n/a — seeded |
| Error | Rename collides with a sibling → refused by the uniqueness index, naming the existing sibling |
| Offline | Read-only. Structural changes to a taxonomy that other queued writes reference are refused rather than queued. **Not modelled on the phone-alone ledger** (arc 1 has no server to be offline from); this rule applies once one exists |
| Gated | Convert to group refused while transactions reference it; reparent refused across kinds; merge onto a group refused |


**One rule, stated the same way in S06 and S19:** *creating a leaf under an
existing parent queues offline — it can only be referenced by rows you are
creating now. Renaming, moving, merging or deleting an existing node is refused
offline, because it changes the meaning of rows that already exist.*

Previously S06 said category creation queues and S19 said structural changes are
refused, which are the same act described twice. Offline at a market you could
create `Groceries › Market` from the capture sheet and be refused the identical
thing from Settings — and a rule that looks arbitrary is how a person stops
trusting every other refusal.
## 7. Interaction

**Merge is the screen that matters.** It states how many transactions will move
**before** it happens, and says plainly that it is not reversible in one step.
The mapping is recorded in `category_mappings`, so a bad translation is corrected
by re-running rather than by editing thousands of rows.

## 8. Rules this screen must obey

- **`TAXONOMY.md` R1** — group or leaf, never both. Enforced by trigger, so this
  screen surfaces refusals rather than preventing attempts.
- **R3** — a concept lives in exactly one place; the collision finder is how
  that is maintained.
- **Names are not identifiers** — renaming propagates and breaks nothing.
- **Archive, never delete.**
- `Uncategorized` is a queue and its count should be shown as a **trend**, not a
  number.

## 9. Open questions

1. ~~**Should the agent's bulk reclassification be launched from here?**~~
   **Decided: yes — an action on this screen, running through the agent.**
   *Review with agent* sits beside the `Uncategorized` count, opens an S03
   session pre-seeded with the batch, and every proposal still passes the same
   `DiffCard` gate.

   **The capability lives where you notice you need it; the mechanism stays one
   path.** A maintenance job with no prompt is a maintenance job that never
   starts — and the count is right there, visibly not shrinking. A separate
   deterministic bulk editor was rejected: it would duplicate `categorize_batch`
   in a second place, and would be blind to the Polish and Russian descriptions
   that §9.2 says are most of the tail.
2. ~~**The collision finder has nothing to find.**~~ **Decided: keep it, and
   change what it looks for.** Exact sibling collisions are already impossible —
   the uniqueness index on `lower(btrim(name))` refuses them, so a finder for
   those would return zero forever.

   **What it should find is near-duplicates**, which no constraint can prevent:
   `Groceries` and `Grocery`, `Software & tools` and `Software`, created months
   apart from S06's *Create "…"* under different groups. Same mechanism as
   `MatchWarning` (§8.4) — trigram similarity, ranked, showing usage counts so
   the merge decision has the numbers it needs.

   That is a real maintenance surface rather than a vestigial one, and it is the
   thing that keeps R3 true over years rather than just at seed time.
