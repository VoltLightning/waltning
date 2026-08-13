# Calendar

A time-shaped view of the ledger (`SPEC.md` §14.4). One component tree, four
scales, two navigation modes — not four screens.

### 6.1 `<Calendar>`

```
props: scale       "day" | "week" | "month" | "year"
       navigation  "continuous" | "stepped"
       anchor      Date
       scope       all | personal | business
```

Scale and navigation are independent and both persist. Switching scale keeps
the anchor date, so moving month → day lands on the day you were looking at
rather than resetting to today — the single most common calendar annoyance.

### 6.2 Scales

| Scale | Cell | Shows |
|---|---|---|
| `CalendarDay` | `TransactionRow` | Chronological entries, running day total, projected items last |
| `CalendarWeek` | `DayCell` | Seven columns; net figure, count, category dots |
| `CalendarMonth` | `DayCell` compact | Grid; per-day net, density shading from the green ramp |
| `CalendarYear` | `MonthCell` | Twelve tiles; month net plus a daily sparkline |

`<DayCell>` states: empty · has entries · **today** · selected · projected-only
· over-budget (if budgets ever land, N7).

**Density shading uses the ramp**, which puts it straight into the
colour-independence problem (Q2) — a heavy day and a moderate day are adjacent
steps. Cells therefore carry the figure as text, and shading is reinforcement,
never the sole encoding.

### 6.3 Navigation

| Mode | Mechanics |
|---|---|
| `continuous` | Virtualized infinite scroll in **both** directions. Sticky header updates as period boundaries pass. ~2,100 days from 2020 to now, so windowing is mandatory, not an optimization |
| `stepped` | One period per page. Swipe or arrow. Edges snap; the header names the period and stays fixed |

Shared: `<PeriodHeader>` (label + prev/next + *Today*), `<ScaleSwitcher>`
(segment control, 4 options), `<NavModeToggle>`.

### 6.4 Projected entries

Recurring rules (`SPEC.md` §6.2) project forward, so the calendar shows what is
coming as well as what happened. Projected cells are outlined rather than
filled, carry a `scheduled` tag, and are **excluded from any total labelled
actual**. A total that silently mixes posted and projected amounts is a bug,
not a feature.

**`<PeriodHeader>` therefore carries two figures, never one.** The actual total
is unqualified; beneath it, in the same muted dashed treatment as the projected
cells, `plus 4 200,00 scheduled`. They are never summed, and no forecast of
where the period will land is offered — a prediction set in the same typography
as a measurement is precisely the conflation this rule exists to prevent.
