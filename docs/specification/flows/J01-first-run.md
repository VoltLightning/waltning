# J1 · First run

**Frequency** once · **Surface** mobile, then web
**Screens** S29a, S29b, S16, S17, S22, S04
**Status** specified

---

## 1. Why this journey exists

The only journey where nothing exists yet — no accounts, no history, no
balances. Every other journey assumes its output.

It also carries the project's single highest-stakes moment. Step 4 runs the
migration, and `SPEC.md` §8.4 makes balance reconciliation the go/no-go gate for
the entire system: *"if balances do not reconcile, nothing built on top is
trustworthy."* A wizard that treats that as a progress bar has hidden the one
thing worth showing.

## 2. Preconditions

| Must be true | Why |
|---|---|
| Device enrolled in the tailnet | There is no public ingress; an unenrolled device cannot route to the server at all (`SPEC.md` §5.1) |
| Authenticated, including TOTP | Setup runs behind login, not before it (§5.2) |
| Server reachable | Every step writes; there is no offline first-run |
| Currencies and taxonomy seeded | Shipped by the seed, not created here — 7 currencies, 59 leaves, 15 groups |

**The pivot is already USD and is never mentioned.** It is a technical hub for
rate storage, chosen once and invisible in every screen (`SPEC.md` §7.0). A
wizard step asking about it would be asking the user to decide something that
has no user-visible consequence.

## 3. The path

```
login ──first launch, no accounts──→ S29a Setup wizard

  1  Display currency          pin from PLN · USD · EUR · …
     └─ a preference, changeable from any header afterwards

  2  Currencies in use         pin / archive from the seeded 7
     └─ archiving hides from pickers; history would keep working

  3  First account             → S16 Account editor
     name · kind · currency · group · opening balance + date
     └─ the only mandatory step

  4  Import from Money Manager?     ▸ yes → S29b Migration import
                                    ▸ no  → skip

  5  Tax scheme?                    ▸ yes → S22 Settings · Tax
                                    ▸ no  → skip, offer again at first
                                            business-flagged transaction

  → S04 Today
```

**S29b · Migration import** is a journey inside a journey:

```
file picker (.mmbak)
   │
normalization report      what was renamed, merged, resolved (§8.2)
   │                      reviewed, not just displayed
VERIFICATION GATE         per-account balance comparison, to the cent
   │                      net worth reported TWICE — mine and ours (§6.7)
   ├─ pass  → counterparty proposals → S04
   └─ fail  → §5 below
```

## 4. Branches

| At | Condition | Goes to |
|---|---|---|
| 1 | Wants a currency not in the seeded 7 | S17, add by ISO code — triggers a backfill (§5) |
| 3 | Account currency is archived | Re-pins it silently; an account's currency cannot be hidden |
| 4 | Declines import | Skips 4 entirely; the importer is idempotent, so this closes no doors (§8.3) |
| 4 | Import passes | Counterparty proposals — a **review list**, never an automatic write (§6.6) |
| 5 | Declines tax setup | Deferred. Re-offered the first time a transaction is marked business, which is when it starts to matter |

## 5. Failure paths

| Failure | Where the user lands |
|---|---|
| **Verification gate fails** | The wizard **stops**. Per-account table showing expected, imported, and the delta, sorted by absolute difference. Three actions: retry against a fresh `.mmbak`, export the discrepancy report, or continue with migration **abandoned** and accounts entered by hand. There is no "continue anyway" that keeps the imported rows — reconciled-looking data that is not reconciled is worse than none |
| `.mmbak` unreadable or wrong format | Named at the file picker, before anything is written |
| Unmatched transfer legs (R2 — OUT 1,734 ≠ IN 1,754) | Not a failure. Listed as an explicit exception list in the normalization report and carried forward |
| **FX backfill incomplete for a currency** | Stated per currency with its coverage, not hidden. GEL currently returns 11 of 2,080 days (`SPEC.md` §7.7) — the wizard must say so rather than reporting success, because every later GEL amount will render `estimated` |
| Network drops mid-import | Import is idempotent on `external_id`; re-running resumes rather than duplicating |
| Server unreachable at step 1 | Setup cannot proceed offline. Stated plainly with a retry — not queued, because there is no local schema to queue into yet |

## 6. Rules

- **Steps 1, 2, 4 and 5 are all skippable.** Someone who wants to log one coffee
  reaches S04 in under a minute. Only step 3 is mandatory, because a
  transaction needs an account.
- **The display currency step carries no weight.** It is a toggle afterwards, so
  it needs no explanation and no confirmation (`SPEC.md` §7.0).
- **The migration step is a file picker plus a verification report**, not a
  progress bar. The reconciliation is the point; hiding it behind a spinner
  inverts what matters.
- **Net worth is reported twice** — *mine* and *ours*. Money Manager had one
  figure, corresponding to *ours*. Stating both here is what makes the
  difference read as the new distinction it is, rather than as a shortfall
  (§8.4).
- **Counterparty names are proposed, never written.** The names are inconsistent
  across spellings and nicknames, and silently merging two spellings of one
  person corrupts a balance (§6.6).
- **Opening balance is derived, not typed.** It comes from the `.mmbak` as
  `reported balance − Σ(imported rows)`, which is what makes a balances-only
  migration accurate without importing five years of history (§8.0).

## 7. Success

| Measure | Target |
|---|---|
| Skip-everything path | S04 reachable in **under 60 seconds** with one account |
| Migration path | Every active account reconciles **to the cent**, shown per account |
| Comprehension | The user can state what *mine* and *ours* mean without opening the spec |
| Honesty | Any currency with incomplete FX coverage was named during setup, not discovered later in a report |
