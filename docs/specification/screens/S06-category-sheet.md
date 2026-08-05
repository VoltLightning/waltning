# S06 · Category sheet

> Migrated from `FLOWS.md`. **Not yet expanded** — see the screen template.
> Visual design: exists in the Claude Design project

**Purpose** Choose from 122 categories without a paralysing list.
**Entry** Category chip in S05, S02c, S09.
**Regions** Search · parent chips with counts · two-column subcategory grid ·
pinned footer (`+ New` beside `Use ‹subcategory›`).
**Components** `BottomSheet`, `SearchField`, `Chip`, `Button`.
**States** Browsing · searching · no match (offers *Create "…"*) · creating.
**Actions** Select · search · create scoped to the selected parent.
**Exits** Returns the selection to its caller.
