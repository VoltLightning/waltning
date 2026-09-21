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
| `DateField` | Defaults to today; relative shortcuts (yesterday). Opens a `Wheel` on a phone and a month grid on a desk — §3.7a |
| `TimeField` | A clock time, where something has one. Opens a `Wheel` of hours and minutes — §3.7a |
| `Toggle` | Business / personal, write-a-rule. A toggle is a **state**, not an action — a reader hears "on", not "pressed". The thumb slides at `motion-base`; the track swaps instantly underneath, because two clocks on one control read as the thumb outrunning its own background. The whole labelled row is the target |

### 3.7a `Wheel` — picking from a cycle

**A value picked by rolling, not by typing.** Five rows tall, `44` each, the
middle one banded in `accent-fill` between two `accent-fill-border` hairlines.
The list scroll-snaps to that band, neighbours fade by distance — `.55`, `.26`,
`.12` — and the ends of the drum are veiled into the sheet's own surface, so
the column reads as a curved face rather than a cropped list. The banded row is
the value; there is no second place a reader could look for it.

**Each column is as wide as the widest thing in it.** Two digits given the same
room as `September` reads as a gap, and the eye has to cross it to pair a day
with its month. Day `56`, month `148`, year `76`, hours and minutes `72`.

**A cycle wraps; a scale does not.** Hours and minutes have no first and no
last, so their columns are endless: the list is drawn three times and returns
to the middle copy once the flick settles, with snapping suspended for that one
frame so nothing appears to move. Days, months and years are a **scale** — a
year is not a cycle, and a wheel that wraps one lets a reader spin into 1970 by
accident. They stop at their ends.

**The day column offers only days that exist, and clamping is final.** Rolling
from 31 January to February lands on the 28th, and rolling back to January
stays on the 28th. The alternative — remembering the 31 — means the value is
not what the wheel is showing, and a control whose displayed state is a partial
truth is the one people stop trusting. The cost is stated rather than argued
away: passing through a short month rewrites a date that was already chosen.

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
