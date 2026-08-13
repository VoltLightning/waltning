# S27 · Export

**Surface** web · **Journeys** J11, J6, J9 · **Frequency** monthly to annually
**Design** none
**Status** specified · tier 2

---

## 1. Purpose

Build a workbook — and, for a tax period, prove what is not in it.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| Nav | Export | — |
| S28 | Export this period | S28 |
| S25 | Export this view | S25, filter carried |
| S03 | `export_excel` from the agent | S03, file attached |

## 3. Layout

### Mobile
Not supported. Building a workbook is a desktop act, and the file lands on a
desktop. The mobile app links here.

### Web — ≥1024px

```
  Scope     [ All · Mine · Shared · Business ]
  Period    [ 1 Jan 2026 – 31 Dec 2026 ]

  ┌ sheets ─────────────────────────────────────┐
  │ ☑ Transactions      ☑ General Ledger        │
  │ ☑ Trial Balance     ☑ By Category           │
  │ ☑ Accounts          ☑ Cash Flow             │
  │ ☑ FX Rates          ☑ FX Cost               │
  │ ☑ Business  ← requires a jurisdiction       │
  └─────────────────────────────────────────────┘

  Jurisdiction  [ PL ▾ ]
  Scheme        [ PL_RYCZALT ▾ ]
  Version       [ 2026 ▾ ]   resolved from the period

  ┌ ManifestCard ───────────────────────────────┐
  │  498 rows · 1 Jan – 31 Dec 2026             │
  │  PL · PL_RYCZALT v2026                      │
  │  ✓ zero non-business rows included          │
  │    asserted by the export role, which holds │
  │    no privilege on `transactions`           │
  └─────────────────────────────────────────────┘

                            [ Build workbook ]
```

**The manifest renders before the build and again inside the file.** A manifest
you only see after downloading is a receipt for a decision you already made.

## 4. Components

| Component | Notes |
|---|---|
| `WorkbookBuilder` | Scope, period, sheet selection. Opens pre-filled from your **last export of the same scope**, with the source stated — a starting point on screen, never a hidden preference |
| `SchemeSelector` | Jurisdiction · scheme · **version**, defaulted from the period, not from today |
| `ManifestCard` | Reads its assertion from the export path; **never composes it** |
| `ProgressBar` | Determinate per sheet |
| `ErrorState` | Names the failing sheet |

## 5. Data

| Reads | Writes |
|---|---|
| `tax_ledger` — for the Business sheet only | `export_excel(filter)` |
| Everything else — the ordinary ledger | `record_export(params, hash)` |
| `tax_schemes` for version resolution | — |
| Export history — parameters and build-time hashes | — |

**No workbook is stored.** Exports are deterministic in their inputs, so the
history keeps the parameters and a content hash; the file itself is rebuilt on
demand (§9).

**The Business sheet reads `tax_ledger`, never `transactions`.** The export path
connects as a Postgres role holding `SELECT` on the view and no privilege at all
on the base table, so a personal row reaching a tax output fails with a
permissions error rather than succeeding quietly (§13.1).

## 6. States

| State | Treatment |
|---|---|
| Loading | Sheet list resolves instantly; scheme options depend on the period |
| Populated | Configuring · building (per-sheet progress) · complete |
| Empty | **Nothing in range is not an empty state.** A zero-revenue period is a legitimate filing position, so the workbook builds with a zero-row manifest (§8.7) |
| Error | `ErrorState` naming the sheet. **Partial download offered for general workbooks, never for a tax export** — the manifest asserts completeness, and a partial file carrying that assertion would be false |
| Offline | Disabled. The build is server-side |
| Gated | Business sheet requires a scheme in force for the period; without one it is unselectable with the reason stated |

## 7. Interaction

### Web
Tab through configuration, `Enter` builds. The manifest updates live as scope
and period change — it is a preview, not a summary.

## 8. Rules this screen must obey

- **§13.1** — the exclusion guarantee is structural; this screen renders it, it
  does not implement it.
- **§7.0** — **the display-currency toggle is ignored here.** A KPiR is PLN,
  Schedule C is USD, Anlage EÜR is EUR — by law, not preference. Each adapter
  forces its jurisdiction's currency.
- **§13.4** — the version resolves by transaction date. A 2025 export produces
  17 KPiR columns; a 2026 export, 19.
- **Name the output honestly** — an *ewidencja przychodów* is not a KPiR.
- **§12.1** — the workbook opens looking right: frozen header, autofilter,
  number formats per currency, dates as real dates.

## 9. Open questions

1. ~~**Where do built workbooks go?**~~ **Decided: nowhere — rebuild instead.**
   An export is deterministic in its inputs, so the history stores the
   *parameters* (scope, period, sheets, jurisdiction, scheme version) and not
   the bytes. Zero storage, and *"the one I sent the accountant in March"* is
   always reproducible.

   **The determinism is only real for a closed period, so the history says
   which.** A closed period's rows are frozen (§13.4, S22), so a rebuild is
   guaranteed byte-identical. An open period's are not. Each history entry
   therefore carries a content hash taken at build time and compares it on
   rebuild:

   | Entry state | Reads |
   |---|---|
   | Period closed | *Rebuild → identical, guaranteed* |
   | Open, nothing changed | *Rebuild → identical* |
   | Open, 4 rows changed since | **Rebuild → will differ**, with what changed |

   Storing one hash per export is the cost of not storing the file, and it turns
   an assumption into something checkable — the same move the manifest makes for
   the exclusion guarantee.
2. ~~**Should the manifest be signed or hashed?**~~ **Resolved by the above.**
   The build-time hash ties each manifest to the bytes it described, which is
   what was actually wanted. Cryptographic signing is not — there is no third
   party to convince, and the threat model (§5) is not one where you are
   defending against yourself.
3. ~~**Sheet selection has no memory.**~~ **Decided: default from your last
   export of the same kind.** The builder opens pre-filled from the most recent
   export sharing the same scope — tax exports remember tax selections, general
   workbooks remember theirs — with a line saying where the selection came from.

   **This costs a lookup, not a new store.** Export history already holds the
   parameters, because exports are rebuilt rather than retained (§9.1). Named
   profiles were rejected as a *third* saved-configuration concept after
   dashboard layouts and pinned report widgets, on a screen used a handful of
   times a year.

   Everything stays visible and changeable. A restored selection is a starting
   point stated on screen, never a hidden preference.
