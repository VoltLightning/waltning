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

## 14.1 The bricks

Independent, and each one improves the experience without the next:

- **Brick 1 — the phone alone.** A complete finance app: whole ledger, offline
  indefinitely, scales to any screen. **A write materialises into the local
  tables and records its intent in the outbox** — it does not sit in a queue
  waiting to become real. Durability is an **app-owned encrypted export**
  (§14.4). Tax figures are read-only *estimates*, labelled as such —
  filing-grade tax needs the server, because T1 is a Postgres role and has no
  device equivalent.

  An earlier reading of this document had Brick 1 *only* capturing into an
  outbox, with reads folding the queue over the replica. That works while the
  queue is a handful of entries awaiting a drain. **With no server the outbox
  never drains**, so every transaction ever entered would stay unacknowledged
  and every read would fold five years of log onto an empty base. See §14.6.
- **Brick 2 — add a backend, over Tailscale.** It becomes the writer of record
  and the durable copy. The phone's outbox drains into it; the phone reverts to a
  *complete replica plus outbox*. Filing-grade tax, continuous backup, and the
  heavy work (import, classification, FX, scheduled analysis) arrive together.
  Adding it is a **one-time seed-from-phone migration**, not a merge — and the
  migration is **validate-then-apply**: a dry run reports every row Postgres
  would refuse before anything is written. A straight replay of five years of
  phone-authored history into a database that may refuse some of it is a
  migration that fails halfway through the ledger.
- **Brick 3 — the web dashboard, on the backend.** Full read/write, because the
  backend is the writer of record. No contradiction: the dashboard writes because
  the backend admits writes.

**The honest cost:** durability is not optional. Brick 1's self-backup is real
but weaker; Brick 2 is where durability stops being the owner's job.

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

- **No** → the write lands.
- **Yes** → it is a real conflict. A same-field divergence follows a setting —
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

## 14.3 Durability graduates

- **Brick 1:** an app-owned, age-encrypted export the owner controls. The key
  lives in **iCloud Keychain** (Apple's HSM-backed escrow, which Apple cannot
  read); the ciphertext goes somewhere Apple is **not** — a Mac, a NAS, later the
  backend. **One vendor never holds both halves.** This is a stated dependency on
  Apple, not a hidden one, and it is the honest version of "your data, your
  phone, back it up yourself."
- **Brick 2:** the server is the durable copy — `pg_dump`, age-encrypted, offsite,
  with a restore drill. This is the existing design and it is unchanged.

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
- **File protection is class A**, not AFU — the key is evicted on lock. Nothing
  needs the database while the phone is locked, and `§5.7` already argued for this
  and did not take it.

## 14.5 What held, and stays

The outbox and idempotency model, the F/R/S discipline (now simpler — the phone
holds enough to compute more locally), server-side rate stamping, T1 as a role
grant on the server, passkeys as the perimeter, and "no forwarded port in any
mode." The reframe is a *correction of scope*, not a new architecture: it
enlarges the replica, separates complete from authoritative, and deletes the
mechanisms that only made sense for a cache.

---

## 14.6 The write path, on both bricks

**The phone always materialises. What the brick decides is whether that
materialisation is provisional.**

- **Brick 1** — final. Nothing will ever correct it, because there is nothing
  else that writes.
- **Brick 2** — provisional until the server admits the write, then reconciled
  to the row the server returns.

One code path, one flag. This is not a retreat from §14.0: the phone is still
not authoritative, because the server still admits every write and may refuse
one the phone already showed. What changes is that a refusal *corrects* a
visible row rather than *releasing* an invisible one.

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

**A migration must not be able to destroy the ledger.** On Brick 1 the phone's
database is the only copy, and unlike the server there is nothing to reset from
— no seed, no second copy, no `db:reset`. So every schema migration copies the
file first, runs inside a transaction, and keeps the pre-migration copy until
the app has opened cleanly once. A transaction alone covers an error; it does
not cover a crash, a kill, or a corrupt write, which is the case that matters
when there is no second copy.

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
`transactions_valued` view. The two tax views read from it, and
`computations.md`'s formulae are unchanged. The base table is then the same
concept in both engines.

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

**How the shared set is written is not yet settled.** A single definition
parameterised over a column kit is the goal — add a column once and both engines
get it — but Drizzle's builder types are deep and may not survive the
indirection. A half-day spike on `transactions` and `currencies` decides it. The
fallback, if the types fight back, is the two definitions written side by side
with a compile-time assertion that their row types are identical: the
`contract.types.ts` pattern this repository already uses and already proves by
breaking. **Either way divergence must be unable to reach a commit**, not merely
detectable afterwards.

Two implementations of every foldable figure follow from this — SQL on the
server, `money.ts` on the phone — which `computations.md` already implies for
class **F**. They are held together by a **differential test**: one fixture,
every class-F figure computed both ways, asserted equal to all eight decimal
places. That covers the three ways two sums silently disagree — rounding order,
sign convention, and NULL-versus-zero.
