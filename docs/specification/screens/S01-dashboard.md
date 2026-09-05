# S01 · Dashboard

**Surface** wide (RN Web / DeX / iPad) · **Journeys** J6, J4, J8, J11 · **Frequency** daily
**Design** Claude Design project
**Status** specified · tier 1

---

## 1. Purpose

Where do I stand, and what needs action — with the canvas to actually look.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| Any surface at width | Default route | — |
| Any screen | Brand mark in the shell | — |
| S24 | Layout saved | S01, new arrangement live |

**Exits** — any widget → its drill-through (S10 filtered, S11, S12, S25) ·
unsettled banner → the unallocated transaction · S24 to rearrange.

## 3. Layout

### Mobile — 390pt

**S01 does not exist at phone width.** S04 Today answers the same question at
thumb scale. Two landing surfaces competing for the same job is how both get
half-designed. This is a density limit, not a platform one — the same phone
renders S01 once it has the width to give it (RN Web, DeX, an external
display), the same way it would on a laptop (`architecture/14` §14.4).

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

**Every widget states its own currency, period and scope in its header.** A
figure on a dashboard with no stated frame is a figure you will misread — and
with a scope segment in the shell that a widget may or may not inherit, the
frame has to be local. Those are three required properties of `WidgetCard`,
not one line a caller composes: a caller free to compose the line is free to
compose nothing, and the frame is the part that stops being written first.

**The lead currency is the display currency (§7.0), and it is never inferred.**
The shell's `CurrencyChip` chooses it; every widget states it; and figures held
in any other currency are listed on their own rows at their own scale rather
than converted or dropped. One chart has one axis, so one chart has one
currency — the rest are still on the page.

**The scope segment states an intent that a widget may not be able to honour.**
A widget whose reader carries neither `ownership` nor `is_business` says `All`
in its own header while the band says something else. Two different statements
on one page are readable; one statement that is false is not.

## 4. Components

| Component | Notes |
|---|---|
| `Shell` | Nav, scope `SegmentControl`, `FxStatusChip`, `CurrencyChip`, `DualTotal` hero |
| `WidgetGrid` / `WidgetCard` | Slots at S · M · L |
| `Banner(warn)` | Unsettled clearing, only when non-zero, one action |
| `DonutChart` | 5 segments + *other*, each directly labelled (§7.2). On the phone-alone ledger this renders as a labelled stacked bar — `tokens.ts`'s single-hue chart ramp has no second hue to draw an arc against, and a bar keeps every direct label §7.2 asks for without a new chart-library dependency |
| `LineChart` | Income vs expense — hue **plus** marker shape and end labels (§7.1). On the phone-alone ledger this renders as paired bars, one per bucket. All three channels hold: hue (`theme.income`/`theme.spend`), **marker shape** — a triangle pointing up for income and down for expense, drawn beside every bar and repeated in the legend — and each bar's own figure as its end label. A bucket that has not finished takes P4's assertion fill and says *to date* |
| `BalanceRow` / `FxAmount` | Foreign accounts carry their basis |
| `StatTile` | Deltas; increases in spend take `negative` ink |
| `system_health` | S — **renders only when something is wrong**: stale backup, overdue drill, or a currency fallen behind. Absent while healthy → S30 |

Five widgets are drawn from the ledger alone — `balances` (A1), `recent`,
`debt` (E3), `spend_by_category` and `income_vs_expense` (both computed as
replica folds, `computations.md` §6/§12) — laid out by one seeded
`dashboard_layouts` row (below). `system_health`, `fx_status`, `revenue_ytd`,
`completeness`, `tax_period_status`, `targets` and `subscriptions` each read
something only a server holds.

Of the five, `balances`, `spend_by_category` and `income_vs_expense` follow the
shell's scope segment; `recent` and `debt` state `All`, because a recent row
carries no `ownership` and a counterparty balance belongs to a person rather
than to an account. **A layout naming a widget kind the build cannot draw is
dropped and reported** — a grid quietly shorter than the table it came from is
how the next widget added goes missing without a line in the log.

## 5. Data

| Reads | Writes |
|---|---|
| `get_active_layout` + its widgets | `set_active_layout` (via S24) |
| Per widget: `spend_by_category`, `get_balances`, `compare_periods`, `find_unsettled` | `update_widget_config` |
| FX sync state and coverage | — |

**`get_active_layout` is a migration-seeded row** — one default layout
(`Standing`, `is_active`, `is_preset`) with its five widgets, seeded
identically on both the server and the replica so a fresh install of either has
one to read from its first launch. Read here, written only by S24
(`set_active_layout`/`update_widget_config` are out of this screen's own
slice).

**Exactly one layout is active, bounded on both sides.** A partial unique index
over `is_active` holds the count at no more than one, on Postgres and on the
replica alike; Postgres carries a deferred constraint trigger for the other
half, because an index cannot refuse a count of zero and zero is what leaves
this screen with nothing to draw. Where the bound is missing anyway — a replica
restored from a database that predates the index — the reader still orders its
answer rather than taking whichever row came back first. **A layout that is
absent is an error state, not an empty page.**

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
