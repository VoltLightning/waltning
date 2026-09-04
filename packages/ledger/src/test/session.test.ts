import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { currencies as referenceCurrencies } from "@waltning/core/currencies";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode, pivotPerUnit, toMoney } from "@waltning/core/money";
import {
  createAccountInput,
  createCategoryInput,
  createTransactionInput,
} from "@waltning/core/registry/inputs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type LedgerFs, migrateOutbox, migrateReplica } from "../migrate.ts";
import { type LedgerPaths, openLedger, type SqliteOpener } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";
import { type BootstrapCurrency, createLocalLedgerSession } from "../session.ts";

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

const bootstrapCurrencies: readonly BootstrapCurrency[] = referenceCurrencies.map(
  ({ rateSource: _rateSource, ...currency }) => currency,
);

const options = () => ({
  open,
  paths,
  fs,
  removeDatabase: (path: string) => rmSync(path, { force: true }),
  bootstrapCurrencies,
});

const accountInput = () =>
  createAccountInput.parse({ id: accountId, name: "Bank A · PLN", currency: "PLN" });
/**
 * A złoty expense with the rate asserted — §7.6 level 1, *"enter the rate your
 * bank actually applied"*, which `provisionalFxRate` takes as case 1.
 *
 * The account is in PLN and the pivot is USD, so this row is the proof that the
 * replica holds a currency other than the pivot end to end. It also names the
 * one thing that is **not** yet solved: with no asserted rate and no `fx_rates`
 * row, the executor refuses rather than valuing the row at `1` — correct, and
 * the reason `#e3` has to land before capture in a second currency is routine.
 */
const expenseInput = () =>
  createTransactionInput.parse({
    id: transactionId,
    date: accountingDate("2026-08-23"),
    type: "expense",
    accountId,
    amountOriginal: "10",
    currency: "PLN",
    fxRate: pivotPerUnit("0.250000000000"),
  });

beforeEach(() => {
  removed = [];
  forcedExisting = new Set();
  directory = mkdtempSync(join(tmpdir(), "waltning-session-"));
  paths = { replica: join(directory, "replica.db"), outbox: join(directory, "outbox.db") };
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe("the phone ledger session", () => {
  it("opens, migrates, seeds every reference currency, reads, then releases both copies", () => {
    const diagnostics: object[] = [];
    const session = createLocalLedgerSession({
      ...options(),
      diagnostics: (event: object) => diagnostics.push(event),
    });

    expect(paths.replica).not.toBe(paths.outbox);
    expect(existsSync(paths.replica)).toBe(true);
    expect(existsSync(paths.outbox)).toBe(true);
    expect(existsSync(`${paths.replica}.pre-migration`)).toBe(false);
    expect(existsSync(`${paths.outbox}.pre-migration`)).toBe(false);
    expect(session.listAccounts()).toEqual([]);
    expect(session.listRecent(5)).toEqual([]);
    expect(diagnostics).toEqual([
      { scope: "ledger_startup", phase: "start", stage: "open" },
      { scope: "ledger_startup", phase: "success", stage: "ready" },
    ]);

    // Every one of them, because `accounts.currency` is a foreign key into this
    // table: what is seeded here is exactly the set of currencies an account can
    // be opened in, and one row was the whole single-currency assumption.
    const sqlite = new Database(paths.replica, { readonly: true });
    const seeded = sqlite.prepare("select code, is_pivot from currencies order by code").all();
    expect(seeded).toEqual(
      [...referenceCurrencies]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((currency) => ({ code: currency.code, is_pivot: currency.isPivot ? 1 : 0 })),
    );
    expect(seeded.length).toBeGreaterThan(1);
    sqlite.close();
    session.close();
  });

  /**
   * **What the replica can value, asked before the write rather than during it.**
   *
   * `provisionalFxRate` resolves `1` for the pivot and the last-known rate for
   * anything else, and refuses when there is neither. `capturable` asks the same
   * question in advance, so a screen can decline with a reason instead of
   * letting the executor throw from inside a transaction that has already
   * committed the outbox entry.
   *
   * A fresh replica has `fx_rates` empty, so exactly one currency is capturable
   * on a phone that has never synced — and that is the boundary this whole
   * change stops at: accounts in any currency, captures in the pivot.
   */
  it("marks only the pivot capturable while the replica holds no rates", () => {
    const session = createLocalLedgerSession(options());
    const byCode = new Map(session.listCurrencies().map((c) => [c.code, c.capturable]));

    expect(byCode.get(currencyCode("USD"))).toBe(true);
    expect(byCode.get(currencyCode("PLN"))).toBe(false);
    expect(byCode.get(currencyCode("BYN"))).toBe(false);
    expect([...byCode.values()].filter(Boolean)).toHaveLength(1);
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

  /**
   * C5: `update_transaction`, `delete_transaction` and `set_transaction_lines`
   * were A2 executors with no session method reaching them — the shared plan's
   * own rule is that exposing one is part of the screen's PR that needs it.
   * This is that exposure, and `getTransaction` alongside it: S09's whole
   * subject, joined once, `null` once the row is gone.
   */
  it("exposes getTransaction, updateTransaction, deleteTransaction and setTransactionLines", () => {
    const session = createLocalLedgerSession(options());
    session.createAccount(accountInput(), capture);
    session.createTransaction(expenseInput(), capture);

    const before = session.getTransaction(transactionId);
    expect(before).toMatchObject({ id: transactionId, payee: "", version: 1 });

    session.updateTransaction(
      { id: transactionId, version: before?.version ?? 0, patch: { payee: "Corner shop" } },
      capture,
    );
    const afterUpdate = session.getTransaction(transactionId);
    expect(afterUpdate).toMatchObject({ payee: "Corner shop", version: 2 });

    session.setTransactionLines(
      {
        transactionId,
        version: afterUpdate?.version ?? 0,
        lines: [
          {
            id: id<"transactionLines">("33333333-3333-4333-8333-333333333333"),
            description: "Bread",
            amount: toMoney("10"),
          },
        ],
      },
      capture,
    );
    const afterLines = session.getTransaction(transactionId);
    expect(afterLines?.lines).toMatchObject([{ description: "Bread", amount: "10.00000000" }]);

    session.deleteTransaction({ id: transactionId, version: afterLines?.version ?? 0 }, capture);
    expect(session.getTransaction(transactionId)).toBeNull();
    session.close();
  });

  it("replays an intent whose replica half is missing before the first read", () => {
    createLocalLedgerSession(options()).close();
    const ledger = openLedger(open, paths);
    migrateOutbox(ledger.outbox, { fs });
    migrateReplica(ledger.replica, { fs });
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

  it("refuses a replica version ahead of this build rather than guessing", () => {
    const first = createLocalLedgerSession(options());
    first.createAccount(accountInput(), capture);
    first.close();

    const sqlite = new Database(paths.replica);
    sqlite.pragma("user_version = 99");
    sqlite.close();

    const diagnostics: object[] = [];
    expect(() =>
      createLocalLedgerSession({
        ...options(),
        diagnostics: (event: object) => diagnostics.push(event),
      }),
    ).toThrow(/newer app/);
    expect(diagnostics.at(-1)).toMatchObject({
      scope: "ledger_startup",
      phase: "failure",
      stage: "migrate_replica",
      error: {
        name: "Error",
        message: expect.stringMatching(/newer app/),
        stack: expect.any(String),
      },
    });

    const proof = new Database(paths.replica, { readonly: true });
    expect(proof.prepare("select count(*) as count from accounts").get()).toEqual({ count: 1 });
    proof.close();
  });

  /**
   * No `create_group` operation exists on `main` yet (A3), so the fixture
   * inserts the row directly — the same way "replays an intent" above reaches
   * under `createLocalLedgerSession` to set up a state no executor can build.
   */
  it("lists groups sorted, with institution and an ungrouped account unaffected", () => {
    const session = createLocalLedgerSession(options());
    const sqlite = new Database(paths.replica);
    sqlite
      .prepare("insert into account_groups (id, name, institution, sort) values (?, ?, ?, ?)")
      .run("44444444-4444-4444-8444-444444444444", "Household", "Bank A", 1);
    sqlite
      .prepare("insert into account_groups (id, name, institution, sort) values (?, ?, ?, ?)")
      .run("55555555-5555-4555-8555-555555555555", "Business", null, 0);
    sqlite.close();

    expect(session.listGroups()).toEqual([
      {
        id: "55555555-5555-4555-8555-555555555555",
        name: "Business",
        institution: null,
        sort: 0,
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        name: "Household",
        institution: "Bank A",
        sort: 1,
      },
    ]);

    session.createAccount(accountInput(), capture);
    expect(session.listAccounts()[0]?.id).toBe(accountId);
    session.close();
  });

  /**
   * `listCategoryTree` carries groups and leaves both, unlike `listCategories`
   * (leaves only, for the quick-add picker) — S06's sheet needs the whole
   * shape to browse and filter by group.
   */
  it("lists the whole category tree, groups and leaves, archived excluded", () => {
    const session = createLocalLedgerSession(options());
    const sqlite = new Database(paths.replica);
    const insert = sqlite.prepare(
      "insert into categories (id, parent_id, name, kind, is_leaf, archived, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    insert.run("66666666-6666-4666-8666-666666666666", null, "Food", "expense", 0, 0, 0, 0);
    insert.run(
      "77777777-7777-4777-8777-777777777777",
      "66666666-6666-4666-8666-666666666666",
      "Groceries",
      "expense",
      1,
      0,
      0,
      0,
    );
    insert.run(
      "88888888-8888-4888-8888-888888888888",
      "66666666-6666-4666-8666-666666666666",
      "Retired",
      "expense",
      1,
      1,
      0,
      0,
    );
    sqlite.close();

    const tree = session.listCategoryTree();
    expect(tree.map((c) => c.name)).toEqual(["Food", "Groceries"]);
    expect(tree.find((c) => c.name === "Food")).toMatchObject({ isLeaf: false, parentId: null });
    expect(tree.find((c) => c.name === "Groceries")).toMatchObject({
      isLeaf: true,
      parentId: "66666666-6666-4666-8666-666666666666",
    });
    session.close();
  });

  it("creates a category and the tree carries it immediately", () => {
    const session = createLocalLedgerSession(options());
    const groupId = "99999999-9999-4999-8999-999999999999";
    const sqlite = new Database(paths.replica);
    sqlite
      .prepare(
        "insert into categories (id, parent_id, name, kind, is_leaf, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(groupId, null, "Food", "expense", 0, 0, 0);
    sqlite.close();

    const leafId = id<"categories">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const row = session.createCategory(
      createCategoryInput.parse({
        id: leafId,
        name: "Eating out",
        kind: "expense",
        parentId: groupId,
      }),
      capture,
    );
    expect(row.name).toBe("Eating out");
    expect(session.listCategoryTree().find((c) => c.id === leafId)).toMatchObject({
      name: "Eating out",
      isLeaf: true,
      parentId: groupId,
    });
    session.close();
  });

  /**
   * C4 — `categorizeBatch` and `searchTransactions` are the two methods this
   * PR adds to `LocalLedgerSession`. This only proves each is a one-line
   * passthrough onto the executor/query already tested in depth elsewhere
   * (`transaction-ops.test.ts`'s `categorize_batch` suite,
   * `search-transactions.test.ts`) — end to end, through the real session.
   */
  it("categorizeBatch sets the category, and searchTransactions finds the row by it", () => {
    const session = createLocalLedgerSession(options());
    session.createAccount(accountInput(), capture);
    session.createTransaction(expenseInput(), capture);
    const categoryId = id<"categories">("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    const sqlite = new Database(paths.replica);
    sqlite
      .prepare(
        "insert into categories (id, parent_id, name, kind, is_leaf, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(categoryId, null, "Groceries", "expense", 1, 0, 0);
    sqlite.close();

    const updated = session.categorizeBatch(
      { transactionIds: [transactionId], categoryId },
      capture,
    );
    expect(updated).toHaveLength(1);
    expect(updated[0]?.categoryId).toBe(categoryId);

    const found = session.searchTransactions({ categoryIds: [categoryId] });
    expect(found.rows.map((row) => row.id)).toEqual([transactionId]);
    expect(found.total).toEqual({
      count: 1,
      currencies: [
        {
          currency: "PLN",
          decimals: 2,
          sum: "-10.00000000",
          sumExcludingCapital: "-10.00000000",
          capitalCount: 0,
        },
      ],
    });
    session.close();
  });

  it("listPayeeHistory exposes D2's reader — D4b's proposal calls it", () => {
    const session = createLocalLedgerSession(options());
    session.createAccount(accountInput(), capture);
    session.createTransaction(expenseInput(), capture);
    const categoryId = id<"categories">("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    const sqlite = new Database(paths.replica);
    sqlite
      .prepare(
        "insert into categories (id, parent_id, name, kind, is_leaf, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(categoryId, null, "Groceries", "expense", 1, 0, 0);
    sqlite.close();

    session.categorizeBatch({ transactionIds: [transactionId], categoryId }, capture);
    session.updateTransaction(
      { id: transactionId, version: 2, patch: { payee: "Corner shop" } },
      capture,
    );

    expect(session.listPayeeHistory()).toEqual([
      { payee: "Corner shop", categoryId, date: accountingDate("2026-08-23") },
    ]);
    session.close();
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
