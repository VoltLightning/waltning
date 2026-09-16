/**
 * The export, against two real SQLite files.
 *
 * `CLAUDE.md`: database tests run against real databases, never mocks — and
 * here that is not a style rule. The two properties under test are *every
 * table travelled* and *the outbox travelled separately*, and both are
 * statements about two files that cannot commit together. A harness that put
 * them in one store would pass by construction.
 *
 * The first test is the one that will still be earning its place in a year:
 * it derives the expected table list from SQLite's own catalogue, so a table
 * added to the schema map and forgotten here fails rather than quietly
 * dropping out of every backup taken from that release on.
 */

import { randomBytes } from "node:crypto";
import { decrypt as ageDecrypt, encrypt as ageEncrypt } from "@waltning/core/age/format";
import { generateKeyPair } from "@waltning/core/age/keys";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MIGRATION_JOURNAL } from "../migrate.ts";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import { BACKUP_FORMAT, BACKUP_TABLES, parseBackup } from "./document.ts";
import { exportLedger } from "./export.ts";

const { accounts, currencies, transactions, outbox } = ledgerSchema;

const PLN = currencyCode("PLN");
const ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");
const NOW = new Date("2026-09-15T09:00:00.000Z");

/** Node's CSPRNG. The phone passes `expo-crypto`'s; nothing here reads a global. */
const random = (length: number) => new Uint8Array(randomBytes(length));
const keys = generateKeyPair(random);

let stores: ScratchStores;

beforeEach(() => {
  stores = scratchStores();
  const db = stores.ledger.replica.db;
  db.insert(currencies)
    .values({ code: PLN, name: "Polish Złoty", symbol: "zł", decimals: 2, isPivot: true })
    .run();
  db.insert(accounts)
    .values({ id: ACCOUNT, name: "Bank A · PLN", currency: PLN, ownership: "own" })
    .run();
  db.insert(transactions).values([1, 2, 3].map(oneTransaction)).run();
});

afterEach(() => stores.close());

function oneTransaction(n: number) {
  return {
    id: id<"transactions">(`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa0${n}`),
    date: accountingDate(`2026-09-0${n}`),
    type: "expense" as const,
    accountId: ACCOUNT,
    amountOriginal: money.toMoney(`${n}0.25`),
    currency: PLN,
    fxRate: money.pivotPerUnit("1"),
  };
}

const runExport = () =>
  exportLedger(
    { replica: stores.ledger.replica.db, outbox: stores.ledger.outbox.db },
    { recipient: keys.recipient, now: NOW, random, verifyWith: keys.identity },
  );

const opened = (file: Uint8Array) =>
  parseBackup(ageDecrypt(file, keys.identity), { format: BACKUP_FORMAT });

describe("what the export carries", () => {
  /**
   * The completeness claim, enforced rather than written down. `sqlite_master`
   * is the file's own account of itself, so this fails on the release that
   * adds a table and forgets the backup — the failure that otherwise shows up
   * as a restore missing something nobody looked for.
   */
  it("names every table both files actually hold", () => {
    const live = (db: { all: (q: never) => unknown }) =>
      (
        db.all(
          sql.raw(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
          ) as never,
        ) as { name: string }[]
      )
        .map((row) => row.name)
        // The migrator's journal describes how this file was built, not what
        // it holds; `document.ts` says why a restore must not receive one.
        .filter((name) => name !== MIGRATION_JOURNAL)
        .sort();

    expect(BACKUP_TABLES.replica).toEqual(live(stores.ledger.replica.db));
    expect(BACKUP_TABLES.outbox).toEqual(live(stores.ledger.outbox.db));
    expect(BACKUP_TABLES.replica.length).toBeGreaterThan(10);
  });

  it("carries the rows, with the figures unchanged as strings", () => {
    const backup = opened(runExport().file);
    expect(backup.counts["transactions"]).toBe(3);
    const amounts = backup.replica["transactions"]?.map((row) => row["amount_original"]);
    // Money is `numeric(20,8)` strings end to end (`CLAUDE.md`), and these come
    // back at full scale — a backup showing two decimals went through a JS
    // number on the way, which is the bug that rule exists for.
    expect(amounts).toEqual(["10.25000000", "20.25000000", "30.25000000"]);
    for (const amount of amounts ?? []) expect(typeof amount).toBe("string");
  });

  /**
   * On a phone with no backend the outbox never drains, so these entries are
   * intent that exists in exactly one place. A backup of the replica alone
   * loses them and looks complete doing it.
   */
  it("carries the outbox, from the other file", () => {
    stores.ledger.outbox.db
      .insert(outbox)
      .values({
        seq: 1,
        operation: "capture_expense",
        payload: { note: "unsent" },
        opVersion: 1,
        capturedTz: "Europe/Warsaw",
        capturedOffsetMinutes: 120,
        state: "pending",
      })
      .run();

    const backup = opened(runExport().file);
    expect(backup.counts["outbox"]).toBe(1);
    expect(backup.outbox["outbox"]?.[0]?.["operation"]).toBe("capture_expense");
    // And it is not in the replica's half — the two files stay two.
    expect(backup.replica["outbox"]).toBeUndefined();
  });

  it("records the schema version each store is at", () => {
    const backup = opened(runExport().file);
    expect(backup.schema.replica).toBeGreaterThan(0);
    expect(backup.schema.outbox).toBeGreaterThan(0);
  });

  it("states what it holds without ever naming the key that opens it", () => {
    const { manifest, file } = runExport();
    expect(manifest.transactions).toBe(3);
    expect(manifest.bytes).toBe(file.length);
    expect(manifest.recipient).toBe(keys.recipient);
    expect(JSON.stringify(manifest)).not.toContain(keys.identity);
  });
});

describe("the key withheld", () => {
  /** §14.3's whole claim, proven by trying rather than asserted. */
  it("leaves the file unreadable to another key", () => {
    const { file } = runExport();
    const stranger = generateKeyPair(random);
    expect(() => ageDecrypt(file, stranger.identity)).toThrow("does not open this file");
  });

  it("leaves no account name, payee or figure in the ciphertext", () => {
    const { file } = runExport();
    const bytes = Array.from(file);
    for (const secret of ["Bank A", "waltning-ledger", "10.25000000", "PLN"]) {
      const needle = Array.from(new TextEncoder().encode(secret));
      const found = bytes.some((_, at) => needle.every((byte, n) => bytes[at + n] === byte));
      expect(found, `${secret} appears in the ciphertext`).toBe(false);
    }
  });
});

describe("reading it back before calling it a backup", () => {
  it("refuses to report success on a file it cannot open", () => {
    const stranger = generateKeyPair(random);
    expect(() =>
      exportLedger(
        { replica: stores.ledger.replica.db, outbox: stores.ledger.outbox.db },
        { recipient: keys.recipient, now: NOW, random, verifyWith: stranger.identity },
      ),
    ).toThrow("could not be read back");
  });

  it("refuses a backup that is not a ledger", () => {
    const file = ageEncrypt(
      new TextEncoder().encode('{"kind":"something else"}'),
      keys.recipient,
      random,
    );
    expect(() => opened(file)).toThrow("not a waltning ledger export");
  });

  it("refuses a backup from a newer app rather than restoring part of it", () => {
    const backup = { ...opened(runExport().file), format: BACKUP_FORMAT + 1 };
    const file = ageEncrypt(
      new TextEncoder().encode(JSON.stringify(backup)),
      keys.recipient,
      random,
    );
    expect(() => opened(file)).toThrow(/newer app/);
  });

  /**
   * The counts are written before the rows and checked against them, so a file
   * that lost rows but still parses as JSON is caught. Without it a short
   * backup restores quietly and the missing months are found years later.
   */
  it("refuses a backup whose counts and rows disagree", () => {
    const backup = opened(runExport().file);
    const short = {
      ...backup,
      replica: { ...backup.replica, transactions: backup.replica["transactions"]?.slice(1) },
    };
    const file = ageEncrypt(
      new TextEncoder().encode(JSON.stringify(short)),
      keys.recipient,
      random,
    );
    expect(() => opened(file)).toThrow("says 3 rows and carries 2");
  });

  it("refuses a file with a byte changed in it", () => {
    const { file } = runExport();
    const tampered = Uint8Array.from(file);
    const at = file.length - 30;
    tampered[at] = ((tampered[at] as number) ^ 0x02) & 0xff;
    expect(() => ageDecrypt(tampered, keys.identity)).toThrow(/^age:/);
  });
});
