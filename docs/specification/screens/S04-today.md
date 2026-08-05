# S04 · Today

> Migrated from `FLOWS.md`. **Not yet expanded** — see the screen template.
> Visual design: exists in the Claude Design project

**Purpose** Answer the only question a daily user opens the app for.
**Entry** App launch; tab bar.
**Regions** Dark hero (net worth, period spend, net) · unsettled chip ·
say-a-transaction row with Scan beside it · Recent · tab bar with raised `+`.
**Components** `Shell(hero)`, `StatTile`, `Banner(warn)`, `TransactionRow`,
`TabBar`.
**States** Loading (skeleton) · ⊗ first run, no accounts · ⊗ offline staleness.
**Actions** `+` → S05 · Scan → S07a · say-a-transaction → S05 voice mode.
**Exits** S05, S07a, S09, S10, S11, S12.
