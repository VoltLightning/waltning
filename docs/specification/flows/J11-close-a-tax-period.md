# J11 · Close a tax period

**Frequency** monthly or annually · **Surface** web
**Screens** S01, S28, S09, S27, S22
**Status** specified

---

## 1. Why this journey exists

**Highest stakes, lowest frequency** — the combination that guarantees you will
have forgotten how it works by the time you need it again.

The scope boundary matters more here than anywhere: **Waltning is not your legal
book of account** (§13.5). It is the layer around the book — evidence,
reconciliation, categorise-once-project-many-ways, and the Excel you actually
want. A malformed filing is a compliance problem; a bug in a spending dashboard
is an annoyance, and the asymmetry is why this journey ends in an export rather
than a submission.

Under the current position — **ryczałt, not VAT-registered** (§13.6) — the
record is an *ewidencja przychodów*, a revenue register. **There is no cost
side.** That makes this journey substantially smaller than the tax section
implies, and the interface must say so rather than presenting an empty expense
table.

## 2. Preconditions

| Must be true | Why |
|---|---|
| A tax scheme is set for the period | S22 — a **timeline**, not a dropdown, because you may file under different schemes in different years |
| Business rows are marked | `is_business` defaults false; nothing becomes reportable by omission (§13.1) |
| Revenue rows carry their ryczałt rate | Derived from the *activity*, not the category — the expense taxonomy cannot imply it (§13.6) |

## 3. The path

```
S01 Dashboard → scope: Business
        │
   S28 Tax view
        │  the scheme IN FORCE FOR THIS PERIOD, with its version
        │  resolved by transaction date, not by export date (§13.4)
        │
        │  ▸ ryczałt          → REVENUE ONLY, per-row rates
        │                       cost side REMOVED WITH A STATED REASON,
        │                       never blanked
        │  ▸ skala / liniowy  → both sides, KPiR column mapping
        │
   COMPLETENESS  — listed, fixable inline
        ▸ business rows missing counterparty NIP
        ▸ missing KSeF invoice id
        ▸ uncategorized business rows
        ▸ rows resting on an estimated FX rate      ← §7.6
        │
        └─ each → S09, fix, return to the list
        │
   S27 Export
        │  period · scheme · VERSION selector
        │  named honestly — "ewidencja przychodów", not "KPiR"
        │  MANIFEST PREVIEW:
        │    row count · date range · jurisdiction · scheme version
        │    · assertion that ZERO non-business rows are included
        │
   → .xlsx
```

## 4. Branches

| At | Condition | Goes to |
|---|---|---|
| S28 | No scheme set for the period | Blocks, with a link to S22. Guessing a scheme is worse than refusing |
| S28 | The period spans a scheme change | Split by effective date and reported separately. A scheme is immutable once a period closes against it (§13.4) |
| S28 | Completeness list is non-empty | Export is still allowed — but the **manifest states what was missing** |
| S27 | Jurisdiction is PL | `PL_RYCZALT`. `PL_KPIR`, `US_SCHED_C` and `DE_EUER` are defined but unimplemented (§13.6) |
| S27 | Display currency ≠ PLN | **Ignored.** Tax outputs are denominated by law, not by preference (§7.0) |

## 5. Failure paths

| Failure | Treatment |
|---|---|
| A personal row would reach the output | **Structurally impossible.** The export path connects as a Postgres role with `SELECT` on `tax_ledger` and **no privilege on `transactions`** — it fails with a permissions error rather than succeeding quietly (§13.1) |
| A business row sits in a shared account | Blocked at write time by trigger (§6.5), so it cannot reach this journey at all |
| Revenue row with no ryczałt rate | Listed in completeness. Exported with the rate blank rather than defaulted — a guessed tax rate is worse than a missing one |
| FX estimates in the period | Listed. NBP rates are what Polish filing uses, so an estimated PLN rate in a revenue row is a real problem, not a cosmetic one |
| **Export build failed** | `ErrorState`, naming **which sheet** failed and why. For a general workbook, a partial download is offered with the missing sheets named. For a **tax** export it is not: the manifest asserts completeness (§13.1), so a partial file carrying that assertion would be false. Better to produce nothing than to produce a document that lies about itself |
| **Nothing in range** | **Not an error, and not an empty state.** A quarter with no revenue is a legitimate filing position you may need to evidence, so the workbook still builds and the manifest still asserts zero non-business rows — over zero rows. Offering *try a different period* here would misread the situation entirely (`design-system/08` §8.7) |

## 6. Rules

- **The exclusion guarantee is a design problem, not a copy problem.** The
  manifest is the visible half of the structural guarantee — a receipt you can
  check rather than a promise you have to trust.
- **The cost side is removed with a stated reason, never blanked.** Under
  ryczałt there is no cost deduction; an empty expense table reads as a bug or
  as missing data. Saying *why* it is absent is the difference between a system
  that is correct and one that looks broken.
- **Name the output honestly.** An *ewidencja przychodów* is not a KPiR. Calling
  it one would misrepresent the record to whoever receives it.
- **Resolve the scheme by transaction date**, never by export date. A 2025
  export produces 17 KPiR columns; a 2026 export, 19.
- **Nothing here is a filing.** No JPK, no KSeF submission, no ELSTER. The
  handoff to filing software is deliberate (N1–N3, §13.5).
- **Every specific is confirmable, none is advice.** This section is a scope
  argument built from published sources.

## 7. Success

| Measure | Target |
|---|---|
| Manifest | Asserts **zero non-business rows**, and the assertion is backed by a database role rather than a query |
| Completeness | Every missing NIP, KSeF id, category and estimated rate is listed **before** export, fixable inline |
| Cross-check | The workbook is shaped like the filing software's own view, so discrepancies are visible by comparison |
| Recall | Someone returning after twelve months can complete this without reading `SPEC.md` §13 |
