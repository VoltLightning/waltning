# S03 · Agent

**Surface** both · **Journeys** J9, J12 · **Frequency** a few times a week
**Design** Claude Design project
**Status** specified · tier 1

---

## 1. Purpose

Answer what needs Excel today, and perform bounded writes that you approve.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| Nav | Agent | — |
| S04 | Agent tab | S04 |
| Any screen | `⌘K` | Where you were |

**Exits** — a result row → S09 · a workbook → S27 · a proposed category → S19.

## 3. Layout

### Mobile — 390pt

Single column: conversation, with the audit trail behind a tab rather than
beside it. Tool cards render full-width. The composer is bottom-anchored in the
thumb zone.

### Web — ≥1024px

Three columns — and each earns its place:

```
┌ sessions ─┬─ conversation ──────────────────┬─ audit ──────────┐
│ Today     │  "what did I spend on the flat  │ 14:32  write     │
│ ▸ flat    │   this year?"                   │  create_txn      │
│   spend   │                                 │  approved ✓      │
│ Aug 3     │  ⟳ search_transactions · 1.2 s  │                  │
│ ▸ Q2 biz  │                                 │ 14:31  read      │
│           │  ┌ ToolResultCard ────────────┐ │  search_txns     │
│           │  │ ran automatically · 240 ms │ │  auto · 240 ms   │
│           │  │ 34 rows · 48 210,00 zł     │ │                  │
│           │  │            [ See in ledger]│ │ 14:28  read      │
│           │  └────────────────────────────┘ │  get_balances    │
│           │                                 │  auto · 90 ms    │
│           │  "log 48.90 cash coffee"        │                  │
│           │                                 │                  │
│           │  ┌ DiffCard ──────────── write ┐│                  │
│           │  │ before      │ after         ││                  │
│           │  │ —           │ 48,90 zł Cash ││                  │
│           │  │             │ Eating out    ││                  │
│           │  │ Total unchanged: 12 480,20  ││                  │
│           │  │        [Decline]  [Approve] ││                  │
│           │  └─────────────────────────────┘│                  │
│           │  ┌─────────────────────────────┐│                  │
│           │  │ ⌨ ask or instruct           ││                  │
│           │  └─────────────────────────────┘│                  │
└───────────┴─────────────────────────────────┴──────────────────┘
```

**The audit column is not a log viewer — it is the honesty of the screen.**
Every call with its kind, whether it auto-ran, and how long it took. It is what
lets you answer *what did this thing actually do* without trusting the prose.

## 4. Components

| Component | Notes |
|---|---|
| `ThinkingIndicator` | Thinking (timer after 2 s) · tool running (names the tool) · streaming. Cancel at 20 s |
| `ToolResultCard` | Reads — labelled *ran automatically · 240 ms*, visually distinct from writes |
| `DiffCard` | Writes — before/after, `pending` · `applying` · `approved` · `declined`. **Never a modal** |
| `RefusalCard` | The model declined. Distinct from an error and from a decline |
| `AuditRow` | Tool · kind · state · timing. **Declined calls stay**, muted and collapsed — the only place a refused proposal survives, since nothing reaches `audit_log` |
| `AutoModeComposer` | **The composer carries the state, not the page.** A persistent inline label above the input — `AUTO · recategorise · 14 left` — with a `✕` to exit and a doubled send glyph (`▶▶`). You cannot type an instruction without passing over it, which a page-level banner does not guarantee. **Uses no colour**, so P4's single meaning for amber stays intact |
| `ErrorState(recoverable)` | Model call failed; session continues |

## 5. Data

| Reads | Writes |
|---|---|
| `get_agent_sessions`, `get_messages` | `send_message` |
| The operation catalogue — the agent's own capabilities (§11.0) | Every registry write, **each behind a `DiffCard`** |
| `agent_tool_calls` for the audit column | `grant_auto_mode` — bounded, stored (§11.2) |

## 6. States

| State | Treatment |
|---|---|
| Loading | Session list skeleton; the conversation opens instantly from cache |
| Populated | Idle · thinking · tool running · streaming · awaiting approval · applied · declined |
| Empty | No sessions — `EmptyState(first-run)` with three example questions, which is also how the capability surface gets discovered |
| Error | Model failed → stated in-conversation, session continues, nothing partially applied. Tool validation failed → returned to the model, which retries or explains. **Never a silent no-op** |
| Offline | **Disabled, with the reason stated.** Not queued — a turn is not a replayable write |
| Gated | Every write gates by default. Auto mode is opt-in, scoped, bounded, and visibly on |

## 7. Interaction

### Mobile
Composer bottom-anchored. Diff cards are full-width with Approve and Decline as
`primary` + `secondary` — never two primaries. Haptic on approve.

### Web
`⌘K` opens from anywhere. `⌘↵` sends. `A` approves the focused card, `D`
declines. `Esc` cancels a running turn. The audit column is scrollable
independently.

### Shared
**Never a modal, never "are you sure".** The diff *is* the confirmation — a
generic dialog teaches nothing and gets clicked through.

## 8. Rules this screen must obey

- **P3** — one approval gate, three call sites. This `DiffCard` is the same
  component S05 and S07 use.
- **§11.2** — nothing is written on the model's own authority, ever. Auto mode
  changes who taps approve, not whether it is audited.
- **§11.4** — `stop_reason: "refusal"` is checked **before reading content**.
- **§11.5** — a new category is proposed, never created silently.
- **§11.0** — reach is everything the UI can do; reach is not authority.

## 9. Open questions

1. ~~**Auto mode's visual treatment.**~~ **Decided: the composer, not the
   page.** State belongs where you are already looking, and the composer is the
   one region you cannot avoid before issuing an instruction — a banner at the
   top of a three-column screen is ignorable within a day. It carries the scope
   and the remaining count, because *auto mode is on* is less useful than *auto
   mode is on for recategorisation, fourteen operations left*. No colour is
   used, which keeps P4 intact.

   Still to settle: whether auto-applied `DiffCard`s should **also** read
   differently from approved ones in the transcript. The composer answers *am I
   in auto mode now*; the card would answer *did I approve this particular row*,
   permanently. They are different questions and the second may outlive the
   first.
2. ~~**Session titles are generated — can they mislead the audit trail?**~~
   **Decided: no, because the title is not the audit trail.** Titles are the
   first user message, truncated, and editable. No second model call — the
   latency and cost would buy nothing over the sentence you already typed.

   **The audit record is `agent_tool_calls`**, which holds the tool, its input,
   its output and its approval state. A session called *"coffee"* that contains
   a bulk recategorisation is findable by what it *did*, not by what it was
   named — so a wrong title costs navigation, never accountability.
3. ~~**Should the audit column show declined writes?**~~ **Decided: yes, muted
   and collapsed.** Declined calls stay in the column, visually recessed and
   plainly distinct from applied ones, so the column answers both questions —
   what happened, and what was proposed and refused.

   **The refusals are the more interesting record.** A proposal you decline three
   times says something about how the agent is reading your ledger, and it exists
   nowhere else: nothing reaches `audit_log`, because nothing was written. A
   default-on filter was rejected for the reason S13's history toggle had to be
   fixed — it would hide real data, and would then need a count to be honest
   about it.
