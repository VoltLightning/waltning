/**
 * §6.6 — an obligation is a person and the role it is owed in, both or neither
 * (`transactions_obligation_pair_shape`). Proven on the phone's replica twice:
 * `update_transaction` refuses a merged row that would hold one without the
 * other, with a message naming the field, and — with the executor out of the
 * way — the replica's own trigger refuses it too. The Postgres CHECK is
 * `packages/db`'s own.
 */

import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccountExecutor } from "../accounts/create-account.executor.ts";
import { createCounterpartyExecutor } from "../counterparties/create-counterparty.executor.ts";
import { ledgerRegistry } from "../registry.ts";
import { ledgerSchema } from "../schema-map.ts";
import { createTransactionExecutor } from "../transactions/create-transaction.executor.ts";
import { updateTransactionExecutor } from "../transactions/update-transaction.executor.ts";
import { type Capture, writeLocally } from "../write.ts";
import { type ScratchStores, scratchStores } from "./stores.ts";

const { currencies, transactions } = ledgerSchema;
const EUR = currencyCode("EUR");
const capture: Capture = { timeZone: "Europe/Prague", offsetMinutes: 120 };
const ACCOUNT = id<"accounts">("00000000-0000-4000-8000-00000000000a");
const TXN = id<"transactions">("00000000-0000-4000-8000-000000000001");
const NINA = id<"counterparties">("00000000-0000-4000-8000-0000000000b1");

let stores: ScratchStores;

beforeEach(() => {
  stores = scratchStores();
  stores.ledger.replica.db
    .insert(currencies)
    .values([{ code: EUR, name: "Euro", decimals: 2, isPivot: true }])
    .run();
  writeLocally(stores.ledger, {
    executor: createAccountExecutor,
    registry: ledgerRegistry,
    capture,
    input: { id: ACCOUNT, name: "Bank A · EUR", currency: EUR },
  });
  writeLocally(stores.ledger, {
    executor: createCounterpartyExecutor,
    registry: ledgerRegistry,
    capture,
    input: { id: NINA, name: "Nina", kind: "person" },
  });
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
    },
  });
});
afterEach(() => stores.close());

const readRow = () =>
  stores.ledger.replica.db.select().from(transactions).where(eq(transactions.id, TXN)).get();

const update = (patch: Record<string, unknown>) =>
  writeLocally(stores.ledger, {
    executor: updateTransactionExecutor,
    registry: ledgerRegistry,
    capture,
    input: { id: TXN, version: readRow()?.version ?? 0, patch },
  });

describe("update_transaction", () => {
  it("refuses a person with no role, and writes nothing", () => {
    expect(() => update({ obligationCounterpartyId: NINA })).toThrow(
      /an obligation and its role travel together/,
    );
    expect(readRow()?.obligationCounterpartyId).toBeNull();
  });

  it("refuses a role with no person", () => {
    expect(() => update({ obligationRole: "debt" })).toThrow(/travel together/);
  });

  it("takes the pair together", () => {
    update({ obligationCounterpartyId: NINA, obligationRole: "contribution" });
    expect(readRow()?.obligationCounterpartyId).toBe(NINA);
    update({ obligationCounterpartyId: null, obligationRole: null });
    expect(readRow()?.obligationRole).toBeNull();
  });

  it("refuses to take away only the role, or only the person, of a pair the row holds", () => {
    update({ obligationCounterpartyId: NINA, obligationRole: "contribution" });
    expect(() => update({ obligationRole: null })).toThrow(/travel together/);
    expect(() => update({ obligationCounterpartyId: null })).toThrow(/travel together/);
  });
});

describe("the replica's own trigger holds when the executor is bypassed", () => {
  const set = (values: Partial<typeof transactions.$inferInsert>) =>
    stores.ledger.replica.db.update(transactions).set(values).where(eq(transactions.id, TXN)).run();

  it("transactions_obligation_pair_shape, on update", () => {
    expect(() => set({ obligationCounterpartyId: NINA })).toThrow(
      /transactions_obligation_pair_shape/,
    );
    expect(() => set({ obligationRole: "debt" })).toThrow(/transactions_obligation_pair_shape/);
  });

  it("transactions_obligation_pair_shape, on insert", () => {
    expect(() =>
      stores.ledger.replica.db
        .insert(transactions)
        .values({
          id: id<"transactions">("00000000-0000-4000-8000-000000000002"),
          date: accountingDate("2026-09-01"),
          type: "expense",
          accountId: ACCOUNT,
          amountOriginal: money.toMoney("1"),
          currency: EUR,
          fxRate: money.pivotPerUnit("1"),
          obligationCounterpartyId: NINA,
        })
        .run(),
    ).toThrow(/transactions_obligation_pair_shape/);
  });
});
