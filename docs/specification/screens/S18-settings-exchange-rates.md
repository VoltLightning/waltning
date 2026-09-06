# S18 · Settings · Exchange rates

**Surface** both · **Journeys** J10, J11 · **Frequency** rare, and after every failure
**Design** none
**Status** specified · tier 3

---

## 1. Purpose

See what rates are held, correct the ones that are wrong or missing, and know
when a source has stopped working.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| Settings | Exchange rates | Settings |
| `FxStatusChip` | Any header, when stale or failed | Where you were |
| S30 | *Re-run a backfill* | S30 |
| S09 | A row's rate provenance | S09 |
| S17 | A row's *Exchange rates* | S17 |
| A capture that has no rate | *"{code} needs an exchange rate — set one"* | The capture |

### Search parameters

Both entries above are links, so both are parameters rather than screen state:

| Parameter | Effect | Absent, or not resolvable |
|---|---|---|
| `quote` | Preselects the pair, when the code names one of this pivot's quote currencies | The first quote currency, as with no link |
| `date` | Opens `RateEditor` on that single day, so the fix is one field away | The editor stays closed |

`date` is checked against the **calendar**, not only the `YYYY-MM-DD` shape — a
parameter is whatever a link put in the address bar, and `2026-02-31` has the
shape of a date without being one.

**The route reads them; the screen takes them as props.** A route composes, and
a screen that is a function of its props is a screen its tests and the journey
harness drive without a router to stand in for.

## 3. Layout

### Both surfaces

Pair selector and date range above a `RateTable`. `SyncLog` beneath, carrying
**coverage per currency** rather than only events. Web places them side by side;
mobile stacks.

The pair selector, presets, date range and action buttons sit on the ground;
`RateTable` is the one grouped-rows card, and the per-currency coverage list is
a second, separate card. **With no quote currency to compare against the pivot
there is no table, so there is no card** — the hint saying so is a hint, and
renders on the ground where every other hint on this screen does.

**The whole page scrolls, through `GroundPanel`, and clears the bottom inset.**
Nothing on this screen owns a scroller of its own — which is why `RateTable`
draws plain rows rather than a virtualized list. It used to be the other way
round: the table scrolled, the page did not, and the coverage card ran off the
bottom edge of the device with no way to reach it.

**The range control stacks on a phone and pairs at desk width** (`useBreakpoint`,
never a raw width read). Each date field carries its own row of relative-day
chips, so *From* and *To* side by side is two fields and six chips across a
390 px screen — the *To* field and half its chips ran off the right edge.

**The range is capped at the same 366 days `set_manual_rate` caps a write at.**
The table draws one row per calendar day into the page's own scroller, so the
range that can be *picked* is the range that can be *written* — one constant,
shared with `RateEditor`. A custom range past it draws no table and states the
cap; it is not silently truncated to a window nobody asked for.

**`RateEditor` opens in a `BottomSheet`, not below the table.** A tapped row is
what opens it, and rendering it under a table of up to a year of rows put it
some 1,300 px past the row that was tapped: on a phone, tapping a date looked
like it did nothing at all. The sheet's own header states the sentence naming
the pair and the range — *"Set PLN per USD, 2026-08-08 … 2026-08-08"* — so that
title is a heading rather than a body line under one.

**One state decides both cards.** *No quote currency* is the same fact for the
table and for the coverage list — the list holds exactly one row per quote
currency — so the hint and the coverage card are drawn from one value rather
than from two conditions that happen to agree. A date range that does not parse
is a different state, and so is a ledger that names no pivot: each leaves
nothing to table, so each drops the table card and draws **no hint** — neither
may claim there is no quote currency when there is one. The coverage card is
not theirs to drop: coverage is per currency, not per range and not per pivot,
so its rows stay true and stay drawn.

## 4. Components

| Component | Notes |
|---|---|
| `Card` | Two — `RateTable` alone (only when there is a pair to table), and the per-currency coverage list. Everything else — pair select, presets, date range, action buttons and the no-quote hint — sits on the ground |
| `RateTable` | One row per calendar day, drawn plainly into the page scroller — the range is capped, so this is bounded. Gaps render as **explicit empty rows**, never as absence |
| `RateEditor` | Single date **or a range**; states what it will overwrite before writing. Hosted in a `BottomSheet`, whose header carries the pair-and-range heading |
| `BottomSheet` | The editor's host — a tapped row opens the editor where the tap was |
| `SyncLog` | `succeeded` · `failed` · **`rate_limited`** — the third is distinct, because retrying a rate limit is futile |
| `FxStatusChip` | Fresh · syncing · stale · failed |

## 5. Data

| Reads | Writes |
|---|---|
| `fx_rates(base, quote, range)` | `set_manual_rate(pair, from, to, rate, overwriteManual, today?)` |
| Sync history and per-currency coverage | `clear_manual_rate` · `force_sync` |
| Count of estimated transactions in range, split **open / closed period** | `rerate_transactions(range)` — gated, open periods only |

## 6. States

| State | Treatment |
|---|---|
| Loading | Virtualized rows resolve as scrolled |
| Populated | Fresh · stale · syncing · has overrides |
| Empty | A pair with no rates at all — states the source and its last attempt. No quote currency at all: no table card, no coverage card, and the hint on the ground saying why. **No pivot**, or a custom range that does not parse: no table card and **no hint** either — there is a currency to compare against, so the hint would be false; the coverage card stays. A custom range **past the cap**: no table card, and its own hint naming the cap — a range that draws nothing needs a sentence saying why |
| Error | Sync failed → `ErrorState(recoverable)`. **Rate-limited → paced retry**, not immediate |
| Offline | Read-only from cache; overrides queue |
| Gated | n/a |

## 7. Interaction

Drag across dates in the table to select a range, which feeds `RateEditor`. A
range write is one action producing many `manual` rows — the mechanism that
makes RUB recoverable in one entry rather than 1,600.

## 8. Rules this screen must obey

- **§7.6** — `manual` outranks every synced source for that pair and date, is
  never overwritten by a later sync, and writes to `audit_log`.
- **Never silently overwrite another manual entry.** Existing `manual` rows in a
  range are counted separately and require a second confirmation.
- **§7.7** — carry-forward is capped at 10 days; the table shows the cap being
  hit rather than hiding the gap.
- **A rate is never set for a date that has not happened yet.** The screen
  passes `today` — the device's own day, since nothing below the client holds
  a zone. It is optional on the operation, and an entry that omits it is
  checked against the day its capture happened on instead, so a queue written
  by an older build still replays.
- The rate **table** never holds an invented figure. Estimates live on the
  transaction (§7.6).
- **A write refused inside the editor is stated inside the editor.** The sheet
  is a modal; a toast on the page behind it is a refusal nobody can read.

## 9. Open questions

1. ~~**Should setting a manual rate clear `fx_rate_estimated`?**~~ **Decided:
   offered, gated, and never inside a closed period.** After writing the range,
   the count of estimated transactions it covers is stated and re-rating them is
   offered as **one audited write behind a `DiffCard`** — the same gate any bulk
   change gets, whoever initiates it.

   **Rows inside a closed tax period are excluded and listed separately.**
   Re-rating them would silently move figures you have already filed against,
   which is precisely what §13.4's immutability exists to prevent. A better rate
   arriving later does not entitle the system to rewrite a closed period; it
   entitles you to reopen one deliberately, which is an audited act (S22).

   Leaving the marker permanently was rejected: the *resting on an estimate*
   filter would then overstate forever, and a filter that never empties stops
   being read.
2. ~~**No alerting.**~~ **Decided: alert on coverage, never on failures.** A
   failed sync is routine — providers hiccup, and FX sync runs on every app
   foreground, so two consecutive failures can mean four minutes of bad wifi.
   Notifying on that would spend the channel's credibility on a tunnel.

   **What is not routine is a currency whose coverage has stopped growing.**
   Push when a currency in active use falls more than a week behind, on the same
   second-occurrence rule as backups (S30). That is precisely the GEL condition —
   NBG rate-limited, the adapter reported it honestly, and 0.5% coverage went
   unnoticed for months — and it fires close to never otherwise.

   The distinction generalises: **alert on the symptom, not on the event.** A
   failure that self-corrects is not worth a notification; a gap that persists
   is.
