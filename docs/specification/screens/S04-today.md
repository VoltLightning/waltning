# S04 · Today

**Surface** mobile · **Journeys** J2, J5, J6, J7, J8 · **Frequency** several times a day
**Design** [S04.html](design/S04.html)
**Status** specified · tier 1

---

## 1. Purpose

Answer the only question a daily user opens the app for — **where do I stand,
and does anything need me** — and then keep going, because the same list that
shows today is the list that shows every day before it.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| App launch | Default tab | — |
| Any tab | Tab bar | — |
| S05 | Save | S04, with the new row in today's group |
| S16 | An account row or a group title | S16, **filter carried and visible** |
| S25 | A chart element | S25, scrolled to the period |
| Push notification | Unsettled clearing, failed backup | The thing it names |

**Exits** — `+` → S05 · Scan → S07a · say-a-transaction → S05 in voice mode ·
a row → S09 · the net-worth strip → S16 · unsettled banner → J8 allocation ·
tab bar → S16, S12, S30.

**S04 has no *show all*, and the tab bar has no Ledger or Calendar tab.**
Browsing the ledger and picking a date are this screen, at a different scroll
position and with the picker open. See §10.

## 3. Layout

### Mobile — 390pt

**At rest** — the header is present, so the strip is not:

```
┌ shell ──────────────────────────────────────────┐
│  September                            [ 📅 ]    │  ← header · picker action
│  Three days in — all quiet                      │
└─────────────────────────────────────────────────┘
┌ ground panel ───────────────────────────────────┐
│  ┌ mine   48 620,84 zł                       › ┐│  ← NetWorthStrip → S16
│  ┌ Kept so far ────────────────────────────────┐│  ← MonthSummary, the hero
│  │ +3 529,82 zł                                ││
│  │ ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░ ││  ← out, against in
│  │ Came in                            Went out ││
│  │ +7 850,00 zł                  −4 320,18 zł  ││
│  └─────────────────────────────────────────────┘│
│  ⚠ 340,00 zł unallocated · dinner, 6 Aug        │  ← only when non-zero
│  ┌ Where it went ────────────────────────────┐  │  ← SpendRows, §6
│  │ Groceries  ███████████████     1 240,50   │  │
│  └───────────────────────────────────────────┘  │
│  ┌ TODAY                            −184,50 ─┐  │  ← the list begins, and
│  │ Market B     Groceries · Bank A  −96,00   │  │    does not end
│  │ Café A       Eating out · Cash   −48,90   │  │
│  └───────────────────────────────────────────┘  │
│  ┌ FRIDAY 4 SEPTEMBER               −213,40 ─┐  │
│  │ Clinic G     Health · Bank A    −180,00   │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
│                                          (＋)   │
┌ tab bar · 4 ────────────────────────────────────┐
│  Home    Accounts    Debt    Settings     (＋)  │
└─────────────────────────────────────────────────┘
```

**Scrolled** — the header has gone, so the strip has arrived and stays:

```
┌ DateStrip · pinned ─────────────────────────────┐
│  August 2026        −3 210,40            [ 🔍 ] │  ← label · figure · one icon
│ ‹│ S  │ M  │ T  │ W  │ T  │ F  │ S  │ S │›      │  ← DayRibbon, scrolls with
│  │10  │11  │12  │13  │14 ●│15  │16  │17│        │    the list, clipped both ends
└─────────────────────────────────────────────────┘
┌ the list ───────────────────────────────────────┐
│  ┌ THURSDAY 14 AUGUST               −296,00 ┐    │
│  │ Clinic G     Health · Bank A    −180,00  │    │
│  └──────────────────────────────────────────┘    │
│    Wednesday 13 August ············· nothing     │  ← one quiet day
│  ┌ 3 – 27 August · 25 days           [Show] ┐    │  ← a quiet run
│  └──────────────────────────────────────────┘    │
│                  ( ↑ Today )                     │  ← floats, only when away
└─────────────────────────────────────────────────┘
```

**The header and the strip are one control in two states.** At rest the screen
is the layout it has always been and there is no strip; scrolling collapses the
header into `DateStrip`, which then carries the month and its running figure, so
the month summary never actually leaves — it gets small. A strip drawn *as well
as* the header is a band wedged between two cards: a seam, not an element.

**`MonthSummary` puts the label above the figure and the figure on its own
line.** A label to the left of a number on one baseline leaves the number
nowhere to breathe and shrinks the currency to fit beside it; S05's amount field
already solved this and this card uses its shape. Every figure on the card
carries its currency — `<Amount>` renders `1 234,56 zł` and a figure without the
suffix is not a quieter design, it is a different component
(`design-system/04` §4.1).

**The bar is the arithmetic, not two shares.** Its track is *came in* and its
fill is *went out*, so the gap that remains is *kept so far* — the same
subtraction the three figures state, in a form readable without reading any of
them. Two proportional halves would say something else and something less: how
the month's flow divided, which nobody asks.

**When the month spent more than it took in, the bar fills and stops.** *Kept
so far* goes negative and takes the expense ink; the fill does not overrun its
track, because a bar longer than its own container is a graphic that has to be
explained. The figures carry the overshoot, which is what figures are for.

**The list is the whole ledger, and it is continuous in both directions.**
Scrolling down passes into August, July, and back to the opening balance;
scrolling up passes into what is expected. There is no *show all*, because
there is nowhere else for it to go.

**Only the top month carries a summary.** `MonthSummary` and `SpendRows`
describe the month you are in when the screen opens. Scroll back and you get
days and their figures; the strip's month total is the one aggregate that
follows you. Laying a fresh summary at every month boundary would turn the
scroll into a stack of monthly reports, which is S25's job and needs S25's
width.

**The strip carries three things and no more.** The month, its figure, one
icon. It had four — a bordered pill inside a bordered band, a figure, and two
buttons — and at 388px of content in a 326px row it could not fit, which is
what made it read as clutter. Return-to-today is a floating pill over the list
that exists only when you are away from today.

**Where the visible days span two months the label says both** — `Aug – Sep
2026` — rather than naming one and being wrong for half the strip. The label
follows the list, not the week.

**`DayRibbon` scrolls; it does not page.** It is a continuous run of days
clipped at both edges, translating with the list rather than advancing a week
at a time. The slivers at each end are load-bearing: they are what says there
is more in both directions.

**The strip reports; it does not select.** It marks whichever day the list is
showing, and tapping a day scrolls there. A selector alongside a scroll gives
two sources of truth for *what day am I on*, and they diverge on the first
fling.

**Filtered, this is the same screen with one clause added.** S16 hands it an
account or a group, S25 a period; the filter pins under the strip as a chip
that says what it is and dismisses, the same *carried and visible* contract
S10 states for every drill-through it receives. The list, the strip, the
ribbon and the picker are unchanged — they simply describe less.

```
┌ DateStrip · pinned ─────────────────────────────┐
│  August 2026        −1 120,40            [ 🔍 ] │
│ ‹│ S  │ M  │ T  │ W  │ T  │ F  │ S  │ S │›      │
│  ┌ Bank A · PLN                           ✕ ┐  │  ← the filter, dismissible
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**Everything on the screen scopes to the filter, including the month card.**
The strip's figure, the ribbon's activity marks, the picker's per-tile figures
and `MonthSummary` all describe the filtered set. A summary of everything
sitting above a list of one account is the §5 defect — a figure whose scope the
screen has no way to state — and here the chip states it, so the honest thing
is to make the figures obey it.

***Where it went* does not scope, and is not drawn.** §6 is class **S** and
takes no account clause; a category breakdown of everything above a filtered
list would be the same defect the paragraph above avoids. Filtered, the card
is absent rather than wrong.

**A day's mark means activity, never direction.** `DayRibbon`'s dot varies in
size and darkness with how much moved that day, and never in hue. A salary day,
a day of transfers between your own accounts, and a day netting to zero all
read wrong the moment the mark means *spending*; and a mark whose only signal is
colour fails WCAG 1.4.1 besides. Direction lives in the list and in the day's
figure, where a sign can be read.

**What this screen absorbed.**

**S10 · Transactions list, at phone width.** This screen scrolled, with search
in the strip. A separate browsing surface existed because Recent was a five-row
window; once the window is the whole ledger there is nothing left for a phone
ledger to do that a scroll position does not. **S10 survives on the desk**,
where it is a sortable table with a filter rail — a shape 390pt has no columns
for, and the destination S01's widgets and S25's charts drill into.

**S11 · Calendar, at phone width.** `PeriodPicker` at day depth is the calendar
here: the same grid and marks, expanding over the list rather than replacing
it. *See as list* was always a calendar admitting it could not show you one.
**S11 survives on the desk**, where a wide cell carries per-day entry previews
and the four scales and two navigation modes a phone cell has no room to mean.

**S01 · Dashboard is untouched.** It does not exist at phone width and this
screen does not exist on web; neither absorbs the other.

**Nothing is deleted, and no screen ID retires.** Each of the three keeps the
surface it is good at, which is the same rule S01 already states about itself.

### Web — ≥1024px

**S04 does not exist on web.** Its job is answered by S01 Dashboard, which has
the canvas for widgets and the density for real reading. Duplicating it would
create two screens competing to be the landing surface, and the honest split is
that the phone answers *where do I stand* and the desktop answers *what
happened*.

## 4. Components

| Component | Notes |
|---|---|
| `Shell` | The heading, the day, and the picker action. Present at rest only; scrolling replaces it with `DateStrip` |
| `NetWorthStrip` | *Mine* on the ground in one line, *ours* and any second currency muted beneath it. Pressable → S16. Renders above the error branch, so a failed refresh keeps it (§6) |
| `MonthSummary` | The hero, opening month only. *Kept so far* stacked over its figure, a `FlowBar`, then the labelled pair. Draws three zeroes for a period the ledger did not exist in — that is the true answer, not an empty state |
| `FlowBar` | Track is *came in*, fill is *went out*, gap is *kept*. Fill clamps at 100%; a deficit is carried by the figures, not by an overrunning bar |
| `SpendRows` | *Where it went* — §6 at leaf granularity, five rows plus a named remainder, bars proportional to the largest row, one colour. Opening month only |
| `DateStrip` | Pinned once the header has gone. Label + period figure + one icon. Label opens `PeriodPicker`; icon is search |
| `DayRibbon` | Inside `DateStrip`. Continuous, horizontally scrollable, clipped at both edges. Cells ≥44×44 with the day number at 17px. Activity dot per §3 |
| `PeriodPicker` | Expands over the list. Three depths — days, months, years — one panel, one grammar: the label goes up a level, a tile comes back down. Tiles ≥44px carrying their own figure. Replaces S11 |
| `DayGroup` | A day's rows under its date and total. The list's only grouping |
| `QuietDay` | One empty day: a single muted line |
| `QuietRun` | Two or more consecutive empty days: one row naming the span and its length, with *Show* |
| `ExpectedGroup` | A future day. Dashed border, muted type, figures in neither the income nor the expense colour — it is not money yet |
| `TransactionRow` | `TransferRow` for transfers; `BIZ` tag where business |
| `BrandIcon` | `TransactionRow`'s leading mark for a recognised merchant (§14.4b). Offline, never blank: an unmatched payee falls back to its monogram |
| `FxAmount` | Any foreign row — `local · rate · display`, the rate for that row's own date (P1) |
| `Banner(warn)` | Unsettled clearing — rendered **only when non-zero**, with one action |
| `TodayPill` | Floats over the list when the list is away from today. The only way back from a jump (§6) |
| `FilterChip` | The carried filter, pinned under the ribbon: what it is, and an `✕` that clears it. One chip — this screen receives a filter, it does not compose them. Composing is `FilterBar`, and it is S10's, on the desk |
| `TabBar` | 4 tabs, all ≥44px — Home · Accounts · Debt · Settings. **No Ledger tab**: this screen is the ledger, so one would lead where you already are. `+` is not a tab, though it may come to rest in the bar (`02-tokens` §2.9) |
| `FloatingAdd` | The `+`, above everything, wherever it was last put (`02-tokens` §2.9) |
| `EmptyState(first-run)` | No accounts — offers create; the import path is S29's and arrives with it. No transactions — §6 |
| `AppearanceButton` · `BottomSheet(appearance)` | Moved to S30 · Settings. The header has one action, and it is the picker |

**`PeriodPicker` is the existing component, not a new one.** Reports' picker
already carries granularity, presets and an arbitrary range (§7); this screen
opens it from the strip's label and it gains the per-tile figures. `PeriodHeader`
retires — its arrows and *Today* are the ribbon and the pill.

## 5. Data

| Reads | Writes |
|---|---|
| `get_balances` — scoped to *mine* and *ours* | — |
| `spend_by_period` — the visible period: `spend`, `inflow`, `net` | — |
| `spend_by_category` — the opening month, scope `mine` | — |
| `search_transactions` — a windowed page around the anchor date, both directions, with the carried filter | — |
| `spend_by_period` — one row per picker tile, at the picker's granularity | — |
| `get_projections(period)` from `recurring_transactions` — expected entries, to the horizon (§6) | — |
| `find_unsettled` — clearing balances ≠ 0 | — |
| FX sync state | `sync_fx_rates` on foreground (§7.6) |

**S04 writes nothing.** Every mutation is a navigation away — which is what
keeps it fast and what makes it safe to render from cache offline.

**Both period figures are `mine` — own accounts only — and the screen has no
scope control to say so.** `spend_by_period` has always been own-accounts (§5);
`spend_by_category` is asked for the same scope so *where it went* breaks down
the *went out* directly above it. §6.7's named shared row is a desk figure
(`S01`'s widgets); the phone shows the half it can total honestly, and S16 is
where the shared accounts are.

**A day's total is only drawn when it can be computed.** Where a day holds more
than one currency the total converts at each row's **accounting date** and is
marked approximate (`≈`). Where a rate for that date has not arrived the day
shows **no total at all** and says why — never a total that silently omits the
rows it could not convert. Transfers between own accounts appear in the day's
rows and in neither its spend nor its inflow.

## 6. States

| State | Treatment |
|---|---|
| Loading | Not modelled for the replica window — the read is synchronous SQLite. Beyond it, §10 |
| Populated | As drawn |
| Empty · no accounts | `EmptyState(first-run)`, offering create. **No summary, no strip, no empty chart** — nothing has happened, so the screen says so and offers the two ways to make it happen |
| Empty · no transactions | Strip and month card stay: three zeroes is the true answer for that period. *No transactions yet*, S10's wording, in place of the list. *Where it went* draws nothing |
| Empty · filtered | `EmptyState(filtered)` — names the account or group and the count it excluded, with a *Clear* that drops the chip. Never the first-run wording: the ledger holds rows, this filter does not |
| Empty · today only | The month card stays; today gets a named card saying nothing is recorded and what is next, with one action. The list continues into yesterday beneath it |
| Error | Balance query failed → `ErrorState(recoverable)` in the ground panel; **the strip and the month card keep their last known figures** rather than blanking. They render above the error branch, which a test pins |
| Offline | Cached, with `Banner(neutral)`. Capture stays fully available; that is the point of the outbox. Past the replica window, §10 |
| Gated | n/a — single user |

**The list is infinite in both directions, so both directions need an end, and everything between needs a rule.**

The list is infinite in both directions, so both directions need an end, and
everything between needs a rule.

| Boundary | Rule |
|---|---|
| **Cold open** | Anchored on today, whether or not today holds anything |
| **Forward horizon** | Expected entries stop at the **end of the current month**, with a stated reason. Recurring rules repeat forever, so a horizon is not optional; this one answers *what is still coming before the month turns* and nothing wider. S21 Recurring and S34 Subscriptions are where a rule's whole future lives, and a list that projected a quarter would be answering their question badly on a screen that cannot show a rule |
| **Expected that arrived** | The real transaction replaces the expected one in place and is marked as having been expected. Never both |
| **Expected that did not arrive** | Stays in its own past day, still dashed, still uncoloured. It is a rule that did not fire, not a debt |
| **Backward end** | The opening balance, marked as first. There is nothing before it by construction: every figure above is derived from it |
| **The far end is reachable offline** | There is no window to hit. The replica is a complete copy of the whole ledger (`architecture/14` §14.0 — *no 400-row window*, no TTL, not evicted), so scrolling to 2021 on a plane reads local rows like every other day. Offline changes what this screen can *compute*, never what it can reach: §6's cached banner and the class **S** figure are the whole story |
| **Quiet day** | One line |
| **Quiet run** | Two or more consecutive: one row naming the span and its length, with *Show*. Twenty-five days is not twenty-five rows |
| **A jump** | Picking a far date loads that date's neighbourhood and **nothing between**. Scrolling from there walks outward day by day; `TodayPill` is the only way back. The list is never asked to guess a scroll position for content it has not loaded, which is the defect that makes infinite lists jump under the reader |
| **In flight** | An outbox row appears in its day with a `pending` marker until it syncs — the one thing a separate list could never do, and exactly when confirmation matters most. On a phone-alone ledger, local materialisation is the final save and no marker is drawn |
| **A conflict** | S35 arriving for an older entry surfaces as one banner in the list at the current position, naming the month it concerns. It does not scroll the reader to it |

## 7. Interaction

`+` floats and is placed by the thumb that uses it. Pull to refresh re-syncs
rates and balances. Rows swipe to categorize (short) and to edit (long) — never
to delete (`design-system/05` §5.6). Haptic on save arrival.

Tapping the unsettled banner goes **straight to the unallocated transaction**,
not to a list. A warning that costs you a search is a warning you learn to
ignore.

**Search is the strip's icon, and it filters this list.** Day grouping survives,
month rules mark the gaps, and `PeriodPicker`'s tiles carry **match counts**
instead of totals — so *how often, and when* is answered by the control you were
already going to use to jump. Search needs no navigation of its own.

**Accessibility is a constraint, not a review note.** Every target in the strip
and the picker is ≥44×44. Nothing encodes meaning in hue alone. A ribbon cell's
accessible name is its full date and what happened — *Thursday 14 August, 296
złoty out, three entries* — never the bare number the eye reads. The
scroll-to-date transition is suppressed under reduce-motion, which lands the
list at the destination without traversal.

## 8. Rules this screen must obey

- **P1** — every foreign row carries its basis. The hero total is one currency,
  so it carries none; each row beneath it does.
- **P4** — the unsettled banner is the only amber on this screen, except the
  two boundary notices in §10, which state their meaning in words first.
- **P5** — a banner states its meaning in words; the tint is reinforcement.
- **§6.7** — both totals, always, and never placed where summing them suggests
  itself.
- **WCAG 1.4.1** — no meaning carried by colour alone, which is why the ribbon's
  dot varies in size as well as darkness.

## 9. Open questions

1. ~~**How far forward?**~~ **Decided: to the end of the current month.** The
   alternative was a fixed count of expected entries, which is steadier for a
   sparse ledger and jumpier for a dense one — adding four monthly bills would
   silently pull the horizon from ten months out to five, and *what is left this
   month* would stop being answerable by looking.

   The narrow horizon is also what keeps S21 and S34 worth their screens: this
   list says what is still coming before the month turns; a rule's whole future
   is a different question and belongs where a rule can be edited.
2. ~~**Is there a replica window?**~~ **There never was one.**
   `architecture/14` §14.0 already states it — *the replica holds the whole
   ledger, no 400-row window* — and `SPEC.md` §14.3 that it is not evicted and
   has no TTL. An earlier draft of this screen invented an eighteen-month window
   and a boundary notice to go with it; both are removed. The whole ledger is
   reachable offline, and offline constrains only what can be **computed** (§5's
   class **S** figure), never what can be reached.
3. ~~**Are the picker's per-tile figures readable offline?**~~ **Decided by
   `computations.md`: yes.** §5 period spend is class **R** for the base figure,
   so the strip's figure and every picker tile compute from the replica. The
   **S** half of §5 is shared-boundary netting, which this screen never reaches
   — both its period figures are `mine`, own accounts only. Search counts are
   replica rows, not an aggregate.

   The one figure on this screen that is genuinely **S** is *where it went*
   (§6, two `UNION ALL` branches that miscount a multi-line transaction). It is
   already server-only and stays so; offline it does not draw, which is the
   existing behaviour and not something the infinite list changes.
