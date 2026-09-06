# Money and FX components

The heart of the system. These enforce §7 of `SPEC.md` structurally.

### 4.1 `<Amount>`

```
  1 234,56 zł        display currency — serif, tabular
  $ 62.40            foreign, unconverted
```

Props: `value`, `currency`, `size`, `emphasis`, `signed`. Negative values take
`negative` ink. Never renders a conversion — that is `<FxAmount>`.

**Digits are grouped, through `money.forDisplay`.** A ledger without grouping is
a ledger you count digits in — `12480.20` and `1248.02` are one glance apart —
and the phone's headline total read `48210.00` for the whole life of this
document, while the sketch above has said `1 234,56` throughout.

**The group separator is fixed and the decimal mark follows the language.**

The separator is **U+00A0, a no-break space**, in every language. The app
renders a trailing ISO code rather than a symbol, and `screens/S17` records that
symbol placement is a locale question nobody has answered; a comma group with a
dot decimal is ambiguous in *both* the conventions this product will meet, and a
space group is ambiguous in neither. No-break rather than thin, because a thin
space is not in every fallback face and a plain one would let a figure wrap in
the middle of itself.

That argument settles the separator and leaves the **mark** open — and once the
groups are spaces, `12 480,20` and `12 480.20` are each unambiguous, so the mark
is free to follow the reader. Which is to say it must: `12 480.20` is not how a
Polish reader writes a figure, and this ledger is mostly złoty. `forDisplay`
takes the mark as a parameter and `<Amount>` supplies it from the active
language (`ui/i18n/locales`).

**Not `Intl.NumberFormat`.** It would take the group separator with it —
`en-US` groups with a comma — and so overturn the paragraph above as a side
effect of a call nobody read as a decision. Hermes's `NumberFormat` also differs
between Android and iOS, which is a way for one ledger to render two ways on two
phones.

`forDisplay` lives in `core/money` beside the arithmetic and **returns a
`string`, not a `Money`** — the display form can never be handed back to
arithmetic or written to the wire, and the type is what says so. `toMoney`
remains the storage form: full scale, ungrouped, round-trippable. Grouping runs
on the integer part only; a fraction split into threes reads as a phone number.

### 4.2 `<FxAmount>` — the P1 component

```
  62,40 $ · 4,0231 · 251,04 zł
  └ local    └ rate   └ main
```

The rate is for **the row's own date**. Three variants:

| Variant | Trailing marker |
|---|---|
| `synced` | none |
| `override` | amber `manual` tag — travels with the row into lists, balances, and the dashboard |
| `stale` | amber `stale` tag with the age |
| `estimated` | amber `estimated` tag — the row's date had no published rate, so the nearest was used (`SPEC.md` §7.6). Travels like `override` |

All three non-synced variants are amber under one meaning: the figure is
asserted or aged rather than observed (P4). They differ in **text**, which is
what makes them distinguishable (P5).

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

### 4.6 `<CurrencyGrid>`

Choosing **one** currency out of a set small enough to show whole — account
creation is the call site (`create-account-form.tsx`). A different question
from `<CurrencyChip>` (§4.5): that is which of a few *pinned* currencies a
header displays figures in, cycled one tap at a time; this is a form field
that is set once, so the field shows every option rather than collapsing them
behind a toggle or a `Select`.

Anatomy, one tile: the **code**, the **symbol** beside it muted, the **name**
below in one line. The code is what will appear on every figure the account
holds afterwards, so the choice and its consequence read the same; the symbol
is the glyph those figures will actually carry.

Three columns on the phone, four at the desk breakpoint (`02-tokens` §2.10),
equal widths, `role="radiogroup"` over `role="radio"` tiles — the same anatomy
`AccountPicker`'s account grid and `CategorySheet`'s leaf grid already settled
on. Selected takes the accent border and fill; disabled dims the whole grid.

**Which control depends on what the currency is for, not just that it is
one.** This grid is the choice when the whole set should be visible at once,
weighed against every other — opening an account, where the currency is the
one thing that never changes about it afterwards. A currency field inside a
row-shaped form is a `Select`, the same as any other field in that row —
`counterparty-form.tsx`'s settlement currency, someone else's own preference,
not a decision this product is asking the person to weigh. A currency
cycled from a small, already-pinned set is `<CurrencyChip>` (§4.5), the
header's own display toggle. Three components, three different questions;
none of them substitutes for this grid's own answer to *"pick one, from
everything, deliberately."*

### 4.7 `<RateTable>`

The rate history for one pair, by date. Virtualized — 2,080 days per pair from
2020-11, and growing daily.

**And it is its screen's page scroller.** A virtualized list inside a page
`ScrollView` is one scroller too many, so rather than give up either the
windowing or the page scroll, the hosting screen hands its own content in
through `header` and `footer` and this list carries the whole page. Both are
nodes rather than components, so a `TextInput` a screen puts in its header
keeps focus and its caret across a re-render.

That is also why the table is **not carded**: a card that *is* the whole screen
is what `design-system/05` §5.1 forbids. And why no caller needs to cap the
range it hands over — a decade of days costs one window.

The list renders even with **no pair to table**, because the header and footer
still have to move.

Columns: date · rate (4dp, tabular) · source · provenance marker. Each row's
source is a `Tag`: `nbp` · `ecb` · `nbrb` · `nbg` render neutral;
`carried_forward` renders neutral with its age; `manual` renders **amber** and
sorts to visibility (P4).

Supports **range selection** — dragging across dates is what feeds `RateEditor`,
because the common correction is a period rather than a day.

**Gaps are rows, not absences.** A date with no rate renders as an explicit
empty row, because scrolling past a silent gap is how GEL held 11 days of 2,080
without anyone noticing.

### 4.8 `<RateEditor>`

Sets a manual rate for a pair over a **date or a date range** (`SPEC.md` §7.6,
level 2). The range form is what makes a dead source recoverable by hand: RUB
has had no published quote since 2022-03-11, and covering that day by day would
be some 1,600 entries.

**A write is capped at 366 days**, so a gap that long is a handful of range
writes rather than one — and the worked example below stays inside the cap for
that reason. The cap lives here, where the write is composed, and nowhere else:
reading a wider range is not capped, and neither is clearing one.

Before writing, it states exactly what it will do — **which way the figure
reads, always**: `fx_rates.rate` is units of the quote per one pivot (§4), so
the heading and every confirmation say `{quote} per {base}`, never a `→` arrow
(that reads as a conversion direction, and is exactly backwards for this
figure — RUB per USD is roughly 96, not 0,0104).

**Hosted in a `BottomSheet`, whose header is that heading.** The sentence naming
the pair and the range belongs to the host, not to a second line inside the
component — a body-weight copy of it under a heading saying the same thing read
as disabled chrome. And a sheet is where the row that opened it was: rendered
below a table of up to a year of rows, this editor was 1,300 px away and a tap
looked like it had done nothing.

**Every count declines.** The summary counts days, so *1 day* / *2 days*, never
`1 days` and never a `(s)` in a sentence — plural forms in the catalogue, since
Polish has four categories where English has two.

**A refusal from the write is stated here**, in the sheet, rather than on a
toast: the sheet is a modal, and a toast on the page behind it is a message
nobody sees. It clears when the rate that caused it is retyped.

**The rate field is first, and this component does not avoid the keyboard.**
First because it is the only thing anyone opens this to type, and because a
host that lifts its sheet keeps the top of the content reachable. Not avoiding
it, because the **sheet** is the box that has to move: two nested
keyboard-avoiding views each add the keyboard's height, and the content ends up
twice as far off the bottom as it should be.

```
  Set RUB per USD, 2026-01-01 … 2026-08-07        ← the sheet's own header

  219 days            200 days currently absent
                       19 days currently carried forward
                        0 days currently manual
                                        [ Cancel ]  [ Set rate ]
```

**Never silently overwrites another manual entry.** If the range contains
existing `manual` rows, they are counted separately and the action requires a
second, explicit confirmation — a manual rate is an assertion someone made, and
overwriting it in bulk erases a decision.

Writes `source = 'manual'`, which outranks every synced source for that pair and
date, is never clobbered by a later sync, and writes to `audit_log`.

### 4.9 `<SyncLog>`

Sync attempts, newest first: when, which source, outcome, days written.

Three outcomes, and the third is the one that matters:

| Outcome | Treatment |
|---|---|
| `succeeded` | Neutral, with the count of days written |
| `failed` | `negative` — the provider errored, retry is reasonable |
| `rate_limited` | **`warn`, and distinct from failed.** Retrying is futile; the affordance is *retry later*, paced (`design-system/08` §8.4) |

**`SyncLog` carries coverage, not just events.** A header row per currency
states the percentage of the full range actually held:

```
  PLN  EUR  GBP  BYN   100%
  RUB                   23%   last quote 2022-03-11
  GEL                  0.5%   rate-limited · 11 of 2 080 days
```

This is the component that would have surfaced the GEL failure. The adapter
reported the rate limit honestly and nothing looked broken, because a log of
events answers *did the last sync work* and never *is the data actually there*.
Coverage answers the second question, which is the one that matters.
