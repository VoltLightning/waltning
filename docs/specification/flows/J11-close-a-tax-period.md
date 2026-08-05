# J11 · Close a tax period

> Migrated from `FLOWS.md`. **Not yet expanded** — see the flow template.

**Frequency:** monthly or annually. **Highest stakes, lowest frequency.**

```
S01 Dashboard → scope: Business
        │
   S28 Tax view
        │  scheme in force for THIS period, with its version
        │  ▸ skala / liniowy → both sides, KPiR column mapping
        │  ▸ ryczałt         → revenue only, with per-row rates
        │                      cost side REMOVED with a stated reason,
        │                      never blanked
        │
   COMPLETENESS
        ▸ business rows missing counterparty NIP → listed, fixable inline
        ▸ missing KSeF invoice id                → listed
        ▸ uncategorized business rows            → listed
        │
   S27 Export
        │  period · scheme · VERSION selector
        │  produced record named honestly — KPiR vs ewidencja
        │  MANIFEST: row count · range · jurisdiction · scheme version
        │            · assertion that zero non-business rows are included
        │
   → .xlsx
```

**The exclusion guarantee is a design problem, not a copy problem.** The
manifest is the visible half of the structural guarantee in `SPEC.md` §13.1 —
a receipt you can check rather than a promise you have to trust.
