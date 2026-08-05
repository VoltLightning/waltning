# S10 · Transactions list

> Migrated from `FLOWS.md`. **Not yet expanded** — see the screen template.
> Visual design: **none yet**

**Purpose** Find the thing you remember.
**Regions** Search · filter bar (account, category, scope, currency, date
range, counterparty) · virtualized list · running total for the filter.
**Components** `FilterBar`, `SwipeAction`, `TransactionRow`, `TransferRow`.
**States** Loading · results · ⊗ no results · ⊗ offline (cached).
**Actions** Search · filter · swipe to edit or categorize · tap → S09.
