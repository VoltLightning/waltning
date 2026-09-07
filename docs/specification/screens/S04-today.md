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
┌ shell · sage band ──────────────────────────────┐
│  Today                              Appearance  │
│  Saturday, 5 September                          │
└─────────────────────────────────────────────────┘
┌ ground panel · radius-xl, lifts over the shell ─┐
│  ┌ mine   48 620,84 zł                       › ┐│  ← NetWorthStrip → S16
│  └───────────────────────────────────────────  ┘│
│  ┌ September 2026 ─────────────────── ‹  ›  ────┐│  ← MonthSummary, the hero
│  │ Kept so far                     +3 529,82 zł ││
│  │ ┌ Came in ─────────┐ ┌ Went out ───────────┐ ││
│  │ │ +7 850,00        │ │ 4 320,18            │ ││
│  │ └──────────────────┘ └─────────────────────┘ ││
│  └──────────────────────────────────────────────┘│
│  ⚠ 340,00 zł unallocated · dinner, 6 Aug        │  ← only when non-zero
│                                       [Allocate]│
│                                                 │
│  ┌ Recent ───────────────────────────────────┐  │
│  │ Today     Coffee · Eating out   −48,90 zł │  │
│  │ Today     Salary · Employment +9 200,00 zł│  │
│  │ Yesterday Shop A · Food    62,40 € · 4,02 │  │  ← FxAmount, foreign
│  │                                 251,04 zł │  │
│  │                                Show all → │  │
│  └───────────────────────────────────────────┘  │
│  ┌ Where it went ────────────────────────────┐  │  ← SpendRows, §6
│  │ Groceries  ███████████████     1 240,50   │  │
│  │ Home       ██████████             980,00  │  │
│  │ Transport  ██████                 610,40  │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
│                                          (＋)   │  ← floats, §2.9
┌ tab bar · 4 ────────────────────────────────────┐
│  Today   Ledger   Debt   Settings               │
└─────────────────────────────────────────────────┘
```

**The month is the hero, and net worth is a line.** The band used to carry
`DualTotal` at 54px plus the period and its two stat tiles — about 350pt of an
844pt screen, two fifths of it — and everything the day had actually changed began below the
fold. A total you own moves slowly and is checked occasionally; what changed
*this period* is what the app is opened for. So `MonthSummary` leads the ground
with §5's three figures in the shape `net = inflow − spend`, and `NetWorthStrip`
carries the total above it in one line, with S16 one tap away for the currencies
and the shared figures it cannot fit.

**`inflow` is stated, not implied.** `spent` and `net` alone leave the reader
subtracting to find out what came in — §5 computes all three and the card shows
all three.

**Where it went is §6, at leaf granularity, capped at five plus a named
remainder — six buckets give six named rows, because folding one category into
*Other* costs a name and saves no room.** The lead currency's categories only: arc-phone converts nothing
(§6 is class **S**), so a bar summing two currencies would be an invented
figure. An uncategorised bucket keeps its own name rather than folding into
*Other* — it is the one bucket a person can act on.

**The strip still refuses a toggle.** `NetWorthStrip` shows *mine* with *ours*
on a muted second line — never one at a time, because showing one at a time
invites reading the wrong number (`SPEC.md` §6.7). Where the ledger holds more
than one currency the strip says so, for the same reason: a partial total that
does not admit it is the same defect in a different shape.

**The period is steppable and selectable.** Arrows move one period at a time in
the current granularity, *Today* returns to the present, and tapping the label
or the stat row opens `PeriodPicker` — granularity (day · week · month · year)
plus presets and an arbitrary range. Both components already exist: the arrows
are the calendar's `PeriodHeader` (§6.3), the sheet is Reports' `PeriodPicker`
(§7). Nothing is invented here.

**Only the card is period-scoped.** Net worth is a balance *as of now* and does
not move when you step back to July; everything inside `MonthSummary` does, and
so does *where it went* below it. The arrows sit inside the card they govern,
under the strip rather than above it, so the boundary is positional rather than
something you have to be told.

Recent shows five rows, non-scrolling. It is a *confirmation surface*, not a
browsing one — S10 is a tap away for browsing.

**The Recent card is drawn only when there are rows to group.** An account
exists but nothing has been captured yet is `EmptyState(first-run)` on the
ground — *No transactions yet*, the same wording S10's first run uses — never
a *Recent* card with *Show all* over an empty column, which would be chrome
claiming a list exists and an action that shows nothing.

**Which empty it is, is a count, not a window.** Recent is the five most
recent rows; a window that came back empty is not the claim *this ledger has
never held a transaction*. Only an unfiltered count of the whole ledger may
choose the first-run wording — the same `searchTransactions({})` count S10
uses to tell its own two empties apart. A ledger that does hold rows gets
this screen's own ordinary empty and *Show all*, which goes where the rows
are — its own, because S10's ordinary empty names a filter as the reason and
Recent has no filter: it has a window. *Nothing recent* says the window came
back empty and the full list is where the rows are.

**What earns it the space is the pending row.** Outbox writes appear at the top
with their `pending` marker until they sync, so an offline save is visibly
landed on the screen you saved from. That is the one thing S10 cannot do for
you, and it is exactly when confirmation matters most — a save with no network
and no feedback is indistinguishable from a save that failed.

That marker exists only when the phone has a backend relationship and the write
is awaiting admission. On a phone-alone ledger, successful local
materialisation is the final save: the row appears as ordinary ledger data with
no sync-status marker.

Under the disposable preview profile, S04 renders the net-worth strip, the
month card (*kept so far*, *came in*, *went out*, stepped by month), the
unsettled-clearing banner when one exists, five Recent rows, *where it went*,
the Create account first-run action, the floating `+`, and the appearance
action. That profile omits the tab bar, voice, scan, sync state, and FX
presentation.

### Web — ≥1024px

**S04 does not exist on web.** Its job is answered by S01 Dashboard, which has
the canvas for widgets and the density for real reading. Duplicating it would
create two screens competing to be the landing surface, and the honest split is
that the phone answers *where do I stand* and the desktop answers *what
happened*.

## 4. Components

| Component | Notes |
|---|---|
| `Shell` | The sage band: the heading, the day, and the appearance action. **No `hero`** — see §3 |
| `NetWorthStrip` | *Mine* on the ground in one line, *ours* and any second currency muted beneath it. Pressable → S16. Renders above the error branch, so a failed refresh keeps it (§6) |
| `MonthSummary` | The hero. `PeriodHeader` + *kept so far* + the `StatTile` pair. Draws three zeroes for a period the ledger did not exist in — that is the true answer, not an empty state |
| `SpendRows` | *Where it went* — §6 at leaf granularity, five rows plus a named remainder (six buckets give six named rows), bars proportional to the largest row, one colour |
| `PeriodHeader` | `‹ label ›` + *Today*. Steps by the current granularity (§6.3) |
| `PeriodPicker` | Opened by tapping the label or stat row — granularity, presets, arbitrary range (§7) |
| `StatTile` | *Came in* and *went out*, inside `MonthSummary`. **Period-scoped**; the strip above it is not |
| `Banner(warn)` | Unsettled clearing — rendered **only when non-zero**, with one action |
| `Card` | Wraps Recent — a grouped list of rows, `title="Recent"` + `action="Show all"`. **Only when Recent has rows**; an empty ledger renders `EmptyState(first-run)` on the ground instead |
| `TransactionRow` | Recent; `TransferRow` for transfers; `BIZ` tag where business |
| `BrandIcon` | `TransactionRow`'s own leading mark for a recognised merchant — ORLEN, YouTube, or another the bundled catalogue carries (§14.4b). Offline, never blank: an unmatched payee falls back to its monogram |
| `FxAmount` | Any foreign row — `local · rate · display`, the rate for that row's own date (P1) |
| `TabBar` | 4 tabs, all ≥44px. `+` is not one of them |
| `FloatingAdd` | The `+`, above everything, wherever it was last put (`02-tokens` §2.9) |
| `EmptyState(first-run)` | Two of them. No accounts — offers create; the import path is S29's, and arrives with it (no route exists yet, and this screen invents none). Accounts but no transactions — *No transactions yet*, S10's own wording, in place of the Recent card. *No transactions yet* is chosen by an unfiltered count, never by an empty Recent window: a ledger holding rows Recent did not return gets `transactions.emptyRecentTitle`/`emptyRecentBody` and *Show all* instead |
| `AppearanceButton` | Header action; opens the appearance sheet |
| `BottomSheet(appearance)` | Radio choices: System, Light, Dark |

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
| Loading | Not modelled — the replica read is synchronous SQLite, with no in-between moment to show a skeleton for (`09-state-matrix.md`) |
| Populated | As drawn |
| Empty | `EmptyState(first-run)` when no accounts exist. Reachable if J1 was abandoned; offers *Add an account*. *Import from Money Manager* is S29's path — the setup wizard, which S16 enters by that name — and arrives with it; until then this state offers create alone rather than an action with nowhere to go. Accounts with no transactions is the second empty: the strip and the month card stay — three zeroes is the true answer for that period — and *No transactions yet* replaces the Recent card rather than emptying it. *Where it went* draws nothing at all, because there is no row to name. That wording is chosen by the unfiltered count — a ledger that holds rows Recent did not return gets this screen's ordinary empty, `transactions.emptyRecentTitle` (*Nothing recent*) and `emptyRecentBody`, with *Show all*. Its own pair rather than S10's: S10's body names an excluding filter, and Recent has a window, not a filter |
| Error | Balance query failed → `ErrorState(recoverable)` in the ground panel; **the strip and the month card keep their last known figures** rather than blanking. They render above the error branch for that reason, which a test pins |
| Offline | Cached, with `Banner(neutral)` — *showing data as of 14:06*. Capture stays fully available; that is the point of the outbox |
| Gated | n/a — single user |

## 7. Interaction

### Mobile
`+` floats and is placed by the thumb that uses it — dragged to either side, or parked on the bottom edge — so it is reachable from either hand by construction. Pull to
refresh re-syncs rates and balances. Recent rows swipe to categorize (short) and
to edit (long) — never to delete (`design-system/05` §5.6). Haptic on save
arrival.

The appearance action in the header opens a bottom sheet containing exactly
System, Light, and Dark. The choice persists across launch. System follows the
device scheme; choosing Light or Dark overrides it. A change repaints S04 in
place and does not remount the screen or discard navigation or form state.

Until C4's ledger list merges, the unsettled banner's `Open` action lands on
`/ledger?account=<id>` — the stub §3 names — rather than the Shared rule
below; that needs a real, filterable transaction list this card does not
build.

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
   balance is as-of-now; the month's figures are period figures. Putting the
   arrows inside the card they govern, under the net-worth strip, makes that
   positional instead of something the interface has to explain.
