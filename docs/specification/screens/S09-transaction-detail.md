# S09 · Transaction detail

**Surface** both · **Journeys** J5, J3, J7, J11, J13 · **Frequency** several times a week
**Design** [S09.html](design/S09.html)
**Status** specified · tier 1

---

## 1. Purpose

Show everything one transaction is, and let all of it be corrected.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| S04 | Tap a row | S04, scroll position kept |
| S10 | Tap a row · desk | S10, scroll position kept |
| S11 | Tap an entry · desk | S11, anchor kept |
| S04 | Tap a Recent row | S04 |
| S03 | A row in an agent result | S03 |
| S28 | *Fix inline* on a completeness warning | S28, warning cleared |

**Exits** — S06 for category · S15 for counterparty · S07 for a receipt ·
back to the caller on save or cancel.

## 3. Layout

### Mobile — 390pt

Scrolling column, ordered by how often each region is the reason you came.

```
  Went out                          ← the direction, in words (P5)
  48,90 zł                          ← display-hero
  Cash · PLN

  62,40 $ · 4,0231 · 251,04 zł      ← FxAmount, when foreign
  NBP · 2026-08-04 · synced            provenance stated in full

  ┌ fields ───────────────────────────────┐
  │ Category      Food › Eating out       │
  │ Date          6 Aug 2026              │
  │ Account       Cash · PLN              │
  │ Scope         Mine            [BIZ]   │
  │ Who           Shop A                  │
  │ Money owed    Friend A owes me         │
  │ Note          —                       │
  │ One-off                        [ ○ ]  │
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
  │              rule "Corner Café" · 41h │
  │                                       │
  │ and 11 earlier changes            ∨   │
  └───────────────────────────────────────┘
```

**The direction is a word above the figure.** *Went out* · *Came in* — P5
again: a sign and a colour are two ways of saying the same thing to a reader
who can see both. A transfer says neither, because naming one side of a move
between two of your own accounts would be picking a side.

**Counterparty and Owes are two rows, and this screen is the only place they
can name different parties.** `SPEC.md` §6.6.1 defines the pair: *Counterparty*
is the identity link — who the transaction was with — and naming somebody there
owes them nothing, so no role appears. *Owes* is the obligation, and only it
brings a role with it. Paying a shop for a friend names the shop on the first
row and the friend on the second; S05's one chip row cannot express that, which
is why it writes the same party to both when a role is chosen and leaves this
screen to separate them.

One picker serves both rows — the same directory, asked twice — rather than two
components holding two copies of one list. Imported/legacy debt rows with no merchant link retain entered name text as Who,
never silently promote the debtor into a merchant. Show the entered name snapshot and
current linked name when they differ. Cancelling edits restores both identities;
Save applies them together. Changing an obligation shows its balance consequence
before Save. Existing contribution rows say **Contribution from**, not Debt.

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
| `Card` | §3 draws four boxes — `fields`, `receipt`, `breakdown`, `history`. Two are cards today: `fields` and `breakdown`; the receipt and history boxes have nothing to render on the phone yet — no receipts, no audit log — and become cards when they do. The hero figure and its FX basis sit bare on the ground, never in a card |
| `FxAmount` | Full basis, all four provenance variants |
| `BrandIcon` | Beside the hero's account line, not a row inside `FieldsCard` — that card draws every field through one generic labelled row, and singling out Entered name for an icon would be the special case it exists to avoid. Same catalogue and never-blank fallback as S04/S10 (§14.4b) |
| `AuditHistory` | Renders a **diff**, not a sentence. Marks `agent`, `import`, `migration` actors distinctly (§5.6). **A `conflict_detected` row is a write the server *refused*, not one it applied**, and renders as its own kind — the rejected value struck through beside the value that stood. Rendering it as an ordinary diff would say a change happened when none did, on the one screen you consult precisely because you already distrust the row. Read-only: putting a discarded value back is an ordinary edit you make deliberately (S35 §8) |
| `WhoPicker` | Same choices, matching and draft-preserving exits as S05 |
| `Chip` | Every editable field |
| `Tag` | `BIZ` · `manual` · `estimated` · `scheduled` |
| `Button(danger)` | Delete — soft, and the only destructive control on the screen |
| `ConfirmDialog` | Not used — a soft delete does not block on a confirmation |
| `Toast` | States the delete happened. `UndoToast` is the eventual component once `restore_transaction` exists (§7's follow-up); until then a plain `Toast` does not offer an undo it cannot honour |

## 5. Data

| Reads | Writes |
|---|---|
| `get_counterparties` · `get_entered_name_suggestions` | `create_counterparty` (S15) |
| `get_transaction` | `update_transaction` |
| `get_audit_log(entity, id)` | `set_transaction_lines` |
| The receipt and its extraction | `delete_transaction` — soft |
| The rate and its provenance | `attach_receipt` |
| **Count of rows sharing this date and pair** | `set_manual_rate(pair, date)` — the day-wide fix |

**This screen is where `is_capital` is set**, as the *One-off* toggle at the
foot of the fields card. §6.8 defines one-off capital events, S10 splits its
running total when one is in range, and S25 excludes them from every comparison
— three consumers, and this is the producer. Off by default, and its hint says
what turning it on means: *exclude from comparisons — a move, a car, a deposit
returned*.

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
| Offline | Fields and lines are readable from cache. Edits queue; the row shows `pending`. **`get_audit_log` is server-only**: `audit_log` is not a replicated table (`architecture/14-local-first.md`), so the local ledger holds no copy to read — it answers `unavailable_on_device`, and the screen states *not available on this device*, never an empty list that would read as "nothing ever changed this row". **`AuditHistory` (`design-system/05-composites.md`) is not built**, so this screen renders no audit section at all today; the sentence above is what it must say once it does. That is precisely the moment you consult it because you distrust a row |
| Gated | Flipping to business is refused when the account is `shared`, with the reason (§6.7) — the one place this screen can say no |

## 7. Interaction

### Mobile
Tap a field to open it inline; several can be open at once. **Save is one
button, not implicit per field** — it stays disabled until something has
actually changed, and sends only the fields that did. A detail screen with a
save on every keystroke has no state to disable that button against, which is
what a person needs before trusting it. Delete lives at the bottom, behind a
swipe-free tap.

### Web
`E` edits the focused field, `Esc` cancels, `Cmd+Z` undoes the last field
change. Tab order runs fields → receipt → splits → history.

### Shared
**Deletion is soft.** No confirm dialog: on the phone today it takes a plain
toast rather than the `UndoToast` an undo would use — `operations.md` has no
`restore_transaction` for one to call yet, so a `Toast` states what happened
and nothing more, and *restore ops for delete/archive* is the named follow-up
that would let this line say "and undoable" again.

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
