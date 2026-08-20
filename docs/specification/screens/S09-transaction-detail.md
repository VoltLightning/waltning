# S09 · Transaction detail

**Surface** both · **Journeys** J5, J3, J7, J11, J13 · **Frequency** several times a week
**Design** none
**Status** specified · tier 1

---

## 1. Purpose

Show everything one transaction is, and let all of it be corrected.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| S10 | Tap a row | S10, scroll position kept |
| S11 | Tap an entry | S11, anchor kept |
| S04 | Tap a Recent row | S04 |
| S03 | A row in an agent result | S03 |
| S28 | *Fix inline* on a completeness warning | S28, warning cleared |

**Exits** — S06 for category · S15 for counterparty · S07 for a receipt ·
back to the caller on save or cancel.

## 3. Layout

### Mobile — 390pt

Scrolling column, ordered by how often each region is the reason you came.

```
  48,90 zł                          ← display-hero
  Cash · PLN

  62,40 $ · 4,0231 · 251,04 zł      ← FxAmount, when foreign
  NBP · 2026-08-04 · synced            provenance stated in full

  ┌ fields ───────────────────────────────┐
  │ Category      Food › Eating out       │
  │ Date          6 Aug 2026              │
  │ Account       Cash · PLN              │
  │ Scope         Mine            [BIZ]   │
  │ Counterparty  Nina · they owe me      │
  │ Payee         Costa                   │
  │ Note          —                       │
  └───────────────────────────────────────┘

  ┌ receipt ──────────────────────────────┐
  │ [thumbnail]   extracted 2.4 s         │
  │               3 lines · view          │
  └───────────────────────────────────────┘

  ┌ breakdown ────────────────── optional ┐
  │ Groceries              42,10          │
  │ Household supplies      6,80          │
  │                        ──────         │
  │ total                  48,90 ✓        │
  │                          [ + Add ]    │
  └───────────────────────────────────────┘

  ┌ history ──────────────────────────────┐
  │ 6 Aug 14:32  user    category changed │
  │              Uncategorized → Eating   │
  │ 6 Aug 14:06  import  created          │
  │              rule "Costa" · 41 hits   │
  │                                       │
  │ and 11 earlier changes            ∨   │
  └───────────────────────────────────────┘
```

**The FX basis is fully expanded here and nowhere else.** Lists show
`local · rate · display`; this screen adds the source, the date the rate is for,
and whether it was synced, manual, carried forward, or estimated. This is where
*"why is this figure what it is"* has to be answerable.

**The breakdown is optional and available on every transaction**, photographed
or not (§6.10). A card tap covering fuel and a coffee is one payment, so it is
one row — and `+ Add` gives it a breakdown without needing a receipt to hang it
from. Where lines exist, category reporting reads them; where they do not, it
reads the transaction's own category.

### Web — ≥1024px

Two columns. Fields left, evidence right — receipt viewer at usable size with
the extraction beside it, and the audit history beneath. The width buys a
readable receipt, which is the one thing a phone genuinely cannot give you.

## 4. Components

| Component | Notes |
|---|---|
| `FxAmount` | Full basis, all four provenance variants |
| `AuditHistory` | Renders a **diff**, not a sentence. Marks `agent`, `import`, `migration` actors distinctly (§5.6). **A `conflict_detected` row is a write the server *refused*, not one it applied**, and renders as its own kind — the rejected value struck through beside the value that stood. Rendering it as an ordinary diff would say a change happened when none did, on the one screen you consult precisely because you already distrust the row. Read-only: putting a discarded value back is an ordinary edit you make deliberately (S35 §8) |
| `Chip` | Every editable field |
| `Tag` | `BIZ` · `manual` · `estimated` · `scheduled` |
| `Button(danger)` | Delete — soft, and the only destructive control on the screen |
| `ConfirmDialog` | Not used. Soft delete is recoverable, so it takes an `UndoToast` instead |

## 5. Data

| Reads | Writes |
|---|---|
| `get_transaction` | `update_transaction` |
| `get_audit_log(entity, id)` | `set_transaction_lines` |
| The receipt and its extraction | `delete_transaction` — soft |
| The rate and its provenance | `attach_receipt` |
| **Count of rows sharing this date and pair** | `set_manual_rate(pair, date)` — the day-wide fix |

**This screen is where `is_capital` is set, and nothing said so.** §6.8 defines
one-off capital events, S10 splits its running total when one is in range, and
S25 excludes them from every comparison — three consumers and no producer. It is
a toggle in the detail sheet, off by default, labelled *one-off — exclude from
comparisons*.

It is deliberately **not** on the capture sheet. You rarely know at the till that
a purchase is the kind that would distort a trend, and S05's budget is ten
seconds. Marking it later is the ordinary path, and it is why the flag affects
comparisons rather than the record: changing it never moves a balance.

Unlike `is_business`, it is **not** tax-sensitive and carries no §11.2 field
gate — getting it wrong costs a trend line, not a filed figure.

## 6. States

| State | Treatment |
|---|---|
| Loading | Skeleton matching the field block; the amount resolves first because it is the anchor |
| Populated | View · editing (inline, per field) · saving |
| Empty | n/a — this screen always has a subject |
| Error | Save failed → the draft is **retained**, error stated on the field that rejected. Never left half-saved |
| Offline | Readable from cache. Edits queue; the row shows `pending`. **Audit history states it may be incomplete offline** — it is the thing you consult precisely when you distrust a row |
| Gated | Flipping to business is refused when the account is `shared`, with the reason (§6.7) — the one place this screen can say no |

## 7. Interaction

### Mobile
Tap a field to edit inline. Save is implicit per field; there is no form-level
Save, because a detail screen you have to remember to save is how corrections
get lost. Delete lives at the bottom, behind a swipe-free tap, and undoes via
toast.

### Web
`E` edits the focused field, `Esc` cancels, `Cmd+Z` undoes the last field
change. Tab order runs fields → receipt → splits → history.

### Shared
**Deletion is soft and undoable.** No confirm dialog — the `UndoToast` is the
confirmation, and it does not block.

## 8. Rules this screen must obey

- **P1** — the amount never appears without its basis, and this is where the
  basis is complete.
- **P2** — a machine-classified row keeps its trail after correction: the import
  reason and the rule that fired stay in the history. That is how you learn the
  rule was wrong.
- **§6.9** — soft delete only. Every read path filters `deleted_at`.
- **§13.1** — flipping `is_business` writes to `audit_log` with the actor, and
  is refused on shared accounts by trigger.

## 9. Open questions

1. ~~**Should editing the FX rate here be possible?**~~ **Decided: yes, and it
   offers to fix the day.** Per-row editing stays — it is §7.6 level 1, and on a
   transfer the rate is *implied* by two amounts from a statement, so forcing it
   to another screen would break the entry path §7.5 describes.

   But on save, if other rows share that date and pair, the count is stated and
   applying the correction to all of them is offered as **one audited write**:
   *4 other rows on 2026-08-05 also use PLN→USD at 4,3120*. A wrong rate is
   almost never wrong for one row, and without this the narrow fix leaves the
   others silently wrong with nothing to signal they exist. Defaulting to the
   wide fix, with the narrow one available, because the wide case is the common
   one.
2. ~~**How much audit history before it needs paging?**~~ **Decided: show the
   last five, fold the rest behind a count.** *and 11 earlier changes ∨* —
   expandable, and nothing is ever truncated.

   **Folded is not the same as hidden, and the count is what makes the
   difference.** The recent entries answer the common question — who changed
   this last week — while the fold keeps a migrated-then-bulk-edited row from
   pushing the receipt and breakdown four scrolls off a 390pt screen. Summarising
   to first-and-last was rejected: the middle is exactly where a wrong bulk
   operation hides, and finding those is what an audit trail is for.
