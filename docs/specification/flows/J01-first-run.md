# J1 · First run

> Migrated from `FLOWS.md`. **Not yet expanded** — see the flow template.

**Frequency:** once. **Surface:** mobile, then web.

The only journey where nothing exists yet — no accounts, no currencies, no
history. Every other journey assumes its output.

```
install → S29 Setup wizard
    1. Pick display currency         ← a preference, changeable any time
    2. Add sub-currencies            ← optional, addable later
    3. Create first account          → S16 Account editor
    4. Import from Money Manager?    ▸ yes → S29b Migration import
                                     ▸ no  → skip
    5. Set tax scheme?               ▸ yes → S22 Settings · Tax
                                     ▸ no  → skip, prompt later
    → S04 Today
```

**Design rules**

- Display currency is just a starting preference — it is a toggle afterwards,
  so this step carries no weight and needs no explanation (`SPEC.md` §7.0). The
  USD pivot is set silently and never surfaced.
- Steps 2, 4 and 5 are all skippable. A user who wants to log one coffee should
  reach S04 in under a minute.
- The migration step is a **file picker plus a verification report**, not a
  progress bar — the balance reconciliation (`SPEC.md` §8.4) is the gate, and
  it must be shown, not hidden behind a spinner.

⊗ **No design exists for a failed migration.** If balances do not reconcile,
the wizard cannot simply continue.
