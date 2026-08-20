# S25 · Reports

**Surface** wide · **Journeys** J6, J11 · **Frequency** weekly to monthly
**Design** none
**Status** specified · tier 2

---

## 1. Purpose

Compare periods and drill into categories, without exporting anything.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| Nav | Reports | — |
| S01 | Any chart widget | S01 |
| S11 | *See as report* for a period | S11 |

**Exits** — any chart element → S10 filtered · S27 to export the current view.

## 3. Layout

### Mobile
Not supported at phone width. Charts at 390pt reduce to a single donut and a
total, which S01's widgets already give at thumb scale. A dense comparison
surface crammed into a phone would be a worse version of both — a density
limit, not a backend one. Given the width (RN Web, DeX, an iPad), the same
phone renders the same reports screen (`architecture/14` §14.4).

### Web — ≥1024px

```
┌ period ─────────────────────────────────────────────────────────┐
│  [Month][Quarter][Year][YTD]  [ 1 Jan 2026 – 6 Aug 2026 ]        │
│  vs  [ same period last year ▾ ]                                 │
├─────────────────────────────────────────────────────────────────┤
│  spent 34 200,00 zł    excludes 1 one-off (see detail)           │
│                                          ▲ 12% vs 2025           │
├──────────────────────────┬──────────────────────────────────────┤
│  donut · composition     │  line · income vs expense            │
│  5 segments + other      │  ● income solid  ▲ expense           │
│  each directly labelled  │  end labels, not legend lookup       │
├──────────────────────────┴──────────────────────────────────────┤
│  ComparisonTable                                                 │
│  Category         2026        2025       Δ                       │
│  Home           12 400     10 900    ▲ 14%                       │
│  Food            8 210      8 640    ▼  5%                       │
├─────────────────────────────────────────────────────────────────┤
│  Treemap — category deep dive                                    │
└─────────────────────────────────────────────────────────────────┘
```

**Every chart element is an entry point.** Tapping a segment, a bar, or a tile
lands in S10 with the filter carried **and visible**. A chart you cannot drill
into is a picture, not a report.

## 4. Components

| Component | Notes |
|---|---|
| `PeriodPicker` | Presets **plus** an arbitrary range. Comparison defaults to the **same period last year**, capital excluded and stated |
| `DonutChart` | 5 segments + *other*, each directly labelled with its value |
| `LineChart` | Hue **plus** marker shape and end-of-line labels (§7.1) |
| `BarChart` | Month over month; increases in spend take `negative` ink |
| `Treemap` | Tiles ≥ ramp 500 use white ink; ≤ 400 use `ink` |
| `ComparisonTable` | Period × metric with deltas; capital exclusions stated inline |
| `EmptyState(range)` / `EmptyState(filtered)` | Distinguished |

## 5. Data

| Reads | Writes |
|---|---|
| `spend_by_category(period, scope)` | `add_widget` — *Pin to dashboard*, carrying the current period, scope, chart and filter |
| `compare_periods(a, b)` | — |
| `income_vs_expense(period, granularity)` | — |
| `dashboard_layouts`, to choose a destination | — |

Granularity follows the range: daily ≤ 3 months, weekly ≤ 1 year, monthly
beyond.

## 6. States

| State | Treatment |
|---|---|
| Loading | Skeletons in each chart's own shape; the headline total resolves last rather than showing a figure that then changes |
| Populated | As drawn |
| Empty | **Two distinct** — `range` (nothing in this period, offers the nearest with data) and `filtered` (the scope is excluding it, names the count) |
| Error | Per chart, not page-level |
| Offline | Cached with age; the period picker is limited to cached ranges and **says which** |
| Gated | n/a |

## 7. Interaction

### Web
Arrows move the period, `C` cycles chart type, `Enter` drills through. Hover
gives a crosshair reading both series at that point. Every chart is keyboard
reachable — a reporting screen that needs a mouse has not been specified yet.

## 8. Rules this screen must obey

- **§6.8** — capital events excluded from comparison **with the exclusion
  stated**, never silently. `34 200 · excludes 1 one-off`.
- **§7.0** — conversion is per row at each row's own date, then summed.
- **P5** — five segments plus *other*, directly labelled; the line chart's two
  series carry a second channel.
- **§6.7** — scope is a partition; subtotals sum to All.
- **Estimated rates are counted.** A total resting partly on estimates states
  how many rows do (§7.6).

## 9. Open questions

1. ~~**What is the default comparison period?**~~ **Decided: same period last
   year, with capital events excluded.** The intuitive default, left intact
   because §6.8 already handles the distortion that would have broken it — the
   comparison excludes one-offs, states the exclusion inline, and offers to
   include them.

   Defaulting to anything cleverer would have implied the capital flag is not
   trusted. It is the whole reason `is_capital` exists: one property purchase is
   96% of its category and roughly seven times a normal year, and left unflagged
   it makes year-over-year meaningless permanently. Having built that, the
   default should be the question people actually ask out loud.
2. ~~**Treemap versus donut for the same question.**~~ **Decided: donut
   summarises, treemap drills.** They answer different questions once the
   distinction is stated.

   | | Question | Where |
   |---|---|---|
   | `DonutChart` | *What are my five biggest categories this period* | Dashboard widget, top of Reports |
   | `Treemap` | *Show me everything at once* | Behind *other*, and the category deep-dive |

   **The donut is a summary and the treemap is an inspection**, so the treemap
   only appears once you have decided to go looking — which is also when its
   forty tiles stop being noise. Tapping *other* on the donut is the seam
   between them, and §7.2 already treats that tap as the entry to a better
   reading surface for the tail.

   Neither is dropped: a capped, directly-labelled donut is what makes
   composition readable in greyscale (P5), and a treemap is the only component
   that shows the whole distribution without an *other* bucket.
3. ~~**No saved views.**~~ **Decided: reuse dashboard layouts — no new
   concept.** S25 gains **Pin to dashboard**, which writes the current period,
   scope, chart type and filter into a widget and asks which layout to put it
   in.

   **A report configuration you want monthly is a dashboard widget you have not
   created yet.** Building a parallel saved-view table would have meant a second
   saved-configuration model with its own CRUD, its own agent operations and its
   own screen region — for the same job. This way there is one mechanism, and
   the comparison you check monthly ends up on the surface you already open
   rather than on one you have to remember to visit.
