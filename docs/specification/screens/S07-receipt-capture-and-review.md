# S07 · Receipt capture and review

**Surface** mobile (capture) · both (review) · **Journeys** J3, J2, J11
**Frequency** a few times a week
**Design** Claude Design project
**Status** specified · tier 1

---

## 1. Purpose

Turn a photograph into a correctly-split transaction, and keep the photograph
forever as the evidence behind it.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| S05 | `[▣]` photo mode | S05, draft populated |
| S04 | Scan | S04 on commit |
| S09 | *Attach receipt* | S09 |
| S07c | *Enter by hand* after failure | S05, image attached |

Three sub-screens: **a** capture · **b** queue · **c** review.

## 3. Layout

### Mobile — 390pt

**a · Capture** — full-bleed camera, brackets, shutter in the thumb zone, flash
toggle, and a running count of captures in this session. Works offline; the
count is the reassurance that captures are landing when nothing else can
confirm it.

**b · Queue** — one row per capture:

```
  ⏳  waiting    queued 14:06 · uploads on reconnect
  ⟳  extracting  2.4 s
  ✓  ready       Shop A · 62,40 € · 3 lines
  ⚠  unreadable  total not legible          [ Retry ]
```

**c · Review** — a **sequence**, not a series of visits. The header carries
progress (`reviewing 3 of 10`), commit advances to the next ready item, and an
unreadable capture stays queued rather than blocking the ones behind it. Same
shape as S02c, because both are batches of machine-extracted rows confirmed one
at a time.

```
  [ receipt image, tappable to full screen ]

  Merchant   Shop A                      0.97
  Date       5 Aug 2026                  0.99
  Total      62,40 €                     0.62  ← per-field confidence
  Currency   EUR  (detected)
  Rate       4,0231 · ECB · 2026-08-05      ← the RECEIPT's date
  VAT        7,20 €

  LINES
   Milch, Brot, Käse      42,10 €  [Groceries]
   Spülmittel              6,80 €  [Household supplies]
   Pfand                   1,50 €  [Groceries]
                         ────────
   allocated              50,40 €
   unallocated            12,00 €           ← always visible

  ▸ Keep as one          ▸ Split

  ┌ not right? ─────────────────────────────┐
  │ ⌨ the Spülmittel line is household      │
  └─────────────────────────────────────────┘
```

**Extraction is refinable, not just editable.** Typing a correction re-runs the
reasoning with it in context — one sentence instead of hand-editing four fields,
and the model can propagate the consequence (a line moving group may change the
receipt's dominant category). The re-run is bounded like any extractor loop
(`SPEC.md` §11.4) and produces a new draft, which you still approve.

Direct field editing stays available and is the faster path when you already
know the answer. Refinement is for when the *model* was reasoning wrongly rather
than reading wrongly.

**Confidence is per field**, and low values are marked on the field itself. A
banner over the whole receipt tells you nothing about which value to check.

**The unallocated remainder is always on screen**, never computed after commit —
the same rule as J8's allocation, for the same reason.

On commit it is **written as a real line**, categorised to `Uncategorized`, so
lines always sum to the total and the gap survives as a row rather than as an
absence. It then appears in the `Uncategorized` queue, which is already
specified as something that should visibly shrink (`TAXONOMY.md` §5) — so the
reconciliation surface is one that exists rather than one built for the purpose.

### Web — ≥1024px

Capture does not exist on web. **Review does**, and benefits: the image renders
at readable size beside the extracted fields, which is the one thing a phone
cannot give you. This is the surface for correcting a batch of receipts after
the fact.

## 4. Components

| Component | Notes |
|---|---|
| `QueueItem` | `waiting` (queued 14:06) · `extracting` · `ready` · `unreadable` |
| `ProgressBar` | Determinate — upload and extraction both report real progress |
| `ThinkingIndicator` | During extraction, and during a refine |
| `RefineRequest` | Re-runs extraction with a typed correction, so a consequence propagates — a line changing group may change the receipt's dominant category |
| `FxAmount` | The rate is for the **receipt's** date, not today |
| `Chip` | Per-line category — leaves only |
| `ErrorState(terminal)` | Unreadable — image retained, partial extraction shown |
| `Tag` | Per-field confidence where below threshold |

## 5. Data

| Reads | Writes |
|---|---|
| Local capture queue (SQLite) | `upload_receipt` |
| Extraction result and raw model response | `extract_receipt` |
| Rate for the receipt's date | **`create_transaction`** · `set_transaction_lines` |

A receipt is one payment, so it produces **one** transaction (§6.10). *Keep as
one* and *Split* differ only in whether lines are written. The lines hang off
the transaction, not the receipt, so the same breakdown exists on a
hand-entered card payment with no photograph.

**Both the image and the raw model response are retained permanently** — the
image because it is the evidence, the raw response because a prompt improvement
should never require re-photographing anything (§10.2).

## 6. States

| State | Treatment |
|---|---|
| Loading | Queue renders immediately from local SQLite; extraction states are per item, never page-level |
| Populated | Capturing · queued · extracting · ready |
| Empty | Queue clear — `EmptyState`, with the count extracted this session |
| Error | **Unreadable** → `ErrorState(terminal)`, image retained, whatever was legible shown, three actions: Retake (original stays queued until the replacement succeeds) · Enter by hand (draft with the image attached) · Keep image only. **Upload failed** → holds its place in the queue with the reason and a retry; never dropped |
| Offline | Capture fully works. Items queue with their timestamp and state when they will run. The draft in S05 stays editable and saveable meanwhile |
| Gated | n/a |

## 7. Interaction

### Mobile
Shutter is thumb-anchored. Capture is optimistic — the queue row appears before
the file is written. Tap a queue row to review; swipe to discard **only before
extraction**, and with an `UndoToast`.

### Web
Review only. Arrows move between queued receipts, `Enter` commits, `S` splits.
The image pane zooms independently of the field pane.

### Shared
**The split is approved as its outcome**, not its intent: the preview shows the
resulting transactions before commit, which is the same principle as `DiffCard`
(P3).

## 8. Rules this screen must obey

- **P2** — every extracted field declares itself and carries its confidence.
- **P1** — the rate is for the receipt's date, and shows its source.
- **§10.2** — currency is **detected, not assumed**. A café receipt and a
  supermarket receipt in the same week are routinely in different currencies.
- **§10.4** — capture must work in a shop with no signal. This is the only
  screen where offline is the design centre rather than a degraded mode.
- **`TAXONOMY.md` R1** — a line's category is a leaf, enforced by trigger on
  `transaction_lines` as well as `transactions`.
- **The image is never discarded on failure.** A bad photograph of a real
  receipt is still evidence.

## 9. Open questions

1. ~~**Does an unallocated remainder block commit?**~~ **Decided: no — the
   remainder becomes a real line.** The gap is written as an explicit
   `unallocated` transaction line carrying its own amount, categorised to
   `Uncategorized`.

   **Lines therefore always sum to the total**, and the gap stops being an
   absence — it is a row, so it is searchable, it appears in the
   `Uncategorized` queue, and it shrinks as you fix it. The queue that already
   exists becomes the reconciliation surface, which is better than building one:
   `TAXONOMY.md` §5 already commits to `Uncategorized` being a queue that
   visibly shrinks rather than a destination.

   Blocking was rejected because the honest case — a deposit line the model
   could not read — would become a chore performed at a till, one-handed.
2. ~~**Multi-receipt capture in one session.**~~ **Decided: ten transactions,
   reviewed as a queue.** Each receipt is its own payment event, so it is its
   own row — that follows from §6.10 and was never really in question. What was
   open is the review, and it runs as a **sequence with progress**: *reviewing 3
   of 10*, commit advances to the next, skip defers.

   **Nothing blocks on one bad photo.** An unreadable capture stays in the queue
   with its `ErrorState` and the sequence moves past it — the failure of one
   receipt must not hold nine good ones.

   This is deliberately the same shape as the import review queue (S02c): both
   are batches of machine-extracted rows you confirm one at a time, and there is
   no reason for them to feel like different activities. The offline case makes
   it unavoidable anyway — three shops in an afternoon with no signal produces a
   batch whether or not the design expected one.
3. ~~**Retention has no bound.**~~ **Decided: compress on ingest, keep
   everything forever.** Downscale to a legible-but-modest resolution on upload
   — enough to read a till receipt, far less than a phone camera produces — and
   discard the original **only once extraction has succeeded**, never before.
   Retention stays unlimited, which is what the evidence argument requires; only
   the growth rate changes, from ~3.5 MB to ~250 KB a receipt. S30's headroom
   reading stays a check rather than becoming a countdown.

   Tiering by `is_business` was rejected: the flag can be set eighteen months
   later, and a downscaled image cannot be un-downscaled.
