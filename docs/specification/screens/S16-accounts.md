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

  BANK                             8 420,10 zł
   BANK-A · PLN                    6 200,00 zł
   BANK-A/BIZ · PLN        [BIZ]   2 220,10 zł
  CASH                             1 040,00 zł
   Cash · PLN                        840,00 zł
   Cash · BYN              62,40 Br · 0,3121
                                     19,48 zł
  CLEARING                           340,00 zł  ⚠
   Clearing · PLN                    340,00 zł
  ─────────────────────────────────────────────
  SHARED                           6 460,40 zł
   Household · USD          1 800,00 $ · 3,59
                                   6 460,40 zł
```

**`SharedGroup` is visually distinct but not diminished** — separated by a rule,
subtotalled on its own, and rendered at the same weight. A jointly-owned account
is an ordinary account that belongs to a different total (§6.7), and **a negative
balance here gets no warning treatment**, because a shared account being
overdrawn is a real fact.

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
| `SearchField` | Name, kind, currency. Same placement as S06, S10, S12 |
| `BalanceRow` | Account · kind · `FxAmount` for foreign |
| `SharedGroup` | Own subtotal, distinct, not diminished |
| `FxAmount` | Every foreign balance carries its basis (P1) |
| `Tag` | `BIZ` · `archived` · clearing's amber marker |
| `EmptyState(first-run)` | **On the screen itself**, not only in the wizard |

## 5. Data

| Reads | Writes |
|---|---|
| `get_accounts` with computed balances | `create_account` · `update_account` · `archive_account` |
| `opening_balance + Σ signed legs` per account | `reorder_accounts` |

The balance query sums **both legs** of transfers — source by `amount_original`,
destination by `to_amount` (§7.4). It is not a plain `SUM` over `amount_pivot`.

## 6. States

| State | Treatment |
|---|---|
| Loading | Skeleton rows per group; group subtotals resolve last |
| Populated | As drawn |
| Empty | `EmptyState(first-run)` — offers *Add an account* and *Import from Money Manager*. Reachable directly from the tab bar by someone who abandoned J1 |
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
