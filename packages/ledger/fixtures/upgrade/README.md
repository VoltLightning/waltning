# Upgrade fixtures

A fixture is data at a version, never a schema: `replica-v<N>.sql` and
`outbox-v<N>.sql` are `PRAGMA user_version = …;` followed by the `INSERT`
statements a populated ledger held, in `sqlite_master` and `rowid` order so the
file is byte-identical across runs of the same seed script.
`upgrade.journey.test.ts` loads one by running `REPLICA_MIGRATIONS` (or
`OUTBOX_MIGRATIONS`) up to `N` — which builds every table from the DDL, nothing
here does — then executing the SQL, then opening the result through
`createLocalLedgerSession` exactly as an installed app relaunching would.

**`N` is the replica's version, in both filenames.** The two chains carry their
own numbers and always will: the replica gains a version whenever a table
changes, while the outbox's shape barely moves (`architecture/08` item 2). So
`outbox-v9.sql` is not "the outbox at version 9" — it is the outbox as it stood
in the build whose replica was at 9. One installed app, one snapshot, one name;
each file still states its own store's version on its first line, which
`dumpDatabase` reads out of the database rather than being told.

To add a fixture for a new version, extend `tools/dump-fixture.ts`'s seed step
with whatever the new migration needs to exercise, then run `pnpm --filter
@waltning/ledger fixture:dump` and commit the two `.sql` files it writes.
**Every PR that adds a migration adds the fixture for the version it leaves
behind** — an upgrade chain is only proven by a database that actually sat at
the version before it, and a chain with a version nobody ever dumped is a chain
nobody has upgraded from.

`v8` is the database this repository shipped before `0008_schema` rebuilt
`transactions` for the debt columns, and it is the pair with teeth: loading it
runs a real step against real rows, across a table rebuild, with two
counterparties whose names fold to one (`Łukasz Placeholder` and `łukasz
placeholder`, the second archived by the merge the fixture also carries). `v9`
is the current head, so its upgrade is a no-op — what it catches is drift: a
`fixture:dump` that stops producing what is committed here.
