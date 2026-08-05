# S13 · Counterparty detail

> Migrated from `FLOWS.md`. **Not yet expanded** — see the screen template.
> Visual design: **none yet**

**Purpose** One person's full position, across every currency.
**Regions** Header (name, kind, their settlement currency) · `BalanceLedger` — one
row per currency with direction in words · derived totals · transaction
history · ageing (companies only).
**Components** `CounterpartyCard`, `BalanceLedger`, `AgeingBar`.
**States** Outstanding · fully settled · mixed direction.
**Actions** Settle → S14 · edit → S15 · add transaction → S05 prefilled ·
allocate a group expense (⊗ undesigned).
**Exits** S14, S15, S09.
