# Waltning — Design System

The component layer beneath the screens. `Design Spec.dc.html` in the Claude
Design project covers screens, layouts, and UX audits; this document covers the
**parts they are assembled from** — tokens, primitives, composites, states —
so the interface can be built once and reused rather than redrawn per screen.

**Companion to:** [`SPEC.md`](SPEC.md) (§6 data model, §7 FX, §11 agent,
§13 tax, §14 surface).
**Design source:** Claude Design project *App dashboard design directions* —
`Waltning App.dc.html` (prototype), `Waltning Dashboard.dc.html` (direction 2b
"Conservatory"), `Design Spec.dc.html` (screen specs + audits).

**Status:** specification. No components implemented.
**Last updated:** 2026-08-04

---

## Table of contents

1. [Principles](#1-principles)
2. [Tokens](#2-tokens)
3. [Primitives](#3-primitives)
4. [Money and FX components](#4-money-and-fx-components)
5. [Composites](#5-composites)
6. [Calendar](#6-calendar)
7. [Data visualization](#7-data-visualization)
8. [Screen inventory](#8-screen-inventory)
9. [State matrix](#9-state-matrix)
10. [Accessibility](#10-accessibility)
11. [Platform notes](#11-platform-notes)
12. [Build order](#12-build-order)
13. [Open questions](#13-open-questions)

---

## 1. Principles

Five rules the components encode, so screens inherit them rather than
re-implementing them.

**P1 · A converted amount never travels alone.** Any foreign figure renders as
*local · rate · display*, with the rate for that row's own date. There is no
component that displays a converted amount without its basis. This is a
component-level guarantee, not a guideline — `<Amount>` cannot render a
conversion without a rate.

**P2 · Machine-filled fields declare themselves.** Anything a model produced —
voice, OCR, classification — carries a visible trail and an Undo. The draft is
never a black box.

**P3 · One approval gate, one treatment.** Agent writes, voice writes, and
receipt extraction all pass through the same `<DiffCard>`. One pattern used in
three places, not three patterns.

**P4 · Amber means exactly two things.** Unsettled clearing, and a manual FX
override. Overloading it destroys its signal value.

**P5 · Colour is never the only encoding.** Every tint pairs with text, an
icon, or a label. Charts included — the current design does not meet this
(§10), which is why it is a principle and not a claim.

---

## 2. Tokens

### 2.1 Colour

The green ramp is the entire chart palette: magnitude reads as depth, so no
second hue is needed.

| Token | Value | Use |
|---|---|---|
| `canvas` | `#e6ece5` | Outside the app frame (design boards only) |
| `ground` | `#f2f6f1` | Page background; all cards sit on it |
| `surface` | `#ffffff` | Cards, sheets, rows |
| `ink` | `#1a2620` | Body text |
| `muted` | `#5f7168` | Secondary text, labels, captions |
| `green-50` | `#f2f9f4` | Table headers, inset boxes |
| `green-100` | `#e4f1e8` | Ramp floor, tag fills |
| `green-200` | `#cbe6d6` | Borders, rules, dividers |
| `green-300` | `#a3d2b8` | Chart step; the ramp's middle |
| `green-400` | `#75bd99` | Chart step; table header underline |
| `green-500` | `#48a479` | **Focus ring**; chart step; primary accent |
| `green-600` | `#2f7d5a` | Primary action fill; pins |
| `green-700` | `#215f45` | Links; heading ink; hover on 600 |
| `green-800` | `#164531` | Shell gradient end |
| `green-900` | `#0e2e20` | Shell gradient start; display headings |
| `amber` | `#f8eed9` | Fill — unsettled clearing, manual override **only** |
| `amber-ink` | `#856223` | Text on amber |
| `negative` | `#a8452f` | Negative balances, MoM spend increases. **Never chrome** |
| `negative-bg` | `#f6e7e3` | Fill behind negative tags |
| `bolt` | `#f5c63d` | App icon accent only — not a UI colour |

**Shell gradient:** `linear-gradient(160deg, #0e2e20, #164531)`.

### 2.2 Typography

| Role | Family | Weight | Notes |
|---|---|---|---|
| UI | Figtree | 400 / 500 / 600 / 700 | All interface text |
| Display & money | Source Serif 4 | 600 (`opsz 8..60`) | Headings and figures only — the serif makes totals feel weighed rather than computed |
| Mono | `ui-monospace, Menlo` | — | Codes, IDs, rate values in dense tables |

**Every amount carries `font-variant-numeric: tabular-nums lining-nums`.** This
is mandatory — it is what lets columns align without a monospace face, and it
is the single most common omission when amounts are rendered ad hoc.

**Scale**

| Step | Size / line-height | Use |
|---|---|---|
| `display-hero` | 54 / 1.05 | The one dominant total, in the display currency |
| `display-1` | 38 / 1.1 | Board and page titles |
| `display-2` | 23 / 1.2 | Section headings |
| `display-3` | 17 / 1.3 | Card titles |
| `body` | 14.5 / 1.62 | Default |
| `body-sm` | 13 / 1.5 | Table cells, dense rows |
| `caption` | 11.5 / 1.4 | Captions, metadata |
| `kicker` | 11 / 1.2, `700`, `.08em`, uppercase | Eyebrow labels |
| `tag` | 10.5 / 1, `700`, `.08em`, uppercase | Pills and tags |

### 2.3 Spacing

4px base. Permitted steps: **4 · 6 · 8 · 10 · 12 · 14 · 16 · 20 · 22 · 26 · 34 · 44 · 52**.

The ladder is deliberately coarse above 16 — the existing mockups use 22, 26,
34, 44 and 52 for board and card padding, and rounding those to a strict 8-grid
would visibly change the designs.

### 2.4 Radius

| Token | Value | Use |
|---|---|---|
| `radius-pill` | `999px` | Tags, chips, pills |
| `radius-xs` | `3px` | Inline code |
| `radius-sm` | `8px` | Small icons, inputs |
| `radius-md` | `12px` | Inset boxes, rule callouts |
| `radius-lg` | `20px` | Cards, sheets |
| `radius-xl` | `24px` | Ground panel lifting over the shell |
| `radius-icon` | `13 / 18 / 28px` | App icon at 56 / 120 / 512 |

### 2.5 Elevation

| Token | Value | Use |
|---|---|---|
| `shadow-card` | `0 10px 26px rgba(18,48,34,.05)` | Default card |
| `shadow-raised` | `0 8px 26px rgba(14,46,32,.10)` | Panels, popovers |
| `shadow-frame` | `0 8px 34px rgba(14,46,32,.14)` | Device frames, modals |
| `border-hairline` | `1px solid rgba(14,46,32,.09)` | Dividers |

### 2.6 Focus

`2px solid green-500`, `2px` offset, on **every** interactive element. Never
removed, never replaced by a colour change alone.

### 2.7 Motion

| Token | Duration | Curve | Use |
|---|---|---|---|
| `motion-fast` | 120ms | `ease-out` | Hover, press, tint |
| `motion-base` | 200ms | `cubic-bezier(.2,0,0,1)` | Expand, reveal |
| `motion-sheet` | 280ms | `cubic-bezier(.2,0,0,1)` | Bottom sheet rise |
| `motion-none` | 0 | — | `prefers-reduced-motion` branch |

**Every animation needs the `motion-none` branch.** The waveform, the mic halo,
and the sheet rise are all currently unbranched (§10).

### 2.8 Icons

[Phosphor Icons](https://phosphoricons.com) — `fill` for brand and emphasis,
`duotone` for navigation. Icon-only buttons always carry an accessible label.

---

## 3. Primitives

Variants and states for each. `—` means the variant does not exist by design.

### 3.1 Button

| Variant | Fill | Ink | Use |
|---|---|---|---|
| `primary` | `green-600` | white | The one affirmative action — Accept, Approve, Save, Commit |
| `secondary` | transparent, `green-200` border | `green-700` | Skip, Decline, Cancel |
| `ghost` | transparent | `muted` | Tertiary, in-row |
| `danger` | transparent, `negative` border | `negative` | Destructive; confirmation required |

Sizes `sm 32` / `md 40` / `lg 48`. States: default · hover · active · focus ·
disabled · **loading** (spinner replaces label, width held).

**Rule:** never two `primary` buttons in one decision. Import review's
Accept/Skip and the diff card's Approve/Decline are both primary + secondary —
that asymmetry is the affordance.

### 3.2 IconButton

32 / 40 / 44. **44 minimum for any touch target** (§10). Requires `aria-label`.

### 3.3 Tag

Static, non-interactive. Text always present — never tint alone (P5).

| Variant | Fill / ink | Use |
|---|---|---|
| `neutral` | `green-100` / `green-700` | Default |
| `warn` | `amber` / `amber-ink` | Manual override, unsettled, open item |
| `negative` | `negative-bg` / `negative` | Gaps, failures |
| `biz` | `green-100` / `green-700`, uppercase `BIZ` | Business row marker — appears in **every** view a business row appears in |

### 3.4 Pill — classification tier

Import review's row-level provenance marker. Carries text, not just tint.

| Tier | Label | Meaning |
|---|---|---|
| `rule` | `Rule · <name>` | Deterministic, free, names the rule and its hit count |
| `model` | `Model 0.91` | Confidence stated to 2dp; always paired with a reason |
| `transfer` | `Transfer` | Pair already collapsed to one row |
| `duplicate` | `Duplicate` | Matched an existing transaction |

### 3.5 Chip — interactive

Tappable, holds a value, opens a picker. Used across the Quick-add composer for
account, category, date, scope, note.

States: empty (placeholder) · filled · **machine-filled** (carries the trail
marker, P2) · focus · disabled.

⚠️ Chips currently measure ~34px against a 44px floor (§10).

### 3.6 Segment control

2–4 options, one active. Used for scope (**All · Mine · Family · Business**)
and import filters (Needs review / Ready / Duplicates / Skipped), with live
counts per segment.

The scope options are a **partition**, not overlapping filters (`SPEC.md`
§6.7) — every transaction is in exactly one, so the three subtotals always sum
to All. Switching scope can never double-count.

### 3.7 Inputs

| Component | Notes |
|---|---|
| `TextField` | Label, hint, error, character counter |
| `AmountField` | Tabular numerals, **comma decimal**, currency affix, right-aligned |
| `SearchField` | Leading icon, clear button, live results |
| `Keypad` | 0–9, comma, delete. Bottom-anchored, thumb-zone (Fitts) |
| `RateField` | Editable FX rate, 4dp, shows synced value beside the override |
| `DateField` | Defaults to today; relative shortcuts (yesterday) |
| `Toggle` | Business / personal, write-a-rule |

### 3.8 Feedback

`Spinner` · `Skeleton` (matches the shape it replaces, never a grey box) ·
`ProgressBar` (determinate — uploads, extraction) · `Toast` (transient, with
Undo where the action is reversible) · `KeyHint` (`J` `K` `A` — keyboard legend).

---

## 4. Money and FX components

The heart of the system. These enforce §7 of `SPEC.md` structurally.

### 4.1 `<Amount>`

```
  1 234,56 zł        display currency — serif, tabular
  $ 62.40            foreign, unconverted
```

Props: `value`, `currency`, `size`, `emphasis`, `signed`. Negative values take
`negative` ink. Never renders a conversion — that is `<FxAmount>`.

### 4.2 `<FxAmount>` — the P1 component

```
  62,40 $ · 4,0231 · 251,05 zł
  └ local    └ rate   └ main
```

The rate is for **the row's own date**. Three variants:

| Variant | Trailing marker |
|---|---|
| `synced` | none |
| `override` | amber `manual` tag — travels with the row into lists, balances, and the dashboard |
| `stale` | muted `stale` tag with the age |

`<FxAmount>` **cannot be rendered without a rate.** That is what makes P1 a
guarantee rather than a convention.

### 4.3 `<TransferAmount>`

One row, two accounts, two amounts, one derived rate (`SPEC.md` §7.5).

```
  Household · USD  →  Cash · PLN
  150,00 $            565,20 zł        realized 3,7680
                                       reference 3,8100 · spread 6,30 zł
```

The spread is shown **as it is typed** during entry, not discovered in a report
later. This is the component that makes FX cost visible.

### 4.4 `<FxStatusChip>`

Header-resident: `FX 09:12 · NBP · 2 manual`. States: fresh · syncing ·
**stale** (amber) · failed (negative). Staleness is visible, never silent.

### 4.5 `<CurrencyChip>`

The **display-currency toggle**, resident in every header. Pinned currencies
(`PLN · USD · EUR`) with the active one marked; tapping re-expresses every
figure on screen at that row's own historical rate.

Switching is free — no backfill, no confirmation, nothing written (`SPEC.md`
§7.0). It is a client preference, so it does not survive to any export: tax
outputs are always denominated in their jurisdiction's currency regardless of
what this is set to.

---

## 5. Composites

### 5.1 Structural

| Component | Contents |
|---|---|
| `Shell` | Dark gradient band — brand, nav, scope segment, `FxStatusChip`, `CurrencyChip`, hero figure. The hero **excludes external accounts** (`SPEC.md` §6.7) |
| `GroundPanel` | `radius-xl` surface lifting over the shell |
| `Card` | `surface`, `radius-lg`, `shadow-card`; optional title and action |
| `StatTile` | Figure + label + delta. Delta takes `negative` ink when spend rose |
| `BottomSheet` | 170px from top; search, content, **pinned footer** |
| `TabBar` | 5 tabs + raised `+`. Duotone icons, ≥44px targets |
| `Dock` | Bottom-anchored composer: mode row, keypad, full-width Save |

### 5.2 Rows

| Component | Notes |
|---|---|
| `TransactionRow` | Date · payee · category · `Amount`. `BIZ` tag when business |
| `TransferRow` | Variant showing both accounts — one row, never two |
| `BalanceRow` | Account · kind · `FxAmount` for foreign accounts |
| `ExternalGroup` | Balances group for external accounts — own subtotal, visually set apart, never folded into net worth. A negative balance here is unremarkable and gets no warning treatment |
| `ImportRow` | Collapsed: date, payee + raw string, tier pill, proposed category + basis, amount + FX, Accept/Skip. Expanded: three panes — reason + business/rule toggles, category picker, currency and rate panel |
| `AuditRow` | Tool call · kind (read/write) · state · timestamp |
| `TrailRow` | *"Heard: forty-eight ninety, cash, coffee"* + **Undo**. The P2 component |
| `QueueItem` | Receipt queue: `waiting` (queued 14:06, uploads on reconnect) / `ready` (extracted 2.4 s) |

### 5.3 The approval gate

**`<DiffCard>` — one component, three call sites** (agent, voice, receipt).

```
┌ create_transaction ───────────── write ┐
│  before          │  after              │
│  —               │  48,90 zł · Cash    │
│                  │  Eating out         │
│  Total unchanged: 12 480,20 zł         │
│                        [Decline] [Approve]
└────────────────────────────────────────┘
```

States:

| State | Treatment |
|---|---|
| `pending` | Neutral border; both actions live |
| `approved` | Green border and header; `applied 14:32 · audit #4821 · actor = agent` |
| `declined` | Muted, collapsed, reason retained |
| `applying` | Spinner on Approve; both actions locked |

Never a modal. Never "are you sure" — the diff *is* the confirmation, because a
generic dialog teaches nothing and gets clicked through.

**`<ToolResultCard>`** — read results. Visually distinct from writes, labelled
`ran automatically · 240 ms`.

⚠️ Approved cards need a **revert** affordance for the session (§13 Q4).

### 5.4 Messaging

| Component | Use |
|---|---|
| `Banner` | Page-level. `warn` = unsettled clearing, with a stated meaning and one action. `negative` = failure. `neutral` = offline |
| `EmptyState` | Icon, title, explanation, action. Currently only the import queue has one |
| `ErrorState` | What failed, why, what to do. Never a bare code |
| `ConfirmDialog` | Genuinely destructive and irreversible only — deleting an account, changing the **pivot** currency |

### 5.5 Debt and counterparties

Implements `SPEC.md` §6.6. The hard part is not the list — it is that one
person can owe you in one currency while you owe them in another.

| Component | Notes |
|---|---|
| `CounterpartyRow` | Avatar or monogram · name · kind icon (person / company) · net position in **their** currency, with the display-currency equivalent beneath |
| `CounterpartyCard` | Full position: one row per currency, then both derived totals |
| `BalanceLedger` | Per-currency table. Positive = they owe you, negative = you owe them. Direction stated in words, never by sign alone (P5) |
| `SettleSheet` | Amount, currency, which balance it discharges, rate (editable), **residual shown before commit** |
| `DebtDirectionTag` | `owes you` / `you owe` — text, not a colour |
| `CounterpartyPicker` | Search, recent, create-in-place. Same shape as the category sheet |
| `AgeingBar` | Days outstanding. **Companies only** — see O15 |

**`<BalanceLedger>` is the component that justifies the model change:**

```
  ┌ person · settles in EUR ──────────────┐
  │  PLN    +840,00        owes you       │
  │  EUR    −120,00        you owe        │
  │  ───────────────────────────────────  │
  │  net    +75,40 €       @ 2026-08-04   │
  │         +321,60 zł                    │
  └───────────────────────────────────────┘
```

Two currencies, opposite directions, one person. The account model could not
express this at all — it would appear as unrelated balances in
`Loan · PLN` and `Loan · EUR (my)` with nothing connecting them.

**`<SettleSheet>` follows `<TransferAmount>`** (§4.3): two amounts, derived
rate, spread against the reference shown. The settlement rate defaults to the
reference but is editable, because a debt is discharged at the rate the two
parties agreed — not the rate a central bank published.

---

## 6. Calendar

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

---

## 7. Data visualization

All charts draw from the green ramp; magnitude is depth.

| Component | Use | Requirement |
|---|---|---|
| `PieChart` | Category share, whole-of-period | Max 5 segments + *other*, each directly labelled with its value |
| `DonutChart` | Category share with a centre total | Same cap. Legend is reinforcement, never the lookup mechanism |
| `LineChart` | **Income vs expense over time** | Two series, annual or arbitrary range |
| `BarChart` | Month over month | Increases in spend take `negative` ink |
| `AreaChart` | Cumulative net worth | Single series, ramp fill |
| `Treemap` | Category deep-dive | Tiles ≥ ramp 500 use white ink; ≤ 400 use `ink` |
| `TargetBar` | Progress against a monthly target (`SPEC.md` §14.7) | Over-target goes `negative` ink and states the overage — never a warning icon |
| `Sparkline` | Balance trend in rows, year-view cells | No axes; paired with a figure |
| `Legend` | Every chart | Order matches segment order |
| `PeriodPicker` | Every chart | Presets (month, quarter, year, YTD) **plus** an arbitrary range |

### 7.1 `<LineChart>` — income vs expense

Two series over a chosen period, at a granularity that follows the range
(daily ≤ 3 months, weekly ≤ 1 year, monthly beyond).

```
  income   green-600, solid
  expense  negative,  solid
  net      green-900, dashed — optional third series
```

This is the one place `negative` ink appears as a **series colour** rather than
an alert. That is a deliberate exception: expense-versus-income is the single
comparison where red carries its ordinary financial meaning, and forcing both
series into the green ramp would make them harder to tell apart, not easier.

Requirements: shared Y axis in the display currency · hover and tap crosshair
reading both series at that point · zero line always visible when net is shown ·
projected periods (§6.4) rendered dashed and labelled.

### 7.2 Pie versus donut

Both exist; they are not interchangeable.

| Use | Component |
|---|---|
| Composition alone, no meaningful total | `PieChart` |
| Composition **and** a total worth stating | `DonutChart` — the total sits in the hole |

**Neither shows more than five segments plus *other*, and every segment carries
a direct label with its value.**

Five is where adjacent steps in a single-hue ramp stay reliably
distinguishable. Beyond that, colour is doing work it cannot do — roughly 8% of
men have a colour vision deficiency, and the ramp has only seven usable steps
to begin with. The direct label is what makes the encoding colour-independent:
the chart stays readable in greyscale, and the legend becomes reinforcement
rather than the lookup mechanism.

Tapping *other* breaks the tail out as a list, which is a better reading
surface for small values than a sliver of arc ever was.

This preserves the single-hue palette and the "magnitude reads as depth"
principle, which patterns or a second hue family would both have cost.

---

## 8. Screen inventory

### 8.1 Designed

| # | Screen | Surface | Key components |
|---|---|---|---|
| 1 | Dashboard | Web 1440 | `Shell`, `StatTile` ×3, `Banner(warn)`, `DonutChart`, `BarChart`, `TransactionRow`, `BalanceRow`, `FxAmount` |
| 2 | Import review | Web 1440 | `SegmentControl`, `ImportRow`, `Pill`, `KeyHint`, `EmptyState`, `Button(primary/secondary)` |
| 3 | Agent | Web 1440 | 3-col; `ToolResultCard`, `DiffCard`, `AuditRow`, composer |
| 4 | Today | Mobile 392 | `Shell(hero)`, unsettled chip, say-a-transaction row, `TransactionRow`, `TabBar` |
| 5 | Quick add | Mobile 392 | `Dock`, `Keypad`, `Chip` ×5, `TrailRow`, mode switch |
| 6 | Category sheet | Mobile | `BottomSheet`, `SearchField`, parent chips + counts, 2-col grid, pinned footer |
| 7 | Receipt capture + review | Mobile | Camera brackets, `QueueItem`, per-field confidence, `receipt strip`, line splits |
| 8 | Voice, multi-intent | Mobile | Waveform, transcript, `DiffCard` ×2, *Approve both* |

### 8.2 Not yet designed

Ordered by `Design Spec.dc.html` §4.4.

Ordered by dependency, then by `Design Spec.dc.html` §4.4.

| # | Screen | Surface | Why it matters | New components |
|---|---|---|---|---|
| 9 | Transaction detail | Mobile | Everything created must be findable and fixable | `AuditHistory`, receipt viewer, split editor |
| 10 | Transactions list | Mobile | Search, filter, infinite list, swipe to edit | `FilterBar`, `SwipeAction`, virtualized list |
| 11 | **Calendar** | Mobile | 4 scales × 2 navigation modes, one component (§6) | `Calendar`, `DayCell`, `MonthCell`, `PeriodHeader`, `ScaleSwitcher`, `NavModeToggle` |
| 12 | **Debt · counterparties** | Mobile | Who owes you what, across currencies (§5.5) | `CounterpartyRow`, `BalanceLedger`, `DebtDirectionTag` |
| 13 | **Counterparty detail** | Mobile | Per-currency position, history, settle | `CounterpartyCard`, `AgeingBar` |
| 14 | **Settle debt** | Mobile | Cross-currency discharge at an agreed rate | `SettleSheet`, `RateField`, residual preview |
| 15 | **Counterparty editor** | Mobile | Create person or company, set their settlement currency | `KindPicker`, `CurrencySelect` |
| 16 | Accounts | Mobile | Register, balances, archive, opening balances. Card / cash / bank kinds | `AccountEditor`, `KindPicker` |
| 17 | Settings · Currencies | Mobile | Currency list, pinned toggle set, rate sources (`SPEC.md` §7.0) | `CurrencyList`, `RateSourcePicker`, `PinToggle` |
| 18 | **Settings · Exchange rates** | Mobile | Rate table by pair and date, manual override, sync history | `RateTable`, `RateEditor`, `SyncLog` |
| 19 | Settings · Categories | Mobile | **122 categories, 13 collisions** need rename / merge / archive | `CategoryTree`, `MergeFlow` |
| 20 | Settings · Rules | Mobile | Rule list, hit counts, edit, disable | `RuleEditor`, `RuleTestPanel` |
| 21 | Settings · Recurring | Mobile | 24 migrated rules | `RecurringEditor`, RRULE picker |
| 22 | Settings · Tax | Mobile | Scheme timeline, VAT, NIP, default ryczałt rate | `SchemeTimeline`, `NipField` |
| 23 | **Calendar** | Web | Wider canvas; week and month gain per-day detail | reuses §6 |
| 24 | **Dashboard layout** | Web | Preset arrangements, widget config (`SPEC.md` §14.5) | `WidgetGrid`, `WidgetCard`, `LayoutPicker` |
| 25 | Reports | Web | Period comparison, category deep-dive, business view | `PeriodPicker`, `ComparisonTable`, `LineChart`, `PieChart` |
| 26 | **Debt overview** | Web | Totals both directions, ageing, per-counterparty drill-down | `DebtSummary`, `AgeingTable` |
| 27 | Export | Web | The manifest asserting zero personal rows is a **design** problem | `WorkbookBuilder`, `SchemeSelector`, `ManifestCard` |
| 28 | Tax view | Web | The exclusion guarantee needs to be legible | `SchemeTimeline`, KPiR column map, ryczałt rate chip |
| 29 | Onboarding / first run | Both | Display currency, first account, migration import | `SetupWizard` |

**29 screens, 8 designed.** The count roughly tripled from the original seven
outstanding — mostly because Settings was one line item covering six distinct
surfaces, and because calendar and debt were absent entirely.

### 8.3 Tax-layer components

`Design Spec.dc.html` §5 answers **O1: all three Polish schemes**. One field
exists nowhere in the current design:

> **`<RyczaltRateChip>`** — a ryczałt rate on a *revenue* row. Activity-derived,
> defaulted per counterparty or category, editable per row, and versioned. It
> does not belong to the expense taxonomy and cannot be inferred from it.

Also required: `SchemeTimeline` (dated events, **not** a dropdown — two periods
in one calendar year can project differently), and scheme + version stamped on
every export (`PL_KPIR v2026`, `PL_RYCZALT v2026`).

---

## 9. State matrix

Every screen needs all five. Only the import queue has an empty state today.

| Screen | Loading | Empty | Error | Offline | Conflict |
|---|---|---|---|---|---|
| Dashboard | skeleton tiles | first run, no accounts | rate sync failed | **gap** — says nothing when the Pi is unreachable | n/a |
| Import review | parsing progress | ✅ queue clear | parser rejected file | queue locally | n/a |
| Agent | **gap** — no streaming or thinking state | no sessions | model failed / refusal | disabled, stated | n/a |
| Quick add | — | — | **gap** — speech not understood, no network, low confidence, duplicate on save | ✅ outbox | last-write-wins, unsurfaced |
| Receipt | ✅ extracting 2.4s | queue empty | **gap** — unreadable photo | ✅ queue | n/a |
| Reports | skeleton | month with no data | query failed | stale marker | n/a |
| Export | building | nothing in range | build failed | disabled | n/a |

**The Quick-add error states are the single largest gap** — it is the screen
used daily, and the only one where a machine fills fields.

---

## 10. Accessibility

| Requirement | State | Action |
|---|---|---|
| Contrast 4.5:1 body / 3:1 large | ⚠️ verify | Measure `muted #5f7168` on white, amber ink on amber (tightest pair), and ramp 300–400 tiles |
| Target ≥ 44px (WCAG 2.5.8) | ❌ fails | Chips measure ~34px. Tab-bar glyphs unverified |
| Focus visible | ✅ | 2px `green-500`, 2px offset |
| Colour not sole encoding | ⚠️ partial | Pills and overrides carry text — good. **Charts do not** |
| Reduced motion | ❌ gap | Waveform, mic halo, sheet rise all need a branch |
| Screen reader | ❌ gap | Live regions for transcript and extraction progress; labels on icon-only buttons |
| Voice alternative | ❌ gap | Mic is the primary fast path with no non-audio equivalent for a noisy shop or a user who cannot speak. Keypad covers it but needs a visible *type instead* affordance |

**The 44px failure and the chart encoding are blocking**, not cosmetic — both
are systematic, so both are cheap to fix in the component layer and expensive
to fix screen by screen.

---

## 11. Platform notes

One codebase via Expo + React Native Web (`SPEC.md` §14.6).

| Concern | Approach |
|---|---|
| Tokens | One TS module, consumed by RN `StyleSheet` and web CSS variables alike |
| Type | Figtree + Source Serif 4 via `expo-font`; web via the same families |
| Icons | `@phosphor-icons/react` (web) / `phosphor-react-native` — same names, one wrapper |
| Charts | ⚠️ The known RN Web friction point. `victory-native` renders both, but treemap and dense tables may need a web-only path |
| Tables | Import review and Reports are dense and keyboard-driven — most likely to force `apps/web` |
| Keyboard | J/K/A/R/S/T on import review is web-only; mobile uses swipe |
| Haptics | Approve, Save, Undo on native; no-op on web |

**Escape hatch:** if the dashboard fights RN Web, `apps/web` reuses these tokens
and the tRPC client. Building tokens as a shared module first is what keeps that
split cheap.

---

## 12. Build order

| Phase | Deliverable | Rationale |
|---|---|---|
| **D0** | Token module + `Amount`, `FxAmount`, `TransferAmount` | Every screen depends on them; P1 is enforced here or nowhere |
| **D1** | Primitives — Button, Tag, Pill, Chip, Segment, inputs | Fix the 44px floor once, at the source |
| **D2** | `Card`, `Shell`, rows, `TabBar`, `BottomSheet` | Structure for every screen |
| **D3** | `DiffCard` + `ToolResultCard` | One gate, three call sites — build before any of them |
| **D4** | States — `EmptyState`, `ErrorState`, `Skeleton`, `Banner` | Closes §9, starting with Quick add |
| **D5** | Charts + `Legend` + `PeriodPicker` | Unblocked — 5 segments + *other*, directly labelled (§7.2) |
| **D6** | `Calendar` + cells + navigation (§6) | Virtualization is the hard part; build it once for both modes |
| **D7** | Debt — `BalanceLedger`, `SettleSheet`, `CounterpartyPicker` (§5.5) | Depends on D0's money components |
| **D8** | Accessibility pass | Measured contrast, targets, reduced motion, labels |
| **D9** | Screens 9–29 | Everything above already exists by now |

D0–D3 build against `packages/ui`; D7 consumes it. This inverts the current
order, where screens exist and components do not.

---

## 13. Open questions

| # | Question | Blocks | Recommendation |
|---|---|---|---|
| ~~**Q1**~~ | ~~`green-300` undefined~~ | — | **Decided: `#a3d2b8`**, interpolated between 200 and 400. Now in §2.1 |
| ~~**Q2**~~ | ~~Seven categories in one hue ramp fails colour-independence~~ | — | **Resolved** — cap at 5 segments + *other*, every segment directly labelled with its value. Single-hue ramp kept; the chart reads in greyscale (§7.2) |
| ~~**Q3**~~ | ~~Chips ~34px vs the 44px floor~~ | — | **Decided:** raise padding in the `Chip` primitive so every instance clears 44px. Accept the density loss — fixing this once at the source is a day; fixing it across 29 screens is a week |
| ~~**Q4**~~ | ~~No revert on approved diffs~~ | — | **Decided:** session-duration revert on the applied card. Beyond the session, correction goes through normal editing with its audit trail |
| ~~**Q5**~~ | ~~Partial approval for multi-intent voice~~ | — | **Decided:** per-card Approve / Decline. *Approve both* stays as a convenience, but never as the only control |
| ~~**Q6**~~ | ~~Movable confidence threshold~~ | — | **Decided:** draggable, with the affected count updating live in the bulk-accept label |
| ~~**Q7**~~ | ~~Category maintenance~~ | — | **Decided: build it.** Not really optional — 122 categories with 13 name collisions exist today and nothing can currently fix them (S19) |
| ~~**Q8**~~ | ~~Calendar cell density~~ | — | **Decided:** net figure always; category dots on week and month only, where there is room. Never count alone — a number of transactions answers nothing |
| ~~**Q9**~~ | ~~Calendar vs transactions list~~ | — | **Decided: complement.** The list answers *"find what I remember"*; the calendar answers *"what happened then"*. Both are entry points to the same detail screen (`FLOWS.md` J5) |
| ~~**Q10**~~ | ~~Counterparty identity~~ | — | **Decided:** monogram on a ramp tint, derived deterministically from the name. No photo picker — it is a debt ledger, not a contacts app |
| ~~**Q11**~~ | ~~Settlement documentation~~ | — | **Decided:** optional but prompted. An undocumented settlement is precisely the one that gets disputed later |

### Contradictions with `SPEC.md` — both now resolved

Flagged rather than silently reconciled, because both were decisions.

**~~C1 · Main currency~~ — dissolved.** `Design Spec.dc.html` §1.2 says PLN;
`SPEC.md` said USD; Money Manager holds USD. The contradiction existed only
because the design assumed a single reporting currency.

There is now no main currency (`SPEC.md` §7.0). USD is the invisible **pivot**
for rate storage — which is what Money Manager already holds, so migration
needs no conversion — and PLN, USD and EUR are all pinned to the display
toggle. Both documents were describing preferences that no longer conflict.

**~~C2 · O1~~ — resolved.** `Design Spec.dc.html` §5 answers the tax-form
question as *all three* Polish schemes — skala, liniowy, and ryczałt — and
`SPEC.md` §17 now records it. It adds the ryczałt revenue-rate field (which
exists nowhere else in the design and cannot be inferred from the expense
taxonomy), a scheme timeline rather than a dropdown, and a tax view that
removes the cost side under ryczałt with a stated reason rather than blanking
it.

Also settled since: **VAT** — not registered, so NIP / KSeF / document-ref
fields exist but no JPK_V7 handling is built. **Jurisdictions** — all three
scheme definitions written now, adapters implemented on demand, Poland first.
