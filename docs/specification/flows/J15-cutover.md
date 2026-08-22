# J15 · Cutover

**Frequency** once · **Surface** both
**Screens** S29b, S16, S12, S30, S01
**Status** specified

---

## 1. Why this journey exists

The end of the migration (§8.5), and the moment **R8** either happens or does
not. R8 is the highest-impact risk in the register, and its description is
blunt: *"the failure mode for personal projects is not building the wrong thing
— it is abandoning it halfway with data in two places."*

This journey exists to make the switch a discrete, dated, verified event rather
than a drift. Until it completes, **Money Manager is authoritative**. After it,
Money Manager is read-only forever.

## 2. Preconditions

| Must be true | Why |
|---|---|
| J02–J06, J09, J11 and J14 meet their §7 success criteria | Daily use, review, receipts, import, agent, export and account management all work before the old system becomes read-only |
| The Apr–Aug 2026 gap entered in Money Manager | Locked decision (§3) — migration runs against a later backup |
| FX complete for every currency in use | GEL is currently at 0.5% (§7.7). Cutting over with an unbacked currency means five years of `estimated` amounts |
| Backups running and a restore drill passed | §5.4. Cutting over onto untested backups moves your only copy onto one SD card |

## 3. The path

```
1  Last entries recorded in Money Manager
   Final .mmbak exported
        │
2  S29b Migration import — against the FINAL backup
   Idempotent on ZUID, so this is the same operation run before,
   not a new and untested one
        │
3  VERIFICATION GATE — all 52 active accounts, to the cent
        │
        ├─ PASS → continue
        └─ FAIL → STOP. Nothing built on unreconciled balances
                  is trustworthy. Money Manager stays authoritative
        │
4  Counterparty proposals reviewed
   Names extracted from loan and clearing notes — a REVIEW LIST,
   never an automatic write (§6.6)
        │
5  Money Manager set read-only
   Kept installed, never edited again
        │
6  Final .mmbak and the mm-tools repo archived alongside the backups
        │
   → S01 Dashboard, now authoritative
```

## 4. Branches

| At | Condition | Goes to |
|---|---|---|
| 2 | Expenses and transfers now in scope | The same importer, same idempotency. §8.0 defers them; it does not preclude them |
| 3 | Some accounts reconcile, some do not | Treated as failure. A partial reconciliation is a reconciliation you cannot trust |
| 4 | Two proposals are the same person | Merge before accepting. **After acceptance this becomes a debt-corrupting mistake** (J7 §5) |
| 4 | A name cannot be resolved | Left unassigned. An unattributed clearing row is honest; a wrongly-attributed one is not |
| 5 | Money Manager still needed for reference | Kept installed and readable — the point is that it is never *edited* again |

## 5. Failure paths

| Failure | Treatment |
|---|---|
| **Verification fails** | Cutover stops here. This is the designed outcome, not an error state — §8.4 makes reconciliation the go/no-go for imported data |
| Unmatched transfer legs (R2) | The 20-row OUT/IN discrepancy is resolved to an explicit exception list **before** cutover, not carried into it |
| Balances match but monthly totals diverge | Expected. Divergence is the FX correction (§6.1) — Money Manager applied one undated global rate across five years. It must be **explained**, not merely tolerated, and the migration report states the largest drift |
| A currency has incomplete rates | Every affected row carries `fx_rate_estimated`. Cutting over in this state is a decision, and should be made deliberately rather than discovered |
| Cold-start on rules | The classification cascade assumes rules accumulate from confirmed history. Starting near-empty means the first months lean on the model tier — more API calls, more review, self-correcting within a few months. **A cost in euros, not in correctness** (§8.0) |
| Regret after cutover | The archived `.mmbak` and `mm-tools` are the escape hatch. This is why they are archived rather than deleted |

## 6. Rules

- **Money Manager is authoritative until step 5.** Every prerequisite above
  leaves a usable system if work stops before cutover; no intermediate state has
  data in two places *authoritatively*.
- **The verification gate is not advisory.** Failing it stops cutover until the
  mismatch is understood.
- **Idempotency is what makes this rehearsable.** The importer has run against
  progressively later backups several times before this moment, so the cutover
  run is familiar rather than novel.
- **Counterparty extraction is a suggestion, permanently.** Names live as free
  text in inconsistent forms; merging two spellings silently corrupts a balance.
- **Archive, do not delete.** The final `.mmbak` and the `mm-tools` repo go
  alongside the backups.
- **Net worth is reported twice.** Money Manager had one figure, corresponding
  to *ours*. Stating both makes the difference read as the new distinction it is
  (§8.4).

## 7. Success

| Measure | Target |
|---|---|
| Reconciliation | **All 52 active accounts, to the cent**, per currency |
| Finality | Money Manager is read-only and stays that way |
| Explicability | Every divergence in monthly totals is attributed to the FX correction, with the largest drift stated |
| Recoverability | The final backup and the old toolchain are archived and restorable |
| R8 | Retired. There is exactly one authoritative system, on a known date |
