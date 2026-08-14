# J6 · Review a period

**Frequency** weekly to monthly · **Surface** both
**Screens** S01, S04, S11, S24, S25, S10, S09, S27
**Status** specified

---

## 1. Why this journey exists

Answers *"where did it go"* without exporting anything. Today this requires
building a pivot table in Excel from a sideloaded TSV, which means it happens
rarely and is out of date when it does.

It is also the journey where the two structural distinctions in the data model
finally pay off — **mine versus ours** (§6.7) and **capital versus ordinary**
(§6.8). Both exist so that a period comparison means something; this is where
that is spent.

## 2. Preconditions

A period with transactions. FX rates for the period, or figures render with
their estimate markers (`SPEC.md` §7.6).

## 3. The path

```
S04 Today   or   S01 Dashboard
        │
   ┌────┴──────────────────────────┬──────────────────┐
   │                               │                  │
S11 Calendar                  S25 Reports        S24 Dashboard layout
 scale: day/week/month/year    period picker      preset arrangements
 nav: continuous | stepped     donut · line       per-widget config
 per-day net, density shading  bar · treemap
   │                               │
   └──── tap a day or segment ─────┴──→ filtered S10 Transactions list
                                                    │
                                              → S09 Detail
                                              → S27 Export
```

**Every chart is an entry point, not a terminus.** Tapping a donut segment, a
bar, or a treemap tile lands in a filtered transaction list carrying that
filter visibly — so *"why is Food up 40%"* is two taps from the rows that
answer it. A chart you cannot drill into is a picture, not a report.

## 4. Branches

| At | Condition | Goes to |
|---|---|---|
| Any | Scope changed | **All · Mine · Shared · Business** — a partition, so the three subtotals always sum to All and switching can never double-count (§6.7) |
| Any | Display currency changed | Every figure re-expresses instantly, each row at **its own date's rate**. Nothing is written (§7.0) |
| Reports | Period contains a capital event | Excluded from trends and comparisons **by default, with the exclusion stated** — `2025 spending 34,200 · excludes 1 one-off` (§6.8) |
| Reports | Composition chart | Capped at **5 segments + *other***, each directly labelled with its value (`design-system/07` §7.2) |
| Reports | Tap *other* | Breaks the tail out as a list — a better reading surface for small values than a sliver of arc |
| Calendar | Period contains projections | Rendered dashed, tagged `scheduled`, **excluded from any total labelled actual** (§6.4) |
| Dashboard | Wants a different arrangement | S24 — preset layouts; switching preserves each layout's widget config (§14.5) |

## 5. Failure paths

| Failure | Treatment |
|---|---|
| **No data in range** | `EmptyState(range)` — states the range, and offers **the nearest period that does have data, with its count**: *Nothing in Feb 2026 · Jan 2026 has 148 transactions*. Distinct from `EmptyState(filtered)`, where the scope is doing the excluding; the two have different fixes, so conflating them sends you to the wrong control |
| **Dashboard offline** | Every widget renders its cached value with a last-updated time, behind a page-level freshness banner. A widget that cannot render from cache shows a **skeleton labelled *unavailable offline* — never a zero**, because a zero is a number and a wrong number is worse than an absent one. This is the landing surface, so silence here was the worst instance of the gap (`design-system/08` §8.3) |
| FX rates stale or estimated for the period | Totals render, with the count of rows resting on an estimate stated beside them. A total that quietly mixes quoted and estimated figures is a worse answer than one that admits it |
| Query slow on a wide range | Skeletons matching the shape they replace, never a grey box or a spinner over the whole page |
| Two headline totals adjacent | **Never place *mine* and *ours* where summing them suggests itself.** They measure different things in different frames; adding them is meaningless (§6.7) |

## 6. Rules

- **Both totals, always.** Every screen with a headline figure shows *mine* and
  *ours* — `DualTotal`, never a toggle. Showing one at a time invites reading
  the wrong number, and neither is more real than the other.
- **My spending nets the shared boundary.** Money sent to the shared pot minus
  money drawn back, as one derived line. Gross-only would overstate spending by
  every withdrawal ever made, and after five years that drift is both large and
  invisible (§6.7). The line may go negative, and is shown that way rather than
  floored at zero.
- **Capital events are excluded from comparison, never from record.** A single
  property purchase is 96% of its category and roughly seven times a normal
  year; left unflagged it makes every year-over-year comparison meaningless
  permanently. It stays fully present in balances, search, and the calendar.
- **Conversion is per row at each row's own date**, then summed. Converting an
  aggregate at today's rate would make a 2021 total drift daily (§7.0).
- **Colour is never the only encoding** (P5). Composition charts label each
  segment directly; the income-versus-expense line pairs hue with marker shape
  and end-of-line labels.
- **A calendar cell never shows a count alone.** A number of transactions
  answers nothing — the net figure is always present, with category dots only
  at week and month scale where there is room (Q8).

## 7. Success

| Measure | Target |
|---|---|
| Trust | You believe the numbers **on sight**, without cross-checking in Excel |
| Drill-through | Any figure on any chart reaches the rows behind it in **two taps** |
| Comparison | Year-over-year is meaningful — one property purchase does not dominate the series |
| Frame clarity | *Mine* and *ours* are never confused, and never summed |
| Currency | Switching display currency is instant and writes nothing |
