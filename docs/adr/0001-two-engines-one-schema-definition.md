# Two database engines, one schema definition

**Status:** accepted · 2026-08-20

The phone must hold the whole ledger and work with no network
(`architecture/14`), which means a database on the device — and the device
database cannot be Postgres. We keep **Postgres authoritative on the server and
SQLite on the phone**, bound by one rule: *Postgres adds power around the shared
tables — views, triggers, roles, server-only tables — never inside them.* About
thirteen tables are shared and identical in row type across both engines;
everything else, including every tax table, is server-only and therefore cannot
diverge at all.

## Why not one engine

**SQLite everywhere** is genuinely attractive — one dialect, one migration set,
no Postgres container, tests without Docker, backup by file copy, and a Pi that
is single-user anyway so Postgres's concurrency goes unused. It was rejected for
three costs, one of which is the product's headline guarantee:

- **T1 tax isolation has no mechanism.** SQLite has no users, roles or grants.
  The guarantee that a personal expense *cannot reach* a tax export is twelve
  `GRANT`/`REVOKE` lines and a view; under SQLite it degrades to "the `WHERE`
  clause was right."
- **No exact decimal type.** `numeric(20,8)` becomes TEXT, so the generated
  pivot columns — which multiply two decimals — cannot exist, and arithmetic
  leaves SQL entirely.
- **`EXCLUDE USING gist` and deferred constraint triggers** become
  application-level overlap queries, which is the thing this design exists to
  avoid.

**Postgres everywhere** would need an embedded Postgres on iOS. Even granting
one, its roles would be theatre — see below.

## The fact that actually decided it

**T1 is not portable in principle, not merely in practice.** It works because
the export runs as a *separate OS process holding a connection string it cannot
change* (`EXPORT_DATABASE_URL` reaches `tax_ledger` and nothing else). On a
phone, one app process owns the file and every credential in it, so there is no
adversary a role would exclude. Changing engines would not have helped. This is
the same reason `architecture/14` separates **complete** from **authoritative**:
the phone can hold everything and still not be where the guarantees live.

## Consequences

- `transactions.amount_pivot` and `to_amount_pivot` stop being stored generated
  columns and move onto a `transactions_valued` view, so the base table is the
  same concept in both engines. `computations.md`'s formulae are unchanged.
- Three packages: `packages/schema` (neutral definitions and the dialect kit),
  `packages/db` (Postgres kit plus server-only objects), `packages/ledger`
  (SQLite kit plus the phone's queries, outbox and migrator).
- **Two implementations of every class-F figure** — SQL on the server, `money.ts`
  on the phone — held together by a differential test over one fixture, equal to
  eight decimal places.
- Divergence must be unable to *reach a commit*, not merely detectable
  afterwards. Whether that is one definition over a column kit or two
  definitions under a compile-time row-type assertion is unsettled; a spike on
  `transactions` and `currencies` decides it.
- Brick 1 accepts weaker enforcement than Brick 2, stated rather than hidden:
  the phone mirrors every invariant SQLite can express, and role grants and
  cross-table triggers stay on the server. The Brick 1 → Brick 2 migration is
  therefore **validate-then-apply**, never a straight replay.
