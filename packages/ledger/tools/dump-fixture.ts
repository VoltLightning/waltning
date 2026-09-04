/**
 * Seed a populated ledger through the journey harness, then dump both stores
 * to `fixtures/upgrade/`. Run with `pnpm --filter @waltning/ledger fixture:dump`.
 *
 * See `fixtures/upgrade/README.md` for what a fixture is and when a PR must
 * add a new one.
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
import { asc, eq } from "drizzle-orm";
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
import { OUTBOX_MIGRATIONS, REPLICA_MIGRATIONS } from "../src/migrate.ts";
import { ledgerSchema } from "../src/schema-map.ts";

const { accounts, counterparties, counterpartyMerges, currencies, outbox, transactions } =
  ledgerSchema;

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

function main(): void {
  const j = openJourney();
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
    seedCounterparty(j, CP_LOWER, "łukasz placeholder");

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
    j.session.mergeCounterparties(
      { mergeId: MERGE_ID, winnerId: ID.cpA, loserId: CP_LOWER },
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

    const replicaVersion = REPLICA_MIGRATIONS.at(-1)?.version;
    const outboxVersion = OUTBOX_MIGRATIONS.at(-1)?.version;
    if (replicaVersion === undefined || outboxVersion === undefined) {
      throw new Error("fixture:dump — a migration chain with no versions");
    }

    const replicaSql = dumpFile(j.paths.replica);
    const outboxSql = dumpFile(j.paths.outbox);

    const dir = new URL("../fixtures/upgrade/", import.meta.url);
    const replicaOut = new URL(`replica-v${replicaVersion}.sql`, dir);
    const outboxOut = new URL(`outbox-v${outboxVersion}.sql`, dir);
    writeFileSync(replicaOut, replicaSql);
    writeFileSync(outboxOut, outboxSql);

    console.log(`wrote replica-v${replicaVersion}.sql and outbox-v${outboxVersion}.sql`);
  } finally {
    j.close();
  }
}

main();
