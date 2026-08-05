# J4 · Monthly import

> Migrated from `FLOWS.md`. **Not yet expanded** — see the flow template.

**Frequency:** monthly, per institution. Replaces an evening in Excel.

```
bank statement exported (manual — no aggregator covers these institutions)
        │
   S02a Upload            file → parser detected → account confirmed
        │
   S02b Parsing           ⊗ progress state undesigned
        │
   S02c Review queue      ← the screen this journey exists for
        │
        │  each row:  Rule ·  free, names the rule
        │             Model 0.91 ·  confidence AND reason
        │             Transfer ·  pair already collapsed to one row
        │             Duplicate ·  matched an existing transaction
        │
        │  keyboard: J K next/prev · A accept · R rule · S skip · T transfer
        │
        ▸ Expand row → reason · category picker · FX panel with editable rate
        ▸ Write a rule → S20 Rule editor (prefilled from this row)
        ▸ Bulk accept ≥ 0.90 → bounded, count stated. Never "accept all"
        │
   queue clear → S02d Empty state → verify balances → S01 Dashboard
```

**Design rules**

- Bulk accept is **always bounded by a stated threshold and shows its count**.
  "Accept all" is the fastest way to poison a ledger.
- Every model row states confidence *and* its reason; every rule row names the
  rule and its hit count. A guess with no rationale cannot be judged.
- `import_rows.raw` is never mutated, so a reparse is always possible.

⊗ Accept and Skip have no undo. ⊗ The confidence threshold is described as
movable but is not.
