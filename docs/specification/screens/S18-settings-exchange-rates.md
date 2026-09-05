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

## 4. Components

| Component | Notes |
|---|---|
| `Card` | Two — `RateTable` alone (only when there is a pair to table), and the per-currency coverage list. Everything else — pair select, presets, date range, action buttons, `RateEditor`, and the no-quote hint — sits on the ground |
| `RateTable` | Virtualized. Gaps render as **explicit empty rows**, never as absence |
| `RateEditor` | Single date **or a range**; states what it will overwrite before writing |
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
| Empty | A pair with no rates at all — states the source and its last attempt |
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
