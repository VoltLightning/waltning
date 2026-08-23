# J1 · First run

**Frequency** once · **Surface** mobile, then web
**Screens** S29a, S29b, S16, S17, S22, S04
**Status** specified

---

## 1. Why this journey exists

The only journey where nothing exists yet — no accounts, no history, no
balances. Every other journey assumes its output. It runs standalone, on the
phone alone (`architecture/14` §14.1) — no account, no login, no
network. Adding a backend is a separate, later, optional step, not a
precondition of getting started.

It also carries the project's single highest-stakes moment. Step 4 runs the
migration, and `SPEC.md` §8.4 makes balance reconciliation the go/no-go gate for
the entire system: *"if balances do not reconcile, nothing built on top is
trustworthy."* A wizard that treats that as a progress bar has hidden the one
thing worth showing.

## 2. Preconditions

| Must be true | Why |
|---|---|
| The app is installed | Nothing else. The phone-alone app needs no account, no tailnet, no server (`architecture/14` §14.0) |
| Currencies and taxonomy seeded | Shipped with the app, not created here — 7 currencies, 59 leaves, 15 groups |

**Adding a backend is a later, separate step, with its own preconditions when
it happens** — device enrolled in the tailnet and authenticated with TOTP,
because there is no public ingress (§5.1, §5.2). Nothing in this journey
requires it: every step here writes to the phone's own replica, which is
complete from the first account.

**The pivot is already USD and is never mentioned.** It is a technical hub for
rate storage, chosen once and invisible in every screen (`SPEC.md` §7.0). A
wizard step asking about it would be asking the user to decide something that
has no user-visible consequence.

## 3. The path

```
first launch, no accounts ──→ S29a Setup wizard

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
| 1 | Wants a currency not in the seeded 7 | S17, add by ISO code. **Historical backfill is backend work (§14.1)** — standalone the currency is usable immediately with rates from each entry's date forward, and prior amounts render `estimated` until a backend fills the history |
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
| No backend, or one is unreachable | Not a failure. This journey finishes standalone and a backend can be added at any later point (`architecture/14` §14.1) |

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
