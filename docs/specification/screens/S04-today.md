# S04 · Today

**Surface** mobile · **Journeys** J2, J5, J6, J7, J8 · **Frequency** several times a day
**Design** Claude Design project
**Status** specified · tier 1

---

## 1. Purpose

Answer the only question a daily user opens the app for: **where do I stand, and
does anything need me.**

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| App launch | Default tab | — |
| Any tab | Tab bar | — |
| S05 | Save | S04, with the new row at the top of Recent |
| Push notification | Unsettled clearing, failed backup | The thing it names |

**Exits** — `+` → S05 · Scan → S07a · say-a-transaction → S05 in voice mode ·
a Recent row → S09 · balances → S16 · unsettled banner → J8 allocation ·
tab bar → S10, S11, S12, S03.

## 3. Layout

### Mobile — 390pt

```
┌ shell · green-900 → green-800 gradient ─────────┐
│  FxStatusChip          CurrencyChip             │
│                                                 │
│  MINE            12 480,20 zł      display-hero │
│  ours            18 940,60 zł      display-3    │
│                                                 │
│  ‹      August 2026      ›              Today   │  ← PeriodHeader
│  spent  −3 210,40   ·   net  +840,20            │  ← tap → PeriodPicker
└─────────────────────────────────────────────────┘
┌ ground panel · radius-xl, lifts over the shell ─┐
│  ⚠ 340,00 zł unallocated · dinner, 6 Aug        │  ← only when non-zero
│                                       [Allocate]│
│                                                 │
│  ┌ say a transaction ──────────────┐ ┌ Scan ┐   │  ← thumb zone starts here
│  │ ◉  "forty-eight ninety, coffee" │ │  ▣   │   │
│  └─────────────────────────────────┘ └──────┘   │
│                                                 │
│  RECENT                                         │
│  Today      Coffee · Eating out      −48,90 zł  │
│  Today      Salary · Employment   +9 200,00 zł  │
│  Yesterday  Rewe · Groceries    62,40 € · 4,02  │  ← FxAmount, foreign
│                                    251,04 zł    │
│                                       Show all →│
└─────────────────────────────────────────────────┘
┌ tab bar · 5 + raised ＋ ────────────────────────┐
│  Today   Ledger   ＋   Calendar   Debt          │
└─────────────────────────────────────────────────┘
```

**The hero earns its height because it answers the question in one glance.**
`DualTotal` puts *mine* dominant and *ours* secondary beneath — never a toggle,
because showing one at a time invites reading the wrong number (`SPEC.md` §6.7).

**The period is steppable and selectable.** Arrows move one period at a time in
the current granularity, *Today* returns to the present, and tapping the label
or the stat row opens `PeriodPicker` — granularity (day · week · month · year)
plus presets and an arbitrary range. Both components already exist: the arrows
are the calendar's `PeriodHeader` (§6.3), the sheet is Reports' `PeriodPicker`
(§7). Nothing is invented here.

**Only the lower row is period-scoped.** Net worth is a balance *as of now* and
does not move when you step back to July; spend and net do. The arrows sit on
the row they govern, below `DualTotal` rather than above it, so the boundary is
positional rather than something you have to be told.

**Capture sits in the thumb zone, balances do not.** The say-a-transaction row
and Scan are the two things done in motion, one-handed, several times a day, so
they are placed where the thumb already is (Fitts). Reading happens with the
phone held still.

Recent shows five rows, non-scrolling. It is a *confirmation surface*, not a
browsing one — S10 is a tap away for browsing.

**What earns it the space is the pending row.** Outbox writes appear at the top
with their `pending` marker until they sync, so an offline save is visibly
landed on the screen you saved from. That is the one thing S10 cannot do for
you, and it is exactly when confirmation matters most — a save with no network
and no feedback is indistinguishable from a save that failed.

### Web — ≥1024px

**S04 does not exist on web.** Its job is answered by S01 Dashboard, which has
the canvas for widgets and the density for real reading. Duplicating it would
create two screens competing to be the landing surface, and the honest split is
that the phone answers *where do I stand* and the desktop answers *what
happened*.

## 4. Components

| Component | Notes |
|---|---|
| `Shell(hero)` | Gradient band; holds `FxStatusChip`, `CurrencyChip`, `DualTotal` |
| `DualTotal` | *Mine* at `display-hero` 54px, *ours* at `display-3`. Degrades to one figure when no shared account exists |
| `PeriodHeader` | `‹ label ›` + *Today*. Steps by the current granularity (§6.3) |
| `PeriodPicker` | Opened by tapping the label or stat row — granularity, presets, arbitrary range (§7) |
| `StatTile` | Period spend and net. **Period-scoped**; `DualTotal` above it is not |
| `Banner(warn)` | Unsettled clearing — rendered **only when non-zero**, with one action |
| `TransactionRow` | Recent; `TransferRow` for transfers; `BIZ` tag where business |
| `FxAmount` | Any foreign row — `local · rate · display`, the rate for that row's own date (P1) |
| `TabBar` | 5 tabs + raised `+`, all ≥44px |
| `EmptyState(first-run)` | No accounts — offers create and import |

## 5. Data

| Reads | Writes |
|---|---|
| `get_balances` — scoped to *mine* and *ours* | — |
| `spend_by_period` — current month, net | — |
| `search_transactions` — 5 most recent | — |
| `find_unsettled` — clearing balances ≠ 0 | — |
| FX sync state | `sync_fx_rates` on foreground (§7.6) |

**S04 writes nothing.** Every mutation is a navigation away — which is what
keeps it fast and what makes it safe to render from cache offline.

## 6. States

| State | Treatment |
|---|---|
| Loading | Skeleton in the hero's shape — a serif-height block, not a spinner. Recent shows five skeleton rows |
| Populated | As drawn |
| Empty | `EmptyState(first-run)` when no accounts exist. Reachable if J1 was abandoned; offers *Add an account* and *Import from Money Manager* |
| Error | Balance query failed → `ErrorState(recoverable)` in the ground panel; **the hero keeps its last known figure with its age** rather than blanking |
| Offline | Cached, with `Banner(neutral)` — *showing data as of 14:06*. Capture stays fully available; that is the point of the outbox |
| Gated | n/a — single user |

## 7. Interaction

### Mobile
`+` is the raised tab-bar action, reachable by thumb from either hand. Pull to
refresh re-syncs rates and balances. Recent rows swipe to categorize (short) and
to edit (long) — never to delete (`design-system/05` §5.6). Haptic on save
arrival.

### Shared
Tapping the unsettled banner goes **straight to the unallocated transaction**,
not to a list. A warning that costs you a search is a warning you learn to
ignore.

## 8. Rules this screen must obey

- **P1** — every foreign row carries its basis. The hero total is one currency,
  so it carries none; each row beneath it does.
- **P4** — the unsettled banner is the only amber on this screen.
- **P5** — the banner states its meaning in words; the tint is reinforcement.
- **§6.7** — both totals, always, and never placed where summing them suggests
  itself.

## 9. Open questions

1. ~~**Does Recent belong here at all?**~~ **Decided: yes, five rows, and it
   carries pending writes.** It stops being a duplicate of S10 the moment
   unsynced rows surface there — an offline save then has visible confirmation on
   the screen it was made from, which nothing else provides. A single *last
   saved* row would do the confirmation job in less space but loses the
   at-a-glance sense of the last day or two, which is most of why the screen is
   opened.
2. ~~**Should the hero show the period selector?**~~ **Decided: yes — arrows
   plus a tappable label.** `‹ August 2026 ›` with *Today*, stepping by the
   selected granularity; tapping the label or the stat row opens `PeriodPicker`
   for granularity, presets and arbitrary ranges.

   **It costs no new components.** The arrows are the calendar's `PeriodHeader`,
   the sheet is Reports' `PeriodPicker` — so the most-used screen in the system
   gains a real period control by reusing two things that already exist, which
   is what working rule 1 is for.

   The one thing it required deciding: **net worth does not respond to it.** A
   balance is as-of-now; spend and net are period figures. Putting the arrows on
   the row they govern, beneath `DualTotal`, makes that positional instead of
   something the interface has to explain.
