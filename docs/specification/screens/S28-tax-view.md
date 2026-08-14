# S28 · Tax view

**Surface** web · **Journeys** J11 · **Frequency** monthly to annually
**Design** none
**Status** specified · tier 2 · **build early** — revenue is live (`SPEC.md` §13.6)

---

## 1. Purpose

Make the business boundary and the scheme in force legible, before anything is
exported.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| S01 | Scope → Business | S01 |
| Nav | Tax | — |
| S22 | After setting a scheme | S22 |

**Exits** — a completeness row → S09, fixed inline, returning here with the
warning cleared · S27 to export.

## 3. Layout

### Mobile
Not supported. This is an annual, high-stakes, sitting-down screen.

### Web — ≥1024px

```
  Period  [ 2026 ]        PL · PL_RYCZALT v2026
                          in force 1 Jan 2026 – present
  A reconciliation view, not a filing · what's in scope ↗

  ┌ revenue ────────────────────────────────────────────┐
  │  Date      Counterparty      NIP        Rate  Amount│
  │  12 Feb    Acme Sp. z o.o.   1234567890  12%  8 400 │
  │  14 Mar    Beta GmbH         —           12%  6 200 │  ⚠ NIP
  │                                        ───────────  │
  │                                          14 600 zł  │
  └─────────────────────────────────────────────────────┘

  ┌ costs ──────────────────────────────────────────────┐
  │  Not applicable under ryczałt.                      │
  │  The record is an ewidencja przychodów — a revenue  │
  │  register with no cost side (SPEC.md §13.6).        │
  │  Business expenses are still tracked for your own   │
  │  analysis; they are not reportable.                 │
  └─────────────────────────────────────────────────────┘

  ┌ completeness ───────────────────────────────────────┐
  │  ⚠ 1 revenue row missing counterparty NIP    [Fix]  │
  │  ⚠ 2 rows missing a KSeF invoice id          [Fix]  │
  │  ⚠ 1 row resting on an estimated FX rate     [Fix]  │
  │  ✓ no uncategorized business rows                   │
  └─────────────────────────────────────────────────────┘

                       [ Close period ]   [ Export → S27 ]
```

**Closing is the act that makes §13.4's immutability real.** It freezes the
scheme for the period, records who closed it and when, and requires every
completeness warning to be cleared **or explicitly acknowledged** — so the lock
carries a record of what was known to be incomplete at the time, rather than
implying it was clean. Reopening is possible and audited.

**The cost side is removed with a stated reason, never blanked.** An empty
expense table reads as a bug or as missing data. Saying *why* it is absent is
the difference between a system that is correct and one that looks broken.

## 4. Components

| Component | Notes |
|---|---|
| `SchemeTimeline` | Which scheme is in force, and since when — resolved by **transaction date** |
| `ComparisonTable` | Revenue rows with their ryczałt rate |
| `Banner(warn)` | Completeness items, each with an inline fix |
| `ManifestCard` | Preview of what an export would assert |
| `EmptyState(range)` | Zero-revenue period — **not an error** (§8.7) |

## 5. Data

| Reads | Writes |
|---|---|
| `tax_ledger` for the period — business rows only | — |
| `tax_schemes` in force by transaction date | — |
| Completeness: missing NIP, missing `ksef_id`, uncategorized, `fx_rate_estimated` | — |

## 6. States

| State | Treatment |
|---|---|
| Loading | Skeleton rows |
| Populated | **Ryczałt** — revenue only, cost side removed with a reason. **Skala / liniowy** — both sides, KPiR column mapping |
| Empty | Zero revenue in the period — stated as a legitimate position, with export still available |
| Error | Query failed → `ErrorState(recoverable)` |
| Offline | Cached with age. Completeness counts are **not** shown from cache — a stale "all clear" before a filing is the worst possible lie |
| Gated | **No scheme set for the period → blocks**, with a link to S22. Guessing a scheme is worse than refusing |

## 7. Interaction

### Web
Each completeness warning links to the row. Fixing returns here with the warning
cleared — the list is a worklist, not a report.

## 8. Rules this screen must obey

- **§13.1** — reads `tax_ledger`; personal rows are unreachable, not filtered.
- **§13.4** — scheme resolves by transaction date, not export date. A period
  spanning a scheme change splits and reports separately.
- **§13.6** — under ryczałt the ryczałt **rate is per revenue row**, derived from
  the activity rather than the category, and editable.
- **§7.6** — rows resting on an estimated rate are a completeness item. NBP
  rates are what Polish filing uses, so an estimate here is a real problem.
- **§13.5** — this is not a filing, and the screen says so.

## 9. Open questions

1. ~~**Is `Business revenue` live yet, or anticipated?**~~ **Answered: live —
   the JDG is trading now.** So the per-row ryczałt rate, counterparty NIP and
   KSeF id are build-time fields, and this screen is not a Phase 6 concern: it
   wants to exist before the first period it is used to check (`SPEC.md` §13.6,
   §16). The completeness list is the part that earns its place early — it is
   the reconciliation surface, and reconciliation is what Waltning owes here
   rather than filing (§13.5).
2. ~~**Multiple ryczałt rates in one year.**~~ **Resolved by S22's dated rate
   table.** `ryczalt_rates` is keyed by *(activity, valid_from)*, so two clients
   at different rates in the same period and an annual rate change are the same
   mechanism rather than two special cases. The resolved figure is stamped on
   each revenue row, so this screen groups by rate without needing to recompute
   anything.
3. ~~**Nothing here is tax advice, and the screen does not say so.**~~
   **Decided: one permanent line in the header** — *a reconciliation view, not a
   filing · what's in scope ↗* — beside the scheme name, never dismissible,
   linking to a short plain-language note.

   **It sets the frame before the first figure is read**, which is the whole
   point: this screen shows revenue with a tax rate applied beside a
   completeness checklist, and that reads a great deal like software telling you
   what you owe. A dismissible first-visit notice was rejected because the
   screen is annual — *dismissed once* means dismissed a year ago, by someone
   who no longer remembers doing it.

   The manifest carries the same statement (§13.1), but that arrives with the
   artifact rather than with the interpretation.
