# S12 · Debt · counterparties

> Migrated from `FLOWS.md`. **Not yet expanded** — see the screen template.
> Visual design: **none yet**

**Purpose** Who owes you, and whom you owe, across currencies.
**Regions** Direction segment (All / They owe / You owe) · counterparty list ·
totals per direction in the display currency.
**Components** `CounterpartyRow`, `DebtDirectionTag`, `SegmentControl`.
**States** Loading · populated · empty (no counterparties) · all settled.
**Actions** Search · filter by direction · tap → S13 · add → S15.
