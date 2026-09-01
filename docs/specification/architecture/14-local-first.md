# 14 · Local-first, and what that does not mean

**The phone is a complete finance app. The server admits every write.**

Those two sentences are the whole design, and holding them together is the
point. An earlier exploration collapsed them — "the phone is complete, so the
phone is authoritative" — and five independent adversarial reviews took it
apart, all landing on one root cause: **the guarantees this ledger depends on
live in Postgres, and SQLite cannot host them.** Closed periods, T1 tax
isolation, split-line sums, one-pivot, FX validity — every one is a trigger, a
`CHECK`, an `EXCLUDE`, or a role grant. Making the phone the record of truth
moves the record to the one place the guarantees cannot hold.

So this document draws the line the rest of the specification now depends on.

## 14.0 Complete is not authoritative

Two properties that were conflated, now separated:

| | Means | Where it lives |
|---|---|---|
| **Complete** | Holds the whole ledger, reads and captures offline, feels autonomous | The phone |
| **Authoritative** | Admits writes, is the record of truth, hosts the guarantees | The server |

The phone is **complete and not authoritative.** It holds every transaction,
computes every figure it can locally, and captures into an outbox — but a write
is one-way *intent*, replayed to the server, which admits it or refuses it. There
is no second writer of record and therefore no bidirectional merge.

This is not a retreat to a thin client. The phone held a **400-row window**
before; it now holds the **whole ledger** (~8,000 rows, single-digit
megabytes). That one change is what makes it feel autonomous — the window was the
only reason it ever needed the server to answer a question. Reads are local;
history is complete; nothing daily needs a network.

## 14.1 With and without a backend

Both configurations are complete products; the backend changes authority and
durability rather than deciding whether the phone works:

- **With no backend, the phone stands alone.** It is a complete finance app:
  whole ledger, offline indefinitely, scales to any screen. **A write records
  its intent in the outbox and materialises into the local tables** — it does
  not sit in a queue waiting to become real. That is two commits and not one, in
  that order, because the two stores are separate files and SQLite offers no
  transaction across both; §14.6 carries the ordering and what closes the
  window it leaves open.
  Durability is an **app-owned encrypted export** (§14.3). Tax figures are
  read-only *estimates*, labelled as such —
  filing-grade tax needs the server, because T1 is a Postgres role and has no
  device equivalent.

  A queue-only phone would capture into the outbox and fold that queue over the
  replica on every read. That works while the queue is a handful of entries
  awaiting a drain. **With no server the outbox never drains**, so every
  transaction ever entered would stay unacknowledged and every read would fold
  five years of log onto an empty base. See §14.6.

  A build with the disposable preview profile configures and contacts no
  backend. Its outbox is invisible local intent, not a user-facing sync state.
  That profile's reset deletes both the materialised ledger and that intent;
  builds without the profile expose no destructive reset.
- **Once a backend exists, over Tailscale, it becomes the writer of record and
  durable copy.** The phone's outbox drains into it; the phone is a *complete
  replica plus outbox*. Filing-grade tax, continuous backup, and the heavy work
  (import, classification, FX, scheduled analysis) are available there.
  Adding it is a **one-time seed-from-phone migration**, not a merge — and the
  migration is **validate-then-apply**: a dry run reports every row Postgres
  would refuse before anything is written. A straight replay of five years of
  phone-authored history into a database that may refuse some of it is a
  migration that fails halfway through the ledger.
- **The web dashboard requires the backend.** It is full read/write because the
  backend is the writer of record. No contradiction: the dashboard writes
  because the backend admits writes.

**The honest cost:** durability is not optional. The phone's self-backup is real
but weaker; once a backend exists, durability stops being solely the owner's
job.

## 14.2 Conflicts: version, never clock

A write does not race a wall clock. It carries **the version it last read** —
`version`, a `bigint` the database advances on every update — and the server
asks a single question: *did this field change under you since you read it?*

**Why a column and not `updated_at`.** The token is compared for *equality* and
must never be ranked, and a timestamp answers the right question while inviting
the wrong one: two rows' `updated_at` **can** be ordered, so eventually someone
orders them. A bigint cannot be misread as a time. The database sets it from
`OLD.version`, never from the payload, so a client carries a version back and
cannot mint one. `updated_at` survives beside it for display — "last edited" is
the job it is actually good at — and now advances, which for five tables it
never did.

**`version` is the gate, not the answer.** It is per *row*, and the question
above is per *field*. A row counter can only say that something moved, so on its
own it collides disjoint edits: a laptop fixing a payee bumps the row, and a
phone's queued `category` edit then arrives "stale" and is reported as a
conflict this section promises to merge. On a tax-sensitive field it is worse
than a misfire — `08`'s H16 **blocks** a stale tax-sensitive field, so a payee
typo corrected elsewhere permanently blocks an unrelated queued edit while
reporting that another device changed `is_business`. Nothing did.

So **a write carries the prior value of every field it sets**, and the server
compares field by field — plain compare-and-swap, which answers the question
literally. `version` stays as the fast path: equal versions mean nothing moved
and the per-field work is skipped entirely. The failure it replaces was
one-directional and therefore safe — every update bumps the version, so the old
check manufactured conflicts and never missed one — and the replacement keeps
that property.

Deriving the changed fields from `audit_log` was considered and rejected. It
stores `before` and `after` and could answer this, but it has no `version` to
correlate against, and it would make conflict detection depend on the audit
trail being complete forever: a prune would silently turn conflicts into
merges, which is the direction that loses data.

- **No** → the write lands.
- **Yes** → it is a real conflict, and the server records the *detection* —
  an `audit_log` row carrying both values, written at the moment it refused.
  That, not the resolution, is what satisfies "nothing is silently lost":
  choosing *theirs* sends no write at all, so a detection row with no following
  update is the whole record of the discard. A same-field divergence follows a setting —
  *latest applied wins* or *ask* — and the **tax-sensitive set always asks**
  (`is_business`, `ryczalt_rate`, `ryczalt_activity`, `counterparty_tax_id`,
  `date`, `accounts.ownership`, `currencies.is_pivot`).

**Why not "latest timestamp wins":** a phone offline for nine days lands an edit
older than a correction another device already synced, and "latest" — meaning
whichever reached the server last — silently overwrites the newer value. This is
the clock-merge `08` spends a section refusing. Comparing versions cannot lose a
newer edit to an older one.

Different fields on the two sides merge with no prompt. **Non-independent fields
are not independent conflicts** — split lines sync as a unit with their parent,
and the four faces of a transfer (`amount_original`, `to_amount`, `fx_rate`,
`to_fx_rate`, two of which feed generated columns) are one field for this
purpose, or a merge produces a plausible wrong number that neither device held.

## 14.3 Durability with and without a backend

- **With no backend:** an app-owned, age-encrypted export the owner controls,
  with **one vendor never holding both halves.** On iOS the key lives in **iCloud Keychain**
  (Apple's HSM-backed escrow, which Apple cannot read) and the ciphertext goes
  somewhere Apple is **not** — a Mac, a NAS, later the backend; that is a stated
  dependency on Apple, not a hidden one, and it is the honest version of "your
  data, your phone, back it up yourself." On Android **the escrow half is
  unsettled** (`SPEC.md` §5.7): a Keystore key is non-exportable, so an export
  keyed from it cannot outlive the device the export existed to outlive, and
  until something else is named the owner holds the key themselves.
- **Once a backend exists:** the server is the durable copy — `pg_dump`,
  age-encrypted, offsite, with a restore drill. This is the existing design and
  it is unchanged.

## 14.4 What this document changes elsewhere

Alignment work, so no surface still describes the collapsed design:

- **The replica holds the whole ledger.** No 400-row window, no day-aggregate
  tier as a size compromise, **no eviction, no replica TTL as a deletion of the
  record.** A phone that has met a backend keeps a complete copy; the TTL that
  dropped it is deleted, not re-tuned.
- **The phone is complete but its writes are still one-way intent.** The outbox,
  idempotency ledger, `seq` ordering and upcasters (`08`) are unchanged and
  vindicated — they were always the right model.
- **Web-only screens are wide, not web.** Screens marked web-only for
  *information density* stay dense; the phone renders them when given the screen
  (RN Web, DeX, an iPad). "Web-only" that meant "needs a browser" becomes "needs
  the width."
- **The database is unreadable on a locked phone, and each platform gets there
  its own way.** On iOS that is file protection class A, not AFU — the key is
  evicted on lock, and nothing needs the database while the phone is locked.
  Android offers no such class: credential-encrypted storage there is
  AFU-equivalent from first unlock until reboot, so the same requirement can only
  be met by encrypting the database itself. `SPEC.md` §5.7 settles the iOS half
  and leaves the Android one open, which is the one place the two phones reach
  different conclusions rather than the same one twice.

## 14.5 What held, and stays

The outbox and idempotency model, the F/R/S discipline (now simpler — the phone
holds enough to compute more locally), caller-free reference-rate resolution,
T1 as a role grant on the server, passkeys as the perimeter, and "no forwarded
port in any mode." The reframe is a *correction of scope*, not a new
architecture: it enlarges the replica, separates complete from authoritative,
and deletes the mechanisms that only made sense for a cache.

---

## 14.6 The write path, with and without a backend

**The phone always materialises. Whether a backend exists decides whether that
materialisation is provisional.**

- **With no backend** — final. Nothing will ever correct it, because there is
  nothing else that writes.
- **Once a backend exists** — provisional until the server admits the write,
  then reconciled to the row the server returns.

**The replica bootstraps with every reference currency, not the pivot alone.**
`accounts.currency` is a foreign key into `currencies`, so the set of rows a
fresh replica holds *is* the set of currencies an account can be opened in — a
single seeded row made the phone single-currency by referential integrity rather
than by any decision. The list is `@waltning/core/currencies`, the same one the
server seeds from, because two lists is how the phone's `USD` and the server's
`USD` start disagreeing about `decimals`, which is arithmetic.

Reference data is bootstrapped, never restored: the insert is
`ON CONFLICT DO NOTHING`, so a later launch does not overwrite a currency
someone has edited.

**The capture caller does not stamp a reference rate.** SQLite still requires a
non-null `fx_rate`, so the local executor resolves the materialisation: exactly
`1` in the pivot currency, or the replica's last-known rate for another
currency. The outbox entry makes that value visibly provisional once a backend
exists; admission replaces the whole row with the date-correct canonical rate.
With no backend the local value is final because there is no second authority.
An explicitly asserted rate — what the bank actually applied — remains part of
the input because no later resolver has better evidence.

**Holding a currency and capturing in it are two different capabilities, and the
second one is gated.** An account can be opened in any currency the replica
holds, and its balance renders at that currency's own scale — that needs no rate
and no network. A *transaction* is different: every row carries a pivot
valuation, so a capture in a non-pivot currency needs either an asserted rate or
an `fx_rates` row, and a phone that has never synced has neither. The executor
refuses rather than valuing the row at `1`, because `1` is a wrong figure that
looks right and nothing downstream would ever question it.

That refusal is correct and it is not yet a product, so it is asked *before* the
write rather than raised from inside it. `readCurrencies` reports `capturable`
per currency — the same three cases `provisionalFxRate` decides, resolved in
advance — and the capture screen declines with the currency named. Letting the
executor refuse instead would throw after the outbox entry had committed, which
on a phone with no backend leaves an entry that drains nowhere: a capture that
is neither recorded nor reported.

Until FX writes land, a phone-alone ledger holds accounts in every currency it
knows and captures into the pivot.

One code path, one flag. This is not a retreat from §14.0: the phone is still
not authoritative, because the server still admits every write and may refuse
one the phone already showed. What changes is that a refusal *corrects* a
visible row rather than *releasing* an invisible one.

**Intent commits first, and it commits alone.** A capture writes to two files —
`outbox.db` and `replica.db`, separate precisely so that a replica refetch can
never touch unsent intent (`SPEC.md` §5.7) — and both run in WAL mode, which
SQLite's own documentation lists this cost against: *"Transactions that involve
changes against multiple ATTACHed databases are atomic for each individual
database, but are not atomic across all databases as a set."* So "both, or
neither" was never on offer. There are two commits, and the only decision left
is which of them goes first.

**The outbox entry does, because it is the half that cannot be reconstructed.**
That is the same property the two files exist for: the outbox holds the only
copy of intent that has not reached a server, while the replica is rebuildable —
from the server plus the outbox once a server exists, or from the outbox alone
when the phone stands alone, because it then holds the ledger's whole history in
replay form. When only one of the two can be made durable first, it has to be the
irreplaceable one.

So the window a crash can open is **an entry whose row is missing, never a row
with no entry** — a list short by one line until the next launch, rather than a
capture that is gone. A read taken inside that window is already specified:
`SPEC.md` §14.3 suppresses the fold adjustment for any entry whose target is not
in the replica and falls back to the bare checkpoint, which is the honestly
incomplete number rather than the confidently wrong one.

**A launch-time reconciler closes it.** The replica carries an `applied_seq`
watermark, advanced in the same transaction as the row it describes — one file,
so *that* pair is genuinely atomic — and on launch every entry above it is
applied locally before anything reads. Replay is safe because the ids are
client-minted (`08`'s H13): the local apply is an upsert keyed on an id the
entry already carries, so twice is once. A refetch resets the watermark to
nothing, which is correct rather than exceptional — a fresh replica holds what
the server holds, and what is still in the outbox is by definition what it does
not.

**The watermark is what keeps this from becoming the fold §14.1 rejects.**
"Replay every unacknowledged entry" is that failure verbatim: with no server the
outbox never drains, so every launch would replay five years of capture over a
replica that already holds all of it. Bounding by `seq` makes the work
proportional to what a crash interrupted — normally nothing, at most the one
write a kill landed in the middle of.

**Rollback-journal mode was the alternative, and it was rejected.** Outside WAL,
`ATTACH` plus SQLite's master journal does give a genuine atomic commit across
both files, and "both, or neither" would be literally true. It costs
reader-during-write concurrency on the device's hot path — capture happens with
a list on screen — and it requires both databases open on one connection, which
is the thing the separation exists to avoid: dropping and refetching the replica
has to be possible without the outbox being attached to anything. Buying
atomicity that way spends the reason the two files are two files.

**Provisional is derived, never stored.** A row is provisional exactly when an
unacknowledged outbox entry names it. A `provisional` column would be a second
place holding one fact, and the two would disagree — the failure this register
has found more times than any other. The lookup is cheap by construction:
materialising is what keeps the outbox small.

**The phone refuses what the server would refuse, at capture time.** Every
invariant SQLite can express is mirrored into the local schema — foreign keys,
`CHECK`s, the split-line sum, one-pivot as a partial unique index — so a bad row
is rejected while the person who typed it is still looking at it, rather than
days later as a `blocked` outbox entry. What has no device equivalent is stated
rather than approximated: **role grants (T1) and cross-table triggers stay on
the server.** T1 in particular is not portable *in principle* — it works because
the export runs as a separate OS process holding a connection string it cannot
change, and on a phone one app process owns the file and every credential in it.
There is no adversary a role would exclude.

**A migration must not be able to destroy the ledger.** With no backend the
phone's database is the only copy, and unlike the server there is nothing to
reset from — no seed, no second copy, no `db:reset`. So every schema migration
copies the file first, runs inside a transaction, and keeps the pre-migration
copy until the app has opened cleanly once. A transaction alone covers an error;
it does not cover a crash, a kill, or a corrupt write, which is the case that
matters when there is no second copy.

---

## 14.7 Two engines, one definition

Postgres is authoritative; the phone runs SQLite. **One engine everywhere was
considered and rejected**, in both directions:

- **SQLite everywhere** buys one dialect, one migration set, no Postgres
  container, tests without Docker, and a backup that is a file copy. It costs
  T1 (SQLite has no users, roles or grants — there is no mechanism), exact
  decimal money (`numeric(20,8)` becomes TEXT, so the generated pivot columns
  cannot exist), and the `EXCLUDE`/deferred constructs, which become
  application-level overlap queries — the thing the design exists to avoid.
- **Postgres everywhere** would need an embedded Postgres on iOS. Even granting
  one, the roles it brought would be theatre for the reason above.

So the divergence is bounded instead of eliminated, along one rule:

> **Postgres adds power *around* the shared tables — views, triggers, roles,
> server-only tables — never *inside* them.**

The immediate consequence: `transactions.amount_pivot` and `to_amount_pivot`
stop being stored generated columns and become columns on a
`transactions_valued` view. `computations.md`'s formulae are unchanged — only
where the multiplication happens moved. The base table is then the same concept
in both engines.

**One tax view reads it, not two.** This said *"the two tax views"*; when it was
built, exactly one — `tax_ledger` — selected a pivot column. `tax_unvalued_revenue`
and `tax_omission_candidates` need neither, and pointing them at the valued view
would add a dependency to buy nothing.

**The view is not materialised.** A stored generated column was consistent by
construction; a materialised view is consistent only as often as someone
refreshes it, and the most-read number in the system is the worst place to open
a staleness window. `STORED` bought disk, not correctness.

**Adding it made `verify_t1()` narrower than the guarantee it names**, which is
worth recording because it is the shape of the risk rather than a one-off. Check
(b) asserted only that `waltning_export` cannot read the *base table* — so the
first new view over `transactions` since T1 was written would have passed while
handing the export role a complete unfiltered ledger. The check is an
**enumeration** now: the set of relations that role may read must be exactly
`{tax_ledger}`, which survives the next view somebody adds.

**Roughly thirteen tables are shared** — `accounts` `account_groups`
`categories` `counterparties` `currencies` `fx_rates` `transactions`
`transaction_lines` `tags` `transaction_tags` `recurring_transactions`
`dashboard_layouts` `dashboard_widgets`. Everything else is server-only: all
seven tax tables, all five agent tables, `audit_log`, import, `receipts`,
`outbox_receipts`, and the two migration artefacts. **Server-only tables cannot
diverge, because there is nothing to diverge from** — which is why moving tax
entirely to the backend removes almost every hard-to-port construct at once: the
`EXCLUDE USING gist` is on `tax_residency`, the twelve GRANT/REVOKE lines are the
`tax_ledger` view, and the closed-period trigger reads `tax_period_locks`.

**Storage types may differ; the row type may not.** Money is `numeric(20,8)` on
Postgres and TEXT on SQLite — and it is a *string end to end* either way, which
the driver already guarantees. The TypeScript row type is therefore identical on
both engines, and that identity is the thing worth pinning.

Where the definition lives:

| Package | Holds |
|---|---|
| `packages/schema` | the neutral table definitions and the dialect kit, and nothing else |
| `packages/db` | the Postgres kit, plus the server-only tables, views, triggers and roles |
| `packages/ledger` | the SQLite kit, plus the phone's queries, outbox and migrator |

**Settled by spike: the tables are written twice, and drift is a compile
error.** A single definition parameterised over a column kit was tried first and
does not work, for a reason that is structural rather than fixable — TypeScript
typechecks a generic function's body against the *constraint*, not against each
instantiation, so inside `function t<K extends Kit>(k: K)` the expression
`k.text` is a union of incompatible signatures and is not callable. Loosening
the constraint until the body compiles is worse: the return type is computed
from the same loose types, `$inferSelect` collapses, and the thing keeps
compiling while proving nothing. It needs higher-kinded types, which the
language does not have.

So `currencies.pg.ts` sits beside `currencies.sqlite.ts`, and
`parity.type-test.ts` asserts — once, mapped over both modules rather than
restated per table — that every shared table's `$inferSelect` **and**
`$inferInsert` are identical. Both are needed: a column missing on one engine
moves both, while a `.default()` on one side only moves `$inferInsert` alone,
because the row type is `string` either way and only the insert becomes
optional. A third assertion pins the *set*, so two modules cannot agree on the
tables they happen to share while each omitting a different one.

What the kit still removes is the part worth removing: the type decisions. That
money is a string on both engines, that a SQLite boolean is an integer in
`boolean` mode, that the conflict token is a `bigint` here and an integer there
— each decided once rather than in thirteen pairs of files. **Divergence cannot
reach a commit**, which was the requirement; "written once" was only ever the
means.

Two implementations of every foldable figure follow from this — SQL on the
server, `money.ts` on the phone — which `computations.md` already implies for
class **F**. They are held together by a **differential test**: one fixture,
every class-F figure computed both ways, asserted equal to all eight decimal
places. That covers the three ways two sums silently disagree — rounding order,
sign convention, and NULL-versus-zero.
