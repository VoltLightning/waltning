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
| `quote` | Preselects the pair, when the code names one of this pivot's quote currencies | The first quote currency, as with no link — **and the editor does not open**, whatever `date` says |
| `date` | Opens `RateEditor` on that single day, so the fix is one field away | The editor stays closed |

**An unresolvable `quote` opens nothing.** A code this ledger does not quote —
archived, renamed, or a gate that raced the ledger — must never fall through to
whichever pair sorts first *with the editor already open on it*: two taps there
write a manual rate for a pair nobody asked about, and the only thing between
the reader and that write is a heading they arrived at by tapping a link naming
a different currency.

`date` is checked against the **calendar**, not only the `YYYY-MM-DD` shape — a
parameter is whatever a link put in the address bar, and `2026-02-31` has the
shape of a date without being one — and against **today**: §8 refuses a manual
rate for a day that has not happened, so opening the editor on one would only
stage a refusal.

Both arrive as `string | string[]`; a repeated key is an array, and an array is
not a currency code or a date.

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

**`RateTable` is the page's one scroller, and everything else rides in it.**
The table is virtualized, and a virtualized list inside a page `ScrollView` is
one scroller too many — so the pair select, presets, range control and hint are
handed to the table as its **list header**, and the action buttons, the re-rate
note and the coverage card as its **list footer**. The whole page then scrolls,
through the list, and clears the bottom inset. Neither half is given up: the
table stays cheap for a 2,080-day pair, and the coverage card no longer runs
off the bottom edge with no way to reach it.

**The table is therefore not carded.** A card that *is* the whole screen is
exactly what `design-system/05` §5.1 forbids, and a page-scrolling list is the
whole screen. The per-currency coverage list is still a card, riding in the
footer.

**The list still renders when there is nothing to table.** No quote currency,
no pivot, a range that does not parse — the header and footer still have to
move, and a screen whose scroller disappears in exactly the states that put a
hint on it is a screen that cannot show the hint.

**The range control stacks on a phone and pairs at desk width** (`useBreakpoint`,
never a raw width read). Each date field carries its own row of relative-day
chips, so *From* and *To* side by side is two fields and six chips across a
390 px screen — the *To* field and half its chips ran off the right edge.

**The range control caps nothing.** `set_manual_rate` caps a *write* at 366
days and `RateEditor` states that where the write is composed — but
`clear_manual_rate` has no cap at all, and a virtualized table draws whatever
range it is handed for the cost of one window. A cap on the control would
refuse work the ledger accepts: a pair whose manual rows are spread across six
years would have to be cleared six times, by hand.

**A typed date must be a real calendar day**, not merely the `YYYY-MM-DD`
shape. `2026-02-31` has the shape, and the date helpers roll it into March, so
the table would draw rows from a day three later than the one on screen while
the reader filtered on the literal string. One field, one reading.

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
| `RateTable` | **Virtualized, and it is the page**: one row per calendar day, with this screen's own controls as its list header and its coverage card as its list footer. Gaps render as **explicit empty rows**, never as absence |
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
| Empty | A pair with no rates at all — states the source and its last attempt. No quote currency at all: no table, no coverage card, and the hint on the ground saying why. **No pivot**, or a custom range that does not parse: no table and **no hint** either — there is a currency to compare against, so the hint would be false; the coverage card stays. The scroller stays in every one of these, because it is the page |
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
  is a modal; a toast on the page behind it is a refusal nobody can read. The
  refusal clears the moment the rate that caused it is retyped.
- **The sheet is the box that avoids the keyboard**, and it is the only one.
  An iOS `decimal-pad` has no return key, so a sheet that does not lift puts
  the rate field, the counts and both buttons behind the keyboard with no way
  out but dismissing the sheet. `RateEditor` deliberately does not avoid the
  keyboard itself — two nested keyboard-avoiding boxes each add the keyboard's
  height — and puts the rate field first, because the top of the content is
  what a lifted sheet keeps reachable.

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
