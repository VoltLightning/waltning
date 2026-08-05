# S01 · Dashboard

> Migrated from `FLOWS.md`. **Not yet expanded** — see the screen template.
> Visual design: exists in the Claude Design project

**Purpose** Where do I stand, and what needs action.
**Regions** Dark shell (brand, nav, scope segment, FX chip, currency chip, net
worth at 54px with spend/net/business-share beside it) · ground panel ·
unsettled banner (only when non-zero) · widget grid.
**Components** `Shell`, `StatTile`, `Banner(warn)`, `DonutChart`, `BarChart`,
`BalanceRow`, `FxAmount`, `WidgetGrid`.
**States** Loading · populated · ⊗ offline / Pi unreachable · ⊗ first run.
**Actions** Change scope · change period · drill into any widget.
