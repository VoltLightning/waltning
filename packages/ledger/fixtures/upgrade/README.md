# Upgrade fixtures

A fixture is data at a version, never a schema: `replica-v<N>.sql` and
`outbox-v<N>.sql` are `PRAGMA user_version = …;` followed by the `INSERT`
statements a populated ledger held, in `sqlite_master` and `rowid` order so the
file is byte-identical across runs of the same seed script.
`upgrade.journey.test.ts` loads one by running the real migrator
(`migrateReplica` / `migrateOutbox`) over an empty file with the chain cut at
that store's own version — which builds every table from the DDL, and writes
the `__ledger_migrations` rows an installed app at that version would hold,
because nothing here does either — then executing the SQL, then opening the
result through `createLocalLedgerSession` exactly as an installed app
relaunching would.

**`N` is the replica's version, in both filenames.** The two chains carry their
own numbers and always will: the replica gains a version whenever a table
changes, while the outbox's shape barely moves (`architecture/08` item 2). So
`outbox-v9.sql` is not "the outbox at version 9" — it is the outbox as it stood
in the build whose replica was at 9. One installed app, one snapshot, one name.

**Each file states its own store's version on its first line, and that is the
number the loader uses.** `dumpDatabase` reads it out of the database rather
than being told, and `upgrade.journey.test.ts` reads it back — so the outbox
chain is cut at the outbox's version, not at the replica's. Cutting both at the
filename's number is what made the outbox always build to head: its chain ends
at 2 and every filename carries a number well above that, so every outbox step
there has ever been passed the filter and no fixture could exercise an outbox
migration at all.

**The migrator's own journal is not in these files.** It is the chain's record
of itself — which steps ran, and what their statements hashed to — so the
migrator that builds a fixture's tables writes it, exactly as on a device.
Carrying a copy in the `INSERT`s would restate a fact the chain already makes,
and `applied_at` is a clock reading, which is the one thing a byte-identical
dump cannot hold.

## Adding one

**Dump the fixture *before* you add the migration.** `pnpm --filter
@waltning/ledger fixture:dump` writes whatever the chain's head is when it
runs, and the pair worth committing is the one the branch is about to leave
behind: extend `tools/dump-fixture.ts`'s seed step with whatever the new
migration will need to exercise, run the dump, commit the two `.sql` files —
then add the migration. **Every PR that adds a migration adds the fixture for
the version it leaves behind**: an upgrade chain is only proven by a database
that actually sat at the version before it, and a chain with a version nobody
ever dumped is a chain nobody has upgraded from.

If a fixture that should exist does not, import `dumpFixture` from
`tools/dump-fixture.ts` and call it with `{ replicaThrough: "<tag>" }`: it
seeds against a chain cut at that step and dumps the pair at that version — a
real database that really sat there, never a head dump with its `PRAGMA` line
edited. `replica-v8` was produced that way (`replicaThrough: "0007_schema"`),
and re-running it reproduces the committed bytes.

(`tools/dump-fixture.cli.ts` is the three-line entry point `fixture:dump` runs,
separate so that importing `dumpFixture` for an older pair does not also
rewrite the head pair.)

`v8` is the database this repository shipped before `0008_schema` rebuilt
`transactions` for the debt columns, and it is the pair with teeth: loading it
runs a real step against real rows, across a table rebuild, with two
counterparties whose names fold to one (`Łukasz Placeholder` and `łukasz
placeholder`, the second archived by the merge the fixture also carries).
`v10` predates `0010_schema` (`SPEC.md` §14.4b's brand columns), so it is a
second pair with teeth for the identical reason `v8` is — a real rebuild
against real rows, not a synthetic one — and it is what catches the mistake a
generated rebuild invites: an `INSERT … SELECT` naming columns the
pre-rebuild table does not have yet, which only fails when real rows are
there to copy. **`v11` is the current
head**, so its upgrade is a no-op — what it catches is drift: a
`fixture:dump` that stops producing what is committed here. Whichever pair is
named here stops being "the current head, so its upgrade is a no-op" the
moment a later migration lands; `pnpm --filter @waltning/ledger fixture:dump`
is what a PR adding one runs to leave the next PR an honest head pair again.
This line and `upgrade.journey.test.ts`'s own header comment are the two
hand-maintained places that name versions, and both go stale exactly this way
when a PR skips that step.
