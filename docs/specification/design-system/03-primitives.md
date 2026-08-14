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

States: empty (placeholder) · filled · **machine-filled** (carries the trail
marker, P2) · focus · disabled.

⚠️ Chips currently measure ~34px against a 44px floor (§10).

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
| `TextField` | Label, hint, error, character counter |
| `AmountField` | Tabular numerals, **comma decimal**, currency affix, right-aligned |
| `SearchField` | Leading icon, clear button, live results |
| `Keypad` | 0–9, comma, delete. Bottom-anchored, thumb-zone (Fitts) |
| `RateField` | Editable FX rate, 4dp, shows synced value beside the override |
| `DateField` | Defaults to today; relative shortcuts (yesterday) |
| `Toggle` | Business / personal, write-a-rule |

### 3.8 `Feedback`

`Spinner` · `Skeleton` (matches the shape it replaces, never a grey box) ·
`ProgressBar` (determinate — uploads, extraction) · `Toast` (transient, with
Undo where the action is reversible) · `KeyHint` (`J` `K` `A` — keyboard legend).
