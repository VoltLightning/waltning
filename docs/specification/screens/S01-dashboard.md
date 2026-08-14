# S01 · Dashboard

**Surface** web · **Journeys** J6, J4, J8, J11 · **Frequency** daily
**Design** Claude Design project
**Status** specified · tier 1

---

## 1. Purpose

Where do I stand, and what needs action — with the canvas to actually look.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| Browser | Default route | — |
| Any screen | Brand mark in the shell | — |
| S24 | Layout saved | S01, new arrangement live |

**Exits** — any widget → its drill-through (S10 filtered, S11, S12, S25) ·
unsettled banner → the unallocated transaction · S24 to rearrange.

## 3. Layout

### Mobile — 390pt

**S01 does not exist on mobile.** S04 Today answers the same question at
thumb scale. Two landing surfaces competing for the same job is how both get
half-designed.

### Web — ≥1024px

```
┌ shell · gradient, full width ───────────────────────────────────┐
│  Waltning    Dashboard  Ledger  Calendar  Debt  Import  Agent   │
│              [All · Mine · Shared · Business]                   │
│                            FX 09:12 · NBP · 2 manual   PLN ▾    │
│                                                                 │
│   MINE                    ours                                  │
│   12 480,20 zł            18 940,60 zł                          │
│   spent 3 210,40 · net +840,20 · business share 14%             │
└─────────────────────────────────────────────────────────────────┘
┌ ground panel · radius-xl ───────────────────────────────────────┐
│  ⚠  340,00 zł unallocated · dinner, 6 Aug          [Allocate]   │
│                                                                 │
│  ┌── spend by category ──┐ ┌── balances ────────┐ ┌─ debt ──┐   │
│  │      donut, 5 + other │ │ grouped by kind    │ │ 840 in  │   │
│  │      each labelled    │ │ FxAmount, foreign  │ │ 120 out │   │
│  └───────────────────────┘ └────────────────────┘ └─────────┘   │
│  ┌── income vs expense ──────────────────┐ ┌─ fx ─┐ ┌─ sys ─┐   │
│  │  two series, marker + end labels      │ │ 4/6  │ │  ⚠    │   │
│  └───────────────────────────────────────┘ └──────┘ └───────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**The grid is a layout, not a page** (§14.5). Widgets read from
`dashboard_layouts` → `dashboard_widgets`, so *"put family spending on my
dashboard"* is an ordinary audited agent write (§11.0).

**Every widget states its own period and scope in its header.** A figure on a
dashboard with no stated frame is a figure you will misread — and with a scope
segment in the shell that a widget may or may not inherit, the frame has to be
local.

## 4. Components

| Component | Notes |
|---|---|
| `Shell` | Nav, scope `SegmentControl`, `FxStatusChip`, `CurrencyChip`, `DualTotal` hero |
| `WidgetGrid` / `WidgetCard` | Slots at S · M · L |
| `Banner(warn)` | Unsettled clearing, only when non-zero, one action |
| `DonutChart` | 5 segments + *other*, each directly labelled (§7.2) |
| `LineChart` | Income vs expense — hue **plus** marker shape and end labels (§7.1) |
| `BalanceRow` / `FxAmount` | Foreign accounts carry their basis |
| `StatTile` | Deltas; increases in spend take `negative` ink |
| `system_health` | S — **renders only when something is wrong**: stale backup, overdue drill, or a currency fallen behind. Absent while healthy → S30 |

## 5. Data

| Reads | Writes |
|---|---|
| `get_active_layout` + its widgets | `set_active_layout` (via S24) |
| Per widget: `spend_by_category`, `get_balances`, `compare_periods`, `find_unsettled` | `update_widget_config` |
| FX sync state and coverage | — |

## 6. States

| State | Treatment |
|---|---|
| Loading | Skeleton tiles in each widget's own shape — a donut skeleton is a ring, not a rectangle. Widgets resolve independently; one slow query must not hold the page |
| Populated | As drawn |
| Empty | `EmptyState(first-run)` replacing the whole grid when no accounts exist — offers J1's two paths |
| Error | Per widget, never page-level. A failed rate sync degrades the `fx` widget and leaves the rest correct |
| Offline | **Per-widget cached value with its age**, behind a page-level freshness banner. A widget that cannot render from cache shows a skeleton labelled *unavailable offline* — **never a zero**. This was the worst instance of the offline gap, because S01 is the landing surface (`design-system/08` §8.3) |
| Gated | n/a |

## 7. Interaction

### Web
`1`–`9` jump to a widget, `Enter` drills through. `/` focuses search anywhere.
Scope and currency are keyboard-reachable from the shell. Every widget is a link
— hovering shows where it goes, so the grid reads as navigation rather than
decoration.

Rearranging happens in S24, not here. Drag-to-rearrange in place is deferred by
decision (O16).

## 8. Rules this screen must obey

- **§6.7** — both totals in the hero, never a toggle, never adjacent in a way
  that invites summing.
- **P1** — every foreign balance carries its basis.
- **P4** — the unsettled banner and any stale-rate marker are the only amber.
- **P5** — charts are labelled directly; the legend reinforces.
- **§6.8** — any widget showing a trend states capital exclusions inline.

## 9. Open questions

1. ~~**Does `system_health` belong on the financial dashboard?**~~ **Decided:
   yes, but it renders only when something is wrong.** No tile and no green tick
   while backups are current, coverage is complete and the drill is in date — it
   appears only on a stale backup, an overdue drill, or a currency fallen behind.

   **The dashboard stays purely financial in the normal case, and the abnormal
   case is impossible to miss.** Push covers you when the app is closed (S30);
   this covers you when it is open. A permanently green tile would be chrome
   asserting the same thing every day, which is how you stop reading it.
2. ~~**Should the scope segment cascade into every widget?**~~ **Decided:
   cascades, unless a widget pins its own.** The shell segment is the default;
   a widget may pin a scope in its config, and one that has **says so in its
   header** — `Business · pinned` — so a figure on a different frame from its
   neighbours never looks like a figure on the same frame.

   The pinning case is not hypothetical: it is what makes the **Business**
   preset work. Without it, switching to that preset would show personal figures
   until you also changed the segment — two actions for one intent, and the sort
   of thing that gets done wrong once and then distrusted.
3. ~~**Preset layouts are unnamed.**~~ **Resolved in S24:** four ship —
   **Standing** (where do I stand), **Flowing** (where is it going), **Owing**
   (who owes whom), **Business** (what is reportable). Each answers a question
   rather than serving a mood, so switching has a reason you can feel.
