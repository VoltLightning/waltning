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
Browsing the ledger and picking a date are this screen, one swipe away. See §3.

## 3. Layout

### Mobile — 390pt

**S04 is four views of one date, and a swipe moves between them.**

```
┌ shell ──────────────────────────────────────────┐
│  ‹  September  ›            −4 320,18     [🔍] │  ← PeriodBar, shared
│   Summary    List    Calendar    Months         │  ← PageTabs, marker under one
│  ─────────────────────────────────────────────  │
└─────────────────────────────────────────────────┘
```

| Page | Answers | Granularity |
|---|---|---|
| **Summary** | Where do I stand, and how do I get to the rest | the month |
| **List** | Everything, in order, forever | the day |
| **Calendar** | What did this month look like | the day |
| **Months** | What did this year look like | the month |

**There is one date, and the four pages are four ways of looking at it.** That
is what makes a swipe feel like turning a page rather than opening a screen.
Pick August on Months and List is in August; scroll to 25 May on List and
Calendar has 25 May marked. Day-precision pages read and write the date
exactly. Summary and Months read its month, and **picking a month sets the
date to that month's newest day** — a reverse-chronological list is entered
from its end, not its start.

**The chrome is shared and does not move.** One row: the period with its
arrows, the figure for whatever period the current page is in, and search.

**The year appears only when it is not this one.** *September* while you are
in 2026; *March 2024* once you have stepped out of it. Five things share
326pt, and the year is the one of them that is usually already known — a bar
that wrapped to two lines to repeat it would be spending a row on the least
surprising word on the screen.

**The agent is a tab, because `⌘K` is a desk gesture and the top-right corner
is the hardest point on a 390pt phone to reach.** S03 has been reachable from
any screen since it was written, and on the phone it was reachable from
nowhere. A header button was drafted first and did not survive its own
argument: it was justified as *contextual*, then routed to a full screen that
drops the context. Tier 1 at a few-times-a-week is tab frequency, every other
top-level destination is a tab, and the bottom bar is the half of the screen a
thumb owns.
**The arrows step the unit the page is in** — a month on Summary, List and
Calendar; a year on Months — and the label always says which, so the control
never has to be explained.

**`PageTabs` is what makes the swipe exist.** A gesture with no visible
affordance is a gesture only its author knows about, so the four names are
drawn and the marker rides a hairline beneath them. Tapping a name is the
same action as swiping to it; neither is the primary.

#### Summary

```
│  ┌ Kept so far ────────────────────────────────┐│  ← MonthSummary
│  │ +3 529,82 zł                                ││
│  │ ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░ ││  ← FlowBar: out against in
│  │ Came in                            Went out ││
│  └─────────────────────────────────────────────┘│
│  ┌ Where it went ──────────────────────────────┐│  ← SpendRows, §6
│  └─────────────────────────────────────────────┘│
│  GO TO                                          │
│    Between us          Import                   │
│    Recurring           Subscriptions            │
│    Categories          Tax timeline             │
```

**The landing page, and the one the app opens on.** §1's question is answered
here; the other three are where you go once it has been.

***Go to* carries only what nothing else does.** Accounts and the agent are
tabs, so a card for either would be a second door into the same room — and a
second door is worse than none, because now there are two things to keep
current.

**Debt is here rather than in the tab bar, and gains by it.** *Between us* is a
figure you check, not a place you live; as a tab it was a word and an icon, and
as a card it carries `+1 480,00 zł · 3 people`. Every card carries a figure, so
the grid reads as status rather than as a menu — which is the whole reason a
low-frequency destination is better off in it.

#### List

The whole ledger, continuous in both directions, with `DayRibbon` under the
tabs reporting where it is. Everything §5, §6 and §7 say about the list is
this page.

#### Calendar

The month's shape as a grid of days, each carrying the same activity mark
`DayRibbon` uses, with the tapped day's entries open beneath it. **This is
S11's phone layout, restored.** An earlier draft folded the calendar into the
list as a drop-down panel, on the reasoning that *see as list* was a handoff
worth removing. The handoff was never the problem — its price was. A swipe
costs nothing, so the calendar can be a view again, and a whole page serves it
better than a panel dropped over something else.

#### Months

Every month of the year with its income and spend, the current one marked.
Tapping one moves the shared date and stays on the page, so a year can be read
without leaving it.

### Web — ≥1024px

**S04 does not exist on web.** Its job is answered by S01 Dashboard, which has
the canvas for widgets and the density for real reading. Duplicating it would
create two screens competing to be the landing surface, and the honest split is
that the phone answers *where do I stand* and the desktop answers *what
happened*.

## 4. Components

| Component | Notes |
|---|---|
| `Shell` | `PeriodBar` + `PageTabs`, shared by all four pages and never scrolled away |
| `PeriodBar` | The period with its arrows, the current page's figure, search, and the agent. The arrows step **the unit the page is in**; the year is drawn only when it is not the current one |
| `PageTabs` | Summary · List · Calendar · Months, a marker on a hairline. What makes the swipe discoverable |
| `Pager` | The four pages, swiped or tapped between, over one shared date |
| `GatewayGrid` | Summary's *Go to* — six cards, each with a figure. Only destinations neither the tab bar **nor the shared bar** carries, which is why Accounts, Debt and the agent are absent from it |
| `NetWorthStrip` | *Mine* on the ground in one line, *ours* and any second currency muted beneath it. Pressable → S16. Renders above the error branch, so a failed refresh keeps it (§6) |
| `MonthSummary` | The hero, opening month only. *Kept so far* stacked over its figure, a `FlowBar`, then the labelled pair. Draws three zeroes for a period the ledger did not exist in — that is the true answer, not an empty state |
| `FlowBar` | Track is *came in*, fill is *went out*, gap is *kept*. Fill clamps at 100%; a deficit is carried by the figures, not by an overrunning bar |
| `SpendRows` | *Where it went* — §6 at leaf granularity, five rows plus a named remainder, bars proportional to the largest row, one colour. Opening month only |
| `DayRibbon` | Under `PageTabs`, on the List page only. Continuous, horizontally scrollable, clipped at both edges. 48×66 cells with the day number at 17px and room around the weekday letter. Activity mark per §3 |
| `MonthGrid` | Calendar's own grid — a day per cell with `DayRibbon`'s activity mark, ≥44px |
| `MonthRows` | Months' twelve rows, income and spend per month |
| `DayGroup` | A day's rows under its date and total. The list's only grouping |
| `QuietDay` | One empty day: a single muted line |
| `QuietRun` | Two or more consecutive empty days: one row naming the span and its length, with *Show* |
| `ExpectedGroup` | A future day. Dashed border, muted type, figures in neither the income nor the expense colour — it is not money yet |
| `TransactionRow` | `TransferRow` for transfers; `BIZ` tag where business |
| `BrandIcon` | `TransactionRow`'s leading mark for a recognised merchant (§14.4b). Offline, never blank: an unmatched payee falls back to its monogram |
| `FxAmount` | Any foreign row — `local · rate · display`, the rate for that row's own date (P1) |
| `Banner(warn)` | Unsettled clearing — rendered **only when non-zero**, with one action |
| `TodayPill` | Floats over the list when the list is away from today. The only way back from a jump (§6) |
| `FilterChip` | The carried filter, pinned under `PageTabs`: what it is, and an `✕` that clears it. One chip — this screen receives a filter, it does not compose them. Composing is `FilterBar`, and it is S10's, on the desk |
| `TabBar` | 4 tabs, all ≥44px — Home · Accounts · **Agent** · Settings. **No Ledger tab**: this screen is the ledger, so one would lead where you already are. **No Debt tab**: it is a figure you check, not a place you live, and it reads better in *Go to* where it can carry one. `+` is not a tab, though it may come to rest between Accounts and Agent (`02-tokens` §2.9) |
| `FloatingAdd` | The `+`, above everything, wherever it was last put (`02-tokens` §2.9) |
| `EmptyState(first-run)` | No accounts — offers create; the import path is S29's and arrives with it. No transactions — §6 |
| `AppearanceButton` · `BottomSheet(appearance)` | Moved to S30 · Settings. The header has one action, and it is the picker |

**`PeriodPicker` is not used here, and Reports keeps it.** A panel offering
day/week/month/year over a list was the earlier answer to *reach a far date*;
the pager answers it with two of its own pages and a swipe, which is the same
reach without a panel to open and close. Reports (§7) still wants a picker,
because a report has no pager to borrow.

**`PeriodHeader` retires into `PeriodBar`.** Its arrows and its *Today* are
here, stepping whatever unit the page is in.

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
month rules mark the gaps, and **Calendar and Months carry match counts instead
of their figures** — so *how often, and when* is answered by the pages you were
already going to swipe to. Search needs no navigation of its own, and it holds
across the pages the way the date does.

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
