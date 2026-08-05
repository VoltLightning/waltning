# S08 · Voice multi-intent

> Migrated from `FLOWS.md`. **Not yet expanded** — see the screen template.
> Visual design: exists in the Claude Design project

**Purpose** One utterance, possibly several instructions, all gated.
**Regions** Waveform · live transcript · one `DiffCard` per parsed intent ·
approve control.
**States** Listening · transcribing · parsed · ⊗ not understood.
**Actions** Approve / decline **per card** (⊗ currently one *Approve both*).
**Exits** S04.
