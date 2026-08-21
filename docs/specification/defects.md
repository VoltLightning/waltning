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
| **C** | A stated guarantee is false | 31 — **all closed** |
| **H** | Wrong data, silently | 31 — **all closed** |
| **M** | Cannot be implemented from the spec | 24 — **all closed** |
| **L** | Correct but under-specified | 18 |

**Every migration in this register now runs.** All ten files apply cleanly to
an empty database, and the enforcement they add was tested by execution rather
than by reading: `verify_t1()` was made to return false two ways (a `GRANT` on
the base table, a redefined view), the omission check was made to return false
with a real unmarked revenue row, and the closed-period guard was driven through
all seven write cases including the two moves. That last exercise found C16 and
C17 — two defects *in the fix*, one of which suppressed every delete in the
system.

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
**Fixed** — `transactions_period_not_closed` in `0004` guards INSERT, UPDATE and
DELETE against every open lock, so backdating into a filed period is refused
rather than merely discouraged.

Previously: §13.4 said a closed period's rows are frozen and S27's byte-identical
rebuild guarantee rested on that sentence, while `S09` edited per field with no
form-level save, `delete_transaction` had no date check, and nothing stopped
backdating into a filed period. The only closed-period guard in the entire
registry was on `rerate_transactions`.

### C4 — `tax_ledger` has no `ownership` predicate, and the ownership flip is retroactive
**Fixed** — the view in `0005` joins `accounts` and filters `a.ownership = 'own'`,
so the retroactive flip removes those rows from the tax view by construction
rather than depending on a trigger that cannot fire.

Previously: the view filtered `is_business AND deleted_at IS NULL` and never joins
`accounts.ownership`. S16 makes `own → shared` explicitly retroactive over 498
rows. A trigger on `transactions` does not fire on an `accounts` update — so
business rows land in a shared account and stay in the tax view.

### C5 — Under ryczałt the risk is omission, and nothing guards it
**Fixed** — `tax_omission_candidates` and `verify_no_omitted_revenue()` in
`0005`, promoted into §15.1's continuous invariants so it runs against the live
database on a schedule rather than only at close.

Why it was the sharpest finding: every mechanism in §13.1 prevents
a personal row *entering* a tax output. Under ryczałt only revenue is
reportable, so the material failure is a revenue row never marked business and
therefore silently **absent** — under-declared revenue. `is_business` defaults
false, migration sets it nowhere, and S28's completeness list checks four things,
none of which is *income rows with an earnings category, in own accounts, not
marked business.*

### C6 — The T1 assertion is unfalsifiable, and so is the invariant written to check it
**Fixed** — `verify_t1()` in `0005` implements exactly the three checks this
entry prescribed: `pg_get_viewdef` against a pinned shape, `has_table_privilege`
denied on `transactions`, and the two counts agreed from both sides. §15.1's
invariant table now lists those three instead of the tautology.

Previously: the manifest asserted zero non-business rows; that is a restatement of
the view's own `WHERE`, made by a role that by construction cannot see
`transactions` and therefore cannot detect a breach. §15.1's new invariant has
the same shape. Neither detects a redefined view, a missing view, a missing
role, or a grant on the base table — every way T1 actually fails.
**The check must be:** `pg_get_viewdef` equals a pinned definition; a probe as
the export role gets SQLSTATE 42501 on `transactions`; and the two counts agree.

### C7 — No role, no view, no migrate script. T1 is entirely aspirational
**Fixed** — `0005_tax_ledger_roles.sql` creates the view, the `waltning_export`
role, enumerated `REVOKE`s covering the five other tables holding personal rows,
and an `ALTER DEFAULT PRIVILEGES` so nothing added later is readable by
accident. The superuser hazard is documented in §13.1: the export path must take
its connection explicitly, because `createDb()`'s default argument silently
hands it `POSTGRES_USER`, which bypasses every GRANT.

Previously: repo-wide, `tax_ledger` appears in SQL exactly once — in a comment.
Zero `CREATE ROLE`, `GRANT`, `REVOKE`, or `CREATE VIEW`. `POSTGRES_USER` is the
bootstrap **superuser**, which bypasses every GRANT. And `createDb()`'s default
argument means an export module written the obvious way silently gets that
superuser — converting *fails loudly* into *succeeds quietly*.

### C8 — "Structurally impossible" double-posting is not
**Fixed by correcting the claim and specifying the real mechanism.** §14.4 now
states what the index actually gives — *this rule fires once per occurrence*, a
scheduler property — and separates it from what you care about, *this rent is in
the ledger once*. Materialization is manual and offers **Link** rather than
**Post** when an unlinked row matches within ±3 days and 3%; linking stamps
`recurring_id` and `occurrence_date`, which puts the row into the index so the
question cannot be asked twice.

Previously: §14.4 claimed the unique index means a rule cannot post a second rent if
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
**Fixed** — §11.4 now names the three independent ways determinism breaks
(floating model alias, live-ledger retrieval, batch co-tenancy) and narrows the
guarantee to what is true: every classification is re-derivable from recorded
inputs. `import_rows.model_id`, `rule_snapshot` and `retrieved_ids` (migration
`0004`) are those inputs; replay pins them instead of re-retrieving, and running
against today's ledger is a separately named `reclassify`.

Previously: §9.2 and §11.4 rested on a reparse returning the same answer. Nothing
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
**Fixed in the specification (§8.4); still needs the 52 balances typed in.**
`ZASSET.ZLEFTMONEY` was checked as a possible free right-hand side — it is
`0.00` on all 52 accounts, unused in this export. Recorded so it is not
investigated twice. `opening = computed_balance −
Σ(imported income)`, and §8.0 imports only income — so the gate evaluates
`(computed − Σ) + Σ = computed` for every account, unconditionally. Break the
sign map so transfers never credit and the gate still prints 0,00 down all 52
rows. The right-hand side must come from **outside the pipeline**: 52 balances
read off the Money Manager UI, or a structurally different second derivation.
*A gate whose two sides share a derivation is decoration.* There is also no gate
in code — the go/no-go for the project is prose.

### C14 — The transfer reasoning is unfalsified, and two readings are consistent with the evidence
**Resolved by evidence. Reading A is confirmed at 100%.** All 1,680 OUT legs
name a destination in `ZTOASSETUID` that is the account of a same-dated IN leg,
and the converse holds for all 1,680 IN legs. `extract.py`'s docstring
assumption is correct; every destination is credited.

The probe had to be fixed first. Its original test asked whether IN and OUT legs
share a `ZASSETUID` and expected ~0% under Reading A. It measured **17.4%** —
neither answer — because two other mechanisms produce a shared `ZASSETUID`:
pass-through accounts, and the 173 same-account transfers now filed as C18. A
threshold on that number would have returned "Reading A" for the wrong reason,
which is the same failure this register exists to catch. The direct test — does
`ZTOASSETUID` name the account the paired leg sits on — is unambiguous.

### C15 — `debtDelta` hardcodes the source leg, inverting every debt recorded as a transfer
**Fixed.** `side` is now a required argument. §6.4 says the clearing account is 636 transfers of 678 rows, and §6.6
collapses the loan accounts into counterparties — so repayment is naturally a
transfer. `debtDelta(tx) = neg(signed(tx, "from"))` never reads the `to` side, so
Nina repaying 200 moves her balance from +200 to **+400**. The doc comment
claims "the inversion that would have made every receivable read backwards
cannot occur"; it occurs on every transfer.

### C18 — 173 debt reassignments migrate as nothing at all
**Fixed** — specified in §6.6a and given a table in migration `0007`. The
remaining work is human and does not block the migration: unresolved rows import
as zero-effect rows keeping their description, which is exactly their behaviour
in Money Manager today. 173 transfers have the same source and destination. They
net to zero — which is why no balance check has ever seen them — and every one
sits on a Loan account. Their descriptions are *"Marek. Total"*, *"Piotr.
Total"*, *"Доля Кати после реструктуризации"*: **debts moving between people**,
recorded as a self-transfer because Money Manager has no counterparty field.

§6.6 collapses loan accounts into counterparties by reading each leg's
counterparty from the account it sits on. Both legs sit on the same account, so
both resolve to the same counterparty and `debtDelta` sums to zero. All 173 rows
contribute nothing and ~52 000 zł on `Loan Zł (distributed)` is attributed to
whoever the surrounding rows happen to name. **Nothing fails** — the balances
reconcile, because they netted to zero in Money Manager too.

They now migrate as `debt_reassignment`: one row, two counterparties, no cash
flow, checkable by the invariant that a reassignment must not move net
receivables. The names are prose in three languages and cannot be resolved
automatically, so all 173 enter the review queue.

### C19 — The gate could only ever measure fidelity, never completeness
**Fixed** — found by reconciling against the bank; §8.4 now names three sources
and separates the two questions. Every source
§8.4 named — the typed balances, the second derivation — asks whether our
reading of the `.mmbak` matches what Money Manager shows. None can ask whether
Money Manager matches reality, because both sides come out of the same file.

Bank A's `.xls` statements carry `Saldo po transakcji`, a balance computed by the
bank. Running it (`tools/migrate-mm/reconcile_bank.py`):

- **169 of 246** real transactions on `Bank A · PLN` are not in Money Manager, and
  **35 of 56** on `Bank A · Business PLN`.
- **98 ledger rows match a bank row on the *signed* amount**, which is
  independent corroboration of `SIGN` — an inverted map would match ~0. This is
  evidence the `.mmbak` cannot produce about itself.

So fidelity is externally corroborated and completeness is not. The ledger is
internally consistent and partial, which no balance check can detect, and every
downstream figure inherits it — period spend, category totals, the ryczałt
revenue check. **A gate that passes on fidelity and is never run for
completeness certifies a faithful copy of an incomplete ledger.**

Not an extractor defect. It is what the ledger contains, and it is the reason
the sync tooling stays rather than migration being a one-off.

### C20 — The memory guard rejected behaviour along with facts
**Fixed in `0008`.** `agent_memory`'s CHECK was `body !~ '[0-9]{2,}'` — the right
instinct, the wrong predicate. It correctly refused *"Rent is 4500 PLN"* and
*"My salary is 12000"*, and it also refused:

| | |
|---|---|
| `Split group dinners 50/50 with Marek` | a ratio |
| `Treat anything from Zabka after 22:00 as groceries` | a clock time |
| `Round cash expenses to the nearest 10` | a rounding unit |

All three are behaviour. None duplicates a ledger figure, none can drift, and
all three are exactly what the feature exists to learn. **A guard that blocks the
main use case is worse than a slightly loose one** — especially here, where the
write is the one documented exception to the approval gate (§11.6) and the
violation surfaces mid-conversation as unreadable SQL.

The predicate now refuses a ledger *figure*: a number carrying a currency code or
symbol, a run of four or more digits, or a two-decimal quantity. Verified against
thirteen cases, seven accept and six reject.

It is a guard, not a proof — *"rent went up by a third"* still passes. It stops
the mechanical failure of a number copied out of the ledger into a prompt prefix
where it goes stale; S32 covers the rest by keeping every memory listed and
editable.

**Also closed a real drift:** the constraint existed only in migration `0004`'s
`ALTER`, never in `schema.ts`, so the Drizzle model and the database disagreed
about what `agent_memory` permits.

### C21 — A captive portal's `200` deleted the outbox
**Fixed** — Rule 0 in `architecture/09-connectivity.md`: *a 200 is not a
success.* The drain classified on status class alone, and a hotel portal answers
`200` with HTML to every POST. It read the 200, marked the entries sent and
removed them. Nothing reached the Pi.

§14.3 says in its own words that losing a capture is **the worst outcome in the
system**, and this delivered exactly that while reporting a successful sync — on
hotel wifi, which is precisely where a week of travel captures would be. Every
response must now authenticate as ours (`x-waltning` header, parseable envelope,
session nonce) before status is consulted at all.

### C22 — Idempotency covered only INSERTs, so a retry blocked against itself
**Fixed** — a server-side `outbox_receipts` ledger. The claim rested on the
partial unique index on `external_id`, which exists on four tables and fires only
on INSERT. Every `update_*`, `delete_*`, `categorize_batch`, `attach_receipt` and
`merge_counterparties` had no replay protection.

Edit a synced row's `is_business` offline; the drain commits; the connection
drops before the 200; the entry retries carrying the `version` its own first
application already advanced. `is_business` is `tax_sensitive`, so H16 blocks
rather than overwrites — **the entry is permanently blocked by a conflict with
itself**, and S30 reports another device changed it. Nothing did. On
`settle_debt`, which derives the residual from live data, the same replay
**settles twice**.

### C23 — The client stamped four valuations it could not know
**Fixed** — `fx_rate`, `to_fx_rate`, `tax_fx_rate` and `ryczalt_rate` all resolve
server-side at commit (§14.3). The headline claim *"the phone never computes a
derived figure"* was false in four places, and all four freeze into `GENERATED`
columns that are not re-derivable.

The sharpest: a cross-currency transfer captured offline pre-filled its
destination amount from the cached reference rate, so both legs valued to the
same pivot amount and **the margin was identically zero** — the exact failure
§7.5 exists to prevent, and indistinguishable from a genuinely fee-free transfer.
Three documents also disagreed about whether an offline estimate would ever be
corrected: §14.3 promised a firm-up offer, H8 said only a manual rate clears the
flag, S18 attached the offer solely to `set_manual_rate`. The ordinary path had
no mechanism at all.

### C24 — An app update would block a week of captures, correctly
**Fixed** — opaque payloads with `opVersion` and drain-time upcasters
(`architecture/08`). Nothing specified the client's own schema version. Ship v2
with a changed Zod schema for `create_transaction` and every v1 payload in the
outbox fails validation on drain; that is 4xx; H15 says 4xx blocks and is never
retried. A week of offline captures goes permanently blocked in one batch, **by
the rules as written**. The server now accepts N−2 versions, and an unknown
version is surfaced with its payload readable rather than dropped.

### C25 — `sending` had no crash recovery
**Fixed** — `UPDATE outbox SET state='pending' WHERE state='sending'` on launch,
safe only because C22's ledger exists. iOS force-quit gives no callback at all,
so an interrupted entry orphaned in `sending` forever and the pending count never
moved — which is H15's own complaint, reintroduced by its own fix.

### C26 — Receipt originals were held at full resolution for the whole outage
**Fixed** — downscale **at capture**, not on upload. §10.2 held the original
"until extraction returns", and extraction needs a model, which needs a network.
Three receipts a day across a two-week trip is **147 MB** of originals against
10.5 MB downscaled — 14×, using the spec's own 250 KB figure. A 4032×3024 JPEG
also decodes to **48.8 MB of bitmap**, and S07 supports ten captures in a
session; that is a jetsam kill. And in `Caches/`, iOS purges the images under
storage pressure **without telling the app**, so the transaction drains with no
evidence.

### C27 — §5 had no threat model for the device
**Fixed** — §5.7 Device custody. §5 reasons entirely about ingress; §14.3 put a
named third-party debt register, day-level history and a queue of receipt
photographs on a phone that is itself an enrolled tailnet node carrying a 30-day
session token. A stolen phone was both the perimeter and the credential, and
§5.1's lost-device row said only *"revoke that node — no password reset"*.

The decision that unlocks the rest: **drain never runs while locked.** A
background drain needs the database and its key readable while locked, which
forces the weakest protection class and makes every other control theatre.

### C28 — The accounting date came from a timezone that lags the border
**Fixed** — `capturedTz` recorded, the date editable at capture, and a drain-time
flag on timezone change. §7.0a resolves the date once and makes it immutable,
which is right; but the device's zone is not the zone you are standing in. Land
in Tbilisi at 01:00 after four hours in airplane mode and the phone still says
Warsaw, where it is 23:00 the previous day. Every capture in that window is dated
**yesterday**, permanently. Across a New Year's Eve flight that is a revenue row
in the wrong tax year — precisely what §7.0a exists to prevent.

### C16 — Every `DELETE` on `transactions` was silently suppressed
**Fixed in `0006`.** `assert_period_not_closed` ended `RETURN NEW`, and in a
`BEFORE DELETE` trigger `NEW` is NULL. Returning NULL from a BEFORE trigger
cancels the operation — so no row could be deleted from `transactions` in any
period, open or closed, and Postgres reported `DELETE 0` as ordinary success
rather than raising. A guard written to refuse *some* deletes refused *all* of
them, quietly.

### C17 — A filed row could be moved out of a closed period
**Fixed in `0006`.** The guard evaluated `coalesce(NEW.date, OLD.date)`, which
on UPDATE is always `NEW.date` because `date` is `NOT NULL`. It asked whether
the row's *destination* was closed and never whether it had come out of a closed
period. Moving a February transaction to June therefore succeeded, and
February's filed total dropped by that amount with nothing inserted, deleted or
edited inside the period. Worse than the backdating case it was written for:
backdating leaves a row you did not expect, a move leaves nothing at all. A move
touches two periods and both must now be open.

**Both were found by running the trigger, not by reading it** — on a scratch
database, one case per statement, checking the resulting rows rather than the
absence of an error. That is this register's own thesis arriving one layer down:
the fix for *asserting is not enforcing* is itself an assertion until executed.

### C11 — Auto mode is per-operation; the tax boundary is per-field
**Fixed** — §11.2 now evaluates eligibility against the **fields a call actually
writes**. The registry marks each writable field `tax_sensitive`; a call under an
auto grant naming one is gated individually whatever else it also sets, and the
approval card shows only those fields with the rest already applied. The
ineligible set is `is_business`, `ryczalt_rate`, `ryczalt_activity`,
`counterparty_tax_id`, `date`, `accounts.ownership` and `currencies.is_pivot`.

Previously: §11.2 said auto mode is *never eligible for anything touching tax
scope*. `update_transaction` is ✅ auto-eligible and can write `is_business`,
which is exactly what decides `tax_ledger` membership. `categorize_batch` is ✅
and unbounded in rows. `accept_row` and `materialize_occurrence` are ✅ and both
mint ledger rows, defeating the ❌ on `create_transaction` by synonym.

### C29 — Rule 1's envelope reached no client; every domain error arrived empty
**Fixed** — the error formatter returns tRPC's numeric code at `error.code` and
the domain code at `error.data.code`, where Rule 1 now reads it.

The formatter had replaced the top-level `code` with our own vocabulary, which
made Rule 1's `{error:{code,…}}` literally true on the wire and read better than
a JSON-RPC number. tRPC's client validates that field's *type*: an error
response whose `error.code` is not a number is discarded whole, and the caller
gets `Unable to transform response from server` — no code, no details, no path,
for every refusal in the system.

So Rule 1 was unimplementable. Its entire job is telling a domain refusal from a
proxy's 403, and the signal it reads never survived the client. A permanent
refusal — a closed period, a duplicate name — would have been indistinguishable
from a transport blip and retried forever.

**Nothing on the server could have caught it.** The response was well-formed, the
status was right, and the suite asserted the body — correctly, and it passed.
The defect existed only in a client parsing it, so it needed a real client
against a running server: found by `pnpm e2e` the first time it ran, on a code
path four tests already covered. The regression is now pinned by asserting the
*type* of `error.code`, which is the part no reader thinks to check.

### C30 — §2's balance formula subtracted every income
**Fixed.** The source leg is now signed by type, matching §1 one paragraph
above it, and `T` — used by §2 and §6 and defined nowhere — is defined as
`transactions WHERE deleted_at IS NULL`.

`balance(a)` read `sum(-t.amount_original)` over every row on the account.
§1 defines `signed(t,'from')` as `−amount_original` for expense and the source
leg of a transfer, and **`+amount_original` for income and adjustment**. The two
definitions sat one paragraph apart and disagreed.

Concretely: an account opening at zero, one income of 1 000,00, one expense of
200,00. §1 gives **800,00**. §2's SQL gives **−1 200,00**. Every income row in
the system, inverted — and an `adjustment`, which carries its own sign, would
have had its correction reversed.

**Account balance is class F**, so the phone folds the same definition. Both
surfaces would have been wrong in exactly the same way, agreed with each other,
and reconciled against the server without a discrepancy — the only shape of
error that no consistency check can see.

**`money.signed()` in `packages/core` was correct the whole time** — income and
adjustment return the amount unchanged, expense negates, a transfer negates the
source and returns `to_amount` for the destination. Exactly §1. So the code
agreed with the prose and only the *formula* disagreed with both, which is what
made this latent: it would have been introduced by the first person to implement
§2 by copying it, and that person would have been reading the authoritative
document.

Found by building against it rather than reading it: the first screen that
wanted a balance had to be told what a balance is.

### C31 — "Both, or neither" is not something SQLite offers across two files
**Fixed** — `architecture/14-local-first.md` §14.6 replaces the transaction with
an ordering. The outbox entry commits first and alone; the replica row commits
second, carrying an `applied_seq` watermark in the same transaction; a
launch-time reconciler applies every entry above that watermark. The drain runs
the same rule in the other direction (`architecture/08` — canonical row first,
the entry's removal last), because the rule is not *outbox first* but
**whichever half commits second must be the half a replay can reconstruct**.

§14.1 said a write **materialises into the local tables and records its intent
in the outbox**, and the write path read that, correctly, as "both, or neither"
in one SQLite transaction. §5.7 says in the same breath that `replica.db` and
`outbox.db` are **separate files** — and protects both `-wal` siblings, so both
are in WAL mode. SQLite's own documentation lists the cost among WAL's
disadvantages: *"Transactions that involve changes against multiple ATTACHed
databases are atomic for each individual database, but are not atomic across all
databases as a set."* Two requirements, each stated plainly, and nothing
satisfies both.

**The transaction was doing real work, so the ordering has to do it instead.**
Row without entry is a capture that reaches no server and is discovered months
later by two devices disagreeing about a figure. Entry without row is a list
short by one line until the next launch. Those are not the same defect, and the
ordering decides which one the crash window is allowed to produce — the outbox
holds the only copy of unsent intent, while the replica is rebuildable from the
server or, on Brick 1, from the outbox itself.

Dropping WAL would have made the original sentence literally true, through
`ATTACH` and the master journal. Rejected: it costs reader-during-write
concurrency on the capture path and puts both files on one connection, which is
what having two files exists to avoid.

Found the way the two above were — by building it. The module that implements
§14.1 states "both, or neither" in its own header comment, and two files in WAL
mode cannot give it that.

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

**H7 · An offline receipt produces two transactions for one payment. Resolved** — `architecture/08-offline-and-concurrency.md`. The draft mints the transaction id before the image is queued; the upload carries it as a dependency and attaches to a row that already exists. Originally: The
queued image is not bound to the draft the user already saved, so drain creates a
second row. Violates §6.10 directly, and the client-UUID defence does not apply
because these are two genuinely distinct client operations.

**H8 · `fx_rate_estimated` set offline is never cleared. Resolved** — S18 Q1:
a manual rate set offers to clear the flag across the range it covers, gated by
a stated count and **never inside a closed period**.  Only a *manual* rate
set clears it; a later sync does not. Every foreign transaction captured offline
is permanently valued at whatever rate the phone happened to carry, and
`amount_pivot` materializes it.

**H9 · A stale cached balance drives a real write. Resolved** — the client residual is an estimate labelled `as of hh:mm`; `settle_debt` takes the amount settled, never the residual, and the server derives the remainder from live data. Originally: S14 renders the settle sheet
from cache offline and computes its residual — the screen's stated safety
mechanism — from a stale minuend. Same shape on the unsettled banner, where a
second allocation drives the clearing account negative.

**H10 · Set-based writes are approved against one set and applied to another. Resolved** — an approved set is a list of ids, never a predicate. Registry-wide: an operation whose input is a predicate cannot be approved, because what you approved is not what will run. Originally:
S09's day-wide FX fix states "4 other rows" at approval and applies to whatever
matches at drain — 23 rows after an import lands in between, at a rate the user
asserted about one purchase, now immune to sync correction.

**H11 · A closed period's PLN figures are not frozen. Resolved** — §13.6 and migration `0009`. A tax figure no longer joins live `fx_rates` at all: the filing rate is stamped per row as `tax_fx_rate` / `tax_fx_date` / `tax_fx_source`, so a later rate correction cannot reprice a filed period. The general display path stays live, which is correct — a *display* is a current view, a *filing* is a fact. Originally: Only the row→pivot leg is
stamped; pivot→PLN is a live `fx_rates` join. Three paths mutate it, and only one
of them is guarded.

**H12 · Bulk accept is one undoable unit in the UI and N entries in the outbox. Resolved** — an outbox entry is one *intention*, not one row change, so bulk accept is a single entry and undo before drain simply removes it. Originally:
Undo queues compensating writes *behind* unsent accepts; a partial drain commits
rows from an operation the user explicitly undid.

**H13 · Offline `create_*` collides on unique names and orphans dependents. Resolved** — the client mints the entity id and the server accepts it, so dependents are never orphaned; a name collision becomes an S15 merge candidate rather than a failure path. Originally:
Order was preserved and order was not the problem — five transactions reference a
counterparty id that the server rejected.

**H14 · Cross-path duplicates are wide open. Resolved** — duplicate detection is a server-side check on commit for every path, not a step inside the import pipeline. Same window and tolerance (`computations.md` §9); flagged, never refused. Originally: A capture queued on a phone is
invisible to the import's duplicate detection, which runs against "the whole
ledger" — a ledger missing the other writer.

**H15 · A constraint violation on drain wedges the outbox forever. Resolved** — a third outbox state, `blocked`, entered immediately on any 4xx-class refusal, surfaced on S30 and inspectable. Entries behind it still drain unless they depend on it. Originally:, with no
`outbox blocked` state anywhere in the state matrix. The user sees pending
markers that never clear, indistinguishable from a slow network.

**H16 · `update_transaction` is undefined as patch-or-replace. Resolved** — every `update_*` is a patch, registry-wide, and carries the `version` the client last read (`architecture/14` §14.2 — a bigint, never a timestamp to rank). Different fields both land; the same field follows the conflict setting, *latest applied wins* or *ask*, with both values audited either way; a stale `tax_sensitive` field always asks and is blocked rather than overwritten. Originally: If it carries
the whole entity, a phone's category edit reverts a laptop's `is_business` and
`ryczalt_rate`, and the row leaves `tax_ledger`.

**H17 · The migration's balance derivation and skip paths interact. Resolved** — the skip paths are gone. An unseeded currency is now a hard failure (H31) rather than a skipped account, and §8.4's gate has an independent right-hand side, so a derivation that shifted the opening plug can no longer reconcile with itself. Originally: Rows
skipped for unmapped categories or missing FX still shift the derived opening
balance unless `imported` is computed identically — verify against the
verification gate before cutover.

**H18 · `.gitignore` data patterns are root-anchored. Fixed.** The patterns are
un-anchored (`receipts/`, `backups/`, `data/`, `exports/`) so they match where
the application actually writes rather than where someone imagined it would, and
`*.xls`/`*.xlsx`/`*.csv`/`*.ofx`/`*.qif`/`*.mt940` are ignored in any directory
with a negation for documentation fixtures. Verified: nothing matching those
patterns has ever been committed. Originally —  `apps/api/receipts/`,
`docker/backups/`, `*.xlsx` and `*.csv` are **not ignored**, in a public
Apache-2.0 repo whose README asserts it contains no financial data.

**H19 · `pg_dump` carries no roles or grants. Resolved** — the restore runbook
(`architecture/05-deployment.md`) makes re-applying `0005` step 3 and
`verify_t1()` step 4, before the API is pointed at the restored database. The
drill's old "rows verified" could not catch this; `verify_t1()` can.  A DR restore returns the data and
silently drops T1 — and the drill logs "rows verified", which cannot catch it.

**H20 · Three worked examples in the spec do not compute. Fixed.**
`50 × (4.3120 − 4.2810) = 1.55`, printed as `15,50` — a 10× error in S14's
spread. `62.40 × 4.0231 = 251.04`, printed as `251,05` in five places. And
§6.6's two derived totals implied *different* rates (4.298874 vs 4.320000) while
being described as derived from one. These are the figures an implementer
unit-tests against.

**H21 · `fx_rates.rate` and `transactions.fx_rate` are reciprocals, both named
`rate`. Resolved** — `computations.md` §4 pins both directions explicitly and
names the collision as a known hazard rather than leaving it to be rediscovered.
 §7.0's display formula joined against the only row that exists is off
by `3.7556²` — **14.1×**. `RateEditor`'s own mock writes `RUB → 0,0104`, which is
USD-per-RUB into a column wanting RUB-per-USD: **9 246× over**, and §7.6
guarantees a manual rate is never overwritten.

**H22 · `to_fx_rate` semantics are unpinned, and the obvious reading makes the
spread exactly zero. Fixed** — §7.5 now pins it as the **reference** rate, in the
same pivot-per-unit direction as `fx_rate`, with the realized rate derived at
read time and never stored. `computations.md` §4a writes the margin formula down
with a worked example.

The defect's own analysis was the argument for it: storing the *realized* rate
makes the two legs net to 0.00, erasing the bank margin that §7.0 says cannot
vanish, and only the reference rate reproduces the 6,30 zł three documents quote.
The feature would have reported nothing while appearing to work.

**H23 · The FX upsert has no source ranking. Fixed** — sources are ranked `manual > published > carried_forward` and a write only lands if it does not lower the rank; equal rank still refreshes so a corrected publication applies. Verified on all three cases. Originally: `setWhere` protects `manual` and
nothing else, so a `carried_forward` fill can overwrite a published quote and
then report the day as a weekend gap.

**H24 · The nearest-rate fallback is unbounded and non-deterministic. Fixed** — `MAX_CARRY_DAYS` bounds the carry, and beyond it nothing is written so the rate is visibly absent rather than silently wrong. Originally: No date
window, and no tiebreak on equidistant dates — so a 2025 GEL row takes a 2020
rate (18.4% understated), and two runs of an importer whose headline property is
idempotence can produce different `amount_pivot` values.

**H25 · `fillForward` cannot carry across a run boundary. Fixed** — alongside H24, in the same bounded-carry work. Originally: `last` is seeded only
from the current fetch, never from the database, so every weekend foreground
sync writes nothing and punches a hole that then falls through to H24.

**H26 · Opening balances carry no rate, no pivot, and a date one day before FX
coverage begins. Resolved, and the premise is half right.**

The daily drift is **correct and intended.** `balance(a)` is computed in the
account's own currency (`computations.md` §2) and a *balance* converts at today's
rate by definition (§4) — what a USD account is worth in PLN genuinely does
change every day. §7.0 eliminates a *reporting* currency, not the fact that
holding foreign currency is a position. A net worth that did not move with rates
would be the defect.

What the entry is right about is narrower and sharper: after §8.0 imports only
income, the opening balance holds nearly all the value **and is a derived plug**
rather than an observation. It inherits every weakness of the derivation that
produced it, which is exactly C13 — and it is why the 52 balances have to be
typed off the Money Manager UI rather than computed. The rate was never the
problem; the plug was.

No stored rate is needed, then, and the date preceding FX coverage is harmless
because nothing converts an opening balance at its own date.

**H27 · There is no allocation primitive. Resolved** — `computations.md` §8 specifies largest-remainder allocation, so a 185,00 three-way split distributes the last minor unit deterministically instead of stranding it. Originally: `mul` is the only tool, so a 185,00
three-way split leaves 0,01 in the clearing account — permanently tripping §6.4's
trend-to-zero invariant, in the same sign direction, every time.

**H28 · `ZDO_TYPE` is compared as a string in Python and a number in SQL. Resolved by evidence** — the probe reports `typeof(ZDO_TYPE)` as `text` for all 7 874 rows, and now fails the run if any row is `integer`. Originally: If
Core Data returns an integer, `SIGN.get(1)` is `None` and **every** balance
computes to 0.00 — while the income query still matches, because SQLite applies
numeric affinity. The gate from C13 then passes `0 == 0`.

**H29 · `ownership = 'shared' if name == 'family budget'` matches zero
accounts. Resolved by evidence** — the probe reports exactly **1** matching
account in `<backup>.mmbak`, and it is now a checked assumption rather
than an assumed one: `probe.py` §4 fails the run if the count is zero.  No such account exists — `Family budget` is an old *category*
(TAXONOMY §4.1); the shared money is in `Household · USD`. So §6.7 migrates as a
no-op and `DualTotal` prints the same figure twice.

**H30 · `.abs()` turns a negative income row positive. Resolved by evidence** — the probe reports **0** negative income rows, and fails the run if any appear in a later export. Originally:, and the opening-balance
plug absorbs the swing — so a −250 correction reconciles perfectly while
earnings read +250, a 500 error in the one figure §8.0 exists to preserve.

**H31 · An unknown currency silently deletes an account and all its income. Fixed** — it now throws. Skipping the account dropped every row referencing it, and the opening-balance plug then absorbed the difference so the gate still reconciled: a wrong balance that looked right. An unseeded currency is a seeding bug, and the probe already reports the seven currencies actually in use. Originally:,
with no warning and no counter on the `!accountId` path.

---

## M · Cannot be implemented from the spec

The completeness review found 15; the others added 9. **All of them are now
closed**, mostly by `computations.md` — which exists because of this section —
and by migrations `0004` and `0009`. Each is struck through with where it was
answered, so the reasoning stays attached to the complaint that produced it.

- ~~**A settlement in another currency has nowhere to record which balance it
  discharged.**~~ **Fixed in `0004`** — `debt_currency` + `debt_amount`, with a
  CHECK that both are present or neither.
- ~~**`spend_by_category` has three undecided forks**~~ **Decided in
  `computations.md` §6** — two `UNION ALL` branches rather than a `LEFT JOIN` with
  `COALESCE`, which would count a four-line transaction four times; the
  shared-boundary net line is reported separately because it has no category by
  constraint; capital is excluded from every comparison, trend and target.
- ~~**Nothing triggers `materialize_occurrence`**~~ **Decided: materialization is
  manual**, and the contradiction is settled in favour of S21. `computations.md`
  §10 and §14.4: the calendar projects, you post. A rule that could post silently
  would have to resolve the hand-entered-duplicate ambiguity without you, and it
  has no basis on which to — hence **Link** rather than **Post** when an unlinked
  row matches within ±3 days and 3%.
- ~~**J8's allocation step has no screen and no operation**~~ **Fixed** —
  `computations.md` §8 specifies FIFO consumption with largest-remainder
  allocation, so a three-way split of 185,00 distributes the final minor unit
  deterministically instead of stranding 0,01 in the clearing account forever.
- ~~**`Mine` is two different sets**~~ **Resolved in `computations.md` §3** —
  they are two different *things*. `mine` is a balance-level sum over
  `ownership = 'own'` and includes business accounts; the scope partition is a
  transaction-level filter. A balance cannot be partitioned by a transaction flag,
  because one account's balance is composed of rows on both sides of it — which is
  why **`DualTotal` is scope-invariant**.
- ~~**Cross-currency transfer detection cannot work as written**~~ **Fixed in
  `computations.md` §9** — matched on ±3 days with a ±3% tolerance against the
  reference rate, never on equal magnitude. The realized rate then comes from the
  two stored amounts (§7.5).
- ~~**Duplicate detection has no window and no tolerance**~~ **Fixed** — ±3 days,
  ±3% cross-currency, defined once in `computations.md` §9 and now applied
  server-side on commit for *every* path rather than inside the import pipeline
  (H14), so the three call sites cannot drift.
- ~~**Confidence has no defined origin**~~ **Fixed in `computations.md` §14** —
  retrieval *agreement* among the k neighbours, not a number the model reports
  about itself, which injected text could steer. `import_rows.model_id` records
  which model answered, so a threshold stays interpretable across a config
  change.
- ~~**Targets have no operations, no widget, no screen, and no progress rule.**~~
  **Fixed, in two passes — the first was incomplete and claimed otherwise.**
  `computations.md` §11 defines progress as period-to-date and the four
  operations are in the registry; the **widget and the settings surface were
  still missing** while this entry said the item was closed. §14.5's catalogue
  now carries `targets`, and S24's widget config is the *"one settings row"*
  §14.7 asked for — a target is one number against one category for one period
  and does not earn a screen. Deliberately **not** envelope budgets (N7): no rollover, no
  allocation, and going over is information rather than an error.
- ~~**Ageing has no anchor date**~~ **Resolved in `computations.md` §8 and S12**
  — FIFO from the oldest open row, **companies only** (O15), and the label states
  *old* rather than *overdue* because without a due date that is all it can
  honestly mean. A 60-days-overdue badge on a friend's share of dinner is
  absurd.
- ~~**`spent`, `net`, `business share` and `revenue_ytd` are undefined**~~
  **Fixed in `computations.md` §12.** `revenue_ytd` reads `tax_ledger` filtered to
  income — under ryczałt there is no cost side (§13.6), so including business
  expenses was both wrong and meaningless.
- ~~**`FX Cost` totals by institution, and no entity carries an institution.**~~
  **Fixed in `0004`** — `account_groups.institution`.
- ~~**The margin formula is never written down**~~ **Fixed** — §7.5 and
  `computations.md` §4a, with a worked example, and `to_fx_rate` pinned as the
  *reference* rate so the margin is not identically zero (H22).
- ~~**Search has no matching semantics**~~ **Fixed in `computations.md` §13** —
  `pg_trgm` rather than `tsvector`, precisely because no single text-search
  configuration stems English, Polish and Russian, and the corpus is all three
  in the same account and often the same month.
- ~~**`tax_period_locks` cannot represent a period spanning a scheme change**~~
  **Fixed in `0004`** — one lock row **per scheme**, and the table is append-only
  with `reopened_at`, because reopening is audited and a mutable column stores a
  state rather than a history.
- ~~**`tax_residency` has no gap or overlap constraint**~~ — **Fixed in `0009`.**
  Overlaps are refused by an `EXCLUDE USING gist` constraint over
  `daterange(valid_from, valid_to, '[)')`, so abutting periods are legal and
  overlapping ones are not. Gaps are **permitted and reported**
  (`tax_residency_gaps`, `verify_residency_covers`), because being between
  residencies is a real state and refusing it would make the honest case
  unrepresentable — while a transaction dated inside a gap has no jurisdiction
  and silently produces an incomplete tax figure.
- ~~**Which NBP rate values a EUR invoice for a PL filing is unspecified**~~ —
  **Fixed in §13.6 and `0009`.** The average NBP rate from the **last working day
  preceding** the day the revenue arose, stamped per row as `tax_fx_rate` /
  `tax_fx_date` / `tax_fx_source` so a later correction cannot reprice a filed
  period. The general §7 path was actively wrong here: triangulating through the
  USD pivot produces a cross-rate NBP never published.

---

## L · Performance, and three attacks that did not land

Load findings were mostly **not** where §15 expects. The honest summary:

- **`fx_rates` growth is a non-issue** — ~34 000 rows at year 10, and the PK is
  exactly the right shape. **Per-row FX conversion is not the bottleneck** either
  (~28 ms for 8 000 rows). **age encryption is not a CPU concern.** All three
  attack lines were checked and dismissed rather than padded.
- **The real cost is fan-out**: S01 issues seven independent scans, serializing
  to 300–600 ms on two effective cores. One `dashboard_snapshot` CTE fixes it.
  **Still to build** — it is an implementation task with a known shape, and the
  800 ms dashboard budget in `architecture/06-quality-attributes.md` is what it
  has to satisfy.
- ~~**No index is partial on `deleted_at`**~~ **Fixed in `0004`** —
  `transactions_date_live` carries the predicate and `INCLUDE`s the columns the
  aggregates read, so scans are index-only.
- ~~**The transfer destination leg has no date index**~~ **Fixed in `0004`** —
  `transactions_to_account_date`, also partial on `deleted_at`.
- **The FX backfill has no pacing and no resume**, and discards the whole run on
  one failure — which is precisely how GEL ended at 11 of 2 080 days.
- **`docker-compose.yml` is 25 lines, postgres only, stock-tuned**, against a §15
  row that describes tuning for four services. **Still true, and now scheduled** —
  `architecture/05-deployment.md` fixes the boot order, the one-shot `migrate`
  service, the two database roles and the per-container memory budget; the
  compose file catches up in Phase 0.5 and Phase 7.
- **`maintainVisibleContentPosition` does not exist on React Native Web**, so
  backwards calendar scroll will jump the viewport.

---

## What this changes about the plan

**~~Authentication appears in no phase.~~ Fixed — Phase 0.5 exists.** §5.2
specified it; §16's eight phases did not deliver it, and §15.1's four test layers
did not cover it, so Phase 1 would have shipped an API over five years of real
data roughly thirteen weeks before Tailscale landed. `build-order.md` now puts
auth and perimeter before any listener binds, and before the importer runs — and
it is a prerequisite for T1 regardless, since a superuser bypasses every `GRANT`.
This was the single most consequential scheduling finding in the review.

**~~Three sections are load-bearing far beyond their length.~~ All three are now
written to that depth.** §14.3 (offline) was four table rows and three bullets
that eleven screens each read differently — it is now
`architecture/08-offline-and-concurrency.md`, which closes the eight H-class
defects that lived in the gap. §13.1's guarantee had no DDL and is now migration
`0005` plus `verify_t1()`. §11.2's gate was per-operation against a per-field
boundary and is now evaluated per field.

**~~Migration must not be rehearsed until C13 and C14 are settled.~~ C14 is
settled; C13 needs an hour of typing.** The probe ran: **Reading A confirmed at
100%**, so the transfer semantics are verified and the 52 destination balances
are computed correctly. It also surfaced C18 — 173 debt reassignments that net to
zero and were invisible to every check in the system.

C13 remains the one open input. The gate still needs 52 balances typed off the
Money Manager UI, and two substitutes were tried and rejected:
`ZASSET.ZLEFTMONEY` is `0.00` on all 52 accounts, and the bank statements cover
2 accounts over 4 months — enough to corroborate the sign map, not to gate five
years.

And the bank check changed what the gate is *for* (C19): it measures **fidelity**,
never **completeness**. 169 of 246 real transactions on `Bank A · PLN` are not in
Money Manager at all. The ledger is faithful and partial, no balance check can
see that, and it is why the statement sync tooling is permanent rather than a
migration step.

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
