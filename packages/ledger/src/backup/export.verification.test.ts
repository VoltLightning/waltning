/**
 * The read-back, with a reader that loses a row.
 *
 * This is the test the first spelling of `verify` could not have passed and
 * did not have. It compared the decrypted document's counts against the
 * in-memory document that produced it — so a `readTable` that dropped a row
 * produced a file, a manifest, and a reported success for a backup missing
 * part of the ledger. The check now compares against `liveCounts`, a second
 * `SELECT count(*)` that never passes through the writer, and the only way to
 * demonstrate that is to break the writer.
 *
 * Mocking the module is the point rather than a shortcut: the defect being
 * guarded is *the reader disagreeing with the database*, and nothing else can
 * express it.
 */

import { randomBytes } from "node:crypto";
import { generateKeyPair } from "@waltning/core/age/keys";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";

/** Everything real except `readBackup`, which is handed a row fewer on demand. */
let loseRows = 0;

vi.mock("./document.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./document.ts")>();
  return {
    ...actual,
    readBackup: (...args: Parameters<typeof actual.readBackup>) => {
      const backup = actual.readBackup(...args);
      if (loseRows === 0) return backup;
      const kept = backup.replica["transactions"]?.slice(loseRows) ?? [];
      return {
        ...backup,
        // The counts follow the rows, exactly as a genuinely short read would:
        // a writer that lost a row does not also report the number it lost.
        counts: { ...backup.counts, transactions: kept.length },
        replica: { ...backup.replica, transactions: kept },
      };
    },
  };
});

const { exportLedger } = await import("./export.ts");

const PLN = currencyCode("PLN");
const ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");
const random = (length: number) => new Uint8Array(randomBytes(length));
const keys = generateKeyPair(random);

let stores: ScratchStores;

beforeEach(() => {
  loseRows = 0;
  stores = scratchStores();
  const db = stores.ledger.replica.db;
  db.insert(ledgerSchema.currencies)
    .values({ code: PLN, name: "Polish Złoty", symbol: "zł", decimals: 2, isPivot: true })
    .run();
  db.insert(ledgerSchema.accounts)
    .values({ id: ACCOUNT, name: "Bank A · PLN", currency: PLN, ownership: "own" })
    .run();
  db.insert(ledgerSchema.transactions)
    .values(
      [1, 2, 3].map((n) => ({
        id: id<"transactions">(`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa0${n}`),
        date: accountingDate(`2026-09-0${n}`),
        type: "expense" as const,
        accountId: ACCOUNT,
        amountOriginal: money.toMoney(`${n}0.25`),
        currency: PLN,
        fxRate: money.pivotPerUnit("1"),
      })),
    )
    .run();
});

afterEach(() => stores.close());

const run = () =>
  exportLedger(
    { replica: stores.ledger.replica.db, outbox: stores.ledger.outbox.db },
    {
      recipient: keys.recipient,
      now: new Date("2026-09-15T09:00:00.000Z"),
      random,
      verifyWith: keys.identity,
    },
  );

it("succeeds when the reader agrees with the database", () => {
  expect(run().manifest.transactions).toBe(3);
});

it("refuses a backup whose reader lost a row, however consistent it looks", () => {
  loseRows = 1;
  // The short document is internally perfect: its counts match its rows, it
  // encrypts, it decrypts, and every tag verifies. Only the database disagrees.
  expect(run).toThrow("transactions holds 3 rows and the file came back with 2");
});

it("refuses one that lost the whole table", () => {
  loseRows = 3;
  expect(run).toThrow("transactions holds 3 rows and the file came back with 0");
});
