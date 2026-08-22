# Migration runbook

`SPEC.md` §8 explains *what* the migration does and *why* each check exists.
§8.5 gave the procedure four lines. This is the procedure.

It exists because migration is the one operation in this system that is
**irreversible in practice** — not technically (it runs in one transaction and
rolls back), but practically: once Money Manager is read-only and you have been
entering into Waltning for a month, going back means losing that month.

Everything here has been rehearsed or is marked as needing you.

---

## Before you start

| | Status |
|---|---|
| A final `.mmbak` export | ⬜ Step 1 |
| 52 balances typed off the Money Manager UI | ⬜ **needs you — the one blocking input** |
| Bank statements for the accounts you can get them for | ✅ two accounts, four months |
| Phase 0.5 complete — Tailscale, auth, non-superuser role | ⬜ **must precede this** |
| A scratch database to rehearse into | ⬜ |

**Phase 0.5 is a prerequisite, not a parallel track.** The migration puts five
years of real financial history onto the machine. If the perimeter does not exist
at that moment, it does not exist for the thirteen weeks that follow.

---

## The steps

### 1 · Export

Enter the last transactions in Money Manager and export a final `.mmbak`.

**Do not skip the "enter the last transactions" half.** The export is a snapshot;
anything you were going to record later is recorded nowhere.

### 2 · Probe — `python3 tools/migrate-mm/probe.py <backup>`

✅ **Already run against `<backup>.mmbak`.** Re-run on the final export, because
each new export can add a category, a currency or a type the map has never seen.

Exits non-zero on any blocking finding. It settles seven assumptions the
extractor otherwise makes silently — most importantly the transfer leg layout,
where the wrong reading credits **no destination at all** and fails *plausibly*,
because a clearing account computing to ≈0 is what §6.4 says should happen.

**Gate:** exit 0. Do not proceed on a non-zero exit by reasoning about which
finding is acceptable.

### 3 · Reconcile against the bank — `reconcile_bank.py`

✅ **Already run.** Re-run if the statement window has moved.

This measures something the other gates cannot: §8.4's checks derive both sides
from the same file, so they can only establish **fidelity**. `Saldo po
transakcji` is computed by the bank, and it establishes **completeness** —
which is how we know the ledger is faithful and **partial**.

**Gate:** the statement must be self-consistent (Σ amounts = balance span). The
completeness result is **information, not a gate** — you are migrating a partial
ledger deliberately, and the alternative is not migrating.

### 4 · Type the 52 balances ⬅ **needs you**

Into `accounts.expected_balance`. About an hour.

Without them §8.4's gate evaluates `(computed − Σ) + Σ = computed` and prints
`0,00` down all 52 rows regardless of correctness. Two substitutes were tried and
rejected: `ZASSET.ZLEFTMONEY` is `0.00` on every account, and the bank statements
cover two accounts over four months.

**Gate:** 52 non-null values. Then deliberately corrupt the sign map on a scratch
copy and confirm the gate **fails**. A gate never seen to fail is not a gate.

### 5 · Seed reference data

Currencies, the category tree (`TAXONOMY.md`), tax jurisdictions and schemes,
ryczałt rates by activity.

**An unseeded currency now throws rather than skipping** (H31). Skipping dropped
every row referencing the account while the opening-balance plug absorbed the
difference — a wrong balance that reconciled.

### 6 · Rehearse into a scratch database

Full run, both gates, all §15.1 invariants. Throw it away and do it again.

**Gate:** both gates pass, `verify_t1()` returns three trues,
`verify_no_omitted_revenue()` reports its count, every invariant runs.

### 7 · Decide the 173 reassignments ⬅ **needs you, but does not block**

§6.6a: transfers whose source and destination are the same Loan account, netting
to zero, with the person named only in free text. They migrate as
`debt_reassignments` — one row, two counterparties, no cash flow.

The names are prose in three languages and cannot be resolved automatically.
**Unresolved rows import as zero-effect rows keeping their description**, which
is exactly their behaviour in Money Manager today — so this gates *fidelity*, not
the migration. Do it in the review queue afterwards if you prefer.

### 8 · Run it for real

One transaction. Abandoning rolls the whole thing back (S29 Q1).

**Gate:** both gates green, and the §15.1 invariant set recorded — not glanced
at. Record the result somewhere durable; it is the baseline every later drift is
measured against.

### 9 · Mark the tax position

`is_business` defaults false and migration sets it nowhere. Under ryczałt the
damaging direction is **omission**, so run `verify_no_omitted_revenue()` and work
its list down before the first close.

**This is the step most likely to be skipped and most expensive to skip** (C5).
Every other mechanism in §13.1 prevents a personal row *entering* a tax output;
this is the only one looking the other way.

### 10 · Parallel run

Both systems, for one period. Money Manager stays authoritative.

**This is where C19 becomes visible in daily use** rather than in a report. The
ledger is missing real transactions — 169 of 246 on one account over four
months — and a parallel period is when you find out what that feels like.

### 11 · Cut over

Money Manager becomes read-only: kept installed, never edited again. Archive the
final `.mmbak` and the tooling alongside the backups.

**The statement sync tooling is permanent, not a migration step.** That the
ledger is partial is an ongoing property of how it was kept.

---

## Rollback

| Point | Rollback |
|---|---|
| Steps 1–7 | Nothing has happened. Drop the scratch database |
| Step 8, mid-run | Automatic — one transaction, and abandoning returns the database to empty |
| Step 8, after commit | Restore the pre-migration dump, fix, re-run. **Re-migration is idempotent** via `external_id` partial unique indexes (§8.3) |
| Step 10, during parallel run | Money Manager is still authoritative. Walk away at no cost |
| **Step 11, after cutover** | **This is the point of no return in practice.** Not technically — the dump restores — but a month of Waltning-only entries would be lost |

Take a `pg_dump` before step 8 and keep it until the parallel run ends. It is the
one backup taken for a reason other than routine.

---

## What migration deliberately does not carry

§8.0 imports **balances and income**, not five years of expense history. The
reasoning is in §8.0 and it is worth re-reading before step 8, because it is the
decision most likely to feel wrong in the moment and be right in aggregate.

Consequences to accept, stated so they are not discovered later:

- **Opening balances hold nearly all the value**, and are a derived plug rather
  than an observation — which is the whole reason step 4 exists.
- **Historical spend-by-category is not migrated.** Comparisons against last year
  begin accumulating from cutover.
- **The 173 reassignments carry names, not amounts**, because they net to zero.

---

## Related

- `SPEC.md` §8 — the reasoning behind each gate
- `flows/J15-cutover.md` — the same sequence as a user journey
- `screens/S29-setup-wizard.md` — the interface for steps 5–8
- `defects.md` C13, C14, C18, C19 — the findings that shaped these gates
