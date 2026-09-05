# Composites

### 5.1 Structural

| Component | Contents |
|---|---|
| `Shell` | Dark gradient band — brand, nav, scope segment, `FxStatusChip`, `CurrencyChip`, `DualTotal` hero |
| `DeskBand` | The shell at ≥1024px (`02-tokens` §2.10) — brand, nav, a command-bar slot, `CurrencyChip`, scope `SegmentControl` (`tone="shell"`, a dark inset — not the light control it is everywhere else), the hero row, sharing `Shell`'s vocabulary rather than duplicating it. Two rows expanded — identity/command-bar/currency, then the hero (left, under the brand) and scope (right); one row — identity, the hero shrunk to `DualTotal`'s `size="compact"`, then command bar and scope — collapsed, on every route but the landing one, the same split `02-tokens` §2.9 already draws for the phone header. Only the currency chip drops when collapsed. No floating add button renders at this width — the command-bar slot is where `+` lives instead |
| `GroundPanel` | `radius-lg` surface lifting over the shell. Clears the bottom and side insets; the top belongs to the header above it. **The page scroller** — every screen scrolls through it; a screen that owns a virtualized list, directly or one hop through a component it renders that itself imports `FlatList`/`SectionList` (`RateTable`, say — a deeper composition is not detected), passes `scroll="own"` instead, and nothing nests a second scroller. `clearBottom` (default `true`) is for a panel that is not actually the screen's own bottom edge — a `Dock` sits below it (the transfer and quick-add screens) and clears that inset itself, so the panel passes `clearBottom={false}` rather than clearing an inset that was never its own; the design padding stays regardless |
| `Card` | `surface`, `radius-md`, a one-pixel `border`, no shadow; an optional title, an optional `Shared`-style tag beside it, and one action — the header is part of the card, not something sitting on the ground inside it. **A card groups related rows or holds one hero figure. Titles, single fields, chip rows, hints and buttons sit on the ground. Never a whole screen, never a single control.** `action` takes one action or one figure, in the header — a card with three affordances there is a card whose content has stopped being the point. `edge="accent"` draws a 2 px left edge for a card that must read as distinct without reading as lesser (`SharedGroup`). **A tab root without a navigation header may carry its menu list in a titled card** — with no header, the card's title is the only place the screen's name renders, and a list of routes is related rows. The screen specs' §3 wireframes draw the boxes; a box there is a card, a bare figure or field there is on the ground |
| `StatTile` | Figure + label + delta. Delta takes `negative` ink when spend rose |
| `CurrencyTotals` | **One figure per currency held, and no total.** The lead is a hero, the rest one step down, with *Held separately — not a total.* underneath — the line that stops a stacked pair from reading as a sum and its part. Order is the ledger's: ranking by magnitude would put 12 480,20 above 8 400,00 across two currencies nothing can compare. Yields the slot to `DualTotal` once a display currency and rates exist |
| `DualTotal` | **The two headline figures** — *mine* dominant, *ours* secondary beneath (`SPEC.md` §6.7). Never a toggle: showing one at a time invites reading the wrong number. Degrades to a single figure when no shared account exists. **The hero never vanishes.** Where the ledger holds nothing in the display currency (§7.0) — the toggle points at a currency no account is held in — it shows the **first held subtotal in ledger order** with that currency's own code, captioned *no balance in `<display>`*. Order, not size: this is `CurrencyTotals`' rule one row up, and for its reason — ranking across currencies needs a rate, and a hero that has fallen back is a hero that has none. The caption is what carries the meaning, not the choice of row. Rendering nothing there reads as an empty ledger rather than an empty currency, on the one row whose job is to state your position; a fabricated `0.00` in the asked-for currency would be the other way to be wrong. Absent only before the first account, where there is nothing to fall back to |
| `ContributionRow` | An inflow to a shared account, attributed to a counterparty (`counterparty_role = 'contribution'`). Reads as a contribution, never a debt — no settle action, no ageing. The role is what keeps it out of `counterparty_balances`, so this is a rendering of a distinction the data already makes, not one the component invents |
| `BottomSheet` | 170px from top; search, content, **pinned footer** |
| `TabBar` | Five tabs, duotone icons, ≥44px targets. **The add button is not in it** — it floats above the whole screen and parks on the bottom edge (`02-tokens` §2.9), so the bar never has to make room for it |
| `Dock` | Bottom-anchored composer: mode row, keypad, full-width Save |

### 5.2 Rows

| Component | Notes |
|---|---|
| `TransactionList` | **The column.** Owns the separators and the keys; rows are given as data, not as children |
| `TransactionRow` | Date · payee · category · `Amount`. `BIZ` tag when business. Payee at weight 500, so the identity reads before its metadata. Leads with `BrandIcon` once a screen passes `brandKey` (§14.4b) |
| `BrandIcon` | A transaction's own recognised-merchant mark — ORLEN, YouTube, or another the bundled catalogue carries (§14.4b), resolved offline at write time, never from a network fetch. Unknown or absent key → the same deterministic monogram `CounterpartyRow`'s own fallback gives an unmatched name, never blank. Sizes: row (24) and widget (20) — the same two `ServiceIcon` below already uses, and the seam S34 reuses to add a real vector mark without another transaction-facing change |
| `TransferRow` | Variant showing both accounts — one row, never two |
| `BalanceRow` | Account · kind · `FxAmount` for foreign accounts |
| `SharedGroup` | Balances group for shared accounts — own subtotal, visually distinct but **not diminished**: its own card at the same weight as every kind group, marked by a 2 px `accent` left edge and a `Shared` tag beside its *Jointly owned* title rather than by being made smaller. A negative balance here is an ordinary fact and gets no warning treatment |
| `ImportRow` | Collapsed: date, payee + raw string, tier pill, proposed category + basis, amount + FX, Accept/Skip. Expanded: three panes — reason + business/rule toggles, category picker, currency and rate panel |
| `AuditRow` | Tool call · kind (read/write) · state · timestamp |
| `TrailRow` | *"Heard: forty-eight ninety, cash, coffee"* + **Undo**. The P2 component |
| `QueueItem` | Receipt queue: `waiting` (queued 14:06, uploads on reconnect) / `ready` (extracted 2.4 s) |

**A ledger is read as a column, and a separator belongs to the gap between two
rows.** `<TransactionRow>` drew its own bottom hairline, so every list ended
with a rule under nothing — dangling in the card's bottom padding. The row is
now separator-free and `<TransactionList>` draws the line on the top of every
row after the first, which is the structure React Native has instead of
`:not(:first-child)`.

It takes data rather than children: `React.Children.map` cannot tell a row from
a heading, so the day a screen puts anything else in the list the separators
land in the wrong places and nothing says so. Taking data also moves the key off
the screens, which were each constructing one.

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

**`<RefineRequest>`** — a one-line input beneath any machine-produced draft, on
S02c and S07c. Typing a correction **re-runs the extraction with it in context**
rather than editing fields directly, so the model can propagate consequences a
field edit cannot: a receipt line changing group may change the receipt's
dominant category, and *"this trip was a holiday"* may re-place forty import
rows.

States: idle · running (`ThinkingIndicator`) · returned (a new draft, which you
still approve). It never writes — the output is a draft, exactly as the first
pass was.

**Direct editing stays, and is faster when you already know the answer.**
Refinement is for when the model reasoned wrongly rather than read wrongly, and
for when the correction applies to more than the row in front of you.

**`<AutoModeComposer>`** — the agent composer while an auto-mode grant is live.
Carries a persistent inline label above the input — `AUTO · recategorise · 14
left` — with a `✕` to exit and a doubled send glyph (`▶▶`).

**State lives on the composer, not the page.** It is the one region you cannot
avoid before issuing an instruction, whereas a banner at the top of a
three-column screen is ignorable within a day. It **uses no colour**, which
keeps P4's single meaning for amber intact, and it states the *scope and
remaining count* — because *auto mode is on* is much less useful than *auto mode
is on for recategorisation, fourteen operations left*.

⚠️ Approved cards need a **revert** affordance for the session (§13 Q4).

### 5.4 Messaging

Variants, copy rules and the recovery patterns are specified in
[`08-states-and-recovery.md`](08-states-and-recovery.md). This is the roster.

| Component | Use |
|---|---|
| `Banner` | Page-level. `warn` = not finished or not fully observed, with one action (P4). `negative` = failure. `neutral` = offline, stated as freshness |
| `EmptyState` | Three variants — `first-run` · `filtered` · `range`. Never one generic blank; they have different causes and different fixes (§8.1) |
| `ErrorState` | Three variants — `recoverable` · `terminal` · `partial`. Carries what failed, why, what it cost, what to do. Never a bare code (§8.2) |
| `UndoToast` | Transient with Undo, 8 s. Repeats collapse to a count; a bulk operation is **one** undoable unit (§8.4) |
| `MatchWarning` | Near-duplicate guard on save, showing the candidate's balance. No default action (§8.4) |
| `ThinkingIndicator` | Thinking · tool running · streaming, with a cancel at 20 s (§8.5) |
| `RefusalCard` | The model declined. Distinct from an error and from a decline (§8.7) |
| `ThresholdSlider` | Bulk-accept confidence bar; cannot reach 1.00 |
| `RuleHealthTag` | `never posted` · `overdue` · `ending soon` · `amount drifted` · `healthy` |
| `ConfirmDialog` | Genuinely destructive and irreversible only — deleting an account, changing the **pivot** currency, running a restore drill |

### 5.5 Debt and counterparties

Implements `SPEC.md` §6.6. The hard part is not the list — it is that one
person can owe you in one currency while you owe them in another.

| Component | Notes |
|---|---|
| `CounterpartyRow` | Avatar or monogram · name · kind icon (person / company) · net position in **their** currency, with the display-currency equivalent beneath |
| `ServiceIcon` | Brand mark for a recurring rule's `service` slug, resolved from the **bundled** catalog (§14.4a) — never a network fetch. Unknown or absent slug → deterministic monogram (first letter, color hashed from the name), same treatment as `CounterpartyRow`'s fallback. Sizes: row (24) and widget (20) |
| `SubscriptionRow` | `ServiceIcon` · name · native amount + cadence · monthly ≈ equivalent when cadence ≠ monthly · next charge · `RuleHealthTag`. S34 and the `subscriptions` widget share it — the widget renders the same row smaller, not a second component |
| `CounterpartyCard` | Full position: one row per currency, then both derived totals |
| `BalanceLedger` | Per-currency table. Positive = they owe you, negative = you owe them — the **negation** of the ledger's cash-flow sign (`SPEC.md` §6.6), computed once here so no screen has to remember it. Direction stated in words, never by sign alone (P5) |
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
  │  net    +74,44 €       @ 4,3200       │
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

### 5.6 Data surfaces

| Component | Notes |
|---|---|
| `FilterBar` | Account · category · scope · currency · date range · counterparty. Each filter is a `Chip` carrying its **value**, not its name — `Business` rather than `Scope`. An active filter shows the count it excludes, which is what `EmptyState(filtered)` reads from (§8.1). Clear-one and clear-all are separate affordances |
| `SwipeAction` | Row gestures, mobile only. Short swipe → categorize; long swipe → edit. **Nothing destructive is ever on a swipe** — deletion requires the detail screen, because a gesture you can perform by accident should not be able to remove a financial record. Haptic on commit; the web equivalent is the keyboard map, not a hover control |
| `AuditHistory` | Chronological `audit_log` entries for one entity: actor · action · before/after. Agent-originated changes are marked, as are `import` and `migration`. This is the component that answers *"why is this categorized this way?"* eighteen months later (`SPEC.md` §6.1), so it renders a **diff**, not a sentence |
| `ComparisonTable` | Period × metric with deltas. Increases in spend take `negative` ink (§7). Rows excluded as capital state the exclusion inline — `34 200 · excludes 1 one-off` — never silently (§6.8) |
| `LedgerTable` | S10's own desk-width ledger — date · payee · category · account · scope · amount, sortable by header, `J`/`K`/`Enter`/`F` keyboard-navigable. A plain `FlatList`, not a virtualisation library — S10's own risk note names the trade. Not `FilterBar`'s rail (a sibling, not a child) and not S33's own smaller `Table` — three data surfaces named separately because each answers a different density question, not one grid dressed three ways |
| `LedgerSelectionBar` / `CategorizeSelectionConfirm` | The shift-click range's own toolbar and its batch-categorise confirm. Not `<DiffCard>` (§5.3) — a batch spans rows that each carried a different category before, so a single before/after pair would either lie or say nothing; this states the count and the target category instead |

### 5.7 Dashboard

| Component | Notes |
|---|---|
| `WidgetGrid` | Renders one layout's widgets into slots at S · M · L. Reads `dashboard_layouts` → `dashboard_widgets` (`SPEC.md` §14.5) |
| `WidgetCard` | One widget: title, body, and a configure affordance. Every widget states its **period and scope** in its own header — a figure on a dashboard with no stated frame is a figure you will misread. Scope inherits from the shell segment unless the widget **pins** one, and a pinned widget says `· pinned` so it never reads as being on its neighbours' frame |
| `LayoutPicker` | Named layouts, active one marked, presets distinguished from custom. Switching preserves every layout's per-widget config, which is the whole reason layouts are rows rather than constants |

Free drag-and-drop placement is deferred by decision (O16), not missing.

### 5.8 Tax and export

Small in count, and load-bearing out of proportion to it — this is where the
T1 guarantee becomes something a person can actually check.

| Component | Notes |
|---|---|
| `ResidencyTimeline` | Dated jurisdiction changes. Scheme resolution keys on *(jurisdiction, transaction date)*. Selects which forms apply — **not** treaty or foreign-tax-credit treatment, which stays unmodelled (O11) |
| `SchemeTimeline` | Dated scheme changes — **a timeline, not a dropdown**, because you may file under different schemes in different years and a transaction resolves against the scheme in force on *its* date (§13.4). A period with no scheme is rendered as a **gap and an error**, not as a blank |
| `SchemeSelector` | Jurisdiction · scheme · **version** for one export. Version defaults from the period rather than from today, so a 2025 export produces 17 KPiR columns and a 2026 export 19 |
| `WorkbookBuilder` | Scope · period · sheet selection. States which sheets a jurisdiction forces — under ryczałt the cost side is **removed with a stated reason**, never blanked (§13.6) |
| `ManifestCard` | Row count · date range · jurisdiction · scheme version · the assertion that zero non-business rows are included |

**`<ManifestCard>` is the visible half of a structural guarantee** (§13.1), and
two rules follow from that:

- It renders **before the build and inside the file**. A manifest you only see
  after downloading is a receipt for a decision you already made.
- Its assertion is **read from the export path**, never composed by the
  interface. The path holds `SELECT` on `tax_ledger` and no privilege on
  `transactions`, so the claim is backed by a database role rather than by a
  query someone remembered to write. A `ManifestCard` that constructed its own
  assurance would be decorating a promise instead of reporting a fact.

---

## Six components the screens invented

Working rule 1 says **a screen never invents a component**, and a readiness audit
found six that had been invented anyway — named in a screen's §4, defined
nowhere. Each is small; the reason to define them here rather than let each
screen carry its own is that five of the six appear on more than one screen, and
the sixth is a table.

| Component | Used by | Notes |
|---|---|---|
| `PeriodHeader` | S04, S11 | `‹ August 2026 ›` with *Today*, stepping by the selected granularity. **Tapping the label opens a period picker**; the arrows step. One component, because the two screens must step identically or the same gesture means different things in different places |
| `ScaleSwitcher` | S11 | Day · week · month · year. A `SegmentControl` with a persisted selection — the persistence is the reason it is not just a `SegmentControl` |
| `NavModeToggle` | S11 | Continuous ↔ stepped. Also persisted, and deliberately separate from `ScaleSwitcher`: they are independent choices and combining them into one control implies four modes rather than 4 × 2 |
| `RefineRequest` | S02, S07 | The *"not quite — it was actually…"* input on a model result. One component, three call sites' worth of reasoning: it carries the original output so a refinement is a **second pass with context**, not a fresh request, which is what makes §10.2's refinable extraction refinable |
| `AutoModeComposer` | S03 | The composer in its auto-mode state. S03's own decision was that auto mode belongs *in the composer, not on the page* — state where you are already looking, in the one region you cannot avoid before issuing an instruction. It shows the grant's scope and what remains of it |
| `Table` | S33 | Dense, keyboard-navigable, web-only. **Not a general data grid** — S02 and S25 have their own denser needs and are the case that decides the `apps/web` fork (§14.6). This one is small, fixed-column and undemanding, and building the grid for it would be building the wrong thing first |

**`RefineRequest` is the one worth building carefully.** It is the difference
between a model surface you can correct and one you can only accept or reject,
and §10.2's whole *refinable* claim rests on it existing. Building it per-screen
would produce two subtly different refinement semantics on the two screens where
being wrong is most expensive.
