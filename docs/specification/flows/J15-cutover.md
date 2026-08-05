# J15 · Cutover

> Migrated from `FLOWS.md`. **Not yet expanded** — see the flow template.

**Frequency:** once. The end of the migration (`SPEC.md` §8.5).

```
1. Last entries recorded in Money Manager; final .mmbak exported
2. S29b Migration import — run against the final backup
3. VERIFICATION GATE — all 52 balances, to the cent
        ▸ pass → continue
        ▸ fail → STOP. Nothing built on unreconciled balances is trustworthy
4. Counterparty proposals reviewed (names extracted from notes — J7)
5. Money Manager set read-only, kept installed, never edited again
6. Final .mmbak and mm-tools archived alongside the backups
```
