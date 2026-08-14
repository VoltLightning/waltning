# S08 · Voice multi-intent

**Surface** mobile · **Journeys** J2 · **Frequency** occasional
**Design** Claude Design project
**Status** specified · tier 2

---

## 1. Purpose

Let one utterance become several transactions, each approved separately.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| S05 | Voice mode yields more than one intent | S04 on commit |
| S04 | say-a-transaction row, same condition | S04 |

If only one intent is heard, S05 handles it inline and S08 never appears.

## 3. Layout

### Mobile — 390pt

```
  ◉  ▁▃▅▇▅▃▁▂▄▆▄▂       waveform, live
     "coffee four eighty and forty zloty parking"

  Heard 2 things · Cash · PLN
   (•) separate payments      → 2 rows
   ( ) one payment            → 1 row + breakdown

  ┌ DiffCard ────────────────── 1 of 2 ┐
  │  —  │  4,80 zł · Cash              │
  │     │  Food › Eating out           │
  │           [Decline]   [Approve]    │
  └────────────────────────────────────┘
  ┌ DiffCard ────────────────── 2 of 2 ┐
  │  —  │  40,00 zł · Cash             │
  │     │  Transport › Fuel & parking  │
  │           [Decline]   [Approve]    │
  └────────────────────────────────────┘

              [ Approve both ]
```

**Whether this is one payment or two is asked, not assumed.** The unit of a
transaction is the payment event (§6.10), and the model cannot hear the
difference between one card tap and two handovers. The **account is the hint**:
cash defaults to *separate*, a card to *one payment with a breakdown*, because a
card tap is a single authorisation and cash is not. The default is visible and
one tap to flip — never a silent decision.

Choosing *one payment* collapses the cards into a single `DiffCard` for the
combined amount, with the intents as lines.

**One card per intent, each independently approvable.** *Approve both* is a
convenience and never the only control (Q5) — the common failure is that the
model heard two things and got one of them wrong, which an all-or-nothing gate
cannot express.

**Two or three cards in view, and the stack refills as you resolve them.**
Approving or declining the top card frees its space and the next moves up into
it. So the working set is constant — three cards whether the utterance held
three intents or eight — and the pile visibly drains rather than presenting its
full length up front.

Scrolling stays available to look ahead, but is not the primary motion: the
common path is resolve, resolve, resolve, without moving the viewport at all.
There is no count at which this becomes a different component.

Declining one card never disturbs the others, including values heard once and
applied to several — those live in the header.

### Web
Not supported. Voice capture is a phone affordance; the desktop equivalent is
the S05 command bar.

## 4. Components

| Component | Notes |
|---|---|
| `ThinkingIndicator` | Transcribing |
| `DiffCard` | One per intent — the same component as S03 and S07 (P3) |
| `TrailRow` | What was heard, verbatim, per card |
| `Button` | *Approve both* is `secondary` — the per-card Approve is the primary action |

## 5. Data

| Reads | Writes |
|---|---|
| Transcript and parsed intents | **`create_transaction`** — one per approved card |
| `get_accounts`, `get_category_tree` | — |

## 6. States

| State | Treatment |
|---|---|
| Loading | Listening → transcribing, with the waveform live |
| Populated | Parsed — one card per intent |
| Empty | One intent only → falls back to S05 rather than showing a single-card screen |
| Error | Not understood → recording **kept**, transcript shown as heard, keypad offered (`gaps.dc.html` G3) |
| Offline | Transcription requires the network. The recording is kept and queued; the screen states when it will run |
| Gated | Every card gates. No auto mode from voice — a bounded grant needs a session, and this is a single utterance |

## 7. Interaction

### Mobile
Waveform and mic halo both need a `motion-none` branch (§2.7) — currently
unbranched. Declining a card collapses it and retains the reason. Approving is
per card and haptic.

## 8. Rules this screen must obey

- **P2** — every card carries what was heard.
- **P3** — the same `DiffCard` as agent and receipt.
- **Q5** — per-card approve/decline, always.
- **§10** — the mic is the fast path with no non-audio equivalent, so *type
  instead* is visible here too.

## 9. Open questions

1. ~~**One payment or two?**~~ **Decided: asked, with the account as the hint**
   — see §3. This was previously assumed, and under §6.10 it is not the model's
   assumption to make.
2. ~~**Ordering when intents share a field.**~~ **Decided: the survivor keeps
   it.** *"Coffee and parking, both cash"* attaches the account to both cards;
   declining one leaves the other intact. A decline is almost always about that
   card's own amount or category, not about the word heard once and applied to
   several — and the shared value is stated in the header, so it is visible and
   correctable without being re-asked.
3. ~~**How many intents before this becomes a review queue?**~~ **Decided: no
   threshold — a refilling stack of two to three.** Resolving the top card frees
   its space and the next moves up into it.

   **The working set is constant regardless of how many intents were heard.**
   Eight never looks like eight; it looks like three, twice over, with the pile
   draining as you go. That removes the problem a count threshold was invented
   to solve — the ergonomics never degrade, so there is nothing to switch into
   and no number to tune.

   Scrolling remains available to look ahead, but the common path resolves the
   stack without moving the viewport at all.
