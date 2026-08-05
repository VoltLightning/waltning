# S05 · Quick add

> Migrated from `FLOWS.md`. **Not yet expanded** — see the screen template.
> Visual design: exists in the Claude Design project

**Purpose** One draft, three ways in, nothing written until Save.
**Entry** `+` from any tab; say-a-transaction row.
**Regions** Amount display · chip row (account · category · date · scope ·
note) · trail rows · dock (mode switch, keypad, Save).
**Components** `Dock`, `Keypad`, `Chip`, `TrailRow`, `AmountField`.
**States** Empty · filling · machine-filled (trail visible) · saving ·
⊗ speech-not-understood · ⊗ offline extraction · ⊗ low confidence · ⊗ duplicate.
**Actions** Switch mode · tap any chip · Undo a trail row · Save.
**Exits** S04 on save; S06 for category; S15 for counterparty; S07a for photo.
