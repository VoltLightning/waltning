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
│  [Cash · PLN]  [Eating out]  [+ payee]  [Today]  │  ← chips, ≥44px
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

**The top row is the screen's own header, and it is a fixed band.** This route
carries no navigation header (`headerShown: false`) — the ✕ and the kind
control are the whole of it — so the band clears the device's top inset itself
rather than inheriting one from a bar that is not there. It sits *beside* the
page body rather than inside it, the way the dock sits below: a header that
scrolls is not one, and the ✕ is the only way out of a composer.

**`expense ▾` opens a menu, and the chevron is why.** Tapping it lists Expense
and Income **with the draft's own kind marked**; any pick closes the sheet,
including the one already marked — a menu's job is to answer and go, and the
marked option is the one a thumb reaches for first.
A control whose current value and whose action are the same word is only
obvious to whoever wrote it, and someone tapping to read the options would find
the draft's kind changed instead — which is also why the menu marks the current
kind: being read is what it is for, and a menu that answers nothing the trigger
already said is a tap spent on nothing. **Transfer is not among them** (§9.1) —
it is a different shape with its own composer.

**The chip row is the whole model.** Account, category, payee, date, scope,
note, and counterparty when attached. Each chip is empty (placeholder),
filled, or **machine-filled** — the third carries the trail marker (P2). The
payee chip (`[+ payee]`, typed, optional) sits between category and date —
without it the keypad path had no payee, so D2's memory could never fire on a
row it produced and every keypad capture reached the ledger nameless.

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
        ◉ from: "that place near the office" → Corner Café   Undo
```

**`[ yes ]` and `[ no, the other one ]` are chips, not a button row**, and
neither is `primary` — `03-primitives` §3.1's own exemption. The
primary-on-the-right rule governs a decision between an affirmative action
and its alternative; this is an answer to a question about what happened,
where recommending one reply by painting it green is exactly the wrong
affordance. They sit in the order they would be spoken.

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
   Spaces group thousands; comma or point is the decimal mark.
   48.90 PLN   Payee: coffee
   [ Cash ]  [ Sep 2 ]  [ Category? ]
```

Parsing is **deterministic first**: first number is the amount, known account
and category names bind to their chips, relative dates parse, the rest becomes
the payee — D1's grammar, the one this section's own worked example resolves.
D2's payee memory proposes the category the same way it does on the phone,
machine-filled at or above `computations.md` §14's display threshold and left
for the category chip to ask about below it.

**The bar states its one non-obvious rule about numbers, standing:** *spaces
group thousands; comma or point is the decimal mark*. That is not the
convention half of Europe types — `1.234,56` resolves to `1.234` — and it is
the one thing a typed line cannot say for itself before the figure is already
wrong. The rest of the grammar announces itself in the chips as it resolves.

**A second number is payee text, not a second thousands group.** The
first-number rule is the whole rule: `1234 567 cash` is 1 234 złoty with `567`
in the payee, never one million. A grouping chain only ever starts from a one-
to three-digit head, because no real thousands separator follows a fourth
digit.

**The three resolved chips are one list.** The account, the date and the
category sit together in a `listbox` the input owns as a `combobox` — Up, Down
and Tab all walk it, `aria-activedescendant` names the chip reached, and DOM
focus stays in the input throughout. The arrows cycle, because they belong to
the list; Tab leaves the bar past the last chip, because it belongs to the
page. The amount, the payee and the captions are outside that list: they are
readings, not choices. The hint above is the input's own `aria-describedby`,
not loose text beside it.

**The list is read, never chosen from.** `aria-selected` marks the chip the
walk has reached and nothing else — no key, tap or click changes what a chip
says, and correcting a field means retyping the line. That is the one place
this list departs from an ordinary combobox, where Enter would commit the
active option; here Enter saves the transaction.

**A name the grammar does not recognise is payee text, not a refusal — with a
last-used account to fall back on.** §9.2's own four-hour window supplies a
default account the moment one exists, and an unrecognised token folds into
the payee the same way "coffee" does in the headline example: `48.90 revolut
coffee` resolves against the last-used account, payee `revolut coffee`, when
that window is open. The refusal below only ever fires with **no** default
account *and* no name the grammar recognises — the ordinary state is a filled
account chip, not a stopped line.

**A date that names no real day is refused, never quietly replaced by today.**
`2026-02-31` matches the `YYYY-MM-DD` shape and is not a day. The grammar asks
the same calendar question the contract edge asks (`zAccountingDate`), so a
date the bar binds is a date the save will take; a shaped token that names no
real day stops the line and says so. Its digits are never read as money
either — a line whose only token is such a value has no amount, and refuses
for that reason instead.

**No model path.** When D1 truly cannot resolve a line — no amount found, no
account at all (no default, no recognised name), a date that is not a real
calendar day, a currency that disagrees with the named account, or too much
left over — the bar shows the reason beneath it and nothing else. No model call is spent guessing; retyping a
clearer line is the whole recovery, and Enter on such a line is a no-op rather
than a save attempt. §9 Q3 records the same decision: this arc builds only the
grammar, and a model fallback for the shape too ambiguous for it is a future
direction, not something this bar offers today.

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
| `Banner` | `neutral`, under the chip row, when the chosen account's currency has no rate — the refusal, and its one action, *Set a ‹CUR› rate* → S18 |
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
| Gated | **The account's currency has no rate** (`architecture/14`: holding a currency and capturing in it are two capabilities, and the second is gated). Save is disabled and a `Banner` says so, carrying the one action that ends it — *Set a ‹CUR› rate*, opening S18 already scoped to that currency. The account picker's own tiles carry a short *Needs a rate* tag instead of the sentence: the tile is a choice, the banner is the explanation, and repeating the sentence in every uncapturable cell says it in the one place nobody is stopped. `neutral`, never amber — P4 below reserves amber for the estimated-rate marker, and a currency with no rate is a missing capability rather than an asserted figure |

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
`N` opens the composer from anywhere. Enter saves, Escape discards (or undoes a
machine-filled category, when that chip is the one the walk has reached). Up
and Down move through the resolved chips and cycle; Tab moves through them too
and then leaves the bar, the way Tab leaves any other field. No mouse required,
and no way to get stuck.

### Shared
**Nothing is written until Save.** Voice and OCR fill a draft; they do not
commit. This is what makes the trail useful rather than an apology after the
fact.

## 8. Rules this screen must obey

- **P2** — every machine-filled field states what produced it, in one line, with
  Undo. The draft is never a black box. On the desk command bar that Undo is a
  control: a ghost button on the provenance line beside *From your history:
  <payee>*, plus `Esc` while the category chip is the one Tab has reached. The
  keyboard route alone would not satisfy this rule — an Undo reachable only by
  a key nothing on screen names is not one.
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
   space. It is a **menu of two**, opened by the tap: a choice of two is still
   a choice, and a control that changes the draft's kind when someone taps it
   to see what the kinds are is a trap wearing a chevron.

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
   last four hours the chip fills from it, machine-filled and carrying a trail.
   Beyond that the chip is **empty and Save is disabled** until you choose.

   The ten-second target holds *within a session* — a shopping trip, an evening —
   and deliberately does not hold across a gap. A stale default is most likely
   wrong exactly when you have been somewhere else since, and that is also when
   you are least likely to notice: the chip looks filled, so it does not read as
   a question. Making the guess expire converts a silent error into a one-tap
   cost, paid only when the guess had stopped being good.

   **Window: four hours**, named `LAST_USED_WINDOW_MS` in
   `packages/client/src/transactions/last-capture.ts`.
3. ~~**Web command-bar parsing is unspecified.**~~ **Decided: deterministic
   grammar first — no model path in this arc.**

   The grammar handles the common shape with no latency and no model call: the
   first number is the amount, a known account or category name binds to its
   chip, relative dates parse (`yesterday`, `tue`), and the remaining words
   become the payee. Chips resolve **live beneath the line**, so an ambiguity is
   visible before Enter rather than after.

   **This arc builds only the grammar.** A line it cannot resolve shows the
   reason beneath it and nothing else — no *interpret with model* offer, no
   2–5 s spent guessing, and Enter on such a line is a no-op rather than a save
   attempt. A model fallback for the shape too ambiguous for the grammar is a
   real future direction — the same hybrid shape voice capture already takes,
   rendering `TrailRow` (P2) — but it is not part of what this bar does today,
   and nothing here should be read as describing a composer that offers it.
