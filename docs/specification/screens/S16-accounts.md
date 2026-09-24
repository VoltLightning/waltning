# S16 · Accounts

**Surface** both · **Journeys** J14, J1, J2 · **Frequency** rare
**Design** [S16.html](design/S16.html)
**Status** specified · tier 2

---

## 1. Purpose

The register: what accounts exist, what is in them, and which total they feed.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| Settings | Accounts | Settings |
| S01 | `balances` widget | S01 |
| S05 | Account chip → *new* | S05, with it selected |
| S29a | First-run step 3 | S29a |
| S04 | The net-worth strip | S04 |

**Exits** — an account row → its transactions, **filtered and visibly so**:
S04 on the phone, S10 on the desk · a group's title → the same, filtered to
every account in it · *Add account* → the create form · a clearing account's
amber marker → J8 allocation.

**Tapping an account is a filter, not a screen.** The register answers *what
exists and what is in it*; *what happened in it* is the ledger with one clause
added, and the ledger is a screen that already exists on both surfaces. A
third list of the same rows, reachable only from here, would be S10's phone
layout invented a second time — which is the thing S04 §3 just retired.

**A group's title filters to its members, and this is why groups are worth
having on a phone.** `account_groups` earns its place on the desk through
`FX Cost` by `institution` (§5); on a phone it earns it by being the only way
to ask *what did everything at this bank cost me* in one tap.

## 3. Layout

### Mobile — 390pt

Search above, grouped by kind beneath, archived behind a toggle. The
`SearchField` matches S06, S10 and S12 — a register that behaved differently
would make you learn a second habit for the screen you open least.

```
  🔍  Search accounts

  ┌ Bank ──────────────────────────── 8 420,10 zł ┐
  │ BANK-A · PLN                      6 200,00 zł │
  │ BANK-A/BIZ · PLN         [BIZ]    2 220,10 zł │
  └───────────────────────────────────────────────┘
  ┌ Cash ──────────────────────────── 1 040,00 zł ┐
  │ Cash · PLN                          840,00 zł │
  │ Cash · BYN              62,40 Br · 0,3121     │
  │                                      19,48 zł │
  └───────────────────────────────────────────────┘
  ┌ Clearing ────────────────────────── 340,00 zł ┐
  │ Clearing · PLN  [UNSETTLED]         340,00 zł │
  └───────────────────────────────────────────────┘
  ┌ Jointly owned  [SHARED] ───────── 6 460,40 zł ┐
  ┃ Household · USD          1 800,00 $ · 3,59    │
  ┃                                   6 460,40 zł │
  └───────────────────────────────────────────────┘
```

**`SharedGroup` is visually distinct but not diminished** — its own card, at
the same size, weight and subtotal treatment as every kind group, marked by a
2 px `accent` left edge and a `Shared` tag beside its title. Distinction is
drawn by adding a mark, never by taking size or weight away. The title is
*Jointly owned* and the tag is *Shared*: a title repeating its own tag spends
one of the two marks twice and says nothing the tag had not. A jointly-owned
account is an ordinary account that belongs to a different total (`SPEC.md`
§6.7 — where *jointly-owned* is the system's own word for it, as it is in
`flows/J14` §4), and **a negative balance here gets no warning treatment**,
because a shared account being overdrawn is a real fact.

**An account is not named after its group.** *Cash* holding an account called *Cash* spends a row saying what the card's title already said; the register names the account — *Wallet*, *Travel float*, *Everyday*, *Studio* — and the group names the kind. Where a migration produces the repetition, the row keeps the imported name and the rename is an ordinary edit; nothing is renamed on the user's behalf.

**The register is one surface, and a kind is a label on it.** Every kind used
to be its own `Card`, so five kinds drew five bordered boxes each carrying a
filled header — ten stacked bands for eleven accounts, and the pile is what
read as noise rather than any one of them. There is one card; the kinds are
sections inside it.

**Two rules, and the difference between them is the hierarchy.** A rule above
every account but the first of its section, inset to where the name starts —
three banks with nothing between them is one block of text a reader has to
parse back into rows. A heavier rule, full-bleed across the surface, between
one kind and the next. Inset says *the next account*; full width says *a
different sort of thing*. The account rule is drawn on the **top** of the row:
below, the last row of a section lands its hairline on the section rule under
it and every boundary is two lines.

**Every kind wears one colour, and it is a grounded one.** `02-tokens` §2.1b's
`accountKindRamp` — nine kinds, nine hues, so a hue is never reassigned when a
kind is added. Low chroma and warm-compatible: the category ramp exists to make
one leaf findable among fifty-nine in a picker and its inks are bright by
design, which on a register put a blue, a magenta and a lime on a page of
money. The kind's mark is its `tint` filled with a square of its own `ink`,
and the section's label takes that same `ink`.

**The colour belongs to the axis you grouped on.** In the currency view a
section holds a bank, a card and a wallet at once, so it carries no mark and
its label is muted: one hue over accounts of three kinds would be saying
something untrue.

**Grouped by kind or by currency, and the reader chooses** (`SegmentControl`,
above the search). By kind is *what sort of money is this*; by currency is
*what do I hold in euro*. **A section's subtotal is stated in the display
currency in the kind view and in the section's own currency in the currency
view** — a kind is the one grouping whose members need not share a unit, so
its sum exists only once converted; a currency group is already one unit, and
converting there would print a figure nobody can check by adding the rows in
front of them. A section states its subtotal whether it holds one account or
five: the label reads as the section's own line rather than as another
balance, and a sum that vanished at one member and returned at two is a table
with a hole in it.

**Every section folds, and none starts folded.** The state is *shut* rather
than *open* and empty by default: the register's job is to show what exists,
and a default that hid nine tenths of it would be a list you have to open
before you can read it.

**The screen opens with what it all comes to.** §1 says the register answers
which total these accounts feed, and it did not: the screen opened on figures
in three currencies with nothing adding them up. The total is stated in the
display currency, on the ground above the search — and the line under it says
how many accounts it counted, because an account whose currency has no rate
has no converted value and is therefore not in the sum. A figure over nine of
ten accounts is stated as exactly that; it is never passed off as ten. **A
caller with no display currency draws no total at all**, which is the honest
state for a register that cannot convert: a sum over figures in different
units is not a number.

**An account can be in the list and out of the total**, and those are two
switches (`set_account_visibility`), reached from the control beside the
grouping switch. *Show* takes an account out of the register's list; *Count*
leaves it in the list and out of the total. A vault you want to see but not
spend is the second; a card you have stopped using is both. One flag could not
say that, which is why there are two.

**Hiding switches counting off with it**, in the same tap and visibly. The
operation refuses a hidden account that claims to be counted — a row nobody can
see still moving the total is a figure with no way to check it, because a
reader adding the register up by hand gets a different answer and nothing on
screen explains the difference. A sheet that let a person build that state and
then bounced it would be offering a control whose only outcome is a refusal.

**A hidden account is never only hidden.** The search finds it — somebody who
hid an account and then typed its name is asking for it, and answering *no
matches* about a row the register is deliberately holding back would be lying
about the ledger. The count of hidden accounts sits below the list as the way
back in, so no decision made here is one the screen cannot undo.

**Hiding is not archiving, and the sheet says so.** Archiving means the account
is finished: it refuses an account still holding money and takes it out of
every picker. This is a view preference on a live account.

**The name carries the row at 500, not 600.** With a rule under every account
and a mark on every section the page no longer needs weight to separate
things, and at 600 across eleven rows the whole register read as emphasised —
which is the same as nothing being emphasised.

The archived toggle sits last and loads its rows lazily (§6), so whether any
exist is not known until it has been opened once — and an empty result and an
unread one are the same empty list. **It opens only once the rows have
actually arrived**; until then the collapsed heading is all there is, because
a section that opened first would have to say something about a list nobody
had read. Opened, the heading carries the count it found, and opened onto
nothing it says which nothing: *No archived accounts* when the ledger holds
none, *No archived accounts match* when the search above is what emptied the
section. The distinction is not decoration — the first is a claim about the
ledger, and made over a filtered list it is false.

A clearing account with a non-zero balance carries an amber marker — that is the
invariant this screen exists to surface (§6.4).

### Web — ≥1024px

Table: name · kind · currency · group · ownership · opening balance · current ·
archived. Sortable, and editable inline. The width buys the opening balance
column, which is the figure that makes migrated balances reconcile and is
otherwise buried in an editor.

## 4. Components

| Component | Notes |
|---|---|
| `Card` | **One for the whole register**, holding every kind as a section. `SharedGroup` keeps its own, titled *Jointly owned* with `edge="accent"` and a `Shared` tag — it is a different total, not a different kind |
| `SearchField` | Name, kind, currency. Same placement as S06, S10, S12 |
| `SegmentControl` | *By kind* / *By currency*, above the search |
| `BalanceRow` | Account, its tags, and the figure — one line. `kind` is **optional** and left out inside a kind section, where the section's label already says it and the figure already carries the currency; `SharedGroup` passes it, being the one card of mixed kinds. `first` says it begins its section and so draws no rule above it. `FxAmount` for foreign |
| `SharedGroup` | Own subtotal, distinct, not diminished — accent left edge and a `Shared` tag, at full weight |
| `FxAmount` | Every foreign balance carries its basis (P1) |
| `Tag` | `BIZ` · `archived` · clearing's amber marker |
| `EmptyState(first-run)` | **On the screen itself**, not only in the wizard |

## 5. Data

| Reads | Writes |
|---|---|
| `get_accounts` with computed balances | `create_account` · `update_account` · `archive_account` |
| `opening_balance + Σ signed legs` per account | `reorder_accounts` |
| `accounts.expected_balance` — what you last observed | **`reconcile_account(account_id, observed_balance, as_of, note)`** |

The balance query sums **both legs** of transfers — source by `amount_original`,
destination by `to_amount` (§7.4). It is not a plain `SUM` over `amount_pivot`.

### Groups, and the field a headline figure depends on

S16 renders a `group` column and groups the list by it — and **nothing in the
specification created a group, renamed one, or set its institution.** That last
one is not cosmetic: `FX Cost` (§12.2, `computations.md` §12) totals margin and
fees **by `account_groups.institution`**, which is the whole point of the figure —
it tells you which bank is charging you. A consumer with no producer.

Groups are managed here, inline, because they exist to organise this list and
nowhere else:

| Field | Meaning |
|---|---|
| `name` | Display only. Reorderable |
| **`institution`** | Who actually holds the money. **Several groups may share one** — a bank's PLN account and its business PLN account are two groups at one institution, and `FX Cost` must total them together |

**Institution is not the group name**, and conflating them is the easy mistake.
The name is how *you* think about the account; the institution is who charges the
spread. They diverge exactly when you hold several accounts at one bank, which is
the case the figure exists to illuminate.

An account may have no group — it renders ungrouped, and its FX cost totals under
*unattributed* rather than being dropped.

### Choosing a currency the ledger cannot yet value

Holding a currency and capturing in it are two capabilities, and only the
second is gated (`architecture/14` §14.6). An account opens in any currency the
replica holds; a *transaction* in a non-pivot currency needs a rate, and a
replica that has never synced may have none.

So the create form states it where the choice is made rather than letting the
executor refuse one capture at a time later: under the currency grid, a
currency whose `capturable` is false draws a line naming it — *"BYN has no
exchange rate yet. The account opens fine; transactions in it cannot be
recorded until one is set."* — and offers **Set a BYN rate**, which opens S18
on that currency and on today's date. Save is never blocked by it: refusing an
account for a missing rate would refuse the thing that is legal.

### Opening balance and opening date

`opening_balance` is *as of* `opening_date`, and `computations.md` §2 sums every
row from there. Both are set when the account is created and are ordinarily never
touched again — after migration they carry nearly all the value (§8.0), which is
why §8.4's gate exists and why editing one is an audited write with a confirm.

The figure is stored at `numeric(20,8)` and **read at the currency's own
scale, through the same formatter every other figure uses** (`design-system/04`
§4.1): the editor shows `0,00` for an account opened at nothing — `0.00` for a
reader whose language marks decimals with a dot — never `0.00000000`. Ungrouped,
and that is the one place the formatter is trimmed: the mark is a language
property, the thousands separator is a reading affordance, and a field that is
about to be typed into keeps whatever grouping it was seeded with long after
the number has changed under it. What is
saved stays exact: the field is compared to the stored figure by value, so
presenting it is not editing it and an editor nobody typed in produces no
patch at all.

**Changing an opening balance moves every balance from that date forward.** It is
not a correction tool. Reconciling against an observed balance is the next
section, and it writes a dated transaction instead — so the discrepancy stays
visible as an amount rather than disappearing into a starting figure.

### Reconciling against reality

**`adjustment` existed in the type enum, in `signed()`, and in H5's sign fix —
and nothing in the specification could create one.** This is where it belongs,
and C19 is why it matters: the ledger is faithful to Money Manager and
**partial** against the bank — 169 of 246 real transactions on one account were
never recorded. A ledger that cannot be corrected against an observed balance
compounds that forever.

The action is *I counted, and it says this*:

```
  Bank A · PLN            1 240,50        ⌃ reconcile
  ─────────────────────────────────────────────────────
  Computed                1 240,50
  You observed            1 198,30        [        ]
  Difference               −42,20
                                          Uncategorized ▾
                                          "cash spent, not recorded"
```

Committing writes **one `adjustment` transaction** for the difference, dated
`as_of`, categorised (defaulting to `Uncategorized`, which is a queue and not a
destination) and carrying the note. It is an ordinary ledger row: audited,
editable, reversible, and visible in every list.

**Not a silent balance overwrite**, which is what most finance apps do here. A
balance is `opening_balance + Σ signed legs` (`computations.md` §2) — there is no
field to set. Making the correction a *transaction* keeps the balance derived,
keeps the discrepancy visible as an amount you can categorise later, and keeps
§6.9's rule that nothing is destroyed.

**An adjustment may be negative in effect**, which is the ordinary case — you
almost always find *less* money than the ledger claims, because unrecorded
spending is the failure mode, not unrecorded income. H5 fixed exactly this: an
`amount >= 0` CHECK across all types made reconciling an account *down*
unrepresentable.

`expected_balance` is the same column §8.4's migration gate uses. Reconciling
updates it, so the last observation is always recorded next to the derivation —
and the two are never conflated.

**Rules:**

- Refused inside a closed period (§13.4). An adjustment changes a filed total.
- **Never auto-eligible** (§11.2). The agent may notice a discrepancy and say so;
  asserting what you counted is not something it can know.
- Offline it is available — you are standing at the ATM looking at the balance,
  which is the moment you have the observation.

## 6. States

| State | Treatment |
|---|---|
| Loading | Skeleton rows per group; group subtotals resolve last |
| Populated | As drawn |
| Empty | `EmptyState(first-run)` — offers *Add an account*. *Import from Money Manager* is S29's path, the setup wizard this screen enters by that name (S29 §2), and arrives with it; until then this state offers create alone rather than an action with nowhere to go. Reachable directly from the tab bar by someone who abandoned J1 |
| Error | Balance query failed → `ErrorState(recoverable)`; the register still lists accounts without figures rather than showing nothing |
| Offline | Cached with age |
| Gated | Currency change refused when transactions exist; business refused on shared accounts |

## 7. Interaction

### Mobile
**Tap → that account's transactions**, which is §2's filter: Home, narrowed,
with a chip saying so and an ✕ that clears it. The register answers *what
exists*; *what happened in it* is the list that already exists.

**Everything that rewrites a row is behind *Edit*.** One control turns the
register from a thing you read into a thing you arrange: a tap then opens the
editor instead of the filter, and each row gains ▲▼ that move it **within its
kind group** — the groups are this screen's order, not a person's. *Edit*
withdraws while a search is narrowing the list, because `reorder_accounts`
takes the whole ordered list and a filtered register cannot state one.

Not a long-press drag: the gesture is invisible, it collides with the scroll
this screen is mostly doing, and it cannot say which rows are movable. Archive
stays in the editor, not a swipe.

### Web
Inline edit, `Tab` between cells, sortable headers.

### Shared
**Changing an account's currency with transactions present is refused**, not
warned. Every amount is denominated in the account's currency and enforced by
trigger (§6.5); allowing it would silently reinterpret every row.

## 8. Rules this screen must obey

- **§6.7** — both totals; shared distinct, not lesser; negative shared balances
  are ordinary.
- **§6.4** — a clearing account trends to zero, and non-zero is surfaced.
- **P1** — every foreign balance is *built* from a rate and cannot render
  without one. It does not *print* it: one date for every row means one rate
  per currency, so the figure shows and the rate lives in S18
  (`design-system/04` §4.2).
- **Archive, never delete** — history references accounts (§6.9).
- **§8.4** — opening balance is derived on migration, typed only for accounts
  created afterwards.

## 9. Open questions

1. ~~**52 accounts is a lot of rows.**~~ **Decided: add search.** 52 is well
   past what grouping alone keeps scannable, and it is the count §1.3 names as a
   binding constraint rather than an incidental one.

   The consistency argument carries weight independently: S06, S10 and S12 all
   put a `SearchField` at the top of a list, and a register that behaves
   differently makes you learn a second habit for the screen you use least
   often. A control that occasionally sits unused is a smaller cost than an
   inconsistent one.
2. ~~**Ownership change is retroactive, with no preview.**~~ **Decided: preview
   both totals, before and after.** The confirmation states the transaction
   count that moves and shows net worth *mine* and *ours* in both states:

   ```
   Household · USD    own → shared      moves 498 transactions

   net worth        now          after
     mine      12 480,20      6 019,80
     ours      18 940,60     18 940,60
   ```

   An abstract flag flip becomes the two numbers it actually affects — which are
   the only two numbers anyone looks at. Same shape as the category merge in
   J12, which states how many transactions move before it happens.

   Dated ownership was considered and rejected: it models the truth more exactly
   — an account really can become shared on a date — but it makes every
   `mine`/`ours` query date-aware about ownership, which is a large permanent
   weight for an event that happens perhaps twice.
