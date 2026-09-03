/**
 * A4 — the replica holds the whole ledger and the outbox drains in order.
 *
 * `architecture/14` §14.4: the replica **is** the record, not a cache of it —
 * no eviction, no TTL. `SPEC.md` §5.7 makes the outbox the one irreplaceable
 * file on the device. Neither claim survives being tested against a single
 * open connection: this file exists to prove what happens across a **process
 * going away and coming back** — a relaunch, a phone left in a drawer for
 * months.
 *
 * - `close() releases handles without deleting the record` — closing a
 *   session must not touch either file, and there is today no logout path
 *   that could be tempted to.
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { id } from "@waltning/core/id";
import { currencyCode } from "@waltning/core/money";
import { randomId } from "@waltning/core/random";
import { createAccountInput } from "@waltning/core/registry/inputs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";
import type { LedgerPaths, SqliteOpener } from "../open.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import { type BootstrapCurrency, createLocalLedgerSession } from "../session.ts";
import type { Capture } from "../write.ts";
import { nodeFs } from "./stores.ts";

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
