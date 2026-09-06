# S06 · Category sheet

**Surface** both · **Journeys** J2, J3, J4, J5 · **Frequency** several times a day
**Design** Claude Design project
**Status** specified · tier 1

---

## 1. Purpose

Pick one of 59 leaves without reading 59 things.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| S05 | Category chip | S05, with the selection |
| S02c | Category cell on an import row | S02c |
| S09 | Category field | S09 |
| S07c | A receipt line's category | S07c |

Always returns its selection to the caller. **S06 never writes a transaction** —
it returns a category id, and the caller decides what to do with it.

## 3. Layout

### Mobile — 390pt

```
┌ bottom sheet · 170pt from top, radius-lg ───────┐
│  ── grabber ──                                  │
│  🔍  Search 59 categories                       │
│                                                 │
│  Home  Food  Transport  Travel  Health          │  ← group chips, scrollable
│  Personal  Social  Subscriptions  Financial     │     counts on long-press
│                                                 │
│  ┌───────────────────┬───────────────────┐      │
│  │ Groceries     187 │ Eating out     56 │      │  ← two columns, leaves only
│  ├───────────────────┼───────────────────┤      │
│  │ Delivery       48 │ Alcohol        22 │      │
│  └───────────────────┴───────────────────┘      │
│  ───────────────────────────────────────────    │
│    Uncategorized                      194       │  ← muted, subordinate
│                                                 │
├─ pinned footer ─────────────────────────────────┤
│  [ + New ]              [ Use "Groceries" ]     │
└─────────────────────────────────────────────────┘
```

**Group chips narrow; they never select.** A category is a group or a leaf,
never both (`TAXONOMY.md` R1), and the database enforces it — so tapping `Food`
filters the grid to Food's four leaves and nothing else happens.

**Two columns because leaves are short and groups are few.** The deepest group
is Home at ten leaves, which fits in five rows without scrolling.

**The footer is pinned** so *Use ‹leaf›* is reachable without scrolling back,
and `+ New` sits beside it rather than hidden in an overflow — creating a
category mid-entry is a real flow, not an edge case.

**Counts are shown on the leaves.** They are how you tell `Eating out` (56)
from `Delivery` (48) when the names are equally plausible, and they are what
makes `Uncategorized` visibly a queue.

**Positions never move.** Leaves sort by their seeded `sort` within a group and
stay there — no recency reordering, no usage ranking. This screen is opened
several times a day by a thumb, and a target that has stopped moving can be hit
without being read.

### Web — ≥1024px

Same content as a centred modal, ~560px wide, opened from the same callers.
Search is focused on open, and the grid is navigable with arrows. The extra
width buys a third column, nothing more — this is a picker, and a wider picker
is not a better one.

## 4. Components

| Component | Notes |
|---|---|
| `BottomSheet` | 170pt from top; search, content, **pinned footer** |
| `SearchField` | Leading icon, clear, live results across all leaves regardless of selected group |
| `Chip` | Group filter. ≥44px |
| `Button` | `secondary` *+ New* beside `primary` *Use ‹leaf›* — never two primaries (§3.1) |
| `EmptyState(filtered)` | No match — offers *Create "…"* scoped to the selected group |
| `EmptyState(first-run)` | No categories at all — *No categories yet*, offering *Create a category*, which lands at the top level while no group exists and under the chosen group once one does. A query already typed is carried into the name. A caller that passes no create handler (S10's categorize path) gets the same title with copy that offers nothing, and no footer *New* |

## 5. Data

| Reads | Writes |
|---|---|
| `get_category_tree` — leaves, groups, usage counts | `create_category` — **scoped to the selected group** |

`create_category` from here is a direct write, not a proposal. The agent's
equivalent is a proposal (§11.5), and the asymmetry is deliberate: a person
choosing to create a category has already decided, and a model has not.

## 6. States

| State | Treatment |
|---|---|
| Loading | Cached; the tree is small and changes rarely. No skeleton in practice |
| Populated | Browsing · searching · group-filtered |
| Empty | **Two of them, and they are not the same absence.** `filtered` — a search or a group chip excluded everything: *No matching category*, offering *Create "…"* **only while a group chip is on**, scoped to that group: search covers every leaf and ignores the chip by design, so the chip is not what narrowed the result — it is the only thing on screen that says where a new leaf would go, and without one this empty says *Nothing matches* and offers no create at all. A first category with no group to name is the `first-run` empty's business, below. `first-run` — the tree holds nothing at all, which is what a ledger is before the taxonomy arrives: *No categories yet*, with *Create a category*. The search field says *Search categories* there rather than counting to zero, and nothing says *nothing matches* — no query is why the sheet is empty, and blaming one sends a person to retype instead of to create. **A tree with no groups is not a dead end**: `create_category`'s own `parentId` is nullable and `TAXONOMY.md` R1 makes a node a group *or* a leaf without saying anything about parents — the seeded taxonomy holds a top-level leaf itself — so the first category of an empty ledger is created **at the top level**, the same write S19's create sheet makes, and `convert_leaf_group` is what turns it into a group later. The create row says where it will land instead of offering a chooser with nothing in it. Where groups *do* exist this sheet still asks which one, which is the same scoping the `filtered` empty's *Create "…"* keeps. `Uncategorized` alone does not make a tree non-empty; it is the honest blank (§9.2), and it keeps its own row below either way — **known by the seed's own tag, never by being the root leaf**, now that a created category can be one too |
| Error | Create failed (name collides with a sibling) → inline on the field, naming the existing sibling |
| Offline | Fully functional from cache. `create_category` queues to the outbox and the leaf is usable immediately with a `pending` marker |
| Gated | n/a |


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

### Mobile
Sheet rises with `motion-sheet` 280ms, with a `motion-none` branch. Swipe down
or tap the scrim to dismiss without selecting. Grabber drags. Search focuses on
open **only when invoked from S02c** — mid-capture the keyboard covering the
grid is a cost, mid-review it is not.

### Web
Search focused on open. Arrows navigate the grid, Enter selects, Escape
dismisses. Typing filters immediately.

### Shared
Selecting a leaf returns immediately — **no confirm step.** *Use ‹leaf›* in the
footer is for the case where a leaf is already selected and you are
double-checking; the ordinary path is one tap on the leaf itself.

## 8. Rules this screen must obey

- **`TAXONOMY.md` R1** — only leaves are assignable, enforced by trigger, so a
  group cell is not merely unstyled-as-selectable but genuinely cannot be
  chosen.
- **R2** — two levels. There is no third tier to drill into, which is what
  makes a two-column grid sufficient.
- **P5** — leaves are distinguished by name and count, not by icon colour.

## 9. Open questions

1. ~~**Should recently-used leaves pin to the top?**~~ **Decided: no. Positions
   are stable, always.** A leaf keeps its place within its group permanently, so
   the ten categories you actually use can be hit from muscle memory — and
   muscle memory is the fastest path available, but only while the target does
   not move. Any usage-ordered arrangement trades a one-tap reflex for a read,
   and does it silently.

   The speed comes from search instead: live, already covering all 59 leaves
   regardless of the selected group, and one keystroke away.
2. ~~**`Uncategorized` placement.**~~ **Decided: last in the grid, below a rule,
   muted, with its count.** Present and clearly not a peer of the real leaves —
   subordinate rather than hidden.

   **Sometimes you genuinely do not know, and making that hard produces a wrong
   category instead of an honest blank.** A wrong category is far harder to find
   later than a blank one, so friction here would trade a visible queue for
   invisible errors. Hiding it behind search was tempting for the same reason
   the taxonomy renamed it from `Other`; the count does that work instead — a
   number that is meant to shrink, sitting in the place you would tap.
