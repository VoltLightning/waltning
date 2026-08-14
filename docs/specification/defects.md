# Defect register

Ten adversarial reviews, run in parallel against separate attack surfaces: data
model · money and FX · business-logic completeness · agent architecture ·
security and privacy · performance on Pi 4 · offline and concurrency · tax
layer · migration and cutover · internal contradictions.

Each was told to break the design and return concrete failure scenarios with
file references, not summaries.

**The result is not a list of bugs. It is one finding repeated in eleven
places:** this specification asserts guarantees, and asserting is not enforcing.
Almost every critical defect below is a sentence containing the words
*structurally*, *impossible*, *cannot*, *guaranteed* or *enforced*, with nothing
underneath it.

| Severity | Meaning | Count |
|---|---|---|
| **C** | A stated guarantee is false | 15 |
| **H** | Wrong data, silently | 31 |
| **M** | Cannot be implemented from the spec | 24 |
| **L** | Correct but under-specified | 18 |

**The single worst class was not in the design at all — it was in the arithmetic
the design shows you.** Three worked examples in the specification do not
compute, including a spread stated as `15,50 zł` where the figure is `1,55` — a
10× error in the example an implementer would unit-test against. All corrected;
see H20.

---

## C · Guarantees that were not

### C1 — Migration `0002` could never run, so *no* cross-table invariant existed
**Fixed.** The trigger file referenced `transaction_lines`, a table §6.10
described and no schema defined. Postgres aborts the file, so all three
invariants §6.5 presents as facts — currency matching, leaf-only assignment, and
the §13.1 5a business/shared guard — were facts about a file that had never
executed. Table now exists (`0002`), triggers renumbered to `0003`.

### C2 — Every trigger lived on `transactions`; one UPDATE on `accounts` walked past all of them
**Fixed.** `UPDATE accounts SET ownership = 'shared'` moved every business row it
held into `tax_ledger` — §13.1 5a defeated by a write to a different table.
`UPDATE accounts SET currency` left thousands of rows denominated in something
else. Added `accounts_change_safe`, plus a target-side guard so a business
transfer *into* a shared account is refused.

### C3 — The period lock freezes nothing
**Open.** §13.4 says a closed period's rows are frozen, and S27's byte-identical
rebuild guarantee rests on that sentence. No write guard exists: `S09` edits per
field with no form-level save, `delete_transaction` has no date check, nothing
prevents backdating a new row into a filed period, and `run_migration` upserts
below the registry entirely. The only closed-period guard in the whole registry
is on `rerate_transactions`.

### C4 — `tax_ledger` has no `ownership` predicate, and the ownership flip is retroactive
**Open.** The view filters `is_business AND deleted_at IS NULL` and never joins
`accounts.ownership`. S16 makes `own → shared` explicitly retroactive over 498
rows. A trigger on `transactions` does not fire on an `accounts` update — so
business rows land in a shared account and stay in the tax view.

### C5 — Under ryczałt the risk is omission, and nothing guards it
**Open, and the sharpest finding in the set.** Every mechanism in §13.1 prevents
a personal row *entering* a tax output. Under ryczałt only revenue is
reportable, so the material failure is a revenue row never marked business and
therefore silently **absent** — under-declared revenue. `is_business` defaults
false, migration sets it nowhere, and S28's completeness list checks four things,
none of which is *income rows with an earnings category, in own accounts, not
marked business.*

### C6 — The T1 assertion is unfalsifiable, and so is the invariant written to check it
**Open.** The manifest asserts zero non-business rows; that is a restatement of
the view's own `WHERE`, made by a role that by construction cannot see
`transactions` and therefore cannot detect a breach. §15.1's new invariant has
the same shape. Neither detects a redefined view, a missing view, a missing
role, or a grant on the base table — every way T1 actually fails.
**The check must be:** `pg_get_viewdef` equals a pinned definition; a probe as
the export role gets SQLSTATE 42501 on `transactions`; and the two counts agree.

### C7 — No role, no view, no migrate script. T1 is entirely aspirational
**Open.** Repo-wide, `tax_ledger` appears in SQL exactly once — in a comment.
Zero `CREATE ROLE`, `GRANT`, `REVOKE`, or `CREATE VIEW`. `POSTGRES_USER` is the
bootstrap **superuser**, which bypasses every GRANT. And `createDb()`'s default
argument means an export module written the obvious way silently gets that
superuser — converting *fails loudly* into *succeeds quietly*.

### C8 — "Structurally impossible" double-posting is not
**Open.** §14.4 claims the unique index means a rule cannot post a second rent if
you entered one by hand. A hand-entered row has `recurring_id = NULL` and is
excluded by the index predicate — it is not in the index at all. The index
prevents the *same rule* firing twice for the same occurrence, which is a much
weaker property and one a scheduler would rarely violate. **The claim must be
corrected or the guarantee actually built.**

### C9 — "Exactly one pivot" was at-most-one
**Fixed.** A partial unique index bounds a count above, never below. Clearing
`is_pivot` succeeded, leaving every stored rate quoted against a currency that no
longer claimed to be the hub. Deferred constraint trigger added; same gap on
`dashboard_layouts.is_active` noted.

### C10 — Reproducibility is claimed three times and supported by nothing
**Open.** §9.2 and §11.4 rest on a reparse returning the same answer. Nothing
pins temperature, seed, or model version — and §11.4 explicitly says *nothing
knows which model answered*. Worse, retrieval reads the **live ledger**, so
neighbours change between runs, and batch co-tenancy means row 37 is conditioned
on rows 1–36. Determinism breaks three independent ways.
**Either stop claiming it, or snapshot the retrieved ids, prompt hash, model id
and batch composition into `import_rows` — and rename the live-data version
`reclassify`.**

### C12 — Three of four FX adapters ignore the currency they are asked for
**Fixed.** `nbp`, `nbrb` and `nbg` all took `_currency` and hardcoded USD in the
URL. §7.7 lists **NBP as a permitted source for RUB** — configuring that fetches
PLN-per-USD (~3.76) and stores it as the RUB rate (~73), valuing a 50 000 RUB
expense at **$13 313 instead of $685**, with `source = 'nbp'` and no estimate
flag. Adapters now assert the currency they actually serve.

### C13 — The verification gate is an algebraic identity and cannot fail
**Open, and it invalidates every rehearsal.** `opening = computed_balance −
Σ(imported income)`, and §8.0 imports only income — so the gate evaluates
`(computed − Σ) + Σ = computed` for every account, unconditionally. Break the
sign map so transfers never credit and the gate still prints 0,00 down all 52
rows. The right-hand side must come from **outside the pipeline**: 52 balances
read off the Money Manager UI, or a structurally different second derivation.
*A gate whose two sides share a derivation is decoration.* There is also no gate
in code — the go/no-go for the project is prose.

### C14 — The transfer reasoning is unfalsified, and two readings are consistent with the evidence
**Open, and it must be probed before anything else.** `extract.py` asserts each
leg references its own account. If instead both legs are written on the source
with the destination in `ZTOASSETUID`, every transfer nets to zero on the source
and **no destination is ever credited**. The cited evidence — that adding
`ZTOASSETUID` produced implausible balances — is equally consistent with both
readings. And it fails *plausibly*: `Clearing · PLN` would compute to ≈0, which
§6.4 says is exactly what a clearing account should do.

### C15 — `debtDelta` hardcodes the source leg, inverting every debt recorded as a transfer
**Open.** §6.4 says the clearing account is 636 transfers of 678 rows, and §6.6
collapses the loan accounts into counterparties — so repayment is naturally a
transfer. `debtDelta(tx) = neg(signed(tx, "from"))` never reads the `to` side, so
Nina repaying 200 moves her balance from +200 to **+400**. The doc comment
claims "the inversion that would have made every receivable read backwards
cannot occur"; it occurs on every transfer.

### C11 — Auto mode is per-operation; the tax boundary is per-field
**Open.** §11.2 says auto mode is *never eligible for anything touching tax
scope*. `update_transaction` is ✅ auto-eligible and can write `is_business`,
which is exactly what decides `tax_ledger` membership. `categorize_batch` is ✅
and unbounded in rows. `accept_row` and `materialize_occurrence` are ✅ and both
mint ledger rows, defeating the ❌ on `create_transaction` by synonym.

---

## H · Wrong data, silently

**H1 · A forgotten FX rate valued a foreign amount at parity.** `fx_rate`
defaulted to 1, and with `amount_pivot` generated, Postgres computed 5 000 PLN as
5 000 USD with total confidence. **Fixed** — default removed.

**H2 · Soft-deleted rows held unique slots hostage.** Deleting a materialized
rent made that occurrence permanently unpostable, with the blocking row invisible
in every read path. **Fixed** — both partial indexes now exclude `deleted_at`.

**H3 · The idempotency mechanism threw on the first row.** `onConflictDoUpdate`
cannot infer a *partial* unique index without its predicate — 42P10. §8.3 calls
this the mechanism that makes re-migration idempotent; it had never run.
**Fixed** — `targetWhere` added.

**H4 · Columns the spec queries did not exist.** The `createdAt()` helper
hardcodes `"created_at"`, so `audit_log.at` and `receipts.captured_at` were named
one thing in TypeScript and another in Postgres. **Fixed.**

**H5 · An adjustment could not adjust downward.** `amount >= 0` for every type
and `signed()` returning `+amount` made reconciling an account *down* —
the ordinary use — unrepresentable. **Fixed.**

**H6 · A Polish filing could print a US line code.** `category_tax_map`'s
`scheme_id` and `tax_line_id` were independent FKs. **Fixed** — composite FK.

**H7 · An offline receipt produces two transactions for one payment.** The
queued image is not bound to the draft the user already saved, so drain creates a
second row. Violates §6.10 directly, and the client-UUID defence does not apply
because these are two genuinely distinct client operations.

**H8 · `fx_rate_estimated` set offline is never cleared.** Only a *manual* rate
set clears it; a later sync does not. Every foreign transaction captured offline
is permanently valued at whatever rate the phone happened to carry, and
`amount_pivot` materializes it.

**H9 · A stale cached balance drives a real write.** S14 renders the settle sheet
from cache offline and computes its residual — the screen's stated safety
mechanism — from a stale minuend. Same shape on the unsettled banner, where a
second allocation drives the clearing account negative.

**H10 · Set-based writes are approved against one set and applied to another.**
S09's day-wide FX fix states "4 other rows" at approval and applies to whatever
matches at drain — 23 rows after an import lands in between, at a rate the user
asserted about one purchase, now immune to sync correction.

**H11 · A closed period's PLN figures are not frozen.** Only the row→pivot leg is
stamped; pivot→PLN is a live `fx_rates` join. Three paths mutate it, and only one
of them is guarded.

**H12 · Bulk accept is one undoable unit in the UI and N entries in the outbox.**
Undo queues compensating writes *behind* unsent accepts; a partial drain commits
rows from an operation the user explicitly undid.

**H13 · Offline `create_*` collides on unique names and orphans dependents.**
Order was preserved and order was not the problem — five transactions reference a
counterparty id that the server rejected.

**H14 · Cross-path duplicates are wide open.** A capture queued on a phone is
invisible to the import's duplicate detection, which runs against "the whole
ledger" — a ledger missing the other writer.

**H15 · A constraint violation on drain wedges the outbox forever**, with no
`outbox blocked` state anywhere in the state matrix. The user sees pending
markers that never clear, indistinguishable from a slow network.

**H16 · `update_transaction` is undefined as patch-or-replace.** If it carries
the whole entity, a phone's category edit reverts a laptop's `is_business` and
`ryczalt_rate`, and the row leaves `tax_ledger`.

**H17 · The migration's balance derivation and skip paths interact.** Rows
skipped for unmapped categories or missing FX still shift the derived opening
balance unless `imported` is computed identically — verify against the
verification gate before cutover.

**H18 · `.gitignore` data patterns are root-anchored.** `apps/api/receipts/`,
`docker/backups/`, `*.xlsx` and `*.csv` are **not ignored**, in a public
Apache-2.0 repo whose README asserts it contains no financial data.

**H19 · `pg_dump` carries no roles or grants.** A DR restore returns the data and
silently drops T1 — and the drill logs "rows verified", which cannot catch it.

**H20 · Three worked examples in the spec do not compute. Fixed.**
`50 × (4.3120 − 4.2810) = 1.55`, printed as `15,50` — a 10× error in S14's
spread. `62.40 × 4.0231 = 251.04`, printed as `251,05` in five places. And
§6.6's two derived totals implied *different* rates (4.298874 vs 4.320000) while
being described as derived from one. These are the figures an implementer
unit-tests against.

**H21 · `fx_rates.rate` and `transactions.fx_rate` are reciprocals, both named
`rate`.** §7.0's display formula joined against the only row that exists is off
by `3.7556²` — **14.1×**. `RateEditor`'s own mock writes `RUB → 0,0104`, which is
USD-per-RUB into a column wanting RUB-per-USD: **9 246× over**, and §7.6
guarantees a manual rate is never overwritten.

**H22 · `to_fx_rate` semantics are unpinned, and the obvious reading makes the
spread exactly zero.** Storing the *realized* rate makes the two legs net to
0.00 — erasing the bank margin that §7.0 says cannot vanish. Only the reference
rate reproduces the 6,30 zł that three documents quote.

**H23 · The FX upsert has no source ranking.** `setWhere` protects `manual` and
nothing else, so a `carried_forward` fill can overwrite a published quote and
then report the day as a weekend gap.

**H24 · The nearest-rate fallback is unbounded and non-deterministic.** No date
window, and no tiebreak on equidistant dates — so a 2025 GEL row takes a 2020
rate (18.4% understated), and two runs of an importer whose headline property is
idempotence can produce different `amount_pivot` values.

**H25 · `fillForward` cannot carry across a run boundary.** `last` is seeded only
from the current fetch, never from the database, so every weekend foreground
sync writes nothing and punches a hole that then falls through to H24.

**H26 · Opening balances carry no rate, no pivot, and a date one day before FX
coverage begins.** They hold essentially all the value after §8.0, and they are
the one figure that converts at *today's* rate — the precise defect §7.0 exists
to eliminate. Net worth drifts daily for no reason.

**H27 · There is no allocation primitive.** `mul` is the only tool, so a 185,00
three-way split leaves 0,01 in the clearing account — permanently tripping §6.4's
trend-to-zero invariant, in the same sign direction, every time.

**H28 · `ZDO_TYPE` is compared as a string in Python and a number in SQL.** If
Core Data returns an integer, `SIGN.get(1)` is `None` and **every** balance
computes to 0.00 — while the income query still matches, because SQLite applies
numeric affinity. The gate from C13 then passes `0 == 0`.

**H29 · `ownership = 'shared' if name == 'family budget'` matches zero
accounts.** No such account exists — `Family budget` is an old *category*
(TAXONOMY §4.1); the shared money is in `Household · USD`. So §6.7 migrates as a
no-op and `DualTotal` prints the same figure twice.

**H30 · `.abs()` turns a negative income row positive**, and the opening-balance
plug absorbs the swing — so a −250 correction reconciles perfectly while
earnings read +250, a 500 error in the one figure §8.0 exists to preserve.

**H31 · An unknown currency silently deletes an account and all its income**,
with no warning and no counter on the `!accountId` path.

---

## M · Cannot be implemented from the spec

The completeness review found 15; the others added 9. The ones that block hardest:

- **A settlement in another currency has nowhere to record which balance it
  discharged.** S14's picker is unimplementable: the currency trigger forces the
  row into the account's currency, which discharges the wrong balance. Needs
  `debt_currency` + `debt_amount`.
- **`spend_by_category` has three undecided forks** — lines vs transaction
  category, the shared-boundary net line (which has no category by constraint),
  and capital treatment, which three screens answer three ways.
- **Nothing triggers `materialize_occurrence`.** No cron, no boot hook, no
  foreground trigger — and S21 and J13 contradict each other about whether
  posting is automatic at all.
- **J8's allocation step has no screen and no operation**, despite being the
  reason the journey exists.
- **`Mine` is two different sets** — §6.7 defines it as own accounts for net
  worth and `own AND NOT business` for the scope partition. Balances cannot be
  partitioned by a transaction flag at all.
- **Cross-currency transfer detection cannot work as written** — "equal
  magnitude" never holds across currencies, and this is where the realized rate
  is supposed to come from.
- **Duplicate detection has no window and no tolerance**, and three call sites
  imply three different strictnesses.
- **Confidence has no defined origin** and a threshold tuned against one model
  silently changes meaning when the `models` row changes.
- **Targets have no operations, no widget, no screen, and no progress rule.**
- **Ageing has no anchor date** and no due-date field, so "62 days" can only mean
  old, never overdue — which is the meaning S12 claims.
- **`spent`, `net`, `business share` and `revenue_ytd` are undefined**, and
  `revenue_ytd` reads a view that includes business *expenses*.
- **`FX Cost` totals by institution, and no entity carries an institution.**
- **The margin formula is never written down** and three candidates disagree.
- **Search has no matching semantics**, and no single `tsvector` configuration
  stems English, Polish and Russian.
- **`tax_period_locks` cannot represent a period spanning a scheme change**,
  which J11 calls normal — one `scheme_id`, and no reopen history.
- **`tax_residency` has no gap or overlap constraint**, and a period spanning a
  residency change is unhandled.
- **Which NBP rate values a EUR invoice for a PL filing is unspecified**, and the
  triangulated path produces a cross-rate NBP never published.

---

## L · Performance, and three attacks that did not land

Load findings were mostly **not** where §15 expects. The honest summary:

- **`fx_rates` growth is a non-issue** — ~34 000 rows at year 10, and the PK is
  exactly the right shape. **Per-row FX conversion is not the bottleneck** either
  (~28 ms for 8 000 rows). **age encryption is not a CPU concern.** All three
  attack lines were checked and dismissed rather than padded.
- **The real cost is fan-out**: S01 issues seven independent scans, serializing
  to 300–600 ms on two effective cores. One `dashboard_snapshot` CTE fixes it.
- **No index is partial on `deleted_at`**, so no aggregate can be index-only —
  ~300 ms cold after any memory pressure event, which is exactly when you open
  the dashboard.
- **The transfer destination leg has no date index**, so every balance-as-of-date
  scans every transfer the account ever received.
- **The FX backfill has no pacing and no resume**, and discards the whole run on
  one failure — which is precisely how GEL ended at 11 of 2 080 days.
- **`docker-compose.yml` is 25 lines, postgres only, stock-tuned**, against a §15
  row that describes tuning for four services.
- **`maintainVisibleContentPosition` does not exist on React Native Web**, so
  backwards calendar scroll will jump the viewport.

---

## What this changes about the plan

**Authentication appears in no phase.** §5.2 specifies it; §16's eight phases do
not deliver it, and §15.1's four test layers do not cover it. Phase 1 ships an
API over five years of real data roughly thirteen weeks before Tailscale lands.
That is the single most consequential scheduling finding, and it argues for a
Phase 0.5 gate: auth and perimeter before any listener binds.

**Three sections are load-bearing far beyond their length.** §14.3 (offline) is
four table rows and three bullets, and eleven screens each assumed a different
mechanism from it. §13.1's guarantee has no DDL. §11.2's gate is per-operation
against a per-field boundary. Each needs to be written to the depth its
dependents assume.

**Migration must not be rehearsed until C13 and C14 are settled.** The gate
cannot fail, and the transfer semantics it would have caught are unverified —
so every rehearsal J15 relies on currently confirms nothing. One SQL probe
against the `.mmbak` resolves C14 in minutes and decides whether 52 destination
balances are right or all wrong.

## The order this changes things

1. **Probe the `.mmbak`** — C14. Nothing downstream is trustworthy until the
   transfer reading is known.
2. **Give the gate an independent right-hand side** — C13.
3. **Auth and perimeter before any listener binds** — a Phase 0.5.
4. **Write the DDL that T1 claims** — C7, C6: role, view, revoke, and the three
   falsifiable assertions that replace the tautology.
5. **Close the period lock** — C3, and the closed-period guard every write path
   is missing.
6. Then the M-class gaps, which are ordinary specification work.

## What held up

Stated rather than padded, because a review that finds everything wrong is not a
review. `fx_rates` growth is a non-issue and its primary key is exactly right.
Per-row FX conversion is not the bottleneck. age encryption is not a CPU
concern. The 10-day carry cap is correctly implemented. `signed()` correctly
refuses to value a destination leg without `to_amount`. The `coalesce`-based
sibling uniqueness index is the right construction. Money never reaches a JS
`number`. `.env` is correctly ignored and has never been committed.
