/**
 * **The drill.** Export a real ledger, delete it, restore it into empty files,
 * and check the balances match — to eight decimal places, not by eye.
 *
 * `architecture/14` §14.3 makes the export the phone's only durable copy
 * before a backend exists, and E4's card says the quiet part: a backup nobody
 * has restored is a hypothesis. This file is the restoring. It runs against
 * two real SQLite files through `scratchStores`, because the property under
 * test is what survives the originals going away, and an in-memory harness
 * cannot lose anything.
 *
 * The figures below are placeholders — `Bank A · PLN`, invented ids — as
 * everything in this public repository about a private ledger is.
 */

import { randomBytes } from "node:crypto";
import { decrypt } from "@waltning/core/age/format";
import { generateKeyPair } from "@waltning/core/age/keys";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readBalanceAsOf } from "../accounts/read-balance-as-of.ts";
import { ledgerSchema } from "../schema-map.ts";
import { nodeFs, type ScratchStores, scratchStores } from "../test/stores.ts";
import { BACKUP_FORMAT, parseBackup } from "./document.ts";
import { exportLedger } from "./export.ts";
import { restoreBackup } from "./restore.ts";

const PLN = currencyCode("PLN");
const ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");
const NOW = new Date("2026-09-16T09:00:00.000Z");
const AS_OF = accountingDate("2026-12-31");

const random = (length: number) => new Uint8Array(randomBytes(length));
const keys = generateKeyPair(random);

/** The ledger that gets exported — a few rows with figures worth comparing exactly. */
let source: ScratchStores;
/** The clean install it is restored into. */
let restored: ScratchStores;

beforeEach(() => {
  source = scratchStores();
  const db = source.ledger.replica.db;
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
        // Eight decimal places, deliberately: the card's own bar.
        amountOriginal: money.toMoney(`${n}0.12345678`),
        currency: PLN,
        fxRate: money.pivotPerUnit("1"),
      })),
    )
    .run();
  source.ledger.outbox.db
    .insert(ledgerSchema.outbox)
    .values({
      seq: 1,
      operation: "capture_expense",
      payload: { note: "never sent" },
      opVersion: 1,
      capturedTz: "Europe/Warsaw",
      capturedOffsetMinutes: 120,
      state: "pending",
    })
    .run();

  restored = scratchStores();
});

afterEach(() => {
  source.close();
  restored.close();
});

/** Export, decrypt, parse — the file as an owner would actually receive it back. */
function exported() {
  const { file, manifest } = exportLedger(
    { replica: source.ledger.replica.db, outbox: source.ledger.outbox.db },
    { recipient: keys.recipient, now: NOW, random, verifyWith: keys.identity },
  );
  return { manifest, backup: parseBackup(decrypt(file, keys.identity), { format: BACKUP_FORMAT }) };
}

/** A clean install: the stores exist and hold nothing. */
function emptyStores() {
  return { replica: restored.ledger.replica, outbox: restored.ledger.outbox };
}

describe("the drill", () => {
  /**
   * E4's own **Done when**, run: *the balances match the figures recorded
   * before deletion — to eight decimal places, not by eye.*
   */
  it("brings the balances back exactly, to the last decimal place", () => {
    const before = readBalanceAsOf(source.ledger.replica.db, ACCOUNT, AS_OF);
    const { backup } = exported();

    // The originals go away. Nothing below reads them again.
    source.close();

    restoreBackup(emptyStores(), backup, { fs: nodeFs });

    const after = readBalanceAsOf(restored.ledger.replica.db, ACCOUNT, AS_OF);
    expect(after).toBe(before);
    // Not a rounded comparison: the sum of three eight-decimal figures.
    expect(after).toBe(money.toMoney("-60.37037034"));
  });

  it("brings the unsent captures back, which nothing else holds", () => {
    const { backup } = exported();
    source.close();

    const result = restoreBackup(emptyStores(), backup, { fs: nodeFs });

    expect(result.counts["outbox"]).toBe(1);
    const rows = restored.ledger.outbox.db.select().from(ledgerSchema.outbox).all();
    expect(rows[0]?.operation).toBe("capture_expense");
    expect(rows[0]?.state).toBe("pending");
  });

  it("brings every table back, row for row", () => {
    const { manifest, backup } = exported();
    source.close();

    const result = restoreBackup(emptyStores(), backup, { fs: nodeFs });

    // The export's own manifest against the restore's own count — two
    // independent reads of two different databases.
    expect(result.counts).toEqual(manifest.counts);
  });

  it("leaves the stores at this build's schema head, not the document's", () => {
    const { backup } = exported();
    const result = restoreBackup(emptyStores(), backup, { fs: nodeFs });
    expect(result.schema.replica).toBeGreaterThanOrEqual(backup.schema.replica);
    expect(result.schema.outbox).toBeGreaterThanOrEqual(backup.schema.outbox);
  });

  /** The whole round trip, end to end, through the ciphertext a person would hold. */
  it("survives the file — encrypted, written, read back, restored", () => {
    const before = readBalanceAsOf(source.ledger.replica.db, ACCOUNT, AS_OF);
    const { file } = exportLedger(
      { replica: source.ledger.replica.db, outbox: source.ledger.outbox.db },
      { recipient: keys.recipient, now: NOW, random, verifyWith: keys.identity },
    );
    source.close();

    // Exactly what `age -d -i key.txt backup.age` hands back.
    const backup = parseBackup(decrypt(file, keys.identity), { format: BACKUP_FORMAT });
    restoreBackup(emptyStores(), backup, { fs: nodeFs });

    expect(readBalanceAsOf(restored.ledger.replica.db, ACCOUNT, AS_OF)).toBe(before);
  });
});

describe("what a restore refuses", () => {
  /**
   * **A restore fills an empty ledger.** Two ledgers that both believe they
   * are the ledger cannot be reconciled without a writer of record, and there
   * is none on a phone (§14.0) — so this is refused rather than merged.
   */
  it("refuses stores that already hold rows", () => {
    const { backup } = exported();
    // `restored` is empty; `source` is not.
    expect(() =>
      restoreBackup({ replica: source.ledger.replica, outbox: source.ledger.outbox }, backup, {
        fs: nodeFs,
      }),
    ).toThrow(/already hold rows/);
  });

  it("refuses a backup from a newer build rather than guessing at its shape", () => {
    const { backup } = exported();
    const ahead = { ...backup, schema: { ...backup.schema, replica: backup.schema.replica + 99 } };
    expect(() => restoreBackup(emptyStores(), ahead, { fs: nodeFs })).toThrow(
      /written by a newer app/,
    );
  });

  it("refuses a version its own chain does not contain", () => {
    const { backup } = exported();
    // Between two real steps: not ahead, and not a version this build has.
    const between = { ...backup, schema: { ...backup.schema, outbox: 1.5 } };
    expect(() => restoreBackup(emptyStores(), between, { fs: nodeFs })).toThrow(/does not contain/);
  });

  /**
   * A restored file is the one thing here an attacker chooses, so its values
   * are bound rather than interpolated. A payee that is a `DROP TABLE` is a
   * payee.
   */
  it("treats a restored value as a value, never as SQL", () => {
    const { backup } = exported();
    const hostile = {
      ...backup,
      replica: {
        ...backup.replica,
        accounts: (backup.replica["accounts"] ?? []).map((row) => ({
          ...row,
          name: `'); DROP TABLE transactions; --`,
        })),
      },
    };
    source.close();

    restoreBackup(emptyStores(), hostile, { fs: nodeFs });

    const accounts = restored.ledger.replica.db.select().from(ledgerSchema.accounts).all();
    expect(accounts[0]?.name).toBe(`'); DROP TABLE transactions; --`);
    // And the table the payee named is still there, with its rows.
    expect(restored.ledger.replica.db.select().from(ledgerSchema.transactions).all()).toHaveLength(
      3,
    );
  });
});
