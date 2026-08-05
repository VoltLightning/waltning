# S17 · Settings · Currencies

> Migrated from `FLOWS.md`. **Not yet expanded** — see the screen template.
> Visual design: **none yet**

**Purpose** The currency list, which are pinned to the header toggle, and each one's rate source (`SPEC.md` §7.0).
**Regions** Currency list with rate source per currency · pinned-to-toggle
set · archive · pivot (shown read-only, with an advanced change action).
**States** Default · changing main (confirmation) · backfilling.
**Actions** Add · archive · set rate source · **change main** → `ConfirmDialog`
→ backfill.
