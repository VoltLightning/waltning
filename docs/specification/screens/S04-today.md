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
┌ at rest ────────────────────────────────────────┐
│  September  ⌄                             [🔍]  │  ← PagerHeader, shared
│  2026                                           │
│   Summary    List    Calendar    Months         │  ← PageTabs, marker under one
│  ─────────────────────────────────────────────  │
└─────────────────────────────────────────────────┘

┌ scrolled ───────────────────────────────────────┐
│  September 2026 ⌄            [‹│›]        [🔍]  │  ← the same header, collapsed
│   Summary    List    Calendar    Months         │
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

**The chrome clears the status bar itself.** It is the top of the screen on a
tab root, so the inset is its own — nothing above it can apply one.

**The marker follows the finger, and so does the ink.** `PageTabs` reads the
pager's offset in page units rather than which page is active, so a
half-finished swipe leaves the marker half-way between two names and the two
labels half-toned. A marker driven by the active page can only jump when the
gesture ends, which makes the bar look like it is reacting to the swipe rather
than being part of it.

**The title is the month on three pages and the year on Months.** It names the
period the page in front of you is actually showing — three of them show a
month, and Months shows twelve. *June* over a page of 2026 was the one label on
this screen naming something the page was not drawing; the arrows already step
a year there (§4), so the title and the control now agree. What does not change
with the page is the title's *shape*: it is a large tappable title on all four,
because a picker's affordance disappearing exactly where a reader wants it is
the failure this label was first written to avoid. On Months it opens the year
picker instead of the month one.

**The chrome is shared and never scrolls away, but it changes shape.** The
header has two layouts and the scroll chooses between them, continuously —
it is one control resizing, not two headers swapping.

- **At rest** the month is a large title and **the whole title is the picker**:
  tapping it opens `PeriodPicker` — a sheet holding the year and its twelve
  months — which is where you go when the month you want is not the next one.
  There are no arrows. At the top of a screen the answer to "somewhere else" is
  usually not "one step", and a stepper flanking a title makes the title look
  like a value being scrubbed.
- **Scrolled** the title shrinks to a single row and **the stepper appears**
  beside search, as one control with a divider rather than two loose chevrons.
  The title is no longer a target worth aiming at, and stepping is what you
  want while reading a month — so the control arrives exactly when the reason
  for it does.

The month never moves sideways and never changes colour; it changes size. The
year travels: it sits under the month at rest at a caption's size and stands
beside it collapsed at the month's own, and it crosses between the two in one
motion — out from under the month first, then up onto its row and growing as it
rises, never both at once. It is one element throughout, so it carries one
weight: `displayThree`'s, at the caption's size while it is up there rather
than the caption's own lighter weight. That is the price of the year being a
thing that moves rather than two things that trade places, and it is the right
price. The caret follows whatever the title now ends with, and the stepper is
the one thing that fades, because it is the one thing that is genuinely new
rather than a smaller version of something already on screen.

**Every part has to fit inside the header at every offset, not only at the
ends.** The header clips, so a part drawn past its bottom edge is cut with no
error and no warning — and both ends of the travel still look perfect. The year
grew to full size while it was still in the caption's slot once, and a third of
its digits were sliced for a third of the travel before a baseline caught it.
The year therefore grows on the rise, and the room under the row is only
reclaimed as the year leaves it.

**Nothing in the title is ever drawn twice, and nothing in it fades.** Each
part is one element that moves. Two stacked layouts cross-faded is the obvious
way to build this and it was the wrong one: the two fades met at zero, so the
header was *blank* at the midpoint of the travel and under half lit across
fourteen of the thirty-six points it collapses over — which is a bar that
flickers out and back for any reader who scrolls slowly, and a second copy of
the month in the accessibility tree the whole time. The same rule the page
transition is held to (§ *the opacity dips and never reaches zero*) is the rule
here, and one element that moves is how it is kept rather than a fade that is
careful.

The parts are laid out once at their larger size and *scaled* down from there,
never re-typeset: type that reflows every frame puts a text layout in the
scroll's critical path, and type scaled up is a raster stretched past the size
it was drawn at. Where the year lands is the month's own width plus a gap, and
a month's width is its word in the reader's language — so the two words report
their widths and the arithmetic is done from those, with the resting layout as
the base so a header draws correctly before it has measured anything.

**The pages arrive from the side you stepped from, when the page on screen
actually changed.** Months shows a year and the other three show a month, so
tapping a row on Months moves nothing — that page draws the same twelve rows
either way, with a different one marked, and a page that moves when its own
contents did not reads as a remount. Swiping between pages moves nothing
either: the pager is already animating that gesture, and two motions over one
gesture is a screen that looks like it reloaded.

Stepping or picking a month replaces every figure on the pages that show one, and swapped instantly
that reads as a redraw rather than as a move — nothing says which way you went,
and on a slow read it is not obvious anything happened. A later period comes in
from the right, an earlier one from the left, which is the one thing the figures
cannot say themselves. The opacity dips and never reaches zero: a page that
vanishes and returns flickered, where one that dips moved, and the figures stay
readable on the step a reader is watching a number for.

**The picker is a sheet, not a page.** The title routed straight to the Months
page first, and rendered that read as a bug: tapping *September* collapsed the
header and left a year on screen, with nothing to choose from and no sign the
pager had changed page at all. A control whose affordance says *choose* has to
answer with a choice. The sheet holds a year of months at once — twelve is the
whole set and it fits in four columns, where a list would make the reader
scroll to find out there was nothing more to find. Its year steps
independently, so looking at 2024 is not choosing a month in it. Every month is
offered including the empty ones, because a grid that hid them would change
shape as the ledger fills; the forward horizon is the exception, and a month
that has not happened is disabled rather than absent (§6).

**The collapse is spread over the height the header gives up**, not a round
number, so the header rises at exactly the speed of the content beneath it and
the two read as one sheet sliding under another.

**The chrome never resizes the page it is reading.** It gives up 36 points of
height and takes the same 36 back as a negative margin, so its footprint is the
collapsed one at every offset and the pager below it is the same box the whole
way; the pager is then moved down by that number as a transform. Without that
the chrome's height *was* the pager's height, and the pager is the scroller the
header reads: the offset set the header's height, the height set the scroll
viewport, and the viewport set the largest offset the scroller would hold. On
any page whose content is within one collapse of a screenful that closes — the
scroller pulls the offset back, the header re-opens, and the bar flickers in and
out for as long as the gesture is held. It also laid out four mounted pages
every frame. Measured in Chrome, the viewport moved 640 → 676 with the header
before and holds at 732 across the whole travel after.

The pager therefore hangs one collapse below the screen while the header is
open, and the frame clips it. **That is only invisible while a page can be
scrolled far enough to close the header**: content is lost when a page's
scrollable travel is shorter than the collapse by more than its own bottom
padding, because then the header never closes, the pager never rises, and no
gesture reveals the bottom. Every page in the pager clears that today by ~94
points of bottom inset from `useGroundInset`, which is the condition to check
before adding a page that does not use it, or before this shell renders
anywhere `useFloatingClearance()` is zero.

**The header navigates; the page reports.** It carries no figure. A draft put
the current period's total in the row's trailing half and it did not survive
being rendered: a bare number with no label to say which figure it was, no room
for its currency, and close enough to the magnifier to read as its caption —
while the card 100pt below said the same month as three labelled figures with
the currency on each. The header was carrying a worse copy of what the screen
already said better.

**The year is a caption, and it is always drawn.** It used to be dropped inside
the current year, because five things shared 326pt and the year was the one of
them usually already known. It now sets under the month rather than beside it,
so it costs a line nobody was using instead of a share of the row — and a rule
that exists to save width has nothing left to save. Months is the exception:
there the year *is* the title, and `2026` under `2026` is the year twice.

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

The whole ledger, continuous in both directions — the list pages backwards at
its end and forwards at its start, and a page arriving above keeps the row the
reader is on where it is rather than pushing it off screen. With `DayRibbon` under the
tabs reporting where it is. Everything §5, §6 and §7 say about the list is
this page.

#### Calendar

The month's shape as a grid of days, each carrying the same activity mark
`DayRibbon` uses, with the tapped day's entries open beneath it. **This is
S11's phone layout, restored.**

**The blank half of the page is three states, and says which** (`design-system/08`
§8.1). Under the grid sits the tapped day's entries, and where there were none
there was nothing — so a month the ledger has never reached, a day you simply
did not tap a mark on, and a search with no answer here all rendered as the same
silence, which reads as a screen that failed to load:

| What is true | What the page draws |
|---|---|
| A search excludes everything this month | `filtered` — names the query, and clears **it** |
| The month holds nothing, the ledger holds something | `range` — the nearest month, how many entries it holds, and a jump to it |
| The ledger draws nothing anywhere | `first-run` — the same words List uses, because it is the same fact |
| The month holds something, this day does not | The day's own *nothing*, and one quiet line pointing at the nearest day |

**The jump lands on a day, not on the first of a month.** `readNearestActivity`
answers with the nearest *day* holding something — crossing a gap forwards that
is the target month's earliest row — so the panel under the grid opens on
entries. A jump to the 1st would land the reader on another empty day, one
screen further on.

**A day with nothing in a month with plenty is not an empty state.** The grid
above it is full of marks, so a title and a button would be shouting about a day
the reader chose; it gets one line, which is still the only thing in that region
able to say where the entries are.

**The day's total is in the pivot currency, and says so.** Every row is taken to
the pivot at its own rate to be summed at all (`computations.md` §1), and the
header labelled that figure with the *lead* currency — the currency of your
first account. A ledger with a USD pivot and a PLN account drew a day of one 500
PLN expense as *-138.89 PLN* above a row reading *-500.00 PLN*. The two agree in
a one-currency ledger, which is why it stood.

**The day's entries are read for that day, never filtered out of a page.**
`readLedgerPage` stops at thirty rows because a ledger does not end; a day does,
and a calendar showing the first thirty rows of one would be a shorter truth
than the mark above it, which counted all of them. A day with nothing on it says
so rather than showing an empty header. An earlier draft folded the calendar into the
list as a drop-down panel, on the reasoning that *see as list* was a handoff
worth removing. The handoff was never the problem — its price was. A swipe
costs nothing, so the calendar can be a view again, and a whole page serves it
better than a panel dropped over something else.

#### Months

**A chart of the year over a list of its months.** The chart is twelve paired
columns — income and spend side by side, one pair per month — and under it the
same twelve months as rows carrying the figures and what each kept. Tapping
either moves the shared date and stays on the page, so a year can be read
without leaving it.

**The comparison is drawn once, at the top.** Every row used to draw its own
two bars: twenty-four tracks down the page, each scaled to a year the reader
had to reconstruct by looking at all of them. A chart answers *which months
were heavy* in one glance, which frees the rows to answer *by how much* in
figures — so the rows lost their bars and gained a **net**, the figure a row of
two bars could never state.

**A month with no entries draws a stub, not a track.** An empty month at zero
share still has to occupy its slot — twelve of them drawn as full-width tracks
is a year holding nothing rendered as a year holding everything, which is
exactly what shipped once. The stub is 2pt of `border`: present, clearly
nothing.

**Empty means nothing happened, not nothing in the lead currency.** A month
whose only rows are foreign keeps its slot in the money colours at zero height:
the row four pixels below it says *+1 other currency* about the same month, and
two elements contradicting each other about one month is worse than a column
that cannot state a figure. The figure it would need is a conversion arc-phone
does not do (class **S**). The year's own total carries the same note — it is
the largest figure on the page and was the only one drawing money with nothing
to say what it left out.

**The year's own arrows live on the chart, not only in the chrome.** The chart
*is* the year, so the control that changes it sits where the eye already is.
They are not a second implementation: the chart's arrows *are* the header's,
because a year step written twice was two — one kept the day of the month and
one landed on 31 December, so whichever arrow you pressed decided which month
the other three pages opened on. Between them the year is a button that opens
`YearPicker`, and on Months the title opens it too.

**Neither arrow steps into a year that has not happened.** A month ahead is a
month the ledger has expected entries in and §3 draws them; a *year* ahead is
twelve stubs. Picking a year lands on its newest month the ledger has reached —
picking the year you are in lands on today, not on its December, because the
date is shared and every other page would then show a month three months out.

**Back to 1900, nine years to a page.** A ledger can hold a date older than the
app, so the picker cannot stop at the years the ledger happens to contain —
`1900` is the floor, and below it the back arrow goes quiet rather than
vanishing, because a control that disappears leaves a reader wondering what they
did. Nine at a time is a 3×3 grid that fits without scrolling, paged from
*this* year backwards so the page a reader opens on is always full and always
ends on the year they are in. A year the ledger has entries in carries a dot;
everything else is offered anyway, because a grid that hid the empty years
would change shape as the ledger filled.

**The dot is the page's own predicate, not a looser one.** Months folds
`readDayFlows` — own accounts, income and expense — so a year whose only row is
a transfer, or sits on another household's account, gets no dot. Asking only
whether a row exists offered a dot that opened onto twelve zeroes, which is a
third answer from a mark whose whole job is to separate two.

**Both pages are folds of one read.** `readDayFlows` is §5's figure cut by day
— the same query, the same filters and the same refusal to sum across
currencies as the card's own figure — and the calendar groups it by day while
Months groups it by month. Three implementations of §5 on one screen is how a
screen comes to say two different things about the same month; there is one,
and a test adds the days up and compares them to the card.

**Both scale to what is on screen, never to an absolute figure.** A day is
*heavy* against the busiest day of its month and a column on the year chart is
drawn against the busiest month of its year, for the reason `DayRibbon` gives: a
ledger whose largest day is 200 zł and one whose largest is 20 000 would
otherwise draw every mark the same, and the mark exists to say *this was
unusual for you*.

**A day or a month holding two currencies keeps its mark and loses its
figure.** Arc-phone converts nothing, so no single number is true; the calendar
draws the mark without a total and a month's row names the currencies its
figures leave out. Dropping them silently would be worse than saying so.

### Web — ≥1024px

**S04 does not exist on web.** Its job is answered by S01 Dashboard, which has
the canvas for widgets and the density for real reading. Duplicating it would
create two screens competing to be the landing surface, and the honest split is
that the phone answers *where do I stand* and the desktop answers *what
happened*.

## 4. Components

| Component | Notes |
|---|---|
| `Shell` | `PagerHeader` + `PageTabs`, shared by all four pages and never scrolled away |
| `PagerHeader` | The period and the search icon, in two layouts the scroll moves between: a large title that is itself the picker, collapsing to a compact title with a stepper beside it. The arrows step **the unit the page is in**; the year is a caption under the title |
| `PageTabs` | Summary · List · Calendar · Months, a marker on a hairline. What makes the swipe discoverable |
| `SearchField` | The search itself, pinned under `PageTabs` while one is on, with the live match count and an `✕` that clears it. **Under the tabs, not in the header**: the header's shape is a function of the scroll — the title travels, scales and hands its room to a stepper — so a field placed there would either inherit the collapse or fight it, and the period would leave the screen exactly when §7 wants the reader stepping through periods. It stays open for as long as the search is on, which is what says the screen is narrowed |
| `Pager` | The four pages, swiped or tapped between, over one shared date |
| `GatewayGrid` | Summary's *Go to* — six cards, each with a figure. Only destinations neither the tab bar **nor the shared bar** carries, which is why Accounts, Debt and the agent are absent from it |
| `NetWorthStrip` | *Mine* on the ground in one line, *ours* and any second currency muted beneath it. Pressable → S16. Renders above the error branch, so a failed refresh keeps it (§6) |
| `MonthSummary` | The hero, opening month only. *Kept so far* stacked over its figure, a `FlowBar`, then the labelled pair. Draws three zeroes for a period the ledger did not exist in — that is the true answer, not an empty state |
| `FlowBar` | Track is *came in*, fill is *went out*, gap is *kept*. Fill clamps at 100%; a deficit is carried by the figures, not by an overrunning bar |
| `SpendRows` | *Where it went* — §6 at leaf granularity, five rows plus a named remainder, bars proportional to the largest row, one colour. Opening month only |
| `DayRibbon` | Under `PageTabs`, on the List page only. Continuous — a cell for **every** day between the first and the last the list has loaded, not only the days holding rows, because the distance between two marks is part of what the strip draws. **Earliest at the left**, and scrolled so the day the list is on is in the middle of it. Horizontally scrollable, clipped at both edges. 48×66 cells with the day number at 17px and room around the weekday letter. Activity mark per §3 |
| `MonthGrid` | Calendar's own grid — a day per cell with `DayRibbon`'s activity mark, ≥44px |
| `EmptyState` | Calendar's three, under the grid — §8.1's `filtered`, `range` and `first-run`, never a blank |
| `YearChart` | Months' hero — twelve paired columns scaled to the busiest month of the year, the current month ticked, empty months drawn as stubs. Carries the year, its net, its two arrows and the button that opens `YearPicker` |
| `MonthRows` | Months' twelve rows: income, spend and **net** per month. No bars — `YearChart` above is the comparison, so a row states figures |
| `YearPicker` | A sheet of up to nine years, paged back to 1900, a dot on the years holding entries. `PeriodPicker` at year granularity. Pages are counted back from this year, so the oldest one is the short one — at 1900 it is a single cell, and the cells hold their column rather than stretching to fill the row |
| `DayGroup` | A day's rows under its date and total. The list's only grouping |
| `QuietDay` | One empty day: a single muted line |
| `QuietRun` | Two or more consecutive empty days: one row naming the span and its length, with *Show*. The span is **one date range**, not two dates — the language collapses whatever its ends share (`September 7 – 8, 2026`, `7–8 września 2026`), because a row whose whole content is that nothing happened must not spend two lines spelling the month and the year twice |
| `ExpectedGroup` | A future day. Dashed border, muted type, figures in neither the income nor the expense colour — it is not money yet |
| `TransactionRow` | `TransferRow` for transfers; `BIZ` tag where business |
| `BrandIcon` | `TransactionRow`'s leading mark for a recognised merchant (§14.4b). Offline, never blank: an unmatched payee falls back to its monogram |
| `FxAmount` | Any foreign row — `local · rate · display`, the rate for that row's own date (P1) |
| `Banner(warn)` | Unsettled clearing — rendered **only when non-zero**, with one action |
| `TodayPill` | Floats over the list when the list's **anchor** is not today — which is what a jump moves, and a jump is what §6 says this exists for. Deliberately not *scrolled away from today*: paging backwards walks day by day and can be walked back, where a jump loaded a neighbourhood with nothing between it and here. The only way back from a jump (§6). Top-centre **of the list**, not of the page: the add button owns the bottom corners and settles against either side edge at any height (`02-tokens` §2.9), and `DayRibbon` owns the band above the list — a pill resolved against the whole page lands on the strip's first cells, which are both data and 44pt targets. A floating control over an infinite list covers something; it covers a sliver of content the reader can scroll, never chrome they cannot. Its edge says *above the page*, not `shadow-float`, which §2.5 keeps for the add button and the toast — the things above the whole screen rather than above one list |
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

**`PeriodHeader` retires into `PagerHeader`.** Its arrows and its *Today* are
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

**A day's total is a flow, and it is drawn in the direction it went.** A day
that cost money is spend red, a day that brought money in is the income green
every other inflow figure on this screen draws, and a day that nets to zero with
rows behind it is muted — that is a day of transfers between your own accounts,
and the muted figure is the other half of the `flat` mark `DayRibbon` already
gives it. A sign-based rule that leaves a positive in plain ink belongs to a
*balance*, where a positive figure is what you have rather than what came in;
two rows apart it read as *this day cost you something* and *we have nothing to
say about this day*.

## 6. States

| State | Treatment |
|---|---|
| Loading | Not modelled for the replica window — the read is synchronous SQLite. Beyond it, §10 |
| Populated | As drawn |
| Empty · no accounts | `EmptyState(first-run)`, offering create. **No summary, no strip, no empty chart** — nothing has happened, so the screen says so and offers the two ways to make it happen |
| Empty · no transactions | Strip and month card stay: three zeroes is the true answer for that period. *No transactions yet*, S10's wording, in place of the list. *Where it went* draws nothing |
| Empty · before the ledger | A jump landed behind everything the ledger holds. One muted line naming the anchor — *nothing recorded on or before 25 May 2026* — with `TodayPill` above it, which is already the way back. **Never the first-run wording**: the reader has rows, all of them newer than where they are standing, and offering a first capture would tell them their ledger is empty while it is not |
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
| **A jump** | Picking a far date loads that date's neighbourhood and **nothing between** — the older half only, so the list opens on the day the header names. Scrolling from there walks outward day by day: backwards always, and forwards once the reader has scrolled away from the top and come back, which is what tells a pull-down apart from a list that has only just mounted. Where a jump lands somewhere too sparse to fill a screen there is no scrolling to do and no forward walk: the stepper and `TodayPill` are the way out, and a list that cannot be scrolled cannot report having been. A cold open is the exception and loads forward at once, because *newer than today* is the forward horizon two rows up rather than the rest of the ledger. The list is never asked to guess a scroll position for content it has not loaded, which is the defect that makes infinite lists jump under the reader |
| **In flight** | An outbox row appears in its day with a `pending` marker until it syncs — the one thing a separate list could never do, and exactly when confirmation matters most. On a phone-alone ledger, local materialisation is the final save and no marker is drawn |
| **A conflict** | S35 arriving for an older entry surfaces as one banner in the list at the current position, naming the month it concerns. It does not scroll the reader to it |

## 7. Interaction

`+` floats and is placed by the thumb that uses it. Pull to refresh re-syncs
rates and balances. Rows swipe to categorize (short) and to edit (long) — never
to delete (`design-system/05` §5.6). Haptic on save arrival.

Tapping the unsettled banner goes **straight to the unallocated transaction**,
not to a list. A warning that costs you a search is a warning you learn to
ignore.

**Search is the strip's icon, and it filters this list.** Day grouping survives
— and nothing else about the gaps does, for the reason two paragraphs down —
and **Calendar and Months carry match counts instead of their figures** — so *how often, and when* is answered by the pages you were
already going to swipe to. Search needs no navigation of its own, and it holds
across the pages the way the date does: the query is a parameter of the route
beside the date, so a swipe, a step and a jump all keep it.

**The field counts the ledger; the pages count their period.** The line in the
field is every row the query matches, at any date — that is what a search box
reports. The grid is the month on screen and the year's rows are that year, so
the field's figure is larger than the grid's marks add up to whenever the query
matches outside the month. Two questions, both worth answering, and the field is
the only place the wider one is asked.

**The counting is the search's own, not a second reading of it.** §13's text
rule cannot be pushed into SQL — a query is matched against payee, note, every
line's description and, when the whole query is one, an amount — so the per-day
counts are produced by the same matcher that produces the list. Two readings of
what a search means is how the field's total and the grid under it come to
disagree.

**A day or a month that matched nothing still says so, quietly.** *Not in this
month* is part of *how often, and when*. But a searched grid draws an empty cell
rather than a zero in each of thirty, and a searched year draws its empty months
in muted ink: a page that says nothing thirty times has stopped answering.

**A count and a mark are two populations, and the count is the wider one.** The
unsearched calendar's mark is §5's figure — own accounts, income and expense —
because it is the same answer the month card gives. A search searches the
*ledger*: every row the query matches, whatever account it sits on and whatever
type it is, which is the set the list beneath it draws and the field above it
counts. So a day holding one matching row on a shared account has no mark and a
count of one, and that is the honest pair — the alternative is a search that
silently cannot find half the ledger.

**A searched list states no day totals, marks no quiet days, and its ribbon is
not continuous.** The rows on
screen are a subset chosen by a query, so their sum is not the day's own figure,
and a day whose rows all failed the query is not a day the ledger was quiet on.
Both are answers this list gives about the ledger, and under a filter it has not
read enough to give either: a day holding six rows of which one matched would
report that row's amount as the day's, and a full day would collapse into a row
reading *nothing recorded*. §7.2's continuous ribbon goes the same way — a cell
invented between two matches is named *nothing*, about a day the reader can see
six transactions on by clearing the search. Continuity is a property of the
unfiltered list, where a gap between two loaded days really is a gap.

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
