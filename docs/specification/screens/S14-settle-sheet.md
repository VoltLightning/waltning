# S14 · Settle sheet

> Migrated from `FLOWS.md`. **Not yet expanded** — see the screen template.
> Visual design: **none yet**

**Purpose** Discharge a debt, possibly in another currency.
**Regions** Amount + currency · which balance it discharges · rate (editable,
defaults to reference) · spread vs reference · **residual preview** · account
the money moves through.
**Components** `SettleSheet`, `RateField`, `TransferAmount`.
**States** Entering · partial (residual shown) · exact · over-settlement
(becomes a balance in the other direction) · saving.
**Actions** Edit rate · edit amount · commit.
**Exits** S13.
