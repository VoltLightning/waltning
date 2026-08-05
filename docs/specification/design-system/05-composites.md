# Composites

### 5.1 Structural

| Component | Contents |
|---|---|
| `Shell` | Dark gradient band — brand, nav, scope segment, `FxStatusChip`, `CurrencyChip`, `DualTotal` hero |
| `GroundPanel` | `radius-xl` surface lifting over the shell |
| `Card` | `surface`, `radius-lg`, `shadow-card`; optional title and action |
| `StatTile` | Figure + label + delta. Delta takes `negative` ink when spend rose |
| `DualTotal` | **The two headline figures** — *mine* dominant, *ours* secondary beneath (`SPEC.md` §6.7). Never a toggle: showing one at a time invites reading the wrong number. Degrades to a single figure when no shared account exists |
| `ContributionRow` | An inflow to a shared account, attributed to a counterparty. Reads as a contribution, never a debt — no settle action, no ageing |
| `BottomSheet` | 170px from top; search, content, **pinned footer** |
| `TabBar` | 5 tabs + raised `+`. Duotone icons, ≥44px targets |
| `Dock` | Bottom-anchored composer: mode row, keypad, full-width Save |

### 5.2 Rows

| Component | Notes |
|---|---|
| `TransactionRow` | Date · payee · category · `Amount`. `BIZ` tag when business |
| `TransferRow` | Variant showing both accounts — one row, never two |
| `BalanceRow` | Account · kind · `FxAmount` for foreign accounts |
| `SharedGroup` | Balances group for shared accounts — own subtotal, visually distinct but **not diminished**. A negative balance here is an ordinary fact and gets no warning treatment |
| `ImportRow` | Collapsed: date, payee + raw string, tier pill, proposed category + basis, amount + FX, Accept/Skip. Expanded: three panes — reason + business/rule toggles, category picker, currency and rate panel |
| `AuditRow` | Tool call · kind (read/write) · state · timestamp |
| `TrailRow` | *"Heard: forty-eight ninety, cash, coffee"* + **Undo**. The P2 component |
| `QueueItem` | Receipt queue: `waiting` (queued 14:06, uploads on reconnect) / `ready` (extracted 2.4 s) |

### 5.3 The approval gate

**`<DiffCard>` — one component, three call sites** (agent, voice, receipt).

```
┌ create_transaction ───────────── write ┐
│  before          │  after              │
│  —               │  48,90 zł · Cash    │
│                  │  Eating out         │
│  Total unchanged: 12 480,20 zł         │
│                        [Decline] [Approve]
└────────────────────────────────────────┘
```

States:

| State | Treatment |
|---|---|
| `pending` | Neutral border; both actions live |
| `approved` | Green border and header; `applied 14:32 · audit #4821 · actor = agent` |
| `declined` | Muted, collapsed, reason retained |
| `applying` | Spinner on Approve; both actions locked |

Never a modal. Never "are you sure" — the diff *is* the confirmation, because a
generic dialog teaches nothing and gets clicked through.

**`<ToolResultCard>`** — read results. Visually distinct from writes, labelled
`ran automatically · 240 ms`.

⚠️ Approved cards need a **revert** affordance for the session (§13 Q4).

### 5.4 Messaging

| Component | Use |
|---|---|
| `Banner` | Page-level. `warn` = unsettled clearing, with a stated meaning and one action. `negative` = failure. `neutral` = offline |
| `EmptyState` | Icon, title, explanation, action. Currently only the import queue has one |
| `ErrorState` | What failed, why, what to do. Never a bare code |
| `ConfirmDialog` | Genuinely destructive and irreversible only — deleting an account, changing the **pivot** currency |

### 5.5 Debt and counterparties

Implements `SPEC.md` §6.6. The hard part is not the list — it is that one
person can owe you in one currency while you owe them in another.

| Component | Notes |
|---|---|
| `CounterpartyRow` | Avatar or monogram · name · kind icon (person / company) · net position in **their** currency, with the display-currency equivalent beneath |
| `CounterpartyCard` | Full position: one row per currency, then both derived totals |
| `BalanceLedger` | Per-currency table. Positive = they owe you, negative = you owe them. Direction stated in words, never by sign alone (P5) |
| `SettleSheet` | Amount, currency, which balance it discharges, rate (editable), **residual shown before commit** |
| `DebtDirectionTag` | `owes you` / `you owe` — text, not a colour |
| `CounterpartyPicker` | Search, recent, create-in-place. Same shape as the category sheet |
| `AgeingBar` | Days outstanding. **Companies only** — see O15 |

**`<BalanceLedger>` is the component that justifies the model change:**

```
  ┌ person · settles in EUR ──────────────┐
  │  PLN    +840,00        owes you       │
  │  EUR    −120,00        you owe        │
  │  ───────────────────────────────────  │
  │  net    +75,40 €       @ 2026-08-04   │
  │         +321,60 zł                    │
  └───────────────────────────────────────┘
```

Two currencies, opposite directions, one person. The account model could not
express this at all — it would appear as unrelated balances in
`Loan · PLN` and `Loan · EUR (my)` with nothing connecting them.

**`<SettleSheet>` follows `<TransferAmount>`** (§4.3): two amounts, derived
rate, spread against the reference shown. The settlement rate defaults to the
reference but is editable, because a debt is discharged at the rate the two
parties agreed — not the rate a central bank published.
