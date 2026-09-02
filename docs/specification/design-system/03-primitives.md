# Primitives

Variants and states for each. `—` means the variant does not exist by design.

### 3.1 `Button`

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
| `TextField` | Label, hint, error, character counter. **The error replaces the hint** — they answer the same question at different moments, and showing both makes the reader reconcile them. The counter appears only when a limit exists, and counts up: `97/120` states a fact where `23 left` sets a deadline |
| `AmountField` | Tabular numerals, **comma decimal**, currency affix, right-aligned |
| `SearchField` | Leading icon, clear button, live results |
| `Keypad` | 0–9, comma, delete. Bottom-anchored, thumb-zone (Fitts) |
| `RateField` | Editable FX rate, 4dp, shows synced value beside the override |
| `DateField` | Defaults to today; relative shortcuts (yesterday) |
| `Toggle` | Business / personal, write-a-rule. A toggle is a **state**, not an action — a reader hears "on", not "pressed". The thumb slides at `motion-base`; the track swaps instantly underneath, because two clocks on one control read as the thumb outrunning its own background. The whole labelled row is the target |

### 3.8 Selection

Four controls, four different promises to the reader. The choice among them is
the design decision; everything visual follows from it.

| Control | The promise | When instead |
|---|---|---|
| `Checkbox` | Each row is its own yes/no — rows do not exclude each other | One exclusive choice → `Radio` |
| `RadioGroup` | Exactly one of these, all worth reading before picking | Options many, long, or rarely changed → `Select` |
| `Select` | One choice, folded away until asked for. **Picking is answering** — the panel closes on choice | A partition used as a filter → `SegmentControl` |
| `MultiSelect` | A collection. **Picking is collecting** — the panel stays open, and the field restates the chosen labels (never an invented count — that is a plural, and the catalogue's plural story is device-unproven) |  |

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

**Selects disclose in place; they do not overlay.** An overlay needs a portal
and a scrim — `BottomSheet`'s machinery, which a *screen* may compose around
any of these controls. A primitive reaching for the shell would invert the
foundation. States for every selection control: default · hover · focus ·
selected · disabled.

### 3.9 `Feedback`

`Spinner` · `Skeleton` (matches the shape it replaces, never a grey box) ·
`ProgressBar` (determinate — uploads, extraction) · `Toast` (transient, with
Undo where the action is reversible) · `KeyHint` (`J` `K` `A` — keyboard legend).
