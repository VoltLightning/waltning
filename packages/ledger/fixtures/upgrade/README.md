# Upgrade fixtures

A fixture is data at a version, never a schema: `replica-v<N>.sql` and
`outbox-v<N>.sql` are `PRAGMA user_version = N;` followed by the `INSERT`
statements a populated ledger held at that version, in `sqlite_master` and
`rowid` order so the file is byte-identical across runs of the same seed
script. `upgrade.journey.test.ts` loads one by running `REPLICA_MIGRATIONS`
(or `OUTBOX_MIGRATIONS`) up to `N` — which builds every table from the DDL,
nothing here does — then executing the SQL, then opening the result through
`createLocalLedgerSession` exactly as an installed app relaunching would.

To add a fixture for a new version, extend `tools/dump-fixture.ts`'s seed
step with whatever the new migration needs to exercise, then run
`pnpm --filter @waltning/ledger fixture:dump` and commit the two `.sql`
files it writes. **Every PR that adds a migration adds the fixture for the
version it leaves behind** — an upgrade chain is only proven by a database
that actually sat at the version before it, and a chain with a version
nobody ever dumped is a chain nobody has upgraded from.
