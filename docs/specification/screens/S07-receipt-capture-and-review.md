# S07 · Receipt capture and review

> Migrated from `FLOWS.md`. **Not yet expanded** — see the screen template.
> Visual design: exists in the Claude Design project

**a · Capture** Brackets, shutter, flash, count. Works offline.
**b · Queue** Per-item: ⏳ waiting (queued 14:06, uploads on reconnect) ·
✓ ready (extracted 2.4 s).
**c · Review** Merchant · date · total · detected currency with the
receipt-date rate · VAT · per-field confidence · lines with subcategories ·
resulting transactions preview.
**States** Capturing · queued · extracting · ready · ⊗ unreadable · ⊗ upload
failed.
**Actions** Edit any field · Keep as one · Split · Commit.
**Exits** S04.
