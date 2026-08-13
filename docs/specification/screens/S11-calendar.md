# S11 · Calendar

**Surface** both · **Journeys** J5, J6, J13 · **Frequency** weekly
**Design** none
**Status** specified · tier 1

> Absorbs the former S23 (Calendar · web). It was the same component at a wider
> density, which is what a web subsection is for.

---

## 1. Purpose

Answer *what happened in this period* — the question you cannot phrase as a
search.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| Tab bar | Calendar | — |
| S01 | `calendar` widget | S01 |
| S06 → J6 | Review a period | The caller |
| S21 | *See projections* | S21 |

**Exits** — an entry → S09 · a day → day scale · *see as list* → S10 filtered
to that period.

## 3. Layout

Four scales, two navigation modes, **one component tree** — not four screens.
Scale and navigation are independent, and both persist.

### Mobile — 390pt

```
┌ period header ──────────────────────────────────┐
│  ‹   August 2026   ›              Today         │
│  −3 210,40 zł  ·  84 entries                    │
├─────────────────────────────────────────────────┤
│  [Day] [Week] [Month] [Year]      [⇅ stepped]   │
├─────────────────────────────────────────────────┤
│  Mo   Tu   We   Th   Fr   Sa   Su               │
│               1    2    3    4    5             │
│   6    7    8    9   10   11   12               │  ← density from the ramp,
│  ▓▓   ░░   ▒▒   ░░   ──   ▓▓   ▒▒               │     figure always present
│ −340  −12  −86  −20        −210  −64            │
│  13   14   15   16   17   18   19               │
│                          ╌╌╌╌  ← projected      │
└─────────────────────────────────────────────────┘
```

| Scale | Cell | Shows |
|---|---|---|
| Day | `TransactionRow` | Chronological entries, running day total, projections last |
| Week | `DayCell` | Seven columns — net, count, category dots |
| Month | `DayCell` compact | Grid — per-day net, density shading |
| Year | `MonthCell` | Twelve tiles — month net plus a daily sparkline. **One figure**, scope from the shell; both totals live in the period header, which is the headline (§6.7) |

**Density shading is reinforcement, never the encoding.** A heavy day and a
moderate day are adjacent steps on a single-hue ramp, so every cell carries its
figure as text (Q8, P5). A count alone is never shown — a number of transactions
answers nothing.

### Web — ≥1024px

Same four scales, same two modes, materially more per cell. Week and month cells
gain **per-day entry previews** — the top two or three rows by magnitude with
payee and amount — rather than only a net. That is the whole reason a wide
calendar is worth having: a month grid you can read without opening anything.

Year gains a twelve-column strip with the sparkline at usable height.

## 4. Components

| Component | Notes |
|---|---|
| `Calendar` | `scale` · `navigation` · `anchor` · `scope` |
| `DayCell` | States: empty · has entries · **today** · selected · projected-only |
| `MonthCell` | Net plus `Sparkline` |
| `PeriodHeader` | Label, prev/next, *Today*, period total |
| `ScaleSwitcher` | `SegmentControl`, four options |
| `NavModeToggle` | Continuous ⇄ stepped, remembered |
| `TransactionRow` | Day scale, and web cell previews |
| `EmptyState(range)` | Offers the nearest period with data |

## 5. Data

| Reads | Writes |
|---|---|
| `search_transactions(period)` grouped by day | — |
| `get_projections(period)` from `recurring_transactions` | — |
| Period totals, actual and projected **separately** | — |

## 6. States

| State | Treatment |
|---|---|
| Loading | Skeleton grid in the real grid's shape — the cell layout is stable, only figures resolve |
| Populated | As drawn |
| Empty | `EmptyState(range)` — *Nothing in Feb 2026 · Jan 2026 has 148 transactions*, with one tap to go there |
| Error | Query failed → `ErrorState(recoverable)`; the header and scale switcher stay live |
| Offline | Cached period with its age. Adjacent periods that were never cached render as skeleton cells rather than empty ones — an uncached day and a day with no spending must not look alike |
| Gated | n/a |

**The offline distinction is the subtle one here.** An empty cell and an
unloaded cell are the same shape, and conflating them turns a connectivity
problem into a false statement about your spending.

## 7. Interaction

### Mobile
Continuous mode: virtualized infinite scroll in **both** directions — roughly
2,100 days from 2020, so windowing is mandatory rather than an optimisation.
Stepped mode: swipe between periods, edges snap. Tap a day → day scale. Pinch is
not used; the scale switcher is explicit.

### Web
Arrows move by period, `↑`/`↓` change scale, `T` jumps to today. Hover on a cell
reveals its entries without navigating. Continuous mode scrolls; stepped mode
pages.

### Shared
**Switching scale keeps the anchor date.** Month → day lands on the day you were
looking at, not on today. That is the single most common calendar annoyance, and
it is stated here as a requirement rather than left to implementation.

## 8. Rules this screen must obey

- **P1** — a day containing foreign transactions shows its net in the display
  currency; opening the day reveals each entry with its own basis.
- **P5** — density shading pairs with the figure, always.
- **§6.4 / §14.4** — projections render **outlined and tagged `scheduled`**, and
  are excluded from any total labelled actual. A total that silently mixes
  posted and projected amounts is a bug.
- **Q9** — the calendar complements S10 and never replaces it.

## 9. Open questions

1. ~~**Do projected and actual totals both belong in the period header?**~~
   **Decided: actual is the figure; projected sits beneath it, labelled.**

   ```
   August 2026
     −3 210,40 zł          84 entries
     plus 4 200,00 scheduled
   ```

   Two figures, **never summed into one**. The scheduled line takes the same
   muted, dashed treatment as the projected cells it summarises, so the visual
   language is consistent from grid to header. This satisfies §6.4 literally —
   no total labelled actual contains a projection — while still answering *what
   is still coming this month*, which is most of why you open a calendar rather
   than a list.

   A projected end-of-period figure was rejected: it is a forecast, and putting
   it in the same typography as a measurement is exactly the conflation §6.4
   exists to prevent.
2. ~~**Should the year scale offer a scope segment?**~~ **Decided: no — one
   figure per tile, scope from the shell.** Same as day, week and month, none of
   which carry their own scope control.

   **§6.7's both-totals rule is about headline figures, and a month tile in a
   twelve-up grid is a data point.** The period header above the grid is the
   headline and carries both; the tiles carry one number and a sparkline, which
   is what makes the year view legible at all. Two figures per tile would make
   each one three rows tall and the grid would stop fitting twelve.
