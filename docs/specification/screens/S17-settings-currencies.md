# S17 · Settings · Currencies

**Surface** both · **Journeys** J10, J1 · **Frequency** rare
**Design** none
**Status** specified · tier 3

---

## 1. Purpose

Decide which currencies exist, which appear in the header toggle, and where each
one's rates come from.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| Settings | Currencies | Settings |
| S29a | First-run steps 1–2 | S29a |
| S18 | *Change source* | S18 |

A row's expanded detail carries *Exchange rates*, which opens S18 with the pair
preselected (`?quote=<code>`) — the place a coverage line saying *"no rates yet
· set one by hand"* is talking about.

## 3. Layout

### Both surfaces

**A list of compact rows, one open at a time.** Each row states code, name,
symbol · decimals, its coverage, and *Pinned* when it is; tapping the row
expands that one row's controls **in place** — the pinned toggle, the rate
source, and the row's own actions (*Exchange rates*, *Edit*, *Archive*). Symbol
and decimals stay behind the row's own detail sheet (§9.2).

Every row holding its whole editor open was some 200 px each, which made a
six-currency screen three screens tall and unscannable; a list of six things is
exactly what a list is for, and one row open at a time is what makes opening a
second close the first.

The list of rows is the one grouped-rows **card**. *Add currency*, the pivot
block and the screen's own name sit on the ground — and the card carries **no
title**: the navigation header already says *Currencies*, and saying it twice,
40 px apart, is chrome.

Pivot shown **read-only** at the bottom with an advanced change action.

Web adds columns rather than regions; the list is short and does not need two.

## 4. Components

| Component | Notes |
|---|---|
| `CurrencyChip` | Pinned set preview — what the header will show |
| `Toggle` | Pinned |
| `CoverageStatus` | Coverage per currency — a **muted caption in sentence case**, amber ink below 100%. Never a `Tag`: a tag is upper-cased and marks a *state* (`manual`, `estimated`), and coverage is a measurement. Six rows each wearing *NO RATES YET · SET ONE BY HAND* was a list of badges shouting a fact nobody had to act on |
| `ConfirmDialog` | Pivot change only |
| `ProgressBar` | Backfill when adding |

## 5. Data

| Reads | Writes |
|---|---|
| `get_currencies` with coverage | `add_currency` · `archive_currency` · `set_rate_source` · `set_pinned` |
| Pivot | `change_pivot` — audited, confirmed |

## 6. States

| State | Treatment |
|---|---|
| Loading | Instant from cache |
| Populated | Default |
| Empty | n/a — seven ship seeded |
| Error | Add failed → the backfill states which ranges it could not fetch, **per currency**, rather than reporting success |
| Offline | Read-only; changes queue |
| Gated | Archive refused while any account or transaction references it |

## 7. Interaction

Adding a currency triggers a backfill across the range existing data covers —
minutes, with real progress, and it **may partially fail**. Changing the pivot
is the one heavy operation left: confirmed, audited, and not something moving
abroad requires.

## 8. Rules this screen must obey

- **§7.0** — the **display** currency is not set here. It is the header
  `CurrencyChip`, free and instant. This screen sets what is *available*.
- **§7.7** — prefer the central bank of the jurisdiction you report in.
- Coverage is stated per currency, with its source and last quote date.
  Reporting a currency as present when it holds 0.5% of its range is how GEL
  stayed broken.
- **The coverage line is not itself pressable.** The row around it is the tap
  target, and a pressable inside a pressable is one gesture with two meanings.
  The link into S18 is one of the row's expanded actions instead — available at
  every coverage rather than only at zero.
- **Stated, never nudged.** The screen reports coverage and offers archiving; it
  does not recommend either. A currency stuck at 23% is a stable fact, and the
  system has no standing to guess whether you still hold it.

## 9. Open questions

1. ~~**Should archiving a currency with incomplete coverage be encouraged?**~~
   **Decided: no prompt. Surface the number and leave the decision alone.**
   Coverage is already stated per currency with its source and last quote date;
   that is the information, and whether you still hold RUB is not something the
   system can infer.

   Archiving stays available and unprompted. The alternative — nudging toward it
   — turns a status display into a nag about a currency you may be keeping
   deliberately, and the system has no standing to have an opinion about that.

   **This is deliberately narrower than S18's alerting rule.** A currency
   *falling behind* is a change worth a push; a currency that has been at 23%
   for four years is a stable fact, and re-raising a settled fact is what
   notification fatigue is made of.
2. ~~**Do symbol position and decimals need to be editable?**~~ **Decided:
   editable, but not prominent.** Both are seeded correctly for the seven
   currencies in use and sit behind the row's detail rather than in the list.

   Decimals follow ISO 4217 and are genuinely a property of the currency.
   **Symbol placement is not** — it varies by locale rather than by currency, so
   there is no correct value to seed and no way to derive one. That is the case
   the field exists for.
