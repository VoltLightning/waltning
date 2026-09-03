# S05 · Quick add

**Surface** mobile · **Journeys** J2, J3, J7, J8 · **Frequency** several times a day
**Design** Claude Design project · `design/gaps.dc.html` G3
**Status** specified · tier 1

---

## 1. Purpose

Get a transaction into the ledger in **under 10 seconds**, by whichever of three
routes is fastest right now.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| S04 | Floating `+` | S04 on save |
| Any tab | Floating `+` | The tab you came from |
| S04 | say-a-transaction row | S04 — opens in voice mode |
| Any tab | `+` **long-press** → Expense · Transfer · Income | Transfer opens its own composer, not this one |
| S13 | *Add transaction* | S13, prefilled with the counterparty |
| S07c | *Enter by hand* after a failed extraction | S07b, image attached |

**Exits** — S06 for category · S15 for counterparty · S16 for account ·
S07a for photo · S08 when voice yields two intents.

## 3. Layout

### Mobile — 390pt

One draft, three ways in, one Save. The modes fill the **same** draft; switching
mid-draft never discards what is there.

```
┌─────────────────────────────────────────────────┐
│  ✕                                    expense ▾ │
│                                                 │
│                    48,90 zł                     │  ← display-hero, tabular
│                                                 │
│  ┌ trail ─────────────────────────────────────┐ │  ← only when machine-filled
│  │ ◉ Heard: "forty-eight ninety, cash,        │ │
│  │   coffee"                            Undo  │ │
│  └────────────────────────────────────────────┘ │
│                                                 │
│  [Cash · PLN]  [Eating out]  [Today]            │  ← chips, ≥44px
│  [Mine]  [+ note]                               │
│                                                 │
├─ dock · bottom-anchored ────────────────────────┤
│   [123]      [◉]      [▣]                       │  ← mode row
│   ┌───┬───┬───┐                                 │
│   │ 1 │ 2 │ 3 │                                 │
│   │ 4 │ 5 │ 6 │        keypad, thumb zone       │
│   │ 7 │ 8 │ 9 │                                 │
│   │ , │ 0 │ ⌫ │                                 │
│   └───┴───┴───┘                                 │
│   ┌───────────────────────────────────────────┐ │
│   │                 Save                      │ │  ← full width, primary
│   └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**The amount is the largest thing on the screen** because it is the only field
that is always required and always typed.

Under the disposable preview profile, the expense path has two explicit inputs:
a positive USD amount and an account. The app supplies expense type, today's
device-local accounting date, USD, and the operation defaults. Its *Create
account…* exit returns to the same draft with the new account selected. That
profile omits the keypad, category, scope, note, counterparty, voice, scan, and
FX affordances.

**The chip row is the whole model.** Account, category, date, scope, note, and
counterparty when attached. Each chip is empty (placeholder), filled, or
**machine-filled** — the third carries the trail marker (P2).

**The dock is fixed to the bottom** so the keypad, the mode switch and Save are
all within thumb reach without a hand shift. Save is full-width because it is
the only affirmative action and it is pressed in motion.

### The fourth mode — conversational capture

`[123]` `[◉]` `[▣]` `[💬]`. The first three fill a draft and stop. The fourth is
an **agentic loop** (`SPEC.md` §11.4), and it is the one place in the system
where a loop is the right shape:

```
  💬  coffee at that place near the office
      ⟳ searching recent payees …
      the café near the office?          [ yes ]  [ no, the other one ]
      → 48,90 zł · Cash · Eating out
        ◉ from: "that place near the office" → Costa   Undo
```

**It can ask a question, which a pipeline cannot.** One row, you are present,
and the interaction *is* the iteration — you are not reviewing an answer, you
are arriving at one together. Read tools only; the output is still a draft that
Save commits.

**This is a deliberate trade against the ten-second target**, and the target
survives because it belongs to the *keypad* path, not to the screen. Someone who
wants speed types an amount. Choosing to talk is choosing a slower, smarter
interaction — and the budget follows the choice rather than the screen.

### Web — ≥1024px

Quick add appears as a **command bar**, not a screen: `N` from anywhere opens a
single-line composer that parses as you type, with chips resolving beneath it
and Enter to save. No keypad, no dock, no camera.

```
  48.90 cash coffee yesterday
  ─────────────────────────────────────────
   48,90 zł   [Cash · PLN]  [10 Aug]
   payee: coffee   [ Category? ]
```

Parsing is **deterministic first**: first number is the amount, known account
and category names bind to their chips, relative dates parse, the rest becomes
the payee. Instant, no model call.

When the grammar cannot resolve — no amount found, or too much unmatched — the
composer offers *interpret with model ⏎* rather than silently spending 2–5 s.
The slow path is always chosen, never stumbled into, and it renders the same
`TrailRow` as voice (P2).

This is a genuine divergence rather than a reflow. The mobile design optimises
for one thumb and no keyboard; the desktop has a keyboard and a person sitting
still, and a numeric keypad on screen would be slower than typing.

## 4. Components

| Component | Notes |
|---|---|
| `Dock` | Mode row (`123` · `◉` · `▣` · `💬`), keypad, full-width Save |
| `ThinkingIndicator` | Conversational mode, between turns |
| `Keypad` | 0–9, comma decimal, delete. Bottom-anchored (Fitts) |
| `AmountField` | `display-hero`, tabular lining numerals, comma decimal, currency affix |
| `Chip` | Account · category · date · scope · note · counterparty. **≥44px** (Q3). The account chip fills from last-used **only within a short window**, and is otherwise empty with Save disabled — a stale default reads as an answer rather than a question (§9) |
| `TrailRow` | *"Heard: forty-eight ninety, cash, coffee"* + **Undo**. The P2 component |
| `SegmentControl` | Scope — Mine · Shared · Business |
| `ThinkingIndicator` | While a voice utterance or photo is being parsed |
| `DiffCard` | Only when voice yields multiple intents → S08 |

## 5. Data

| Reads | Writes |
|---|---|
| `get_accounts`, `get_category_tree` | **`create_transaction`** |
| `get_counterparties` | `create_category` (via S06, proposed) |
| Rate for the draft's date | `create_counterparty` (via S15) |

`create_transaction` is the operation the agent inherits (§11.0), which is why
voice entry and agent entry produce identical audit rows differing only in
`actor`.

## 6. States

| State | Treatment |
|---|---|
| Loading | Not applicable — the screen opens empty and instantly. Account and category lists come from cache |
| Populated | Filling · machine-filled (trail visible) · saving (Save shows a spinner, width held) |
| Empty | The default. A blank amount is the resting state, not an empty state |
| Error | **Four designed states, `design/gaps.dc.html` G3** — see below |
| Offline | Full function. Writes go to the outbox with a client-generated UUID; Save reads as done, because it is |
| Gated | n/a |

**The four error states**, all designed rather than described:

| | Treatment |
|---|---|
| Speech not understood | Recording **kept**, transcript shown as heard, Replay and Again beside the keypad. Never an emptied draft |
| Offline extraction | Photo queues with its timestamp and states when it will run. Draft stays editable and saveable meanwhile |
| Low confidence | Marked **per field**, not per draft. 0.62 must not look like 0.99 |
| Duplicate at save | Caught on Save, showing the matched row's date and amount. Both actions live — the honest answer is usually *yes, twice* |

## 7. Interaction

### Mobile
Thumb-zone: mode row, keypad, Save. Every target ≥44px including chips. Haptic
on Save. `✕` discards with a confirm **only if a machine filled something** —
discarding your own typing is cheap to redo; discarding a transcription is not.

### Web
`N` opens the composer from anywhere. Enter saves, Escape discards, Tab moves
through resolved chips. No mouse required.

### Shared
**Nothing is written until Save.** Voice and OCR fill a draft; they do not
commit. This is what makes the trail useful rather than an apology after the
fact.

## 8. Rules this screen must obey

- **P2** — every machine-filled field states what produced it, in one line, with
  Undo. The draft is never a black box.
- **P1** — if the draft's currency differs from the display currency, the
  converted figure shows with its rate; if the date has no rate,
  `fx_rate_estimated` is set and rendered amber.
- **P4** — the estimated-rate marker is the only amber here.
- **§7.0a** — the date is stamped from the **device's local calendar** and never
  recomputed.
- **§14.3** — every write carries a client-generated UUID, so a retry cannot
  become a second coffee.
- **§6.6** — attaching a counterparty requires choosing a role; it is never
  defaulted, because *they owe me* and *was with them* are opposite claims.

## 9. Open questions

1. ~~**Does the type selector (`expense ▾`) belong in the header?**~~
   **Decided: yes — and transfers get their own entry point.** The selector
   stays top-right as an escape hatch, deliberately out of the thumb zone,
   because most entries are expenses and the rare case should not occupy prime
   space.

   **The real answer is that Quick add is an expense composer.** A transfer is a
   different shape — two accounts, two amounts, a live rate, and a spread shown
   as it is typed (§14.1) — and folding that into a chip row would compromise
   both. So `+` **long-press** offers Expense · Transfer · Income, and Transfer
   opens its own composer.

   Sign-as-input was rejected outright: §7.2 stores every amount positive with
   `type` carrying direction, and letting the keypad mean something the ledger
   deliberately does not is how sign-flip bugs return.
2. ~~**Should Save be disabled until an account is chosen?**~~ **Decided:
   last-used, but only within a short window.** If something was saved in the
   last few hours the chip fills from it, machine-filled and carrying a trail.
   Beyond that the chip is **empty and Save is disabled** until you choose.

   The ten-second target holds *within a session* — a shopping trip, an evening —
   and deliberately does not hold across a gap. A stale default is most likely
   wrong exactly when you have been somewhere else since, and that is also when
   you are least likely to notice: the chip looks filled, so it does not read as
   a question. Making the guess expire converts a silent error into a one-tap
   cost, paid only when the guess had stopped being good.

   Window length is unset; a few hours is the intent, not a specification.
3. ~~**Web command-bar parsing is unspecified.**~~ **Decided: deterministic
   grammar first, model as an explicit fallback.**

   The grammar handles the common shape with no latency and no model call: the
   first number is the amount, a known account or category name binds to its
   chip, relative dates parse (`yesterday`, `tue`), and the remaining words
   become the payee. Chips resolve **live beneath the line**, so an ambiguity is
   visible before Enter rather than after.

   **The fallback is offered, not taken automatically.** When the grammar cannot
   resolve an amount — or leaves too much unmatched — the composer says so and
   shows *interpret with model ⏎* rather than silently spending 2–5 s. That
   removes the real cost of a hybrid, which is not two code paths but two
   unpredictable latencies in one box: here the slow path is always a thing you
   chose, and it renders the same `TrailRow` the voice path does (P2).
