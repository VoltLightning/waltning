import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { createAccountInput, createTransactionInput } from "@waltning/core/registry/inputs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type LedgerFs, migrateOutbox, migrateReplica } from "../migrate.ts";
import { type LedgerPaths, openLedger, type SqliteOpener } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";
import { createLocalLedgerSession, USD_BOOTSTRAP } from "../session.ts";

const { outbox, outboxSeq } = ledgerSchema;

type Run = Database.RunResult;

const capture = {
  timeZone: "Europe/Warsaw",
  offsetMinutes: 120,
  at: new Date("2026-08-23T10:00:00Z"),
};
const accountId = id<"accounts">("11111111-1111-4111-8111-111111111111");
const transactionId = id<"transactions">("22222222-2222-4222-8222-222222222222");

let directory: string;
let paths: LedgerPaths;
let removed: string[];
let forcedExisting: Set<string>;

const open: SqliteOpener<Run, typeof ledgerSchema> = (filename) => {
  const sqlite = new Database(filename);
  return { db: drizzle(sqlite, { schema: ledgerSchema }), close: () => sqlite.close() };
};

const fs: LedgerFs = {
  exists: (path) => forcedExisting.has(path) || existsSync(path),
  copy: (from, to) => copyFileSync(from, to),
  remove: (path) => {
    removed.push(path);
    forcedExisting.delete(path);
    rmSync(path, { force: true });
  },
};

const options = () => ({
  open,
  paths,
  fs,
  removeDatabase: (path: string) => rmSync(path, { force: true }),
  bootstrapCurrency: USD_BOOTSTRAP,
});

const accountInput = () =>
  createAccountInput.parse({ id: accountId, name: "Wallet · USD", currency: "USD" });
const expenseInput = () =>
  createTransactionInput.parse({
    id: transactionId,
    date: accountingDate("2026-08-23"),
    type: "expense",
    accountId,
    amountOriginal: "10",
    currency: "USD",
  });

beforeEach(() => {
  removed = [];
  forcedExisting = new Set();
  directory = mkdtempSync(join(tmpdir(), "waltning-session-"));
  paths = { replica: join(directory, "replica.db"), outbox: join(directory, "outbox.db") };
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe("the phone ledger session", () => {
  it("opens, migrates, seeds USD, reads, then releases both safety copies", () => {
    const session = createLocalLedgerSession(options());

    expect(paths.replica).not.toBe(paths.outbox);
    expect(existsSync(paths.replica)).toBe(true);
    expect(existsSync(paths.outbox)).toBe(true);
    expect(existsSync(`${paths.replica}.pre-migration`)).toBe(false);
    expect(existsSync(`${paths.outbox}.pre-migration`)).toBe(false);
    expect(session.listAccounts()).toEqual([]);
    expect(session.listRecent(5)).toEqual([]);

    const sqlite = new Database(paths.replica, { readonly: true });
    expect(sqlite.prepare("select code, is_pivot from currencies").all()).toEqual([
      { code: "USD", is_pivot: 1 },
    ]);
    sqlite.close();
    session.close();
  });

  it("keeps an account and expense through close and a new session", () => {
    const first = createLocalLedgerSession(options());
    first.createAccount(accountInput(), capture);
    first.createTransaction(expenseInput(), capture);
    first.close();

    const second = createLocalLedgerSession(options());
    expect(second.listAccounts()[0]?.balance).toBe("-10.00000000");
    expect(second.listRecent(5)[0]?.id).toBe(transactionId);
    second.close();
  });

  it("replays an intent whose replica half is missing before the first read", () => {
    createLocalLedgerSession(options()).close();
    const ledger = openLedger(open, paths);
    migrateOutbox(ledger.outbox, { fs });
    migrateReplica(ledger.replica, { fs, canRefetch: false });
    ledger.outbox.db
      .insert(outbox)
      .values({
        seq: 1,
        operation: "create_account",
        opVersion: 1,
        payload: accountInput(),
        deps: [],
        capturedTz: capture.timeZone,
        capturedOffsetMinutes: capture.offsetMinutes,
      })
      .run();
    ledger.outbox.db.update(outboxSeq).set({ issued: 2 }).run();
    ledger.close();

    const recovered = createLocalLedgerSession(options());
    expect(recovered.listAccounts().map((account) => account.id)).toEqual([accountId]);
    recovered.close();
  });

  it("reset removes both stores and every sibling, reseeds, and returns empty", () => {
    const session = createLocalLedgerSession(options());
    session.createAccount(accountInput(), capture);
    session.createTransaction(expenseInput(), capture);
    for (const path of [paths.replica, paths.outbox]) {
      for (const suffix of ["-wal", "-shm", ".pre-migration"]) {
        forcedExisting.add(`${path}${suffix}`);
      }
    }
    removed = [];

    session.reset();

    expect(session.listAccounts()).toEqual([]);
    expect(session.listRecent(5)).toEqual([]);
    for (const path of [paths.replica, paths.outbox]) {
      for (const suffix of ["-wal", "-shm", ".pre-migration"]) {
        expect(removed).toContain(`${path}${suffix}`);
      }
      expect(existsSync(`${path}.pre-migration`)).toBe(false);
    }
    session.createAccount(accountInput(), capture);
    expect(session.listAccounts()).toHaveLength(1);
    session.close();
  });

  it("refuses a replica version mismatch rather than dropping the only ledger", () => {
    const first = createLocalLedgerSession(options());
    first.createAccount(accountInput(), capture);
    first.close();

    const sqlite = new Database(paths.replica);
    sqlite.pragma("user_version = 99");
    sqlite.close();

    expect(() => createLocalLedgerSession(options())).toThrow(/only copy of the ledger/);

    const proof = new Database(paths.replica, { readonly: true });
    expect(proof.prepare("select count(*) as count from accounts").get()).toEqual({ count: 1 });
    proof.close();
  });

  it("reset deletes an unmaterialised outbox entry too", () => {
    const session = createLocalLedgerSession(options());
    const sqlite = new Database(paths.outbox);
    sqlite
      .prepare(
        "insert into outbox (id, seq, operation, payload, deps, op_version, captured_at, captured_tz, captured_offset_minutes) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "33333333-3333-4333-8333-333333333333",
        1,
        "create_account",
        JSON.stringify(accountInput()),
        "[]",
        1,
        Date.now(),
        capture.timeZone,
        capture.offsetMinutes,
      );
    sqlite.close();

    session.reset();
    session.close();

    const proof = new Database(paths.outbox, { readonly: true });
    expect(proof.prepare("select count(*) as count from outbox").get()).toEqual({ count: 0 });
    proof.close();
  });
});
