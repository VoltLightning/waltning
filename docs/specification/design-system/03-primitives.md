# Primitives

Variants and states for each. `—` means the variant does not exist by design.

### 3.1 `Button`

| Variant | Fill | Ink | Use |
|---|---|---|---|
| `primary` | `green-600` | white | The one affirmative action — Accept, Approve, Save, Commit |
| `secondary` | transparent, `green-200` border | `green-700` | Skip, Decline |
| `ghost` | transparent, no edge | `muted` | Tertiary, in-row, and **every Cancel** |
| `danger` | `danger-solid` | `text-on-danger` | **Irreversible only** — Delete, a merge that archives, a reset that drops data. Confirmation required |
| `dangerQuiet` | transparent, `danger-border` | `danger` | Destructive but **reversible** — Archive. Consequential enough to be red, undoable enough not to be the loudest control on the screen |

Sizes `sm 32` / `md 40` / `lg 48`. States: default · hover · active · focus ·
disabled · **loading** (spinner replaces label, width held). The two filled
variants take no hover fill — a second green or red for one state would be a
new role; their liveliness is §2.7's press scale.

**Rule:** never two `primary` buttons in one decision. Import review's
Accept/Skip and the diff card's Approve/Decline are both primary + secondary —
that asymmetry is the affordance.

**Rule:** *cannot be undone* is the whole licence for the fill. Three of the
first six `danger` call sites were **Archive**, which is reversible and which
sits *below* the primary Save on the account editor — so filling it put the
loudest control on the screen on the action you can take back, under the one
you cannot. Reversible takes `dangerQuiet`.

**Rule:** `danger` is **filled** and *Cancel* is **`ghost`**, always — §2.6c.
The destroying control and the way out of it must differ in weight and not in
hue alone, and the escape is never the loudest thing on the screen. A filled
red does not count as a second `primary`: that rule is about two buttons
competing to be the affirmative one. `tests/architecture.test.ts` refuses a
Cancel drawn as anything but `ghost`.

**Rule:** the `primary` sits on the **right** of a button row, the secondary
to its left — `[ Decline ] [ Approve ]` (`05-composites` §5.3),
`[ Cancel ] [ Set rate ]` (`04-money-and-fx-components` §4), `[ Add
transaction ] [ Settle ]` (`screens/S13` §3). One order everywhere, so the
affirmative action is always in the same place under the thumb.

**Exempt: a conversational reply is not a button row.** The chips that answer
a question the agent asked — `[ yes ] [ no, the other one ]` (`screens/S05`
§3) — are §3.5 chips in a transcript, not `Button`s in a decision, and they
carry **no `primary` at all**. Neither answer is the affirmative one: *yes*
confirms a guess and *no* corrects it, and painting one of them green would
recommend an answer to a question about what actually happened. They read
left to right in the order they would be spoken, which is why the rule above
governs `Button` and stops there.

### 3.2 `IconButton`

32 / 40 / 44. **44 minimum for any touch target** (§10). Requires `aria-label`.

### 3.3 `Tag`

Static, non-interactive. Text always present — never tint alone (P5).

| Variant | Fill / ink | Use |
|---|---|---|
| `neutral` | `green-100` / `green-700` | Default |
| `warn` | `amber` / `amber-ink` | Asserted rather than measured (manual override, estimated rate), outstanding (unsettled clearing, open item), or aged (stale). One meaning, four instances — P4 |
| `negative` | `negative-bg` / `negative` | Gaps, failures |
| `biz` | `green-100` / `green-700`, uppercase `BIZ` | Business row marker — appears in **every** view a business row appears in |

### 3.4 `Pill` — classification tier

Import review's row-level provenance marker. Carries text, not just tint.

| Tier | Label | Meaning |
|---|---|---|
| `rule` | `Rule · <name>` | Deterministic, free, names the rule and its hit count |
| `model` | `Model 0.91` | Confidence stated to 2dp; always paired with a reason |
| `transfer` | `Transfer` | Pair already collapsed to one row |
| `duplicate` | `Duplicate` | Matched an existing transaction |

### 3.5 `Chip` — interactive

Tappable, holds a value, opens a picker. Used across the Quick-add composer for
account, category, date, scope, note.

States: empty (placeholder) · filled · **selected** · **machine-filled**
(carries the trail marker, P2) · hover · focus · disabled. The 44px floor is
fixed in the component itself, not per screen (§10).

**Selected is paint, never a suffix.** The chosen chip takes the accent fill
and the drawn check — §3.8's selection vocabulary — and announces itself
through `accessibilityState`. Appending "· selected" to the visible value is
the announcement leaking into the picture, and it shipped that way once.

### 3.6 `SegmentControl`

2–4 options, one active. Used for scope (**All · Mine · Shared · Business**)
and import filters (Needs review / Ready / Duplicates / Skipped), with live
counts per segment.

The scope options are a **partition** (`SPEC.md` §6.7) — every transaction is
in exactly one, so the three subtotals always sum to All and switching can
never double-count.

Distinct from the **two headline totals** (`DualTotal` below), which are *not*
a filter: *mine* and *ours* show together regardless of scope.

### 3.7 `Inputs`

| Component | Notes |
|---|---|
| `TextField` | Label, hint, error, character counter. **The error replaces the hint** — they answer the same question at different moments, and showing both makes the reader reconcile them. The counter appears only when a limit exists, and counts up: `97/120` states a fact where `23 left` sets a deadline. **An errored field's ring is the danger colour** (`theme.dangerBorder`) whether focused or not — the ordinary green focus ring would otherwise swamp the danger border the moment an errored field is focused, which is exactly when the person is looking at it |
| `AmountField` | Tabular numerals, **comma decimal**, currency affix, right-aligned. **An errored field's ring is the danger colour** (`theme.dangerBorder`) whether focused or not — the ordinary green focus ring would otherwise swamp the danger border the moment an errored field is focused, which is exactly when the person is looking at it |
| `SearchField` | Leading icon, clear button, live results. **A field, drawn as one**: `surface`, the interactive edge and `radius-sm` — the same box `TextField` is, since it is the same thing. Composed bare on the ground it read as a caption: grey words nothing said could be typed into. The magnifier and the × are **vendored icon paths**, never shapes assembled from views — a ring and a rotated bar is, at 16pt, a circle with a stick near it |
| `Keypad` | 0–9, comma, delete. Bottom-anchored, thumb-zone (Fitts) |
| `RateField` | Editable FX rate, 4dp, shows synced value beside the override |
| `DateField` | Defaults to today. **On a phone the field is a button and a tap opens the `Wheel`** — nothing in between: the relative days (*Today*, *Yesterday*, two weekdays) are chips on the drum itself. It was a typed field over a row of chips, one of which opened the drum, and on Add that arrangement sat inside a bottom sheet of its own: three taps and two surfaces for one choice. The button says what it holds in words — *Today*, *Yesterday*, *March 4, 2026* — never `2026-03-04`. On a desk it stays a typed `YYYY-MM-DD` with the chips and a month grid — §3.7a. A composer's *Date* row (Add, Transfer, a transaction's own card) opens the same drum directly |
| `TimeField` | A clock time, where something has one. **Empty is a value, and the normal one** — a time of day is a description (`SPEC` §7.0a), most rows never have one, and *No time* takes one back off: clearing is not setting midnight. Typed loosely and read strictly (`9:05`, `0930`, `9.30` → `09:30`); *Now* is one tap, from the device's wall clock in its own zone. **On a phone the field is a button and a tap opens the `Wheel`** of hours and minutes — §3.7a — where *Now* is a chip and *No time* is an action, offered only when there is a time to take off. On a desk the typed field is the fastest way in and nothing else is offered |
| `Toggle` | Business / personal, write-a-rule. A toggle is a **state**, not an action — a reader hears "on", not "pressed". The thumb slides at `motion-base`; the track swaps instantly underneath, because two clocks on one control read as the thumb outrunning its own background. The whole labelled row is the target |

### 3.7a `Wheel` — picking from a cycle

**A value picked by rolling, not by typing.** Five rows tall, `44` each, the
middle one banded in `accent-fill` between two `accent-fill-border` hairlines.
The list scroll-snaps to that band, neighbours fade by distance — `.55`, `.26`,
`.12` — and the ends of the drum are veiled into the sheet's own surface, so
the column reads as a curved face rather than a cropped list. The banded row is
the value; there is no second place a reader could look for it.

**It is a bottom sheet, not something shaped like one.** The drum opens in
`BottomSheet` — the scrim behind it, the handle, the title and *Close*, a swipe
down to dismiss — the same surface every other choice in the app opens in. It
was a hand-built modal with a transparent backdrop and no gesture at all. One
thing differs: **the sheet is dragged by its handle and header, never by its
body**, because a vertical pan on the body is the drum's own gesture; left on,
the first downward roll of a date closed the picker.

**On a row, always — and a tick for each one that passes.** `snapToInterval` is
a request, dropped whenever something interrupts the deceleration: on a phone
the minutes came to rest half a row off the band. So the drum does not settle
when the finger lifts — the coast is still to come, and settling there moved a
wrapping drum to its middle copy mid-flight, which cancels the snap — but where
the coast *ends*; and a drum found between two rows is put on the nearer one.
Each row passing the band under a hand is one selection tick, the platform's
own (`primitives/haptics.tsx`, provided once by the app); a chip or a pressed
row rolls the drum through a dozen rows and ticks for none of them.

**A row can be pressed.** Rolling was the drum's whole interface: nothing for a
screen reader or a switch to operate, and no way to take the neighbour a reader
can already see except by nudging the drum onto it. Pressing a row picks it and
the drum follows, the way it follows a chip. A wrapping column draws every
option three times and **speaks one of them**. The month column says the month
and not the year — the year has a column of its own, and the drum read
*18 · September 2026 · 2026* — and a weekday chip is *Wed*, because
*Wednesday, September 16* twice is a chip row on two lines.

**Each column is as wide as the widest thing in it.** Two digits given the same
room as `September` reads as a gap, and the eye has to cross it to pair a day
with its month. Day `56`, month `148`, year `76`, hours and minutes `72`.

**A cycle wraps; a scale does not.** Hours and minutes have no first and no
last, so their columns are endless: the list is drawn three times and returns
to the middle copy once the flick settles, with snapping suspended for that one
frame so nothing appears to move. Days, months and years are a **scale** — a
year is not a cycle, and a wheel that wraps one lets a reader spin into 1970 by
accident. They stop at their ends.

**The year column runs a century either side of today**, 201 rows anchored on
the current year, so rolling the wheel never moves the column under the finger.
A date outside that window widens it rather than falling off the wheel. Every
row is drawn, as the minutes' 180 already were. A roll re-renders only the rows
whose distance from the band changed, so a long column costs a roll nothing.

**The day column offers only days that exist, and clamping is final.** Rolling
from 31 January to February lands on the 28th, and rolling back to January
stays on the 28th. The alternative — remembering the 31 — means the value is
not what the wheel is showing, and a control whose displayed state is a partial
truth is the one people stop trusting. The cost is stated rather than argued
away: passing through a short month rewrites a date that was already chosen.

**A clock is the same drum.** Two columns, hours `00`–`23` and minutes
`00`–`59`, both wrapping, with a `:` on the banded row between them — so a
reader who has set a date already knows how to set a time. **Every minute, not
steps of five**: that was drawn for a schedule, where nobody needs the minute; a
transaction's time comes off a receipt or off the clock, both of which say
`12:47`, and a drum that cannot band the row *Now* lands on is showing
something other than the value. The columns wrap, so sixty is never more than
thirty detents from anywhere. Above it, *Now* and three landmark times —
`09:00`, `12:00`, `18:00` — **labelled with the time they set**, because
*Morning* does not say which minute a tap will write, and four worded chips do
not fit one row of a phone.

**Relative chips sit above the drum, and go out on their own.** `Today`,
`Yesterday`, then the two weekdays before them. Tapping one rolls the wheels to
it; rolling the wheels clears whichever chip no longer matches, because a lit
chip that disagrees with the banded row is a lie about what is selected. No
chip is ever the value — the drum is.

**The phone gets the drum; the desk gets a month grid.** A wheel is a thumb
control: it trades precision for momentum, which is the right trade held in one
hand and the wrong one in front of a keyboard. On `desk` the field opens the
calendar popover the web has taught everyone to expect, and the typed
`YYYY-MM-DD` the field already accepts remains the fastest path for a date
somebody already knows. Both write the same bare `AccountingDate`.

### 3.8 Selection

Four controls, four different promises to the reader. The choice among them is
the design decision; everything visual follows from it.

| Control | The promise | When instead |
|---|---|---|
| `Checkbox` | Each row is its own yes/no — rows do not exclude each other | One exclusive choice → `Radio` |
| `RadioGroup` | Exactly one of these, all worth reading before picking | Options many, long, or rarely changed → `Select` |
| `Select` | One choice, folded away until asked for. **Picking is answering** — the panel closes on choice | A partition used as a filter → `SegmentControl` |
| `MultiSelect` | A collection. **Picking is collecting** — the panel stays open, and the field holds each choice as a **removable token**: the × takes one out with the panel closed, because deciding against something should not require reopening the list it came from. Labels, never an invented count — a count is a plural, and the catalogue's plural story is device-unproven |  |

**The group is the component.** A lone radio is a checkbox with worse manners:
"exactly one selected" is a property of the set, so the API takes the set —
`options`, `value`, `onChange` — and the contradiction cannot be built. Same
argument as §3.1's `ButtonRow`.

**Selection lands as a pop, system-wide.** The checkbox's mark and the radio's
dot scale in from .4 at `motion-fast` — most of the travel in the first third,
which reads as the mark *landing*. Deselection is instant: the absence of a
mark is not a picture worth animating. Fills swap instantly under the moving
part in every control (toggle track, checkbox box), the same asymmetry as press
feedback — the system answers at once, the picture settles after. Every one of
these transitions takes the `motion-none` branch from `useReducedMotion`.

**Marks are drawn, not typed.** The check and the chevron are two borders
rotated 45° — the same mark in every face and theme. A ✓ glyph is whatever the
fallback font says it is.

**A select's panel is drawn above the page, anchored under its field.** The
page must not move when a choice opens: a panel laid out in the form's own
flow pushes everything under it down and back, which loses the reader's place
on the one interaction whose job is answering a question about the row in
front of them. The panel opens below the field, flips above it when below is
the smaller room, and never leaves the window.

The overlay is React Native's own `Modal` — the one escape hatch that behaves
the same on iOS, Android and the web without a portal library. Not an
absolutely-positioned panel: on Android a child drawn outside its parent's
bounds stops receiving touches, so the last field on a form would open a list
nobody could tap. Not `BottomSheet` either — that is the shell's, and a
primitive reaching for the shell would invert the foundation; a *screen* is
still free to compose a sheet around any of these controls. The backdrop
behind the panel is transparent and takes the tap that means *never mind*: a
select is not a dialog and earns no scrim.

**The modal costs the role, and the modal is what pays it by name.** A modal
is announced as a dialog whatever this design believes about scrims, so the
field's own label goes on the modal itself — the element that carries the
role — and what a screen reader reports on the web is *"Currency, dialog"*
rather than *"dialog"*. On a label placed inside the modal it names a generic
box and the dialog stays anonymous. On a phone the platform's modal takes no
accessible name at all and the panel's own options are what is read. That is
the price of being the only overlay that behaves the same on three platforms,
and it is stated rather than left for someone to hear.

States for every selection control:
default · hover · focus · selected · disabled.

**The panel scrolls at six and a half rows**, or at whatever room the window
leaves on the side it opened, whichever is less — the half row is the signal
that there is more, the way a list edge says it everywhere else. Two rows is
the floor, for a field with little room on either side of it — and where the
floor is larger than the room, the floor wins and the panel overlaps its own
field rather than hanging off the window. An overlapped field is a legible
compromise; a list half off the screen is not. Where even that does not fit,
the margin off the window's edge gives way before the window does. **`searchable`**
adds a filter row for the lists scrolling cannot carry (52 accounts is S16's
own number): case-blind, matching the *label* — the person filters what they
see, and matching hidden values reads as haunted. The query clears when the
panel closes; a filter that survives a closed panel is an invisible reason the
list looks short next time, and a filter that matches nothing says so.
`defaultOpen` starts a select disclosed, for a screen whose whole point is the
choice.

### 3.9 `Feedback`

`Spinner` · `Skeleton` (matches the shape it replaces, never a grey box) ·
`ProgressBar` (determinate — uploads, extraction) · `Toast` (transient, with
Undo where the action is reversible) · `KeyHint` (`J` `K` `A` — keyboard legend).

### 3.10 Submitting a form

**A form's Save is always pressable, and a press on a form that is not ready
says why.** A greyed Save answers *can I?* and never *why not?* — the reader is
left to find, unprompted, which field the form objects to, and on a phone that
field is often scrolled out of view. So a press on a form with a broken field
does three things at once (`useSubmitCheck`):

1. **Every broken field shows its error**, in the field's own error line and
   danger ring — from that press on, not before. A form that opens already
   saying *Required* under empty fields is scolding someone who has not
   started. The errors clear as the fields are fixed.
2. **A `FormAlert` drops in at the top of the window**: *The form isn't
   complete — check the highlighted fields.* Top, because the bottom is where
   the thumb that pressed Save and the keyboard still are. It names no field:
   the fields do that themselves. A sheet is its own window, so an alert raised
   from inside one is drawn inside it, above the sheet, never on the page
   behind (the reason §4.8 gives for `RateEditor`'s refusals).
3. **The scroller brings the first broken field into view**, in drawn order —
   the page's `GroundPanel` or the sheet's body, whichever holds the field. A
   field folded under *More details* is unfolded first, so what is scrolled to
   is drawn.

A field's own objection to what is being typed — a date that is not a date, a
fee that does not parse — still shows immediately; that is the field
answering, not the form refusing.

**Save stays disabled in exactly two states**, neither of them the reader's
mistake: a save already in flight, and an edit with nothing changed (S09 §7).
