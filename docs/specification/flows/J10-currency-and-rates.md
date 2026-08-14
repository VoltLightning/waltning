# J10 · Currency and rates

**Frequency** rates daily (automatic) · configuration rarely · **Surface** both
**Screens** S17, S18, S30, plus the header on every screen
**Status** specified

---

## 1. Why this journey exists

Seven currencies, three countries, and **no home base**. Money Manager kept one
global rate per currency and applied it retroactively across five years, its own
documentation conceding the rates "may be outdated." Every historical figure it
ever showed was wrong by an unknown amount.

This journey is what makes **G8** true: the gap between the bank's rate and the
reference rate becomes a figure you can total, rather than an invisible leak.

Mostly it runs without you. The interesting part is what happens when it
**cannot** — which, as of today, is two of six currencies.

## 2. Preconditions

Currencies seeded with their rate sources. The USD pivot is set once at setup
and never surfaced.

## 3. The path

```
AUTOMATIC — on app foreground
   ▸ rates current        → no network call
   ▸ stale, online        → fetch, upsert, stamp fetched_at
   ▸ stale, offline       → last known, MARKED STALE
   ▸ provider failed      → surfaced, never silently carried
   ▸ weekend or holiday   → carry forward, marked carried_forward,
                            CAPPED AT 10 DAYS
        │
   → FxStatusChip in every header:   FX 09:12 · NBP · 2 manual

MANUAL
   S18 Settings · Exchange rates
        │  rate table by pair and date · sync history including failures
        │  ▸ override ONE DAY  ─┐
        │  ▸ override A RANGE  ─┴→ writes `manual`, outranks sync forever
        │  ▸ clear an override → falls back to the synced figure
        │  ▸ force sync
        │
   S17 Settings · Currencies
        │  ▸ pin / unpin      → which appear in the header toggle
        │  ▸ set rate source  → per currency (§7.7)
        │  ▸ add              → ISO code, decimals, symbol; backfills
        │  ▸ archive          → hidden from pickers, history keeps working
        │  ▸ change PIVOT     → ConfirmDialog + audit. Essentially never
```

## 4. Branches

| At | Condition | Goes to |
|---|---|---|
| Header | Display currency tapped | Every figure re-expresses at **each row's own date's rate**. Nothing written, no confirmation, no audit entry (§7.0) |
| S17 | Add a currency | Backfill across the range existing data covers — minutes, and **may partially fail** (§5) |
| S17 | Archive | Refused while any account or transaction references it |
| S17 | Change the pivot | The one heavy operation left. Confirmed, audited, and not something moving abroad requires |
| S18 | Override a range | One entry writes `manual` rows across every day in it — the mechanism that makes a dead source recoverable |
| S18 | Row already `manual` | A later sync never overwrites it (§7.6) |

## 5. Failure paths

| Failure | Treatment |
|---|---|
| **GEL — 11 days of 2,080 held** | **Live, and the real one.** NBG answers a self-redirect once its bot defence trips; the adapter reports that honestly rather than as a crash, which is exactly why nothing looked broken. Georgia is one of three countries in use. Needs a **paced** re-run — retries are the wrong remedy for a rate limit — and until then every GEL amount renders `estimated` against a December 2020 rate |
| **RUB — no quote since 2022-03-11** | ECB delisted it; the 10-day carry cap correctly refused to invent four more years. Covered by a **manual range override**, entered once (O5) |
| Provider fails on sync | `FxStatusChip` goes `failed`, stating which source and when it last succeeded. Falls back to the last known rate — never silently |
| Offline | Last known rates, `FxStatusChip` amber with the age. Every converted figure inherits the marker (P1) |
| A transaction's date has no rate at all | Nearest rate, `fx_rate_estimated` on the row, amber. **A missing rate never costs you the transaction** (§7.6) |
| Backfill partially fails when adding a currency | Coverage stated **per currency as a percentage**, not as success. The system already got this wrong once by reporting completion for a currency holding 0.5% of its range |

## 6. Rules

- **Changing the display currency is free.** A header toggle — no backfill, no
  confirmation, nothing written. Changing the **pivot** is the heavy operation,
  and moving abroad does not require it (§7.0).
- **A reference rate values things; it never invents money that moved.**
  Realized rates come from the two amounts on a transfer or settlement, never
  from a feed (§7.3).
- **Carry forward is capped at ten days.** Weekends and holidays fill; a dead
  source stops. When ECB delisted RUB, the naive fill produced 1,754 consecutive
  days holding one 2022 figure, presented exactly like a weekend gap. A
  four-year carry is not a gap, it is a dead source.
- **`manual` outranks every synced source** for the same pair and date, is never
  overwritten by a later sync, and writes to `audit_log`.
- **The rate table never holds an invented figure.** Estimates live on the
  transaction, attributable to one row, rather than being written into
  `fx_rates` where they would look like published quotes.
- **Staleness is visible, never silent** — in the header, and on every figure
  that rests on it.
- **Prefer the central bank of the jurisdiction you report in**, because that is
  the rate the tax authority will use. Where none exists, fall back to ECB.

## 7. Success

| Measure | Target |
|---|---|
| Invisibility | On a normal day this journey does not happen — rates are current and nothing is shown but the chip |
| Coverage | **100% for every currency in active use.** Currently 4 of 6 (§7.7) |
| Honesty | No figure rests on an estimate without saying so, on the row |
| FX cost | The bank-versus-reference spread is totalled per period and per institution, which no version of Money Manager could show |
| Switching | Display currency changes in under a second and writes nothing |
