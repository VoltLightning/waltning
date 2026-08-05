# J3 · Receipt to split

> Migrated from `FLOWS.md`. **Not yet expanded** — see the flow template.

**Frequency:** a few times a week.

```
S05 Quick add [▣]  or  S04 → Scan
        │
   S07a Capture       brackets · shutter · flash · count
        │             works offline; captures queue locally
        │
   S07b Queue         ⏳ waiting — queued 14:06, uploads on reconnect
        │             ✓ ready   — extracted 2.4 s
        │
   S07c Extraction review
        │  merchant · date · total · DETECTED currency
        │  rate for the receipt's date · VAT · per-field confidence
        │  lines, each with a subcategory
        │
        ▸ Keep as one   → single transaction
        ▸ Split         → shows the resulting transactions before commit
        │
   Commit → S04 Today
```

**Design rules**

- Currency is **detected, not assumed**, and the rate is for the *receipt's*
  date, not today (`SPEC.md` §10.2).
- The split is shown **as its resulting transactions** before commit — you
  approve the outcome, not the intent.
- Image and raw model response are retained permanently. Re-extraction after a
  prompt improvement never requires re-photographing.

⊗ No design for an unreadable photo. ⊗ Low-confidence fields have no distinct
treatment — a field at 0.6 should not look like one at 0.99.
