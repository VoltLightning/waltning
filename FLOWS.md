# Waltning — User Journeys and Screen Specifications

Every screen, reached the way a user actually reaches it. [`DESIGN.md`](DESIGN.md)
enumerates the component system and the screen inventory; this document walks
the **flows between them** — which is where missing screens surface, because an
inventory never reveals the step nobody designed.

**Companion to:** [`SPEC.md`](SPEC.md) (data model, FX, tax) ·
[`DESIGN.md`](DESIGN.md) (tokens, components, states).

**Status:** specification. Nothing implemented.
**Last updated:** 2026-08-04

---

## How to read this

- **Journeys** `J1–J15` are ordered by how often they run, not by build order.
  A journey that runs daily earns more design attention than one that runs
  annually, regardless of which is more interesting to build.
- **Screens** `S01–S29` keep the numbering from `DESIGN.md` §8.
- Each screen is specified **once**, at its first appearance. Later journeys
  reference it.
- `▸` marks a branch. `⊗` marks a state with no design yet.

---

## Table of contents

**Journeys** — [J1 First run](#j1--first-run) · [J2 Daily capture](#j2--daily-capture)
· [J3 Receipt to split](#j3--receipt-to-split) · [J4 Monthly import](#j4--monthly-import)
· [J5 Find and fix](#j5--find-and-fix) · [J6 Review a period](#j6--review-a-period)
· [J7 Lend and settle](#j7--lend-and-settle) · [J8 Group expense](#j8--group-expense)
· [J9 Ask the agent](#j9--ask-the-agent) · [J10 Currency and rates](#j10--currency-and-rates)
· [J11 Close a tax period](#j11--close-a-tax-period) · [J12 Maintain categories](#j12--maintain-categories)
· [J13 Recurring](#j13--recurring) · [J14 Accounts](#j14--accounts) · [J15 Cutover](#j15--cutover)

**Screens** — [S01–S29](#screen-specifications) · [Coverage matrix](#coverage-matrix)
· [Gaps](#gaps-found-by-walking-the-flows)

---

# Journeys

## J1 · First run

**Frequency:** once. **Surface:** mobile, then web.

The only journey where nothing exists yet — no accounts, no currencies, no
history. Every other journey assumes its output.

```
install → S29 Setup wizard
    1. Pick display currency         ← a preference, changeable any time
    2. Add sub-currencies            ← optional, addable later
    3. Create first account          → S16 Account editor
    4. Import from Money Manager?    ▸ yes → S29b Migration import
                                     ▸ no  → skip
    5. Set tax scheme?               ▸ yes → S22 Settings · Tax
                                     ▸ no  → skip, prompt later
    → S04 Today
```

**Design rules**

- Display currency is just a starting preference — it is a toggle afterwards,
  so this step carries no weight and needs no explanation (`SPEC.md` §7.0). The
  USD pivot is set silently and never surfaced.
- Steps 2, 4 and 5 are all skippable. A user who wants to log one coffee should
  reach S04 in under a minute.
- The migration step is a **file picker plus a verification report**, not a
  progress bar — the balance reconciliation (`SPEC.md` §8.4) is the gate, and
  it must be shown, not hidden behind a spinner.

⊗ **No design exists for a failed migration.** If balances do not reconcile,
the wizard cannot simply continue.

---

## J2 · Daily capture

**Frequency:** several times a day. **The journey the product lives or dies on.**

Target: **under 10 seconds** (`SPEC.md` G3). Three input modes, one draft, one
Save.

```
S04 Today  ──tap +──→  S05 Quick add
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   [123] keypad      [◉] voice         [▣] photo
        │                 │                 │
   amount typed     transcript →       camera → extract
        │           fills fields            │
        │                 │                 │
        └────────→  chips: account · category · date · scope · note
                          │
                     S06 Category sheet  (if category tapped)
                          │
                     Save → S04 Today
```

**Branches**

| Branch | Goes to |
|---|---|
| Category needs creating | S06 → create in place, scoped to the selected parent |
| Account needs creating | S16 Account editor, returns to the draft |
| Voice heard two intents | S08 Voice multi-intent |
| Photo taken | J3 |
| Counterparty involved (lending) | J7 from step 3 |

**The trail is the honest part.** Any machine-filled field states what was heard
or read, in one line, with Undo (`DESIGN.md` P2). The draft is never a black box.

⊗ **The largest gap in the product.** No design for: speech not understood, no
network for extraction, extraction confidence below threshold, duplicate
detected on save. All four occur on the daily path.

---

## J3 · Receipt to split

**Frequency:** a few times a week.

```
S05 Quick add [▣]  or  S04 → Scan
        │
   S07a Capture       brackets · shutter · flash · count
        │             works offline; captures queue locally
        │
   S07b Queue         ⏳ waiting — queued 14:06, uploads on reconnect
        │             ✓ ready   — extracted 2.4 s
        │
   S07c Extraction review
        │  merchant · date · total · DETECTED currency
        │  rate for the receipt's date · VAT · per-field confidence
        │  lines, each with a subcategory
        │
        ▸ Keep as one   → single transaction
        ▸ Split         → shows the resulting transactions before commit
        │
   Commit → S04 Today
```

**Design rules**

- Currency is **detected, not assumed**, and the rate is for the *receipt's*
  date, not today (`SPEC.md` §10.2).
- The split is shown **as its resulting transactions** before commit — you
  approve the outcome, not the intent.
- Image and raw model response are retained permanently. Re-extraction after a
  prompt improvement never requires re-photographing.

⊗ No design for an unreadable photo. ⊗ Low-confidence fields have no distinct
treatment — a field at 0.6 should not look like one at 0.99.

---

## J4 · Monthly import

**Frequency:** monthly, per institution. Replaces an evening in Excel.

```
bank statement exported (manual — no aggregator covers these institutions)
        │
   S02a Upload            file → parser detected → account confirmed
        │
   S02b Parsing           ⊗ progress state undesigned
        │
   S02c Review queue      ← the screen this journey exists for
        │
        │  each row:  Rule ·  free, names the rule
        │             Model 0.91 ·  confidence AND reason
        │             Transfer ·  pair already collapsed to one row
        │             Duplicate ·  matched an existing transaction
        │
        │  keyboard: J K next/prev · A accept · R rule · S skip · T transfer
        │
        ▸ Expand row → reason · category picker · FX panel with editable rate
        ▸ Write a rule → S20 Rule editor (prefilled from this row)
        ▸ Bulk accept ≥ 0.90 → bounded, count stated. Never "accept all"
        │
   queue clear → S02d Empty state → verify balances → S01 Dashboard
```

**Design rules**

- Bulk accept is **always bounded by a stated threshold and shows its count**.
  "Accept all" is the fastest way to poison a ledger.
- Every model row states confidence *and* its reason; every rule row names the
  rule and its hit count. A guess with no rationale cannot be judged.
- `import_rows.raw` is never mutated, so a reparse is always possible.

⊗ Accept and Skip have no undo. ⊗ The confidence threshold is described as
movable but is not.

---

## J5 · Find and fix

**Frequency:** several times a week.

Two entry points, because there are two ways people look for a transaction.

```
"I remember something"          "what happened around then"
        │                                │
   S10 Transactions list           S11 Calendar
   search · filter · scroll        day / week / month / year
        │                                │
        └──────────────┬─────────────────┘
                       │
              S09 Transaction detail
                 amount · account · category · date · scope · note
                 receipt (if any) · line splits · FX basis
                 audit history — who changed what, when
                       │
                  ▸ Edit → inline, save
                  ▸ Split → line editor
                  ▸ Delete → soft, recoverable
                  ▸ Attach receipt → J3
```

**Design rules**

- The calendar **complements** the list, never replaces it. The list answers
  *"find the thing I remember"*; the calendar answers *"what happened then"*.
- Audit history is on the detail screen, not hidden in settings. When you are
  your own accountant, "why is this categorized this way?" needs an answer
  eighteen months later.

---

## J6 · Review a period

**Frequency:** weekly to monthly.

```
S04 Today  or  S01 Dashboard
        │
   ┌────┴─────────────────────────┬──────────────────┐
   │                              │                  │
S11 Calendar                 S25 Reports         S24 Dashboard layout
 scale: day/week/month/year   period picker       preset arrangements
 nav: continuous | stepped    pie · line · bar     widget config
   │                          treemap
   │                              │
   └──── tap a day/segment ───────┴──→ filtered S10 Transactions list
                                              → S09 Detail
```

**Charts in play** — pie (composition), line (income vs expense over a range),
bar (month over month), treemap (category deep-dive). All capped at seven
segments plus *other*.

---

## J7 · Lend and settle

**Frequency:** weekly. **New in this spec** — previously impossible to express.

```
RECORD
  S05 Quick add → attach counterparty
        ▸ new person/company → S15 Counterparty editor
                                  name · kind · THEIR settlement currency
        │
        Save → the transaction now carries counterparty_id

TRACK
  S04 Today → Debt  or  S12 Debt · counterparties
        │  list: name · kind · net position in THEIR currency
        │        display-currency equivalent beneath
        │
   S13 Counterparty detail
        │  one row per currency — direction stated in words, not by sign
        │  PLN  +840,00  owes you
        │  EUR  −120,00  you owe
        │  net in EUR · net in main
        │  history · ageing (companies only)

SETTLE
   S14 Settle sheet
        │  amount · currency · which balance it discharges
        │  rate — defaults to reference, EDITABLE
        │  spread against reference shown
        │  RESIDUAL stated before commit
        │
        ▸ fully settled  → balance clears, counterparty stays
        ▸ partial        → remainder stays outstanding, stated plainly
```

**Design rules**

- A settlement **never implicitly clears** a balance. If the amounts do not
  reconcile, the remainder is shown, not absorbed.
- The rate is editable because a debt is discharged at the rate the two parties
  agreed, not the one a central bank published (`SPEC.md` §6.6).
- Direction is always stated in words. `+840` and `−120` on the same card are
  too easy to misread when they mean opposite things.

---

## J8 · Group expense

**Frequency:** weekly. The clearing-account journey (`SPEC.md` §6.4) — 678
transactions in the historical data.

```
you pay for the group
        │
   S05 Quick add → account: Clearing · <currency>
        │
   ALLOCATE
   S13/S12 → allocate shares
        │  split the total across counterparties
        │  each share becomes a receivable against that person
        │
   the clearing balance should now trend to ZERO
        │
        ▸ non-zero → S01/S04 unsettled banner
                     "a group expense was paid but never allocated"
                     one action: allocate
        │
   CHASE  → S12 shows who has not settled — not merely that something has not
        │
   SETTLE → S14, per person (J7)
```

**This is the capability the account model could not provide.** Previously the
clearing balance told you *that* something was unallocated; now it tells you
*who*.

⊗ The allocation screen itself is undesigned — splitting one transaction across
N counterparties with per-share amounts is not the same control as a category
split.

---

## J9 · Ask the agent

**Frequency:** a few times a week.

```
S03 Agent (web)  or  S04 → Agent (mobile)
        │
   ┌────┴──────────────────────────────────┐
   │ QUESTION                              │ INSTRUCTION
   │ "what did I spend on the flat?"       │ "48.90 cash coffee yesterday"
   │        │                              │        │
   │  read tool runs automatically         │  create_transaction proposed
   │        │                              │        │
   │  ToolResultCard                       │  DiffCard — before | after
   │  "ran automatically · 240 ms"         │  nothing happens until approved
   │                                       │        │
   │                                       │   ▸ Approve → applied 14:32
   │                                       │              audit #4821
   │                                       │              actor = agent
   │                                       │   ▸ Decline → declined result,
   │                                       │               session continues
   └───────────────────────────────────────┘
        │
   audit column lists every call with its kind and state
```

**One gate, three call sites.** Agent writes, voice writes (J2), and receipt
extraction (J3) all render the same `DiffCard`. Never a modal, never "are you
sure" — the diff *is* the confirmation, because a generic dialog teaches
nothing and gets clicked through.

⊗ No streaming or thinking state, against 3–15 s turns. ⊗ Approved writes have
no revert.

---

## J10 · Currency and rates

**Frequency:** rates daily (automatic); configuration rarely.

```
AUTOMATIC — app foreground
   sync reference rates ▸ current → no call
                        ▸ stale, online → fetch, stamp
                        ▸ stale, offline → last known, MARKED STALE
                        ▸ provider failed → surface it, never carry silently
   → FxStatusChip in every header:  FX 09:12 · NBP · 2 manual

MANUAL
   S18 Settings · Exchange rates
        │  rate table by pair and date
        │  ▸ override one day/pair → amber "manual", outranks sync forever
        │  ▸ sync history + failures
        │
   S17 Settings · Currencies
        │  ▸ add sub-currency → code · decimals · symbol · rate source
        │  ▸ archive → hidden from pickers, history keeps working
        │  ▸ pin/unpin currencies shown in the header toggle
```

**Changing the display currency is free** — a header toggle, no backfill, no
confirmation, nothing written. Changing the **pivot** is the heavy operation,
and it is not something a move abroad requires; it gets a `ConfirmDialog` and an
audit entry, and should essentially never happen after setup.

---

## J11 · Close a tax period

**Frequency:** monthly or annually. **Highest stakes, lowest frequency.**

```
S01 Dashboard → scope: Business
        │
   S28 Tax view
        │  scheme in force for THIS period, with its version
        │  ▸ skala / liniowy → both sides, KPiR column mapping
        │  ▸ ryczałt         → revenue only, with per-row rates
        │                      cost side REMOVED with a stated reason,
        │                      never blanked
        │
   COMPLETENESS
        ▸ business rows missing counterparty NIP → listed, fixable inline
        ▸ missing KSeF invoice id                → listed
        ▸ uncategorized business rows            → listed
        │
   S27 Export
        │  period · scheme · VERSION selector
        │  produced record named honestly — KPiR vs ewidencja
        │  MANIFEST: row count · range · jurisdiction · scheme version
        │            · assertion that zero non-business rows are included
        │
   → .xlsx
```

**The exclusion guarantee is a design problem, not a copy problem.** The
manifest is the visible half of the structural guarantee in `SPEC.md` §13.1 —
a receipt you can check rather than a promise you have to trust.

---

## J12 · Maintain categories

**Frequency:** rarely, but overdue — **122 categories with 13 name collisions
exist today.**

```
S19 Settings · Categories
        │  tree · usage counts · archived toggle
        │
        ▸ Rename        → propagates; history unaffected (names are not keys)
        ▸ Merge         → pick survivor, preview affected count, confirm
        ▸ Archive       → hidden from pickers, history keeps working
        ▸ Reparent      → move a subcategory
        ▸ Find collisions → the 13 documented duplicate names
```

**Merge is the screen that matters.** It must state how many transactions move
before it happens, and it is not reversible in one step.

---

## J13 · Recurring

**Frequency:** monthly review. 24 rules migrate from Money Manager.

```
S21 Settings · Recurring
        │  rule list · next date · amount · enabled
        ▸ edit → RRULE picker · account · category · counterparty
        ▸ disable → stops projecting
        │
   projections appear in S11 Calendar as dashed, tagged `scheduled`,
   and are EXCLUDED from any total labelled actual
```

---

## J14 · Accounts

**Frequency:** rarely.

```
S16 Accounts
        │  register grouped by kind · balances · archived toggle
        ▸ add    → name · kind · currency · group · opening balance + date
        ▸ edit   → all of the above
        ▸ archive → never deleted; history references it
        │
   kinds: cash · bank · card · loan_receivable · loan_payable
          · clearing · investment · deposit · other
```

Opening balance matters more than it looks: it is what makes migrated balances
reconcile (`SPEC.md` §8.4), and it is derived during migration rather than
entered.

---

## J15 · Cutover

**Frequency:** once. The end of the migration (`SPEC.md` §8.5).

```
1. Last entries recorded in Money Manager; final .mmbak exported
2. S29b Migration import — run against the final backup
3. VERIFICATION GATE — all 52 balances, to the cent
        ▸ pass → continue
        ▸ fail → STOP. Nothing built on unreconciled balances is trustworthy
4. Counterparty proposals reviewed (names extracted from notes — J7)
5. Money Manager set read-only, kept installed, never edited again
6. Final .mmbak and mm-tools archived alongside the backups
```

---

# Screen specifications

Template: **purpose · entry · regions · components · states · actions · exits.**
Screens marked ✅ have designs in the Claude Design project; the rest do not.

## Mobile

### S04 · Today ✅
**Purpose** Answer the only question a daily user opens the app for.
**Entry** App launch; tab bar.
**Regions** Dark hero (net worth, period spend, net) · unsettled chip ·
say-a-transaction row with Scan beside it · Recent · tab bar with raised `+`.
**Components** `Shell(hero)`, `StatTile`, `Banner(warn)`, `TransactionRow`,
`TabBar`.
**States** Loading (skeleton) · ⊗ first run, no accounts · ⊗ offline staleness.
**Actions** `+` → S05 · Scan → S07a · say-a-transaction → S05 voice mode.
**Exits** S05, S07a, S09, S10, S11, S12.

### S05 · Quick add ✅
**Purpose** One draft, three ways in, nothing written until Save.
**Entry** `+` from any tab; say-a-transaction row.
**Regions** Amount display · chip row (account · category · date · scope ·
note) · trail rows · dock (mode switch, keypad, Save).
**Components** `Dock`, `Keypad`, `Chip`, `TrailRow`, `AmountField`.
**States** Empty · filling · machine-filled (trail visible) · saving ·
⊗ speech-not-understood · ⊗ offline extraction · ⊗ low confidence · ⊗ duplicate.
**Actions** Switch mode · tap any chip · Undo a trail row · Save.
**Exits** S04 on save; S06 for category; S15 for counterparty; S07a for photo.

### S06 · Category sheet ✅
**Purpose** Choose from 122 categories without a paralysing list.
**Entry** Category chip in S05, S02c, S09.
**Regions** Search · parent chips with counts · two-column subcategory grid ·
pinned footer (`+ New` beside `Use ‹subcategory›`).
**Components** `BottomSheet`, `SearchField`, `Chip`, `Button`.
**States** Browsing · searching · no match (offers *Create "…"*) · creating.
**Actions** Select · search · create scoped to the selected parent.
**Exits** Returns the selection to its caller.

### S07 · Receipt capture and review ✅
**a · Capture** Brackets, shutter, flash, count. Works offline.
**b · Queue** Per-item: ⏳ waiting (queued 14:06, uploads on reconnect) ·
✓ ready (extracted 2.4 s).
**c · Review** Merchant · date · total · detected currency with the
receipt-date rate · VAT · per-field confidence · lines with subcategories ·
resulting transactions preview.
**States** Capturing · queued · extracting · ready · ⊗ unreadable · ⊗ upload
failed.
**Actions** Edit any field · Keep as one · Split · Commit.
**Exits** S04.

### S08 · Voice multi-intent ✅
**Purpose** One utterance, possibly several instructions, all gated.
**Regions** Waveform · live transcript · one `DiffCard` per parsed intent ·
approve control.
**States** Listening · transcribing · parsed · ⊗ not understood.
**Actions** Approve / decline **per card** (⊗ currently one *Approve both*).
**Exits** S04.

### S09 · Transaction detail
**Purpose** Everything created must be findable and fixable.
**Entry** S10, S11, S04 Recent, agent result.
**Regions** Amount + FX basis · account · category · date · scope · note ·
counterparty · receipt · line splits · audit history.
**Components** `FxAmount`, `AuditHistory`, receipt viewer, split editor.
**States** View · edit · saving · deleted (soft, recoverable).
**Actions** Edit · split · attach receipt · change scope · delete.
**Exits** Back to caller.

### S10 · Transactions list
**Purpose** Find the thing you remember.
**Regions** Search · filter bar (account, category, scope, currency, date
range, counterparty) · virtualized list · running total for the filter.
**Components** `FilterBar`, `SwipeAction`, `TransactionRow`, `TransferRow`.
**States** Loading · results · ⊗ no results · ⊗ offline (cached).
**Actions** Search · filter · swipe to edit or categorize · tap → S09.

### S11 · Calendar
**Purpose** What happened in this period.
**Regions** Period header · scale switcher (day/week/month/year) · nav-mode
toggle (continuous/stepped) · the grid or list · period total.
**Components** `Calendar`, `DayCell`, `MonthCell`, `PeriodHeader`,
`ScaleSwitcher`, `NavModeToggle`, `Sparkline`.
**States** Loading · populated · empty period · projected-only · ⊗ offline.
**Actions** Switch scale (anchor date preserved) · switch nav mode · tap a day
→ day scale · tap an entry → S09.

### S12 · Debt · counterparties
**Purpose** Who owes you, and whom you owe, across currencies.
**Regions** Direction segment (All / They owe / You owe) · counterparty list ·
totals per direction in the display currency.
**Components** `CounterpartyRow`, `DebtDirectionTag`, `SegmentControl`.
**States** Loading · populated · empty (no counterparties) · all settled.
**Actions** Search · filter by direction · tap → S13 · add → S15.

### S13 · Counterparty detail
**Purpose** One person's full position, across every currency.
**Regions** Header (name, kind, their settlement currency) · `BalanceLedger` — one
row per currency with direction in words · derived totals · transaction
history · ageing (companies only).
**Components** `CounterpartyCard`, `BalanceLedger`, `AgeingBar`.
**States** Outstanding · fully settled · mixed direction.
**Actions** Settle → S14 · edit → S15 · add transaction → S05 prefilled ·
allocate a group expense (⊗ undesigned).
**Exits** S14, S15, S09.

### S14 · Settle sheet
**Purpose** Discharge a debt, possibly in another currency.
**Regions** Amount + currency · which balance it discharges · rate (editable,
defaults to reference) · spread vs reference · **residual preview** · account
the money moves through.
**Components** `SettleSheet`, `RateField`, `TransferAmount`.
**States** Entering · partial (residual shown) · exact · over-settlement
(becomes a balance in the other direction) · saving.
**Actions** Edit rate · edit amount · commit.
**Exits** S13.

### S15 · Counterparty editor
**Purpose** Create or edit a person or company.
**Regions** Name · kind (person / company) · **their settlement currency** · contact ·
note · archive.
**States** New · editing · ⊗ possible duplicate name.
**Actions** Save · archive.

### S16 · Accounts
**Purpose** Register, balances, opening balances.
**Regions** Grouped list by kind · balance per account · archived toggle ·
editor.
**States** Populated · empty (first run) · archived shown.
**Actions** Add · edit · archive · reorder.

### S17 · Settings · Currencies
**Purpose** The currency list, which are pinned to the header toggle, and each one's rate source (`SPEC.md` §7.0).
**Regions** Currency list with rate source per currency · pinned-to-toggle
set · archive · pivot (shown read-only, with an advanced change action).
**States** Default · changing main (confirmation) · backfilling.
**Actions** Add · archive · set rate source · **change main** → `ConfirmDialog`
→ backfill.

### S18 · Settings · Exchange rates
**Purpose** See, override, and audit rates.
**Regions** Pair selector · date range · rate table (date · rate · source ·
manual flag) · sync history including failures.
**Components** `RateTable`, `RateEditor`, `SyncLog`, `FxStatusChip`.
**States** Fresh · stale · syncing · failed · has overrides.
**Actions** Override a day/pair · clear an override · force sync.

### S19 · Settings · Categories
**Purpose** Rename, merge, archive, reparent. **Overdue** — 13 collisions.
**Regions** Tree with usage counts · collision finder · merge flow.
**Actions** Rename · merge (states affected count, confirm) · archive ·
reparent.

### S20 · Settings · Rules
**Purpose** The deterministic tier of classification (`SPEC.md` §9.2).
**Regions** Rule list with hit counts · editor (conditions, actions, priority) ·
test panel showing what it would match.
**Actions** Create (often prefilled from S02c) · edit · disable · reorder.

### S21 · Settings · Recurring
**Purpose** 24 migrated rules; projections feeding S11.
**Regions** List with next date · RRULE editor.
**Actions** Edit · disable · run now.

### S22 · Settings · Tax
**Purpose** Scheme timeline, not a dropdown.
**Regions** `SchemeTimeline` with effective dates · VAT registration · NIP ·
default ryczałt rate per activity.
**States** No scheme set · single scheme · **multiple periods in one year**.
**Actions** Add a dated scheme change · edit registration details.

## Web

### S01 · Dashboard ✅
**Purpose** Where do I stand, and what needs action.
**Regions** Dark shell (brand, nav, scope segment, FX chip, currency chip, net
worth at 54px with spend/net/business-share beside it) · ground panel ·
unsettled banner (only when non-zero) · widget grid.
**Components** `Shell`, `StatTile`, `Banner(warn)`, `DonutChart`, `BarChart`,
`BalanceRow`, `FxAmount`, `WidgetGrid`.
**States** Loading · populated · ⊗ offline / Pi unreachable · ⊗ first run.
**Actions** Change scope · change period · drill into any widget.

### S02 · Import ✅ (review) / ⊗ (upload, parsing)
**a · Upload** File picker · parser detection · account confirmation. ⊗
**b · Parsing** Progress, row count, parse issues. ⊗
**c · Review queue** ✅ — see J4.
**d · Empty** ✅ "Queue clear" with session counts and a reload.

### S03 · Agent ✅
**Purpose** Answer what needs Excel today; perform bounded writes.
**Regions** Three columns — sessions · conversation · audit.
**Components** `ToolResultCard`, `DiffCard`, `AuditRow`.
**States** Idle · ⊗ thinking/streaming · tool running · awaiting approval ·
applied · declined · ⊗ refusal.
**Actions** Ask · approve · decline · ⊗ revert.

### S23 · Calendar (web)
Same component as S11, wider canvas. Week and month cells gain per-day entry
previews rather than only totals.

### S24 · Dashboard layout
**Purpose** Choose what the dashboard shows and where.
**Regions** Preset layout picker · widget list with size and config per widget.
**Components** `WidgetGrid`, `WidgetCard`, `LayoutPicker`.
**Actions** Pick a preset · configure a widget · reorder (⊗ free drag deferred,
`SPEC.md` §14.5).

### S25 · Reports
**Purpose** Period comparison, category deep-dive, the business view.
**Regions** Period picker (presets + arbitrary range) · chart area (pie · line ·
bar · treemap) · comparison table · export action.
**Components** `PeriodPicker`, `LineChart`, `PieChart`, `Treemap`,
`ComparisonTable`.
**States** Loading · populated · ⊗ no data in range.
**Actions** Change period · change chart · drill to S10 · export → S27.

### S26 · Debt overview
**Purpose** Both directions at portfolio scale.
**Regions** Totals by direction and currency · ageing table (companies) ·
per-counterparty list · unallocated clearing.
**Actions** Drill to S13 · export.

### S27 · Export
**Purpose** Build a workbook; assert the exclusion guarantee.
**Regions** Scope · period · sheet selection · jurisdiction and scheme +
**version** · **manifest preview** · build.
**Components** `WorkbookBuilder`, `SchemeSelector`, `ManifestCard`.
**States** Configuring · building · complete · ⊗ failed · ⊗ nothing in range.
**Actions** Build · download.

### S28 · Tax view
**Purpose** Make the business/personal boundary and the scheme legible.
**Regions** Scheme + version for the period · revenue and (scheme-dependent)
cost sides · KPiR column mapping · completeness warnings (missing NIP, missing
KSeF id, uncategorized business rows).
**States** Skala/liniowy (both sides) · ryczałt (revenue only, cost side
**removed with a stated reason**) · no scheme set.
**Actions** Fix a row inline → S09 · export → S27.

## Both

### S29 · Setup wizard
**a · First run** Display currency → currencies in use → first account → import? →
tax scheme? → S04.
**b · Migration import** File picker · normalization report · **verification
gate** with per-account balance comparison · counterparty proposals.
**States** Step-by-step · verifying · ⊗ verification failed · complete.

---

## Coverage matrix

Screens each journey touches. `●` primary, `○` reachable.

| | S01 | S02 | S03 | S04 | S05 | S06 | S07 | S08 | S09 | S10 | S11 | S12 | S13 | S14 | S15 | S16 | S17 | S18 | S19 | S20 | S21 | S22 | S23 | S24 | S25 | S26 | S27 | S28 | S29 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **J1** | | | | ○ | | | | | | | | | | | | ● | ● | | | | | ○ | | | | | | | ● |
| **J2** | | | | ● | ● | ● | ○ | ○ | | | | | | | ○ | ○ | | | | | | | | | | | | | |
| **J3** | | | | ○ | ● | ○ | ● | | | | | | | | | | | | | | | | | | | | | | |
| **J4** | ○ | ● | | | | ○ | | | | | | | | | | | | | | ● | | | | | | | | | |
| **J5** | | | | ○ | | ○ | ○ | | ● | ● | ● | | | | | | | | | | | | | | | | | | |
| **J6** | ● | | | ● | | | | | ○ | ○ | ● | | | | | | | | | | | | ● | ● | ● | | | | |
| **J7** | | | | ○ | ● | | | | ○ | | | ● | ● | ● | ● | | | | | | | | | | | ○ | | | |
| **J8** | ○ | | | ○ | ● | | | | | | | ● | ● | ● | | | | | | | | | | | | ○ | | | |
| **J9** | ○ | | ● | ○ | | | | ○ | ○ | | | | | | | | | | | | | | | | | | ○ | | |
| **J10** | ○ | | | | | | | | | | | | | | | | ● | ● | | | | | | | | | | | |
| **J11** | ● | | ○ | | | | | | ○ | ○ | | | | | | | | | | | | ● | | | ○ | | ● | ● | |
| **J12** | | | | | ○ | ○ | | | | | | | | | | | | | ● | | | | | | | | | | |
| **J13** | | | | | | | | | | | ○ | | | | | | | | | | ● | | | | | | | | |
| **J14** | | | | | ○ | | | | | | | | | | | ● | | | | | | | | | | | | | |
| **J15** | ○ | | | ○ | | | | | | | | ○ | | | ○ | ○ | | | | | | | | | | | | | ● |

**Never a primary screen in any journey:** S23 (web calendar — reuses S11).
That is fine. Everything else earns its place in at least one flow, which is
the test an inventory cannot perform.

---

## Gaps found by walking the flows

Walking the journeys surfaced nine things the inventory did not.

| # | Gap | Journey | Severity |
|---|---|---|---|
| G1 | **Failed migration** — the wizard cannot just continue when balances do not reconcile | J1, J15 | **Blocking** |
| G2 | **Allocation screen** — splitting one transaction across N counterparties is not the category-split control | J8 | **Blocking** for J8 |
| G3 | Quick-add error states — speech, network, low confidence, duplicate | J2 | **Blocking** — daily path |
| G4 | Import upload and parsing screens (S02a, S02b) were assumed but never specified | J4 | High |
| G5 | Unreadable photo | J3 | High |
| G6 | Agent thinking/streaming, against 3–15 s turns | J9 | High |
| G7 | Web offline — the dashboard says nothing when the Pi is unreachable | J6 | Medium |
| G8 | Undo on import accept/skip | J4 | Medium |
| G9 | Partial approval when voice yields two intents | J2 | Medium |

**G1 and G2 are new.** Neither appears in `DESIGN.md` or in the Claude Design
project, and both are load-bearing: a migration that cannot fail gracefully
blocks cutover, and a group expense that cannot be allocated makes the clearing
account no better than it was in Money Manager.

---

## Build order implication

`DESIGN.md` §12 orders the component work D0–D9. The journey walk reorders the
**screen** work by frequency rather than by interest:

1. **J2 daily capture, including its four error states** — runs several times a
   day; every other journey assumes its output.
2. **J5 find and fix** — everything created must be findable.
3. **J4 monthly import** — the evening it replaces is the strongest single
   argument for the project.
4. **J7 lend and settle** — weekly, and currently impossible.
5. **J6 review** — calendar and charts.
6. **J11 close a tax period** — annual, but the highest stakes.
7. Everything else.

J1 and J15 sit outside this order: they run once, but J15 gates the cutover, so
G1 has to be closed before any of the above ships against real data.
