# S37 · People & companies

**Surface** both · **Journeys** J2, J7 · **Frequency** occasional
**Design** [S37.html](design/S37.html)
**Status** specified · tier 2 · not implemented

---

## 1. Purpose

Find and maintain the people and businesses involved in payments without
confusing a saved name with an outstanding debt.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| Settings | People & companies, beside Categories/Currencies | Settings |
| S05 / S09 | Who → Add | S15, then preserved caller draft |
| S37 | New / row Edit | S15, then S37 with search preserved |
| S37 | Tap saved row | S13 in All activity, then S37 |

## 3. Layout

### Mobile — 390pt

Heading **People & companies**, New action, search, then **People** and
**Shops & services** groups. Rows show name, kind and linked-transaction count;
no debt figure is substituted for usage. Empty groups disappear. A footer opens
Archived and states the count. Recent free text belongs to Who's picker, not
this saved directory. No placeholder entry represents an unknown shop.

### Web — ≥1024px

The same groups in a bounded list with a separate usage column; search and New
stay above it. Enter opens activity; an explicit Edit action opens S15. Between
390 and 1024 the phone layout stretches. This screen needs no dashboard grid.

## 4. Components

| Component | Notes |
|---|---|
| `SearchField` | Name search with clear and retained query |
| `CounterpartyPicker` | Reuse row identity vocabulary; directory is not a selection dialog |
| `Button` | New, Edit, Archived, Retry; 44px targets |
| `EmptyState` | Directory empty versus no search results |
| `Skeleton` | Loading list |
| `MatchWarning` | S15 handles reviewed duplicate decisions |

## 5. Data

| Reads | Writes |
|---|---|
| `get_counterparties` | `create_counterparty` · `update_counterparty` via S15 |
| `search_transactions` | `merge_counterparties` · `unmerge_counterparties` via S15 |
| `counterparty_balances` for archive eligibility | `record_distinct_counterparties` via S15 |

`SPEC.md` §6.6.1 defines both-link counts, snapshots and identity migrations.
Counts include each live transaction once. Group membership follows saved kind,
not spending category, brand recognition, or debt history.

## 6. States

| State | Treatment |
|---|---|
| Loading | Skeleton, no false zero counts |
| Populated | Grouped list with search and New |
| Empty | No saved entries → explain optional saving and offer New; no matches → retain query and offer New |
| Error | Keep query/list when available; show Retry, not an empty directory |
| Offline | Full local browsing and creation; matching scope is stated in S15 |
| Gated | Archive refused while a balance remains open, with a link to its debt detail |

## 7. Interaction

### Mobile

Tap a row for all activity, explicit Edit for maintenance. Return restores query
and scroll. New asks Name and kind; optional fields stay collapsed. Cancelling
creates nothing and returns to the same list.

### Web

Tab reaches search, New, row activity, row Edit, Archived in that order. Enter
activates the focused action; Escape closes an editor without committing its
changes. Groups are semantic headings and icons have text equivalents.

**Shared:** archiving preserves history and excludes the party from new choices.
Rename preserves transaction text. Merge previews the affected count and asks
explicitly; unmerge refuses to overwrite subsequent identity edits. No bulk
linking of historical free text happens implicitly.

## 8. Rules this screen must obey

- `SPEC.md` §6.6.1 owns party identity and history; §6.6 owns debt arithmetic.
- S15 owns duplicate review; the directory never silently merges.
- S12 owns obligations; being in this directory does not place a row there.
- P2: suggestions remain distinguishable from a person's choices.

## 9. Open questions

1. **Separate merchant database?** Decided: one saved directory with explicit
   person/company kind. Separate databases would split identity when a company
   is owed money; grouped presentation supplies the needed distinction.
2. **Save every typed name?** Decided: no. Recent text stays usable without a
   directory entry; explicit Add or an approved agent proposal creates one.
