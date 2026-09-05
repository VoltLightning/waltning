/**
 * Seed a populated ledger through the journey harness, then dump both stores
 * to `fixtures/upgrade/`. Run through `dump-fixture.cli.ts` — `pnpm --filter
 * @waltning/ledger fixture:dump` — which is a separate file for one reason:
 * this one must be importable without writing anything, so a caller after an
 * older pair (below) does not also rewrite the head pair by having imported
 * the module. `packages/ledger` may not name `process`, so "am I the entry
 * point?" is not a question this file can ask itself.
 *
 * See `fixtures/upgrade/README.md` for what a fixture is and when a PR must
 * add a new one. The short version: **dump the fixture before adding the
 * migration**, because this tool writes whatever the chain's head is when it
 * runs, and the pair worth committing is the one an installed app is *leaving
 * behind*.
 *
 * **`dumpFixture`'s `through` options are the escape hatch for a fixture that
 * should already exist and does not** — a chain cut short, so the seeded
 * session stops at an older version and the dump names that version. They
 * take a tag rather than a number, for the same reason the journal does: a
 * tag names a file, a number names only a count. There is no environment
 * variable and no `process.argv` behind them; a caller that wants an older
 * pair passes the parameter. That is how `replica-v8` was produced, and it is
 * why it is a real dump of a database that really sat at 8 rather than a v9
 * dump with its `PRAGMA` line edited.
 *
 * **Every id, date and write order below is fixed, and that is the whole
 * point.** `fixture-dump.ts`'s `dumpDatabase` reads rows back in `rowid`
 * order, which is insertion order — so a deterministic script produces a
 * byte-identical file on every run, and a diff on the committed `.sql` means
 * this file changed, not that a clock ticked.
 *
 * **Two kinds of non-determinism this script has to defeat by hand,
 * because nothing upstream of it offers a seam for either:**
 *
 * - `outbox.id` defaults to `randomId()` (`outbox.ts`) on every write that
 *   goes through `LocalLedgerSession` — there is no parameter to pin it.
 *   Every `createdAt`/`updatedAt`/`mergedAt` column (`k.stamp` in
 *   `packages/schema/src/kit.ts`) defaults to `new Date()` the same way, with
 *   no injection point either. Both are real writes, produced through the
 *   real write path deliberately — this file does not want a second,
 *   hand-rolled way to build a `transactions` row — so the fix runs
 *   afterward: everything is written normally, then the volatile columns are
 *   overwritten to fixed values before dumping. `capturedAt` is the one
 *   exception with a real seam (`Capture.at`), so it is pinned at the source
 *   instead.
 */

import { writeFileSync } from "node:fs";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { FX_SOURCE } from "@waltning/schema/enums";
import Database from "better-sqlite3";
import { asc, eq, sql } from "drizzle-orm";
import { dumpDatabase } from "../src/journeys/fixture-dump.ts";
import { appliedSeq, openJourney } from "../src/journeys/harness.ts";
import {
  ID,
  PIVOT,
  seedAccount,
  seedCounterparty,
  seedCurrency,
  seedRate,
} from "../src/journeys/seed.ts";
import { type Migration, OUTBOX_MIGRATIONS, REPLICA_MIGRATIONS } from "../src/migrate.ts";
import { ledgerSchema } from "../src/schema-map.ts";

const {
  accounts,
  counterparties,
  counterpartyMerges,
  currencies,
  outbox,
  outboxSeq,
  transactions,
} = ledgerSchema;

/** Fixed, so every write's `capturedAt` is the same on every run. */
const CAPTURE = {
  timeZone: "Europe/Warsaw",
  offsetMinutes: 120,
  at: new Date("2026-01-10T09:00:00.000Z"),
};

/** Fixed, for every `createdAt`/`updatedAt`/`mergedAt` this script's writes leave behind. */
const STAMP = new Date("2026-01-01T00:00:00.000Z");

/** Ids `seed.ts`'s own `ID` map does not carry — this fixture's, and only this fixture's. */
const CP_LOWER = id<"counterparties">("55555555-5555-4555-8555-555555555555");
const MERGE_ID = id<"counterpartyMerges">("77777777-7777-4777-8777-777777777777");
const PENDING_TXN_ID = id<"transactions">("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
const PENDING_ENTRY_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

/**
 * Fixed replacements for the three real outbox ids `randomId()` mints along
 * the way — one per session write, assigned in `seq` order.
 */
const FIXED_OUTBOX_IDS = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
];

function dumpFile(path: string): string {
  const sqlite = new Database(path);
  try {
    return dumpDatabase(sqlite);
  } finally {
    sqlite.close();
  }
}

/**
 * The chain to seed against, cut at a tag — every step up to and including it.
 *
 * A tag this chain does not carry is a hard error rather than a silently
 * uncut chain: "dump the fixture for v8" answered with a v9 dump is exactly
 * the hand-edited fixture this parameter exists to stop producing.
 */
function chainThrough(chain: readonly Migration[], tag: string, store: string): Migration[] {
  const cut = chain.findIndex((migration) => migration.tag === tag);
  if (cut < 0) {
    throw new Error(
      `fixture:dump — "${tag}" names no step in the ${store} chain [${chain.map((m) => m.tag).join(", ")}]`,
    );
  }
  return chain.slice(0, cut + 1);
}

export type DumpFixtureOptions = {
  /** Cut the replica chain after this tag — the pair is dumped at that version. */
  readonly replicaThrough?: string;
  /** The same for the outbox, whose chain moves on its own schedule (§08 item 2). */
  readonly outboxThrough?: string;
};

export function dumpFixture(options: DumpFixtureOptions = {}): void {
  const replicaChain =
    options.replicaThrough === undefined
      ? REPLICA_MIGRATIONS
      : chainThrough(REPLICA_MIGRATIONS, options.replicaThrough, "replica");
  const outboxChain =
    options.outboxThrough === undefined
      ? OUTBOX_MIGRATIONS
      : chainThrough(OUTBOX_MIGRATIONS, options.outboxThrough, "outbox");

  const j = openJourney({ migrations: { replica: replicaChain, outbox: outboxChain } });
  try {
    seedCurrency(j, PIVOT, { isPivot: true });
    seedCurrency(j, "EUR");

    seedAccount(j, ID.accountPln, "Bank A · PLN", PIVOT);
    seedAccount(j, ID.accountEur, "Bank B · EUR", "EUR");

    // The last two are legal today and collide only once names are folded
    // past SQLite's ASCII-only `lower()` (R2 C1) — both rows have to survive
    // the upgrade for that finding's journey to have anything to exercise.
    seedCounterparty(j, ID.cpA, "Anna Placeholder");
    seedCounterparty(j, ID.cpB, "Łukasz Placeholder");
    // `CP_LOWER` bypasses `seedCounterparty` on purpose (#116 review, H1):
    // that helper now writes a real `fold()`ed value, correct for every
    // *other* fixture — but `fold("łukasz placeholder")` agrees with
    // `ID.cpB`'s own fold, and both are still live at this point in the
    // script (the merge below is what archives this one), which would
    // collide against `counterparties_name_uq` immediately, before this
    // fixture ever gets to represent anything. A raw insert with
    // `name_folded` left at its `''` default is exactly the shape H1's own
    // comment on that column names: a pre-backfill row, from before
    // anything had computed it a real value — this fixture's whole point is
    // to be one.
    j.raw()
      .replica.db.insert(counterparties)
      .values({ id: CP_LOWER, name: "łukasz placeholder" })
      .run();

    // One `fx_rates` row per real `FX_SOURCE` member — `fx_rates_pk` is
    // `(base, quote, date)`, not `source`, so each needs its own date.
    FX_SOURCE.forEach((source, index) => {
      const day = String(index + 1).padStart(2, "0");
      seedRate(j, PIVOT, "EUR", `2026-01-${day}`, "4.30000000000", source);
    });

    // Two transactions through the real write path, one carrying a debt —
    // each lands its own outbox entry, `seq` 1 and 2.
    j.session.createTransaction(
      {
        id: ID.txn1,
        date: accountingDate("2026-01-08"),
        type: "expense",
        accountId: ID.accountPln,
        amountOriginal: money.toMoney("120.00"),
        currency: PIVOT,
        payee: "",
        note: "",
        isBusiness: false,
        isCapital: false,
        source: "manual",
        counterpartyId: ID.cpA,
        counterpartyRole: "reference",
      },
      CAPTURE,
    );

    j.session.createTransaction(
      {
        id: ID.txn2,
        date: accountingDate("2026-01-09"),
        type: "expense",
        accountId: ID.accountEur,
        amountOriginal: money.toMoney("45.00"),
        currency: currencyCode("EUR"),
        payee: "",
        note: "",
        isBusiness: false,
        isCapital: false,
        source: "manual",
        counterpartyId: ID.cpB,
        counterpartyRole: "debt",
      },
      CAPTURE,
    );

    // One merge — `seq` 3. The loser is the folded-collision counterparty, so
    // the fixture still carries both rows the fold would unify: one live
    // (`ID.cpB`), one archived but present (`CP_LOWER`) — archiving is never
    // deleting (S15 §9.2), so the row the collision needs is still there.
    // `movedTransactionIds` is `[]` — required now (#116 review, M1) — since
    // nothing above ever captured a transaction against `CP_LOWER`.
    j.session.mergeCounterparties(
      { mergeId: MERGE_ID, winnerId: ID.cpA, loserId: CP_LOWER, movedTransactionIds: [] },
      CAPTURE,
    );

    // The pending entry: written straight into the outbox, above the
    // watermark every write above left — never applied to the replica, so
    // `upgrade.journey.test.ts` is what applies it, through recovery.
    const watermark = appliedSeq(j);
    j.raw()
      .outbox.db.insert(outbox)
      .values({
        id: PENDING_ENTRY_ID,
        seq: watermark + 1,
        operation: "create_transaction",
        opVersion: 1,
        payload: {
          id: PENDING_TXN_ID,
          date: accountingDate("2026-01-10"),
          type: "expense",
          accountId: ID.accountPln,
          amountOriginal: money.toMoney("18.00"),
          currency: PIVOT,
          payee: "",
          note: "",
          isBusiness: false,
          isCapital: false,
          source: "manual",
        },
        deps: [],
        capturedTz: CAPTURE.timeZone,
        capturedOffsetMinutes: CAPTURE.offsetMinutes,
        capturedAt: STAMP,
      })
      .run();

    // Claim this entry's own seq through the same counter `outbox.ts`'s
    // `claimSeq` bumps for every write that goes through the session — the
    // insert above sets `seq` directly, without also bumping `outbox_seq`,
    // which leaves `issued` at 3 (one per session write above) while a row
    // claims `seq = 4`. `outbox.ts`'s own header calls that state fatal: the
    // next real write would claim `4` too, a reused seq that loses a write.
    // `SEQ_ROW` (`outbox.ts`) is always `0`; this upserts the same way
    // `claimSeq` does, setting rather than incrementing since the value to
    // land on is already known.
    j.raw().outbox.db.run(
      sql`insert into ${outboxSeq} (id, issued) values (0, ${watermark + 1})
            on conflict(id) do update set issued = ${watermark + 1}`,
    );

    // Replace the three session-written outbox ids with fixed ones, in `seq`
    // order — see the header. Nothing references `outbox.id` from another
    // table, so rewriting it is safe.
    const sessionRows = j
      .raw()
      .outbox.db.select({ id: outbox.id, seq: outbox.seq })
      .from(outbox)
      .where(eq(outbox.state, "pending"))
      .orderBy(asc(outbox.seq))
      .all()
      .filter((row) => row.seq <= watermark);

    sessionRows.forEach((row, index) => {
      const fixedId = FIXED_OUTBOX_IDS[index];
      if (fixedId === undefined) {
        throw new Error(
          "fixture:dump — more session-written outbox entries than fixed ids reserved for them",
        );
      }
      j.raw().outbox.db.update(outbox).set({ id: fixedId }).where(eq(outbox.id, row.id)).run();
    });

    // Every wall-clock stamp this script's writes left behind, pinned last —
    // see the header.
    j.raw().replica.db.update(currencies).set({ updatedAt: STAMP }).run();
    j.raw().replica.db.update(accounts).set({ createdAt: STAMP, updatedAt: STAMP }).run();
    j.raw().replica.db.update(counterparties).set({ createdAt: STAMP, updatedAt: STAMP }).run();
    j.raw().replica.db.update(transactions).set({ createdAt: STAMP, updatedAt: STAMP }).run();
    j.raw().replica.db.update(counterpartyMerges).set({ mergedAt: STAMP }).run();

    /**
     * **A pair is named by the replica's version, both files.**
     *
     * The two chains have their own numbers and always will — the replica
     * gains a version whenever a table changes, the outbox almost never
     * does (§08 item 2) — so `outbox-v9.sql` does not mean "the outbox at
     * version 9"; it means "the outbox as it stood in the build whose
     * replica was at 9". One installed app, one snapshot, one name. Each
     * file still states its *own* store's version in its first line, which
     * `dumpDatabase` reads from the database rather than being told.
     */
    const replicaVersion = replicaChain.at(-1)?.version;
    const outboxVersion = outboxChain.at(-1)?.version;
    if (replicaVersion === undefined || outboxVersion === undefined) {
      throw new Error("fixture:dump — a migration chain with no versions");
    }

    const replicaSql = dumpFile(j.paths.replica);
    const outboxSql = dumpFile(j.paths.outbox);

    const dir = new URL("../fixtures/upgrade/", import.meta.url);
    writeFileSync(new URL(`replica-v${replicaVersion}.sql`, dir), replicaSql);
    writeFileSync(new URL(`outbox-v${replicaVersion}.sql`, dir), outboxSql);

    console.log(
      `wrote replica-v${replicaVersion}.sql (replica at ${replicaVersion}) and outbox-v${replicaVersion}.sql (outbox at ${outboxVersion})`,
    );
  } finally {
    j.close();
  }
}
