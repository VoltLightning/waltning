# Composites

### 5.0 Disclosure heads

**A shut head's words sit as far from what is below them as from what is
above.** Both are measured inside the container's padding: to the
neighbouring rule, or to the padding's edge when the head is first or last —
the card's own padding is the margin every card has, and is not counted. A
head padded for the rows that follow it — room above, little below — puts its
words on the next rule the moment it shuts, which is how the register's kind
heads read (16 above, 4 below).

- **Open, a head may belong to its rows** — the register keeps S16's 16 above
  and 4 below — and **shut, it takes the room below that it has above**
  (`sectionHeadShut`), at a fixed height (the open 44 plus the 12), so its
  words do not move as it shuts, in either lens.
- **Rows in one card separate with a rule above every row but the first**,
  never a rule below each, and never the card's `gap` — a gap lands above each
  rule and a rule below the last floats inside the card's padding.

Holding today, measured this way: `FieldsCard`'s and `LinesCard`'s rows,
`ComposerRow`, `Select`, the holdings card's *Break it down* (12.5 / 12.5),
currency rows (14 / 14), and the register's kind heads (21.5 / 21.5 shut, by
kind or by currency).

### 5.1 Structural

| Component | Contents |
|---|---|
| `Shell` | Dark gradient band — brand, nav, scope segment, `FxStatusChip`, `CurrencyChip`, `DualTotal` hero |
| `DeskBand` | The shell at ≥1024px (`02-tokens` §2.10) — brand, nav, a command-bar slot, `CurrencyChip`, scope `SegmentControl` (`tone="shell"`, a dark inset — not the light control it is everywhere else), the hero row, sharing `Shell`'s vocabulary rather than duplicating it. Two rows expanded — identity/command-bar/currency, then the hero (left, under the brand) and scope (right); one row — identity, the hero shrunk to `DualTotal`'s `size="compact"`, then command bar and scope — collapsed, on every route but the landing one, the same split `02-tokens` §2.9 already draws for the phone header. Only the currency chip drops when collapsed. No floating add button renders at this width — the command-bar slot is where `+` lives instead |
| `GroundPanel` | `radius-lg` surface lifting over the shell. Clears the bottom and side insets; the top belongs to the header above it. **The page scroller** — every screen scrolls through it; a screen that owns a virtualized list, directly or one hop through a component it renders that itself imports `FlatList`/`SectionList` (`RateTable`, say — a deeper composition is not detected), passes `scroll="own"` instead, and nothing nests a second scroller. `clearBottom` (default `true`) is for a panel that is not actually the screen's own bottom edge — a `Dock` sits below it (the transfer and quick-add screens) and clears that inset itself, so the panel passes `clearBottom={false}` rather than clearing an inset that was never its own; the design padding stays regardless. A panel that *is* that edge also clears whatever room the shell says a floating button needs over it (`02-tokens` §2.9) — zero on every route the tab shell does not wrap, which is where the button is not. Under the tab shell the panel is *not* the screen's bottom edge — the tab bar is, and it clears the device itself — so the shell hands the slot a bottom inset of zero rather than letting it be paid twice. `scroll="own"` clears the device only: the clearance has to land on the content that scrolls, and there it is the screen's own list that holds it. **It draws its own top edge, and only once the page has moved** — a hairline that fades in over the first 12pt of scroll. The band above it is always the same cream the page is, so at rest there is nothing between them and nothing should be: a rule under a title nobody has scrolled past is a section divider drawn on every screen in the app. The moment the first row slides under the band the cut is arbitrary — a row sheared through its middle with no edge to explain it — and the line is what explains it. A hairline and not a shadow (`02-tokens` §2.5: one shadow, on the one thing that floats), following the panel's own corner radius rather than cutting across it, so on a tab root it traces the lift instead of contradicting it. Drawn here rather than in the band because this is the component that has the scroller; a band cannot see one |
| `Card` | `surface`, `radius-md`, a one-pixel `border`, no shadow, **18 of padding** (`space.x3b`) and **14 between cards**; an optional title as a plain first line at `label` — **no rule under it** — an optional `Shared`-style tag beside it, and one action; the header is part of the card, not something sitting on the ground inside it. **A card groups related rows or holds one hero figure. Titles, single fields, chip rows, hints and buttons sit on the ground. Never a whole screen, never a single control.** `action` takes one action or one figure, in the header — a card with three affordances there is a card whose content has stopped being the point. `edge="accent"` draws a 2 px left edge for a card that must read as distinct without reading as lesser (`SharedGroup`). **A tab root may carry its menu list in an untitled card** — a list of *destinations*, rows that navigate, which is what a card is for; two or more of them is what makes it a list rather than a single control, and a card of mapped anything is not one. It carries no title: a title on the only card on a screen names the screen rather than the card, and the screen's name belongs to the header above the ground. The screen specs' §3 wireframes draw the boxes; a box there is a card, a bare figure or field there is on the ground |
| `StatTile` | Figure + label + delta. Delta takes `negative` ink when spend rose |
| `CurrencyTotals` | **One figure per currency held, and no total.** The lead is a hero, the rest one step down, with *Held separately — not a total.* underneath — the line that stops a stacked pair from reading as a sum and its part. Order is the ledger's: ranking by magnitude would put 12 480,20 above 8 400,00 across two currencies nothing can compare. Yields the slot to `DualTotal` once a display currency and rates exist |
| `DualTotal` | **The two headline figures** — *mine* dominant, *ours* secondary beneath (`SPEC.md` §6.7). Never a toggle: showing one at a time invites reading the wrong number. Degrades to a single figure when no shared account exists. **The hero never vanishes.** Where the ledger holds nothing in the display currency (§7.0) — the toggle points at a currency no account is held in — it shows the **first held subtotal in ledger order** with that currency's own code, captioned *no balance in `<display>`*. Order, not size: this is `CurrencyTotals`' rule one row up, and for its reason — ranking across currencies needs a rate, and a hero that has fallen back is a hero that has none. The caption is what carries the meaning, not the choice of row. Rendering nothing there reads as an empty ledger rather than an empty currency, on the one row whose job is to state your position; a fabricated `0.00` in the asked-for currency would be the other way to be wrong. Absent only before the first account, where there is nothing to fall back to |
| `ContributionRow` | An inflow to a shared account, attributed to a counterparty (`obligation_role = 'contribution'`). Reads as a contribution, never a debt — no settle action, no ageing. The role is what keeps it out of `counterparty_balances`, so this is a rendering of a distinction the data already makes, not one the component invents |
| `BottomSheet` | Bottom-anchored, and **it owns its own height**: at most the window less 170px from the top — or less the device's top inset plus the design padding, whichever leaves less; **with the keyboard up, up to the device's top inset plus the padding**, because the 170 keeps the page in sight behind a sheet being looked at and, under a keyboard, was most of what was left of a picker's list — with a header that does not scroll, a body, and a `footer` slot for the commitment a sheet ends with, pinned so it cannot scroll away. **The motion is `@gorhom/bottom-sheet`'s** — a spring entrance, pan-to-dismiss and a grab handle, none of which the hand-rolled sheet had; the bounds, the backdrop and the keyboard rule below are still this system's. The body still scrolls **and** the sheet still owns its height, because the library's own scrollable reports the height of what it holds into the sizing — so the sheet is as tall as its content up to the cap, and past the cap the body scrolls inside a sheet that has stopped growing. That holds only while that scrollable is the sheet's direct child; wrapped in a box with a height of its own it never reports, and the content spills out of the bottom. The bottom inset is padding, not a subtraction: the sheet reaches the edge of the screen and its *content* clears the home indicator. **The sheet moves out from under the soft keyboard rather than scrolling under it** — it is lifted by the keyboard's measured height, so its bottom edge and the pinned footer land on the keyboard's top edge, and the cap shrinks by the same amount, on the same keyboard event, so the lift never pushes the sheet's head off the window; the home-indicator inset is dropped while the keyboard is over it. **One mechanism on both phones**: the keyboard covers the window rather than shrinking it on iOS *and* on Android, where an edge-to-edge dialog window ignores the soft-input resize that used to carry a sheet up for free. A sheet capped against the window alone keeps drawing under the keyboard: an iOS `decimal-pad` has no return key and leaves about 49px of a form sheet visible, which is not a distance anything can scroll its way out of. On the web the window itself shrinks and the sheet does nothing. **A press on the backdrop with the keyboard up puts the keyboard away, not the sheet** — the tap was aimed at the keyboard, and dismissing there throws away what was just typed; the second press closes the sheet. **One scroller per sheet, and it is the body.** The library hands a content drag to the sheet or to its own scrollable, never to a plain scroller inside it — on iOS a nested list took no touch at all, and one capped at nine rows was taller than a sheet under the keyboard, so the rest of it could not be reached. What stays in view while a list moves — a search, its filter chips — is **pinned**: drawn with the header, above the body, never scrolled. A sheet whose body is filtered as it is typed into is **steady**: it never shrinks while open, so the list narrows inside a sheet that stays put instead of the sheet's head dropping away from the thumb typing into it. **Vertical drags are the sheet's, sideways ones are not** — the pan starts after 8pt up or down and fails after 8pt across, so a chip row scrolls along inside a sheet. **Typed into, a sheet shows what is typed**: once the lift has settled, the body scrolls the focused field clear of the footer. **It carries a gesture root of its own**: an Android `Modal` is a separate native window the app's root does not reach into, so without one the pan that drags a sheet down was never delivered and no sheet on Android could be swiped away. A body that rolls on its own (a drum) is dragged by the handle and header only. Lives in `primitives/`, because it is domain-free and the date and time drums — which are primitives — open in it |
| `TabHeader` | The band a tab root wears when it has no hero to lead with: `PageHeader` with no way back — the tab's own label at `displayTwo` **on the ground**, the deck's line under it, clearing the top inset the way `Shell` does, with room for **one** right-side action. It was painted in `shell` once, and that green band was this app's invention: S16 and S30 open in ink on cream, the same cream the cards sit on. Drawn by the tab shell from the active tab's label, never by the screen, **so no tab screen carries a title of its own** — a screen that draws its own header is a screen that can disagree with the next one, which is how one app came to have three treatments (Today's hero band, nothing at all, and a title inside a card). Today is the exception and keeps its hero: a 54pt total does not fit in a navigation bar, and a hero is a better header than a word |
| `PageHeader` | **Every screen that is not a tab root.** The name at `displayTwo` and a muted line under it, on the ground, with **one** control at the right — the way back (`BackMark`, drawn), or a composer's ✕. Composed *beside* `GroundPanel`, never inside it, so the device's top inset is cleared once on a `View` that does not move; left in the scroller the way out slides under the notch the moment the column overflows. `ComposerHeader` is this component wearing the ✕ — what is a composer's own is which mark it carries and that its title never names the kind (S05 §3), neither of which is a reason for a second band. **The subtitle is not decoration:** *"Which exist, and where rates come from"* tells a reader what S17 is for before they have read a row of it. It is set at `bodySm` — at `label` it read as a footnote to a 23pt title — wraps to two lines rather than cutting off a long locale, and the band keeps `space.md` under it, so the words never sit on the rule the page grows along that edge when it scrolls; with the panel's own 14 the first card starts 22 below the subtitle. **S16, S17 and S30's drawings predate this step** (13px subtitle, 2px gap) and are not the reference for the header |
| `TabBar` | **Four tabs** — Home · Accounts · **Debt** · Settings — duotone icons, ≥44px targets. **The third slot is Debt until the agent (S03) exists, and then it is the agent's**: a slot held for a screen that is not built is a tab that leads nowhere, and Debt is the one destination people open weekly that nothing else on the phone carries. When the agent takes the slot, Debt moves back into Summary's *Go to*. At desk width the band's nav carries the Ledger (S10) as well, between Accounts and Debt — the desk has a nav bar, not four thumb targets. **There is no Ledger tab and no Calendar tab, and their absence is the point:** S04 is four views of one date (S04 §3), so Home *is* the ledger and the calendar. A tab for either would lead to the screen you are already on, which is worse than a missing tab because it teaches you the bar lies. S10 and S11 keep their routes on the desk, where the shell has a nav bar rather than a tab bar. Metrics and the add button are below.

**The agent earns a tab and Debt loses one.** S03 was reachable from any screen by `⌘K` and therefore from nowhere on a phone; it is tier 1, used a few times a week, and the bottom bar is the half of the screen a thumb owns. A header button was drafted and did not survive its own argument — justified as contextual, then routed to a full screen that drops the context. Debt moves to S04's *Go to* grid, where it carries its figure instead of a word: it is a number you check, not a place you live. The count is the caller's, not the component's.

| `Dock` | Bottom-anchored composer: mode row, keypad, full-width Save |

#### Every sheet, and what it does with the room

One rule set, chosen per sheet by what the sheet holds. *Sized* is the sheet as tall as its content up to the cap; *steady* is sized and never shrinking while open; *pinned* is what stays above the body; *keys* is what the keyboard does to it — every sheet with a field rides above the keys and scrolls the focused field into view. **A picker's way out is the footer, a form's commitment ends its body**: a list is scrolled through, so what leaves it must not scroll with it; a form is read to its end, and its Save is where the reading stops.

| Sheet | Holds | Size | Pinned | Keys | Footer |
|---|---|---|---|---|---|
| Category (S05, S10) | Proposal, grid of leaves, create row | Steady | Search, group chips | Rides above; the create row's name opens focused | — |
| Account (S05) | Recent, sections of accounts | Steady | Search, past eight accounts | Rides above | *Create account* |
| Counterparty (S05, S06) | Recent, list | Steady | Search | Rides above | *New counterparty* |
| Date, time (drums) | Chips, drum, actions | Sized, body rolls | — | None | — (actions under the drum) |
| Year, period | A short list | Sized | — | None | — |
| Add (floating button) | Three kinds | Sized | — | None | — |
| Fee, note, entered name | One field | Sized | — | **Opens focused**: a sheet with one field is opened to type into it | — |
| Scope | Segments | Sized | — | None | — |
| Create, rename category | A field or two | Sized | — | Opens focused | — (Save ends the body) |
| Move, merge category | A list of targets | Sized, body scrolls past the cap | — | None | — (the confirm ends the body) |
| Category actions | A few actions | Sized | — | None | — |
| Reconcile, settle | A form | Sized, body scrolls past the cap | — | Rides above; focused field scrolled into view | — (the commitment ends the body) |
| Add currency, edit currency | A form | Sized | — | Rides above | — (Save ends the body) |
| Rate editor | A field and the rows it would replace | Sized, body scrolls past the cap | — | Rides above | — (the editor's actions end the body) |
| Ledger filters | Selects, scope, period | Sized | — | Select panels are their own overlay | — |
| Appearance preview | Controls | Sized | — | None | — |

### 5.2 Rows

| Component | Notes |
|---|---|
| `TransactionList` | **The column.** Owns the separators and the keys; rows are given as data, not as children |
| `TransactionRow` | Date · entered name · category · `Amount`. Empty entered name falls back to category, then Expense/Income/Transfer; a linked current name can be secondary when the saved text differs. `BIZ` tag when business. Entered name at weight 500, so the identity reads before its metadata. Leads with `BrandIcon` once a screen passes `brandKey` (§14.4b) |
| `BrandIcon` | A transaction's own recognised-merchant mark — ORLEN, YouTube, or another the bundled catalogue carries (§14.4b), resolved offline at write time, never from a network fetch. Unknown or absent key → the same deterministic monogram `CounterpartyRow`'s own fallback gives an unmatched name, never blank. Sizes: row (24) and widget (20) — the same two `ServiceIcon` below already uses, and the seam S34 reuses to add a real vector mark without another transaction-facing change |
| `CategorySheet` option | **A white tile wearing its category's mark** — the hue's `solid` square (`02-tokens` §2.1) with the category's letter, the same square a ledger row wears for that category, then the name on up to two lines and its count. Ten outlined tiles with only a name were ten of one thing, and a reader found *Groceries* by reading all of them. **The chosen option is said in its own colour**: the hue's wash for a fill and its solid for a two-pixel edge, never the accent. Group chips above wear their group's hue as a wash; the chosen one takes the solid as its edge. The mark is decorative — the name is already there |
| `AccountPicker` tile | The same tile, marked by **kind** rather than by name: a washed square carrying the kind's icon in its ink — bank `sky`, cash `amber`, card `indigo`, and one hue each for the rest — so a bank account, a card and cash are told apart before they are read. The balance keeps its money colour |
| `TransferRow` | Variant showing both accounts — one row, never two |
| `BalanceRow` | Account · kind · `FxAmount` for foreign accounts |
| `SharedGroup` | Balances group for shared accounts — own subtotal, visually distinct but **not diminished**: its own card at the same weight as every kind group, marked by a 2 px `accent` left edge and a `Shared` tag beside its *Jointly owned* title rather than by being made smaller. A negative balance here is an ordinary fact and gets no warning treatment |
| `ImportRow` | Collapsed: date, entered name + raw string, tier pill, proposed category + basis, amount + FX, Accept/Skip. Expanded: three panes — reason + business/rule toggles, category picker, currency and rate panel |
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
| `Banner` | Page-level, one tone, **one action** — any tone may carry it, because a banner's action is the way out of whatever it states. `warn` = not finished or not fully observed (P4). `negative` = failure. `neutral` = a fact about now that is neither: offline, stated as freshness (§8.3), or a capability this ledger does not have yet — S05's capture gate, where the currency has no rate and *Set a ‹CUR› rate* is the way out. Amber would be the wrong claim there: nothing has been asserted or aged, something is simply absent. **Under 480 pt wide the action goes under the message, not beside it** — a button holds its own width whatever the row does, so at phone width it took a third of the line and left the sentence a column two words wide, four lines and 110 pt of banner over a screen it was only meant to annotate. Stacked: message at full width, action below it, left-aligned where the text starts. The threshold is the banner's **own** measured width, not the window's — the same banner is just as cramped in a 380 pt column at desk width, and a device breakpoint would not see it |
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
| `WhoPicker` | S05/S09 identity sheet: search; Recent, People, Shops & services; saved selection, Use text, Add via S15, clear. Keyboard-accessible and draft-preserving; distinct from the required-party debt picker |
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
| `AuditHistory` | Chronological `audit_log` entries for one entity: actor · action · before/after. Agent-originated changes are marked, as are `import` and `migration`. This is the component that answers *"why is this categorized this way?"* eighteen months later (`SPEC.md` §6.1), so it renders a **diff**, not a sentence |
| `ComparisonTable` | Period × metric with deltas. Increases in spend take `negative` ink (§7). Rows excluded as capital state the exclusion inline — `34 200 · excludes 1 one-off` — never silently (§6.8) |
| `LedgerTable` | S10's own desk-width ledger — date · entered name · category · account · scope · amount, sortable by header, `J`/`K`/`Enter`/`F` keyboard-navigable. A plain `FlatList`, not a virtualisation library — S10's own risk note names the trade. Not `FilterBar`'s rail (a sibling, not a child) and not S33's own smaller `Table` — three data surfaces named separately because each answers a different density question, not one grid dressed three ways |
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
| `PeriodHeader` | S11 | `‹ August 2026 ›` with *Today*, stepping by the selected granularity. **Tapping the label opens a period picker**; the arrows step. One component, because the two screens must step identically or the same gesture means different things in different places |
| `ScaleSwitcher` | S11 · desk | Day · week · month · year. A `SegmentControl` with a persisted selection — the persistence is the reason it is not just a `SegmentControl` |
| `NavModeToggle` | S11 · desk | Continuous ↔ stepped. Also persisted, and deliberately separate from `ScaleSwitcher`: they are independent choices and combining them into one control implies four modes rather than 4 × 2 |
| `RefineRequest` | S02, S07 | The *"not quite — it was actually…"* input on a model result. One component, three call sites' worth of reasoning: it carries the original output so a refinement is a **second pass with context**, not a fresh request, which is what makes §10.2's refinable extraction refinable |
| `AutoModeComposer` | S03 | The composer in its auto-mode state. S03's own decision was that auto mode belongs *in the composer, not on the page* — state where you are already looking, in the one region you cannot avoid before issuing an instruction. It shows the grant's scope and what remains of it |
| `Table` | S33 | Dense, keyboard-navigable, web-only. **Not a general data grid** — S02 and S25 have their own denser needs and are the case that decides the `apps/web` fork (§14.6). This one is small, fixed-column and undemanding, and building the grid for it would be building the wrong thing first |

**`RefineRequest` is the one worth building carefully.** It is the difference
between a model surface you can correct and one you can only accept or reject,
and §10.2's whole *refinable* claim rests on it existing. Building it per-screen
would produce two subtly different refinement semantics on the two screens where
being wrong is most expensive.
