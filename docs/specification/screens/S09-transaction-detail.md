# S09 · Transaction detail

> Migrated from `FLOWS.md`. **Not yet expanded** — see the screen template.
> Visual design: **none yet**

**Purpose** Everything created must be findable and fixable.
**Entry** S10, S11, S04 Recent, agent result.
**Regions** Amount + FX basis · account · category · date · scope · note ·
counterparty · receipt · line splits · audit history.
**Components** `FxAmount`, `AuditHistory`, receipt viewer, split editor.
**States** View · edit · saving · deleted (soft, recoverable).
**Actions** Edit · split · attach receipt · change scope · delete.
**Exits** Back to caller.
