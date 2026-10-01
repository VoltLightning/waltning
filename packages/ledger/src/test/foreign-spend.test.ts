/**
 * §7.8 — an entry paid in another currency than its account's, on the phone.
 *
 * `350 CZK` paid with a EUR card is stored as the account-side figure (the
 * EUR the account was charged, which every balance and period figure reads)
 * beside the paid figure (`350`, `CZK`). What is proven here, against two real
 * files: the executors write and edit the pair, every refused shape is refused
 * by the executor *and* — with the executor out of the way — by the replica's
 * own trigger, the figures read the account side, search finds either figure,
 * and a backup carries the pair through a restore.
 *
 * The Postgres half (the CHECKs, the scale trigger) is `packages/db`'s own
 * `foreign-spend.test.ts` and `check-validated.test.ts`.
 */

import { randomBytes } from "node:crypto";
import { decrypt } from "@waltning/core/age/format";
import { generateKeyPair } from "@waltning/core/age/keys";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccountExecutor } from "../accounts/create-account.executor.ts";
import { readAccounts } from "../accounts/read-accounts.ts";
import { BACKUP_FORMAT, parseBackup } from "../backup/document.ts";
import { exportLedger } from "../backup/export.ts";
import { restoreBackup } from "../backup/restore.ts";
import { createCounterpartyExecutor } from "../counterparties/create-counterparty.executor.ts";
import { settleDebtExecutor } from "../counterparties/settle-debt.executor.ts";
import { archiveCurrencyExecutor } from "../currencies/archive-currency.executor.ts";
import { updateCurrencyExecutor } from "../currencies/update-currency.executor.ts";
import { ledgerRegistry } from "../registry.ts";
import { ledgerSchema } from "../schema-map.ts";
import { createTransactionExecutor } from "../transactions/create-transaction.executor.ts";
import { readPeriodSpend } from "../transactions/read-period-spend.ts";
import { readTransaction } from "../transactions/read-transaction.ts";
import { searchTransactions } from "../transactions/search-transactions.ts";
import { supersedeTransactionExecutor } from "../transactions/supersede-transaction.executor.ts";
import { updateTransactionExecutor } from "../transactions/update-transaction.executor.ts";
import { type Capture, writeLocally } from "../write.ts";
import { nodeFs, type ScratchStores, scratchStores } from "./stores.ts";

const { currencies, transactions } = ledgerSchema;
const EUR = currencyCode("EUR");
const CZK = currencyCode("CZK");
const JPY = currencyCode("JPY");
const capture: Capture = { timeZone: "Europe/Prague", offsetMinutes: 120 };
const ACCOUNT = id<"accounts">("00000000-0000-4000-8000-00000000000a");
const TXN = id<"transactions">("00000000-0000-4000-8000-000000000001");
const TXN_2 = id<"transactions">("00000000-0000-4000-8000-000000000002");

let stores: ScratchStores;

beforeEach(() => {
  stores = scratchStores();
  // EUR is the pivot, so a EUR entry needs no rate; CZK and JPY differ in
  // decimals so the paid figure's own scale is what is exercised.
  stores.ledger.replica.db
    .insert(currencies)
    .values([
      { code: EUR, name: "Euro", decimals: 2, isPivot: true },
      { code: CZK, name: "Czech koruna", decimals: 2 },
      { code: JPY, name: "Yen", decimals: 0 },
    ])
    .run();
  writeLocally(stores.ledger, {
    executor: createAccountExecutor,
    registry: ledgerRegistry,
    capture,
    input: { id: ACCOUNT, name: "Bank A · EUR", currency: EUR },
  });
});
afterEach(() => stores.close());

const create = (input: Record<string, unknown>) =>
  writeLocally(stores.ledger, {
    executor: createTransactionExecutor,
    registry: ledgerRegistry,
    capture,
    input: {
      id: TXN,
      date: "2026-09-01",
      type: "expense",
      accountId: ACCOUNT,
      amountOriginal: "14.02",
      currency: EUR,
      enteredName: "Coffee",
      ...input,
    },
  });

const update = (patch: Record<string, unknown>) =>
  writeLocally(stores.ledger, {
    executor: updateTransactionExecutor,
    registry: ledgerRegistry,
    capture,
    input: { id: TXN, version: readRow()?.version ?? 0, patch },
  });

const readRow = () =>
  stores.ledger.replica.db.select().from(transactions).where(eq(transactions.id, TXN)).get();

const paid = { paidAmount: "350", paidCurrency: CZK };

describe("create_transaction with a paid pair", () => {
  it("stores the charged figure and the paid figure, and the balance reads the charged one", () => {
    create(paid);

    const row = readRow();
    expect(row?.amountOriginal).toBe("14.02000000");
    expect(row?.currency).toBe(EUR);
    expect(row?.paidAmount).toBe("350.00000000");
    expect(row?.paidCurrency).toBe(CZK);

    const [account] = readAccounts(stores.ledger.replica.db);
    expect(account?.balance, "−14.02 EUR — what the account was charged").toBe(
      money.toMoney("-14.02"),
    );

    const detail = readTransaction(stores.ledger.replica.db, TXN);
    expect(detail?.amount).toBe(money.toMoney("-14.02"));
    expect(detail?.paidAmount).toBe("350.00000000");
    expect(detail?.paidCurrency).toBe(CZK);
    expect(detail?.paidDecimals).toBe(2);
  });

  it("leaves a period's spend on the charged figure", () => {
    create(paid);
    const rows = readPeriodSpend(stores.ledger.replica.db, {
      start: accountingDate("2026-09-01"),
      end: accountingDate("2026-10-01"),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.currency).toBe(EUR);
    expect(rows[0]?.spend, "what the account was charged, not what was paid").toBe(
      money.toMoney("14.02"),
    );
  });

  it("is found by either figure, and by the paid currency", () => {
    create(paid);
    const db = stores.ledger.replica.db;
    expect(searchTransactions(db, { text: "350" }).rows.map((r) => r.id)).toEqual([TXN]);
    expect(searchTransactions(db, { text: "14,02" }).rows.map((r) => r.id)).toEqual([TXN]);
    expect(searchTransactions(db, { currency: CZK }).rows.map((r) => r.id)).toEqual([TXN]);
    const [row] = searchTransactions(db, {}).rows;
    expect(row?.paidAmount).toBe("350.00000000");
    expect(row?.paidCurrency).toBe(CZK);
    expect(row?.paidDecimals).toBe(2);
    expect(row?.amount, "the row's own figure stays the account side").toBe(
      money.toMoney("-14.02"),
    );
  });

  it("writes none when none is given", () => {
    create({});
    expect(readRow()?.paidAmount).toBeNull();
    expect(readRow()?.paidCurrency).toBeNull();
  });

  describe("refuses, by the contract", () => {
    it("an amount without its currency", () => {
      expect(() => create({ paidAmount: "350" })).toThrow(/transactions_paid_shape/);
    });
    it("a currency without its amount", () => {
      expect(() => create({ paidCurrency: CZK })).toThrow(/transactions_paid_shape/);
    });
    it("the account's own currency", () => {
      expect(() => create({ paidAmount: "14.02", paidCurrency: EUR })).toThrow(
        /transactions_paid_distinct/,
      );
    });
    it("a transfer", () => {
      expect(() =>
        create({
          type: "transfer",
          toAccountId: id<"accounts">("00000000-0000-4000-8000-00000000000b"),
          toAmount: "1",
          toCurrency: CZK,
          ...paid,
        }),
      ).toThrow(/transactions_paid_type/);
    });
    it("a zero amount", () => {
      expect(() => create({ paidAmount: "0", paidCurrency: CZK })).toThrow(
        /transactions_paid_amount_positive/,
      );
    });
    it("an amount at the ceiling", () => {
      expect(() => create({ paidAmount: "1000000000", paidCurrency: CZK })).toThrow(
        /amounts_below_ceiling/,
      );
    });
  });

  describe("refuses, by the executor", () => {
    it("a figure past the paid currency's own decimals — not the account's", () => {
      // 350.50 is fine for EUR (the account) and past JPY's none.
      expect(() => create({ paidAmount: "350.50", paidCurrency: JPY })).toThrow(
        /paid_amount .* more decimal places than JPY/,
      );
      create({ paidAmount: "350", paidCurrency: JPY });
      expect(readRow()?.paidCurrency).toBe(JPY);
    });
  });
});

describe("the replica's own triggers hold when the executor is bypassed", () => {
  const insert = (values: Partial<typeof transactions.$inferInsert>) =>
    stores.ledger.replica.db
      .insert(transactions)
      .values({
        id: TXN,
        date: accountingDate("2026-09-01"),
        type: "expense",
        accountId: ACCOUNT,
        amountOriginal: money.toMoney("14.02"),
        currency: EUR,
        fxRate: money.pivotPerUnit("1"),
        ...values,
      })
      .run();

  it("transactions_paid_shape", () => {
    expect(() => insert({ paidAmount: money.toMoney("350") })).toThrow(/transactions_paid_shape/);
    expect(() => insert({ paidCurrency: CZK })).toThrow(/transactions_paid_shape/);
  });
  it("transactions_paid_distinct", () => {
    expect(() => insert({ paidAmount: money.toMoney("14.02"), paidCurrency: EUR })).toThrow(
      /transactions_paid_distinct/,
    );
  });
  it("transactions_paid_type", () => {
    expect(() =>
      insert({ type: "adjustment", paidAmount: money.toMoney("350"), paidCurrency: CZK }),
    ).toThrow(/transactions_paid_type/);
  });
  it("transactions_paid_amount_positive", () => {
    expect(() => insert({ paidAmount: money.toMoney("0"), paidCurrency: CZK })).toThrow(
      /transactions_paid_amount_positive/,
    );
  });
  it("transactions_paid_amount_ceiling", () => {
    expect(() => insert({ paidAmount: money.toMoney("1000000000"), paidCurrency: CZK })).toThrow(
      /transactions_paid_amount_ceiling/,
    );
  });
  it("refuses the same on an update", () => {
    create(paid);
    const set = (values: Partial<typeof transactions.$inferInsert>) =>
      stores.ledger.replica.db
        .update(transactions)
        .set(values)
        .where(eq(transactions.id, TXN))
        .run();
    expect(() => set({ paidCurrency: EUR })).toThrow(/transactions_paid_distinct/);
    expect(() => set({ paidAmount: money.toMoney("0") })).toThrow(
      /transactions_paid_amount_positive/,
    );
    expect(() => set({ paidAmount: null })).toThrow(/transactions_paid_shape/);
    expect(() => set({ paidAmount: money.toMoney("1000000000") })).toThrow(
      /transactions_paid_amount_ceiling/,
    );
  });
});

describe("update_transaction", () => {
  it("edits the charged figure and leaves what was paid alone", () => {
    create(paid);
    update({ amountOriginal: "13.90" });
    const row = readRow();
    expect(row?.amountOriginal).toBe("13.90000000");
    expect(row?.paidAmount).toBe("350.00000000");
    expect(readAccounts(stores.ledger.replica.db)[0]?.balance).toBe(money.toMoney("-13.90"));
  });

  it("edits the paid figure and currency", () => {
    create(paid);
    update({ paidAmount: "9000", paidCurrency: JPY });
    expect(readRow()?.paidCurrency).toBe(JPY);
    expect(readRow()?.paidAmount).toBe("9000.00000000");
  });

  it("takes the pair off, both at once", () => {
    create(paid);
    update({ paidAmount: null, paidCurrency: null });
    expect(readRow()?.paidAmount).toBeNull();
    expect(readRow()?.paidCurrency).toBeNull();
  });

  it("puts a pair on an entry that had none", () => {
    create({});
    update({ paidAmount: "350", paidCurrency: CZK });
    expect(readRow()?.paidCurrency).toBe(CZK);
  });

  it("refuses half a pair, the account's own currency, and a figure past the scale", () => {
    create(paid);
    expect(() => update({ paidAmount: null })).toThrow(/transactions_paid_shape/);
    expect(() => update({ paidCurrency: EUR })).toThrow(/transactions_paid_distinct/);
    expect(() => update({ paidAmount: "350.50", paidCurrency: JPY })).toThrow(
      /paid_amount .* more decimal places than JPY/,
    );
    expect(() => update({ paidAmount: "1000000000" })).toThrow(/ceiling/);
    expect(readRow()?.paidAmount, "nothing was written").toBe("350.00000000");
  });
});

describe("supersede_transaction", () => {
  it("carries the pair onto the replacement", () => {
    create(paid);
    writeLocally(stores.ledger, {
      executor: supersedeTransactionExecutor,
      registry: ledgerRegistry,
      capture,
      input: {
        supersedesId: TXN,
        supersedesVersion: readRow()?.version ?? 0,
        replacement: {
          id: TXN_2,
          date: "2026-09-01",
          type: "expense",
          accountId: ACCOUNT,
          amountOriginal: "14.05",
          currency: EUR,
          source: "import",
          paidAmount: "351",
          paidCurrency: CZK,
        },
      },
    });
    const replaced = stores.ledger.replica.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, TXN_2))
      .get();
    expect(replaced?.paidAmount).toBe("351.00000000");
    expect(replaced?.paidCurrency).toBe(CZK);
  });
});

describe("a repayment has no paid side (§7.8)", () => {
  const NINA = id<"counterparties">("00000000-0000-4000-8000-0000000000c1");
  const settle = (supersedes: boolean) => {
    writeLocally(stores.ledger, {
      executor: createCounterpartyExecutor,
      registry: ledgerRegistry,
      capture,
      input: { id: NINA, name: "Nina", kind: "person" },
    });
    return writeLocally(stores.ledger, {
      executor: settleDebtExecutor,
      registry: ledgerRegistry,
      capture,
      input: {
        id: TXN_2,
        counterpartyId: NINA,
        accountId: ACCOUNT,
        date: "2026-09-02",
        amount: "14.02",
        currency: EUR,
        type: "expense",
        discharges: { currency: EUR, amount: "14.02" },
        ...(supersedes ? { supersedesId: TXN, supersedesVersion: readRow()?.version ?? 0 } : {}),
      },
    });
  };

  it("refuses to re-file a foreign-paid row as a repayment — the pair would be dropped", () => {
    create(paid);
    expect(() => settle(true)).toThrow(/take the paid currency off first/);
    expect(readRow()?.deletedAt, "the original is intact").toBeNull();
  });

  it("refuses update_transaction putting a paid pair on a settlement", () => {
    create({});
    // A row settle_debt wrote carries its discharge; written directly here to isolate update_transaction.
    stores.ledger.replica.db
      .update(transactions)
      .set({ debtCurrency: EUR, debtAmount: money.toMoney("14.02") })
      .where(eq(transactions.id, TXN))
      .run();
    expect(() => update({ paidAmount: "350", paidCurrency: CZK })).toThrow(
      /update_transaction: a repayment has no paid side/,
    );
  });

  it("is held by the replica's trigger when the executor is bypassed", () => {
    create({});
    const db = stores.ledger.replica.db;
    db.update(transactions)
      .set({ debtCurrency: EUR, debtAmount: money.toMoney("14.02") })
      .where(eq(transactions.id, TXN))
      .run();
    expect(() =>
      db
        .update(transactions)
        .set({ paidAmount: money.toMoney("350"), paidCurrency: CZK })
        .where(eq(transactions.id, TXN))
        .run(),
    ).toThrow(/transactions_paid_not_settlement/);
    // …and from the other side: a discharge onto a row that has a paid pair.
    db.update(transactions)
      .set({ debtCurrency: null, debtAmount: null })
      .where(eq(transactions.id, TXN))
      .run();
    db.update(transactions)
      .set({ paidAmount: money.toMoney("350"), paidCurrency: CZK })
      .where(eq(transactions.id, TXN))
      .run();
    expect(() =>
      db
        .update(transactions)
        .set({ debtCurrency: EUR, debtAmount: money.toMoney("14.02") })
        .where(eq(transactions.id, TXN))
        .run(),
    ).toThrow(/transactions_paid_not_settlement/);
  });
});

describe("a currency that an entry was paid in is in use", () => {
  it("cannot be archived while the entry is live", () => {
    create(paid);
    expect(() =>
      writeLocally(stores.ledger, {
        executor: archiveCurrencyExecutor,
        registry: ledgerRegistry,
        capture,
        input: { code: CZK, version: 1 },
      }),
    ).toThrow(/CZK still names 1 live transaction/);
  });

  it("cannot have its decimals lowered under the paid figure", () => {
    create({ paidAmount: "350.50", paidCurrency: CZK });
    expect(() =>
      writeLocally(stores.ledger, {
        executor: updateCurrencyExecutor,
        registry: ledgerRegistry,
        capture,
        input: { code: CZK, version: 1, patch: { decimals: 0 } },
      }),
    ).toThrow(/decimals cannot shrink/);
  });
});

describe("a backup", () => {
  const random = (length: number) => new Uint8Array(randomBytes(length));
  const keys = generateKeyPair(random);

  it("carries the pair through a restore, and the balance with it", () => {
    create(paid);
    const { file } = exportLedger(
      { replica: stores.ledger.replica.db, outbox: stores.ledger.outbox.db },
      {
        recipient: keys.recipient,
        now: new Date("2026-09-16T09:00:00.000Z"),
        random,
        verifyWith: keys.identity,
      },
    );
    const backup = parseBackup(decrypt(file, keys.identity), { format: BACKUP_FORMAT });
    const clean = scratchStores();
    try {
      restoreBackup({ replica: clean.ledger.replica, outbox: clean.ledger.outbox }, backup, {
        fs: nodeFs,
      });
      const back = clean.ledger.replica.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, TXN))
        .get();
      expect(back?.paidAmount).toBe("350.00000000");
      expect(back?.paidCurrency).toBe(CZK);
      expect(back?.amountOriginal).toBe("14.02000000");
      expect(readAccounts(clean.ledger.replica.db)[0]?.balance).toBe(money.toMoney("-14.02"));
    } finally {
      clean.close();
    }
  });
});
