# J2 · Daily capture

**Frequency** several times a day · **Surface** mobile
**Screens** S04, S05, S06, S07a, S08, S15, S16
**Status** specified

---

## 1. Why this journey exists

**The journey the product lives or dies on.** Everything else in this system is
periodic — monthly import, annual tax, occasional review. This is the one that
runs several times a day, and if it is slow or annoying the ledger stops being
complete, at which point every other journey is reporting on a partial record.

Target: **under 10 seconds** (`SPEC.md` G3), including the case where you are
standing at a till with one hand free.

It replaces typing into Money Manager, which had no voice path, no receipt
path, and no way to record who a shared expense was for.

## 2. Preconditions

At least one account exists (J1 step 3). Nothing else — this journey must work
offline, unauthenticated to the network, and with no rate data for today.

## 3. The path

```
S04 Today  ──tap +──→  S05 Quick add
                          │
        ┌──────────────┬────────────┬──────────────┐
        │              │            │              │
   [123] keypad   [◉] voice   [▣] photo   [💬] converse
        │              │            │              │
   amount typed   transcript    camera → J3    a LOOP — it can
        │         fills fields                 ask you a question
        │              │            │              │
        └──────────────┴────────────┴──────┬───────┘
                                           │
                    chips: account · category · payee · date · scope · note
                          │              └─ counterparty, when attached
                          │
                     S06 Category sheet   (if category tapped)
                          │
                     Save → S04 Today
```

**One draft, four ways in, one Save.** The modes are not four flows — they fill
the same draft, and any field is editable regardless of which produced it.
Switching modes mid-draft never discards what is already there.

**Three fill and stop; the fourth converses.** Keypad, voice and photo produce a
draft in one pass. `💬` is an agentic loop (`SPEC.md` §11.4) — *"coffee at that
place near the office"* can search recent payees and **ask you which one**,
which a single pass cannot do.

**The ten-second target belongs to the keypad path**, which uses no model at
all. Choosing to converse is choosing a slower, better interaction; the budget
follows the path rather than the screen.

**The chip row is the whole model.** Account, category, payee, date, scope,
note, and counterparty when present. Each chip is empty, filled, or
**machine-filled** — and the third state is visually distinct, because P2 says
anything a model produced declares itself. The payee chip matters beyond its
own field: D2's memory proposes a category from it, so a keypad row with no
payee is a row that memory can never fire on.

## 4. Branches

| At | Condition | Goes to |
|---|---|---|
| Category chip | Nothing fits | S06 → *Create "…"*, scoped to the selected parent group |
| Category chip | A group is tapped | Narrows the grid. **Groups are not selectable** — only leaves are assignable (`TAXONOMY.md` R1, enforced in the database) |
| Account chip | Account does not exist | S16 editor, returns to the draft with it selected |
| Counterparty attached | Person not known | S15 editor — name, kind, their settlement currency |
| Counterparty attached | — | **A role must be chosen**: debt, contribution, or reference (§4.1 below) |
| Voice | Two intents heard | S08 Voice multi-intent — one `DiffCard` per intent |
| Photo | — | J3, from S07a |
| Account is a clearing account | — | J8 — the allocation prompt appears after Save, not before |

### 4.1 Attaching a counterparty is three different acts

`counterparty_role` (`SPEC.md` §6.6) is not a detail the interface can infer, so
the chip asks. Wording, not enum values:

| Chip reads | Role | Effect |
|---|---|---|
| *they owe me* / *I owe them* | `debt` | Enters the debt ledger. Category defaults to `Debt & giving › Lent out` or `Other inflows › Borrowed` |
| *their share* | `contribution` | Attribution only. Never a balance, never aged (§6.7) |
| *was with them* | `reference` | Records who was involved. No obligation either way |

Defaulting silently would be wrong in both directions: treating a dinner
companion as a debtor invents money owed, and treating a loan as a reference
loses it.

## 5. Failure paths

All four states designed — `design/gaps.dc.html` G3.

| Failure | Treatment |
|---|---|
| **Speech not understood** | The recording is **kept**, transcript shown as heard, with Replay and Again beside a keypad. A retry never starts from nothing, and the draft is never emptied |
| **Offline extraction** | Photo queues locally with its timestamp and states when it will run. The draft stays fully editable meanwhile — an unextracted receipt does not block entry |
| **Low confidence** | Marked **per field**, not per receipt. A field at 0.62 must not look like one at 0.99, and a banner over the whole draft tells you nothing about which chip to check |
| **Duplicate at save** | Caught on Save, showing the row it matched with its date and amount. Both actions are live — the honest answer is usually *"yes, I bought coffee twice"* |
| **No FX rate for the date** | Saves anyway. `fx_rate_estimated` is set, the amount renders `<FxAmount variant="estimated">` in amber, and the row joins the *resting on an estimate* filter. A missing rate must never cost you the transaction (`SPEC.md` §7.6) |
| **Server unreachable** | Writes to the outbox with a client-generated UUID. Save reads as done, because it is |
| **The edit collided while you were offline** | Only when the *same field* moved on another device inside the sync window — a different field on the same row merges with no prompt (`architecture/14` §14.2). The drain marks it and **does not interrupt**; the marker leads to **S35 · Conflict sheet** when you choose. Tax-sensitive fields always ask, whatever the setting |
| Category picker with no match | Offers *Create "…"* under the currently selected group, never at top level |

## 6. Rules

- **The trail is the honest part.** Every machine-filled field states what was
  heard or read, in one line, with Undo (`principles.md` P2). *"Heard: forty-eight
  ninety, cash, coffee"* + Undo. The draft is never a black box.
- **Nothing is written until Save.** Voice and OCR fill a draft; they do not
  commit. This is what makes the trail useful rather than a post-hoc apology.
- **The date is stamped from the device's local calendar and never moves**
  (`SPEC.md` §7.0a). A coffee at 23:00 in Warsaw is that Warsaw date, whether
  you read it later in Berlin or New York.
- **Every write carries a client-generated UUID.** The row's identity is minted
  on the device, so a retry after a dropped response upserts rather than
  inserting a second coffee (§14.3). Two devices means two writers, and this is
  what makes that safe.
- **The keypad is the floor, not the fallback.** Voice is the fast path, but it
  is unusable in a loud shop and unavailable to anyone who cannot speak, so
  *type instead* is a visible affordance rather than a discovered one
  (`design-system/10`).
- **Targets ≥44px, including chips.** This screen is used one-handed, in
  motion, several times a day; it is where the 44px floor is least negotiable.

## 7. Success

| Measure | Target |
|---|---|
| Keypad path, known account and category | **Under 10 seconds**, tap `+` to Save |
| Voice path | One utterance to a reviewable draft, **no typing** in the common case |
| Trail comprehension | Every machine-filled field can be traced to what produced it, without leaving the screen |
| Offline parity | The same flow, same timing, no degraded mode — only the queue indicator differs |
| Correctness | A duplicate is caught **before** it enters the ledger, not found in a later reconciliation |
