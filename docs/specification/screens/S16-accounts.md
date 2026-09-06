# S16 · Accounts

**Surface** both · **Journeys** J14, J1, J2 · **Frequency** rare
**Design** none
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

Each group — kind or `SharedGroup` — is a card of grouped rows: the group name
is the card's title, its per-currency subtotals the card's one header figure,
and the balance rows the body. The search field above the groups stays on the
ground, and so does **Add account**, the register's own primary, below the
last group. It is offered whether or not the register is empty: an action that
lives only in the empty state disappears the moment the first account exists,
which leaves no way to open the second.

The archived toggle sits under the groups and loads its rows lazily (§6), so
whether any exist is not known until it has been opened once. Opened onto
nothing it says so — *No archived accounts* — rather than leaving a heading
standing over blank space.

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
| `Card` | One per kind group and per `SharedGroup` — grouped rows, not a hero figure. The group name is the title, the per-currency subtotals the header figure, the balance rows the body. `SharedGroup`'s is titled *Jointly owned* and carries `edge="accent"` and a `Shared` tag |
| `SearchField` | Name, kind, currency. Same placement as S06, S10, S12 |
| `BalanceRow` | Account · kind · `FxAmount` for foreign |
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
scale**: the editor shows `0,00` for an account opened at nothing, not
`0.00000000`. What is saved stays exact — presenting a figure is not editing
it, so an editor nobody typed in produces no patch at all.

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
Tap → editor. Reorder by long-press drag within a group. Archive is in the
editor, not a swipe.

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
- **P1** — every foreign balance carries its rate.
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
