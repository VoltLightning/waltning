# S29 · Setup wizard

**Surface** both · **Journeys** J1, J15 · **Frequency** once
**Design** none
**Status** specified · tier 2

---

## 1. Purpose

Get from nothing to a usable ledger — and, if history is being migrated, prove
the balances reconcile before anything is built on them.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| First launch after login | No accounts exist | — |
| S16 | *Import from Money Manager* | S16 |
| J15 | Cutover, step 2 | J15 |

Two sub-screens: **a** first run · **b** migration import.

**Exits** — S16 for the first account · S22 for a tax scheme · S04 or S01 when
done.

## 3. Layout

### Both surfaces — a · First run

Five steps, **four of them skippable**:

```
  1  Display currency      pin from the seeded set
  2  Currencies in use     pin / archive
  3  First account         → S16 editor          ← the only required step
  4  Import from Money Manager?
  5  Tax scheme?
```

Steps 1 and 2 are preferences with no weight — the display currency is a header
toggle afterwards, and the USD pivot is set silently and never surfaced (§7.0).

### Both surfaces — b · Migration import

```
  [ choose a .mmbak ]

  ┌ normalization report ───────────────────────┐
  │  15 category names trimmed                  │
  │  13 name collisions resolved by parent+kind │
  │   2 account names reconciled (ł / l)        │
  │  20 unmatched transfer legs → exception list│
  └─────────────────────────────────────────────┘

  ┌ FX coverage ────────────────────────────────┐
  │  PLN EUR GBP BYN     100%                   │
  │  RUB                  23%  last 2022-03-11  │
  │  GEL                 0.5%  ⚠ rate-limited   │
  │  Amounts in GEL will render as estimates.   │
  └─────────────────────────────────────────────┘

  ┌ FX correction by year ──────────────────────┐
  │  2021   +1 240,10    1 051 rows             │
  │  2022     +880,40    1 397                  │
  │  2023     +410,20    1 313                  │
  │  2024     −120,60    2 133                  │
  │  2025      −88,10    1 855                  │
  │                                             │
  │  Monotonic and one-directional — the shape  │
  │  a correction has. Scattered or sign-        │
  │  flipping would not be.                     │
  └─────────────────────────────────────────────┘

  ┌ VERIFICATION GATE ──────────────────────────┐
  │  Account        expected    imported      Δ │
  │  BANK-A · PLN   6 200,00    6 200,00   0,00 │
  │  Cash · BYN     1 240,00    1 240,00   0,00 │
  │  … 50 more                                  │
  │                                             │
  │  net worth   mine 12 480,20                 │
  │              ours 18 940,60                 │
  │  Money Manager reported one figure, which   │
  │  corresponds to ours.                       │
  └─────────────────────────────────────────────┘
```

**The gate is shown, not hidden behind a spinner.** The reconciliation is the
point of this screen (§8.4).

## 4. Components

| Component | Notes |
|---|---|
| `ProgressBar` | Determinate, per phase |
| `ComparisonTable` | Per-account expected / imported / delta, sorted by absolute difference |
| `SyncLog` | FX coverage per currency — the same coverage view as S18 |
| `MatchWarning` | Counterparty proposals, at volume |
| `ErrorState(terminal)` | Verification failed |
| `DualTotal` | Net worth, twice |

## 5. Data

| Reads | Writes |
|---|---|
| The `.mmbak` via the extractor | `run_migration` — idempotent on `external_id` |
| Money Manager's reported balances | `create_account`, `create_transaction` (`source = migration`) |
| Extracted counterparty candidates | `create_counterparty` — **only after review** |

## 6. States

| State | Treatment |
|---|---|
| Loading | Per-phase progress with real counts |
| Populated | Step-by-step · verifying · complete |
| Empty | n/a |
| Error | **Verification failed → the wizard stops.** Per-account deltas, sorted by size. Three actions: retry against a fresher `.mmbak` · export the discrepancy report · **abandon the migration** and enter accounts by hand. There is no *continue anyway* that keeps the imported rows |
| Offline | Setup cannot proceed. Stated plainly with a retry — there is no local schema to queue into yet |
| Gated | n/a |

## 7. Interaction

### Both
Steps are skippable except 3. Back is always available and never loses entered
data. The verification table is scrollable and sortable; the discrepancy export
is a real file, because resolving it happens outside this screen.

## 8. Rules this screen must obey

- **§8.4** — the gate is go/no-go for the whole project. Failing it stops the
  wizard.
- **§8.3** — idempotent on `external_id`, so this runs several times against
  progressively later backups before cutover.
- **§6.7** — net worth reported **twice**, so the difference reads as the new
  distinction it is rather than as a shortfall.
- **§6.6** — counterparty names are **proposed, never written**. Merging two
  spellings of one person corrupts a balance.
- **§7.7** — FX coverage is stated per currency **during setup**. Reporting
  success while GEL holds 0.5% would hide it until it is expensive.

## 9. Open questions

1. ~~**What does "abandon the migration" do to already-imported rows?**~~
   **Decided: roll the whole thing back.** The migration runs inside a single
   database transaction, so abandoning returns you to the state before the file
   was chosen — no accounts, no opening balances, no rows.

   **Nothing partial is allowed to survive**, because a partial ledger is
   indistinguishable from a whole one at a glance and every figure built on it
   would be quietly wrong. That is the same reasoning as §8.4's gate: *nothing
   built on unreconciled balances is trustworthy.* Keeping the rows behind an
   "unverified" flag was rejected — a caveat on every total is a caveat someone
   eventually clears to make the banner go away.

   **The discrepancy report is written before the rollback**, so the evidence of
   what failed outlives the data that failed. Re-running against a corrected
   backup costs nothing, since the importer is idempotent on `external_id`
   (§8.3).
2. ~~**Divergence in monthly totals states only the largest drift.**~~
   **Decided: show the distribution.** A per-year table of total drift with its
   direction and the row count behind it, rather than a single worst case.

   **A systematic FX correction has a shape and a bug does not.** Money Manager
   applied one undated global rate across five years, so the correction should
   grow with distance from whenever that rate was set and lean consistently one
   way. Monotonic and one-directional is a correction; scattered or
   sign-flipping is something else. One number cannot show a shape, and the
   shape is the entire evidence.

   Recomputing an expected baseline was rejected: it would be a second
   implementation of the same conversion, so a bug in it would validate the same
   bug in the first.
3. ~~**What is the re-prompt after skipping the tax scheme?**~~ **Decided: the
   row saves, then one non-blocking offer, asked once.** *First business row.
   Set a tax scheme to see it in the tax view.* — `Later` / `Set up ↗`, and
   never raised again.

   **A scheme is needed to report, not to record.** `is_business` is a true fact
   about a transaction whether or not a settings screen is complete, so blocking
   the flag would invert capture and configuration — and the moment it would bite
   is the one where you are least able to deal with it, recording an invoice at
   a client meeting.

   S28 already handles the consequence properly: it **blocks with a link to
   S22** rather than guessing a scheme, so a business row with nowhere to
   resolve is visible where it matters instead of being prevented where it does
   not.
