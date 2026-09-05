# S10 · Transactions list

**Surface** both · **Journeys** J5, J6, J7, J12 · **Frequency** several times a week
**Design** none
**Status** specified · tier 1

---

## 1. Purpose

Find the thing you remember.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| Tab bar | Ledger | — |
| S04 | *Show all* | S04 |
| S25 | Tap a chart segment | S25, filter carried and **visible** |
| S11 | Tap a day → *see as list* | S11 |
| S13 | A counterparty's history | S13, filtered to them |
| S12 / S19 | Drill from a balance or a category | The caller |

**Exit** — a row → S09.

## 3. Layout

### Mobile — 390pt

```
┌─────────────────────────────────────────────────┐
│  🔍  Search payee, note, amount                 │
│                                                 │
│  [Business ✕] [Feb 2026 ✕] [+ Filter]           │  ← active filters as chips
│                                                 │
│  ┌ 1 284 transactions · −18 940,20 zł ───────┐  │  ← running total for filter
│  └───────────────────────────────────────────┘  │
├─────────────────────────────────────────────────┤
│  6 Aug                                          │
│  Corner Café · Eating out        −48,90 zł      │
│  Salary · Employment          +9 200,00 zł      │
│  5 Aug                                          │
│  Shop A · Groceries        62,40 € · 4,0231     │
│                                251,04 zł        │
│  Cash → BANK-A            −500,00 → +500,00 zł  │  ← TransferRow, one row
└─────────────────────────────────────────────────┘
```

**Active filters are chips carrying their value, not their name** — `Business`,
not `Scope: Business`. Each has its own `✕`, and there is a separate clear-all,
because clearing one filter and clearing six are different intentions.

**The running total is the point of the filter bar.** *"What did I spend on the
flat this year"* is a filter plus a total, and if the total is not on screen the
filter has only narrowed a list. On mobile the running total is the screen's
hero figure and sits in a `Card`; the search field, filter chips and the row
list stay on the ground.

When the filtered set contains a capital event, the total **splits into two
lines** — the full figure, and the figure without one-offs (§6.8). Both, always,
neither a setting. One property purchase is 96% of its category, so a `Home`
filter without this reads as broken.

Rows group by date. Foreign rows carry `FxAmount`; transfers render as
`TransferRow` — one row showing both accounts, never two rows to re-pair.

### Web — ≥1024px

Table, not cards: date · brand mark · payee · category · account · scope ·
amount, with the filter bar as a persistent left rail rather than a chip row.
Every column sorts except the brand mark, which carries no header word and no
sort control — a mark is not a value to order rows by, and `Payee` already
names the identity column it leads into, so its header cell is held open and
left blank the way the selection checkbox's is. The rail buys simultaneous
visibility of every filter dimension, which is what makes this the surface for
a real reconciliation session.

Density is the reason this exists separately from the mobile layout — around 40
rows visible against 8, which is the difference between scanning a month and
scrolling one.

## 4. Components

| Component | Notes |
|---|---|
| `Card` | Mobile only — wraps the running total, the screen's hero figure |
| `FilterBar` | Account · category · scope · currency · date range · counterparty. Reports the count each filter excludes (§5.6) |
| `SearchField` | Payee, note, amount, **and receipt contents** — merchant plus line descriptions. A match inside a receipt states which line matched, so the result is explicable rather than surprising |
| `TransactionRow` / `TransferRow` | `BIZ` where business; `FxAmount` where foreign |
| `BrandIcon` | The leading mark on both surfaces — `TransactionRow`'s on mobile, and the desk table's identity column, between the date and the payee. Same component and catalogue as S04 (§14.4b); an unrecognised payee falls back to its monogram rather than to nothing |
| `SwipeAction` | Mobile — short swipe categorize, long swipe edit. **Never delete** |
| `EmptyState(filtered)` | Names the excluding filter and its hidden count |
| `EmptyState(first-run)` | Nothing has ever existed |
| `SegmentControl` | Scope — a partition, so subtotals always sum to All |


**`Needs attention` — a pinned, count-bearing filter chip.** Without it, a row
the grammar guessed at becomes visually identical to one you typed the moment its
pending dot clears, and three weeks later there is no way to find it. Membership
is exactly three predicates: category is `Uncategorized`, a receipt is attached
but unextracted, or a rate is still estimated. Rows carry an amber dot, labelled
in the detail view (P5).

A row captured offline that is **complete** gets no marker — there is nothing to
act on, and that is what keeps the filter drainable to zero.

## 5. Data

| Reads | Writes |
|---|---|
| `search_transactions(filter, page)` | `update_transaction` — via swipe-categorize |
| Running total for the active filter | `categorize_batch` — web multi-select |

## 6. States

| State | Treatment |
|---|---|
| Loading | Skeleton rows in the row's shape; the running total resolves last and shows a skeleton meanwhile rather than a wrong number |
| Populated | Virtualized, both surfaces |
| Empty | **Two distinct states.** `filtered` — *Scope · Business is excluding 1,284 rows*, clear-this beside clear-all. `first-run` — nothing exists, offers S05 and import |
| Error | Query failed → `ErrorState(recoverable)` with retry; the filter bar stays usable so you can narrow and retry |
| Offline | Cached page with its age. Search works over the cache and **says so** — an incomplete result presented as complete is worse than a stated limit |
| Gated | n/a |

## 7. Interaction

### Mobile
Virtualized infinite scroll. Short swipe → category sheet; long swipe → edit.
Nothing destructive on a swipe (`design-system/05` §5.6). Pull to refresh.

### Web
`J`/`K` move, `Enter` opens. The rail is persistent (§3), so `/` and `F` both
reach the same place — the rail's search field — rather than one opening it and
the other only focusing what is already on screen. Shift-click selects a range;
multi-select enables `categorize_batch` behind one confirm stating the affected
count and the target category — not a `DiffCard` (`design-system/05` §5.3):
that component's shape is a per-row before/after, and a batch spans rows that
each carried a different category before, so a single before/after pair would
either lie or say nothing. Sorting is by column header.

### Shared
A filter arriving from another screen is **shown, not silently applied** —
landing here from a chart segment with an invisible filter is how you conclude
your data is missing.

## 8. Rules this screen must obey

- **P1** — foreign rows carry their basis inline.
- **P5** — `BIZ` and direction are text, not tint.
- **§6.7** — the scope segment is a partition; the three subtotals sum to All.
- **§6.1** — a transfer is one row. Rendering two would reintroduce the exact
  defect the data model exists to remove.
- **§6.9** — soft-deleted rows never appear.

## 9. Open questions

1. ~~**Should the running total respect capital exclusion?**~~ **Decided:
   include, and break the total out whenever a capital row is in range.** A list
   is a record, so its total equals its contents — but when the filtered set
   contains a one-off, a second line appears beneath:

   ```
   1 284 transactions
     −412 940,20 zł
     − 34 200,20 excluding 1 one-off
   ```

   Both figures, neither a toggle. The distinction explains itself **at the
   moment it would otherwise confuse**, rather than relying on a tag two hundred
   rows below the number it explains. Excluding by default was rejected: a list
   whose total does not equal its own rows is a surprising property for a ledger
   view, whatever consistency it buys with Reports.
2. ~~**Does search cover receipt OCR text?**~~ **Decided: merchant and line
   descriptions, not the raw response.** Both are already structured columns, so
   this is a GIN index and a join rather than a new pipeline — and it makes a
   business expense provable from its *contents* rather than only its total,
   which is what the evidence trail is for. The raw `ocr_json` stays unindexed:
   it holds confidence scores and model commentary alongside the text, and
   matches against those look like data without being it.
