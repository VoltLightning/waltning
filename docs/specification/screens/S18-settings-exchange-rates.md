# S18 · Settings · Exchange rates

> Migrated from `FLOWS.md`. **Not yet expanded** — see the screen template.
> Visual design: **none yet**

**Purpose** See, override, and audit rates.
**Regions** Pair selector · date range · rate table (date · rate · source ·
manual flag) · sync history including failures.
**Components** `RateTable`, `RateEditor`, `SyncLog`, `FxStatusChip`.
**States** Fresh · stale · syncing · failed · has overrides.
**Actions** Override a day/pair · clear an override · force sync.
