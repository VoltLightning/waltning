/**
 * A4 — the replica holds the whole ledger and the outbox drains in order.
 *
 * These two board cards are largely proven by `outbox.test.ts`,
 * `recover.test.ts` and `executors.test.ts` already; this file does not repeat
 * that coverage. What it adds is the property none of those files state on
 * their own: that everything above survives a **process going away and coming
 * back** — a relaunch, a phone left in a drawer for months — because that is
 * the whole of what `architecture/14` §14.4 and `SPEC.md` §5.7 promise and
 * neither is a claim a single-connection test can make.
 *
 * - `close() releases handles without deleting the record` — the replica is
 *   the ledger, not a cache of it (`architecture/14` §14.4): closing a session
 *   must not touch either file, and there is today no logout path that could
 *   be tempted to.
 * - `seq is monotonic across a reopen` — `outbox.test.ts` proves the counter
 *   outlives a delete within one connection; this proves it outlives a
 *   process, which is the case the watermark actually depends on.
 * - `deps survive a reopen` — `executors.test.ts` proves derivation within one
 *   connection; this proves an unacknowledged mint from a previous run still
 *   gates a write made after a relaunch.
 * - `capturedAt is display-only` — `recover.ts` orders replay by `seq`;
 *   this is the test that would fail if it ever ordered by the wall clock
 *   instead, which `§14.2` refuses by name.
 * - `sending → pending on launch` is already pinned by
 *   `recover.test.ts`'s *"resets sending to pending, and names what it
 *   reset"* — nothing here duplicates it.
 * - `a replica offline for months` — 2 000 rows across 14 months, reopened,
 *   folded independently of `readAccounts`' own arithmetic and checked against
 *   it, which is the shape a 400-row window could never have been asked to
 *   pass.
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AccountingDate, accountingDate } from "@waltning/core/date";
import { type Id, id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { randomId } from "@waltning/core/random";
import { createAccountInput, createTransactionInput } from "@waltning/core/registry/inputs";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAccountExecutor } from "../accounts/create-account.executor.ts";
import { readAccounts } from "../accounts/read-accounts.ts";
import { defineLocalExecutor, localRegistry } from "../executor.ts";
import type { LedgerPaths, SqliteOpener } from "../open.ts";
import { claimSeq, outbox } from "../outbox.ts";
import { recoverOnLaunch } from "../recover.ts";
import { ledgerRegistry } from "../registry.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import { type BootstrapCurrency, createLocalLedgerSession } from "../session.ts";
import { createTransactionExecutor } from "../transactions/create-transaction.executor.ts";
import { readRecent } from "../transactions/read-recent.ts";
import type { Capture, LocalTx } from "../write.ts";
import { writeLocally } from "../write.ts";
import { nodeFs, type ScratchStores, scratchStores } from "./stores.ts";

const { currencies } = schema;

type Run = Database.RunResult;

const CAPTURE: Capture = { timeZone: "Europe/Warsaw", offsetMinutes: 120 };

const openBetterSqlite: SqliteOpener<Run, typeof schema> = (filename) => {
  const sqlite = new Database(filename);
  return { db: drizzle(sqlite, { schema }), close: () => sqlite.close() };
};

/* ── close() releases handles without deleting the record ──────────────────── */

describe("close() releases handles without deleting the record", () => {
  it("keeps both files on disk through close, and the row through reopen", () => {
    const directory = mkdtempSync(join(tmpdir(), "waltning-durability-"));
    const paths: LedgerPaths = {
      replica: join(directory, "replica.db"),
      outbox: join(directory, "outbox.db"),
    };
    const bootstrapCurrencies: readonly BootstrapCurrency[] = [
      {
        code: currencyCode("USD"),
        name: "Placeholder",
        symbol: "$",
        symbolPosition: "P",
        decimals: 2,
        isPivot: true,
      },
    ];
    const options = {
      open: openBetterSqlite,
      paths,
      fs: nodeFs,
      removeDatabase: (path: string) => rmSync(path, { force: true }),
      bootstrapCurrencies,
      preJournalStores: "refuse" as const,
    };

    try {
      const accountId = id<"accounts">(randomId());
      const first = createLocalLedgerSession(options);
      first.createAccount(
        createAccountInput.parse({ id: accountId, name: "Bank A · USD", currency: "USD" }),
        CAPTURE,
      );

      expect(existsSync(paths.replica)).toBe(true);
      expect(existsSync(paths.outbox)).toBe(true);

      first.close();

      // The replica is the record, not a cache of it (`architecture/14`
      // §14.4) — closing a session releases the driver's handles and deletes
      // nothing. There is today no logout path in `apps/mobile` or
      // `packages/client` that could call `close()` expecting otherwise; if
      // one is added, it must not reach for `reset()` (which does delete, on
      // an explicit person's request — see `session.test.ts`).
      expect(existsSync(paths.replica), "close() must not delete the replica").toBe(true);
      expect(existsSync(paths.outbox), "close() must not delete the outbox").toBe(true);

      const second = createLocalLedgerSession(options);
      expect(second.listAccounts().map((account) => account.id)).toEqual([accountId]);
      second.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

/* ── seq is monotonic across a reopen ────────────────────────────────────── */

type OutboxDb = ScratchStores["ledger"]["outbox"]["db"];

const ENTRY_BASE = {
  operation: "create_transaction",
  opVersion: 1,
  payload: {},
  capturedTz: "Europe/Warsaw",
  capturedOffsetMinutes: 120,
} as const;

function enqueue(db: OutboxDb, values: Partial<typeof outbox.$inferInsert> = {}) {
  const [entry] = db
    .insert(outbox)
    .values({ ...ENTRY_BASE, seq: claimSeq(db), ...values })
    .returning()
    .all();
  if (!entry) throw new Error("insert returned no row");
  return entry;
}

describe("`seq` is monotonic across a reopen", () => {
  it("resumes from the watermark, and never reuses a number a delete freed", () => {
    const s = scratchStores();
    try {
      const claimed = [
        enqueue(s.ledger.outbox.db),
        enqueue(s.ledger.outbox.db),
        enqueue(s.ledger.outbox.db),
      ];
      expect(claimed.map((entry) => entry.seq)).toEqual([1, 2, 3]);

      // Not a simulation: the files close and open again, the way a launch
      // does. `outbox_seq` is a row, not process memory, so it has to survive.
      s.reopen();

      const fourth = enqueue(s.ledger.outbox.db);
      expect(fourth.seq, "4, not 1 — a reopen is not a fresh counter").toBe(4);

      // Deleting the drained entry must not free its number back up, or the
      // replica's `applied_seq` watermark would sit above a seq that gets
      // reissued — the exact failure `outbox.ts`'s `outboxSeq` table exists to
      // prevent, now proven across a restart rather than within one connection.
      s.ledger.outbox.db.delete(outbox).where(eq(outbox.seq, 3)).run();

      const fifth = enqueue(s.ledger.outbox.db);
      expect(fifth.seq, "5, not 3 — a delete must not free the number back up").toBe(5);
    } finally {
      s.close();
    }
  });
});

/* ── deps survive a reopen ───────────────────────────────────────────────── */

describe("`deps` survive a reopen", () => {
  it("still depends on an account minted before the process restarted", () => {
    const s = scratchStores();
    try {
      s.ledger.replica.db
        .insert(currencies)
        .values({ code: currencyCode("USD"), name: "Placeholder", isPivot: true })
        .run();

      const accountId = id<"accounts">(randomId());
      const account = writeLocally(s.ledger, {
        executor: createAccountExecutor,
        registry: ledgerRegistry,
        input: createAccountInput.parse({ id: accountId, name: "Bank A · USD", currency: "USD" }),
        capture: CAPTURE,
      });

      // No server exists in this harness, so nothing has drained: the account
      // entry is still unacknowledged after the relaunch, exactly as it would
      // be on a phone that went offline between the two captures.
      s.reopen();

      const txnId = randomId();
      const transaction = writeLocally(s.ledger, {
        executor: createTransactionExecutor,
        registry: ledgerRegistry,
        input: createTransactionInput.parse({
          id: txnId,
          date: "2026-03-12",
          type: "expense",
          accountId,
          amountOriginal: "18.00",
          currency: "USD",
        }),
        capture: CAPTURE,
      });

      expect(
        transaction.deps,
        "the mint predates the relaunch but is still unacknowledged",
      ).toEqual([account.entryId]);
    } finally {
      s.close();
    }
  });
});

/* ── capturedAt is display-only ──────────────────────────────────────────── */

describe("`capturedAt` is display-only", () => {
  /** A minimal executor, exactly as `recover.test.ts` uses one: what matters here is the order `apply` is called in, not what it writes. */
  const APPLIED = z.object({ mark: z.string() });
  const noop = defineLocalExecutor<typeof APPLIED, { mark: string }, LocalTx<Run, typeof schema>>({
    operation: "noop",
    opVersion: 1,
    input: APPLIED,
    mints: () => [],
    apply: (input) => input,
  });
  const registry = localRegistry([noop]);

  it("replays by seq, not by the wall clock two entries were captured under", () => {
    const s = scratchStores();
    try {
      // seq ascends 1, 2 — capturedAt is stamped in the opposite order, the
      // way a phone's clock can move backwards or two captures can race a
      // millisecond. `recoverOnLaunch` must not care.
      const [first] = s.ledger.outbox.db
        .insert(outbox)
        .values({
          seq: 1,
          operation: "noop",
          opVersion: 1,
          payload: { mark: "first" },
          deps: [],
          capturedTz: "Europe/Warsaw",
          capturedOffsetMinutes: 120,
          capturedAt: new Date("2026-06-01T00:00:00Z"),
        })
        .returning({ id: outbox.id })
        .all();
      const [second] = s.ledger.outbox.db
        .insert(outbox)
        .values({
          seq: 2,
          operation: "noop",
          opVersion: 1,
          payload: { mark: "second" },
          deps: [],
          capturedTz: "Europe/Warsaw",
          capturedOffsetMinutes: 120,
          capturedAt: new Date("2026-01-01T00:00:00Z"),
        })
        .returning({ id: outbox.id })
        .all();
      if (!first || !second) throw new Error("insert returned no row");

      const recovery = recoverOnLaunch(s.ledger, registry);

      expect(recovery.halted).toBeNull();
      // seq order — [first, second] — not capturedAt order, which would
      // reverse this because "second" claims the earlier timestamp.
      expect(recovery.replayed).toEqual([first.id, second.id]);
    } finally {
      s.close();
    }
  });
});

/* ── a replica offline for months ────────────────────────────────────────── */

/**
 * A calendar-day offset from a bare date, entirely in UTC.
 *
 * This is not the accounting-date arithmetic `CLAUDE.md` bans in product
 * code — it builds a synthetic grid of fixture dates for a test, the same way
 * `date.test.ts` builds its own fixtures with `Date.UTC`. Nothing here reads a
 * timezone or represents a capture.
 */
function plusDays(base: string, days: number): AccountingDate {
  const [year, month, day] = base.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return accountingDate(next.toISOString().slice(0, 10));
}

describe("a replica offline for months", () => {
  it("keeps 2 000 transactions across ~14 months through a reopen — nothing dropped by date", () => {
    const s = scratchStores();
    try {
      s.ledger.replica.db
        .insert(currencies)
        .values({ code: currencyCode("USD"), name: "Placeholder", isPivot: true })
        .run();

      const accountIds: readonly Id<"accounts">[] = [randomId(), randomId(), randomId()].map(
        (raw) => id<"accounts">(raw),
      );
      for (const accountId of accountIds) {
        writeLocally(s.ledger, {
          executor: createAccountExecutor,
          registry: ledgerRegistry,
          input: createAccountInput.parse({ id: accountId, name: "Bank A · USD", currency: "USD" }),
          capture: CAPTURE,
        });
      }

      const START = "2025-07-01";
      const BULK_COUNT = 1995;
      // Bulk rows spread across day 0..421 (422 distinct days); the final 5
      // land on the 5 days after that, strictly later than every bulk date —
      // 427 days end to end, a little over 14 months, matching the growth
      // `SPEC.md` §14.3 tracks.
      const BULK_SPAN_DAYS = 422;
      const TAIL_COUNT = 5;

      const expected = new Map<Id<"accounts">, money.Money>(
        accountIds.map((accountId) => [accountId, money.toMoney("0")]),
      );
      const tailIds: string[] = [];

      for (let i = 0; i < BULK_COUNT + TAIL_COUNT; i++) {
        const isTail = i >= BULK_COUNT;
        const tailIndex = i - BULK_COUNT;
        const date = isTail
          ? plusDays(START, BULK_SPAN_DAYS + tailIndex)
          : plusDays(START, Math.floor((i / BULK_COUNT) * BULK_SPAN_DAYS));
        const accountId = accountIds[i % accountIds.length];
        if (!accountId) throw new Error("accountIds must be non-empty");
        const type = i % 3 === 0 ? "income" : "expense";
        const amount = money.toMoney(String((i % 89) + 1));
        const txnId = randomId();
        if (isTail) tailIds.push(txnId);

        writeLocally(s.ledger, {
          executor: createTransactionExecutor,
          registry: ledgerRegistry,
          input: createTransactionInput.parse({
            id: txnId,
            date,
            type,
            accountId,
            amountOriginal: amount,
            currency: "USD",
          }),
          capture: CAPTURE,
        });

        const prior = expected.get(accountId);
        if (prior === undefined) throw new Error("balance not initialised for account");
        const delta = type === "income" ? amount : money.neg(amount);
        expected.set(accountId, money.add(prior, delta));
      }

      // Not a simulation of a reconnect: closing and reopening both files is
      // what a relaunch after months offline actually does. `readAccounts` and
      // `readRecent` below run against the fresh connection, not the one that
      // wrote the rows.
      const start = performance.now();
      s.reopen();
      const balances = readAccounts(s.ledger.replica.db);
      const recent = readRecent(s.ledger.replica.db, 5);
      const elapsedMs = performance.now() - start;

      expect(balances).toHaveLength(accountIds.length);
      for (const account of balances) {
        expect(account.balance, `account ${account.id} balance after reopen`).toBe(
          expected.get(account.id),
        );
      }

      // The 5 newest by date, newest first — the tail was built with 5
      // strictly increasing dates later than every bulk row, so this is
      // unambiguous regardless of insertion order.
      expect(recent.map((row) => row.id)).toEqual([...tailIds].reverse());

      // Task 3 asks this be timed rather than optimised. 500ms is `#e8`'s
      // budget, not this file's — see the PR body for the measured number.
      console.info(
        `durability: reopen + readAccounts + readRecent(5) over ${BULK_COUNT + TAIL_COUNT} rows took ${elapsedMs.toFixed(1)}ms`,
      );
    } finally {
      s.close();
    }
  });
});
