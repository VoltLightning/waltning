# Money and FX components

The heart of the system. These enforce §7 of `SPEC.md` structurally.

### 4.1 `<Amount>`

```
  1 234,56 zł        display currency — serif, tabular
  $ 62.40            foreign, unconverted
```

Props: `value`, `currency`, `size`, `emphasis`, `signed`. Negative values take
`negative` ink. Never renders a conversion — that is `<FxAmount>`.

### 4.2 `<FxAmount>` — the P1 component

```
  62,40 $ · 4,0231 · 251,05 zł
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

### 4.6 `<RateTable>`

The rate history for one pair, by date. Virtualized — 2,080 days per pair from
2020-11, and growing daily.

Columns: date · rate (4dp, tabular) · source · provenance marker. Each row's
source is a `Tag`: `nbp` · `ecb` · `nbrb` · `nbg` render neutral;
`carried_forward` renders neutral with its age; `manual` renders **amber** and
sorts to visibility (P4).

Supports **range selection** — dragging across dates is what feeds `RateEditor`,
because the common correction is a period rather than a day.

**Gaps are rows, not absences.** A date with no rate renders as an explicit
empty row, because scrolling past a silent gap is how GEL held 11 days of 2,080
without anyone noticing.

### 4.7 `<RateEditor>`

Sets a manual rate for a pair over a **date or a date range** (`SPEC.md` §7.6,
level 2). The range form is what makes a dead source recoverable by hand: RUB
has had no published quote since 2022-03-11, and covering that day by day would
be some 1,600 entries.

Before writing, it states exactly what it will do:

```
  Set RUB → 0,0104 for 2022-03-12 … 2026-08-07

  1 610 days        1 464 currently absent
                      146 currently carried_forward
                        0 currently manual
                                        [ Cancel ]  [ Set rate ]
```

**Never silently overwrites another manual entry.** If the range contains
existing `manual` rows, they are counted separately and the action requires a
second, explicit confirmation — a manual rate is an assertion someone made, and
overwriting it in bulk erases a decision.

Writes `source = 'manual'`, which outranks every synced source for that pair and
date, is never clobbered by a later sync, and writes to `audit_log`.

### 4.8 `<SyncLog>`

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
