# S11 · Calendar

> Migrated from `FLOWS.md`. **Not yet expanded** — see the screen template.
> Visual design: **none yet**

**Purpose** What happened in this period.
**Regions** Period header · scale switcher (day/week/month/year) · nav-mode
toggle (continuous/stepped) · the grid or list · period total.
**Components** `Calendar`, `DayCell`, `MonthCell`, `PeriodHeader`,
`ScaleSwitcher`, `NavModeToggle`, `Sparkline`.
**States** Loading · populated · empty period · projected-only · ⊗ offline.
**Actions** Switch scale (anchor date preserved) · switch nav mode · tap a day
→ day scale · tap an entry → S09.
