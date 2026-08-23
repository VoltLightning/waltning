import { accountingDate } from "@waltning/core/date";
import { type IdTable, id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import {
  createPhoneLedger,
  type PhoneAccount,
  type PhoneLedgerPort,
  type PhoneRecentTransaction,
} from "./create-phone-ledger.ts";

function harness() {
  let accounts: PhoneAccount[] = [];
  let recent: PhoneRecentTransaction[] = [];
  const createAccount = vi.fn<PhoneLedgerPort["createAccount"]>((input) => {
    accounts = [
      ...accounts,
      {
        id: input.id,
        name: input.name,
        kind: input.kind,
        currency: input.currency,
        decimals: 2,
        balance: input.openingBalance,
      },
    ];
  });
  const createTransaction = vi.fn<PhoneLedgerPort["createTransaction"]>((input) => {
    const account = accounts.find((candidate) => candidate.id === input.accountId);
    if (!account) throw new Error("fixture account missing");
    accounts = accounts.map((candidate) =>
      candidate.id === input.accountId
        ? { ...candidate, balance: money.sub(candidate.balance, input.amountOriginal) }
        : candidate,
    );
    recent = [
      {
        id: input.id,
        date: input.date,
        payee: input.payee,
        categoryName: null,
        accountName: account.name,
        amount: money.neg(input.amountOriginal),
        currency: input.currency,
        decimals: 2,
        isBusiness: input.isBusiness,
      },
      ...recent,
    ];
  });
  const reset = vi.fn(() => {
    accounts = [];
    recent = [];
  });
  const port: PhoneLedgerPort = {
    listAccounts: () => accounts,
    listRecent: (limit) => recent.slice(0, limit),
    createAccount,
    createTransaction,
    reset,
  };
  const capture = vi.fn(() => ({
    date: accountingDate("2026-08-23"),
    timeZone: "Europe/Warsaw",
    offsetMinutes: 120,
    at: new Date("2026-08-23T10:00:00Z"),
  }));
  let sequence = 0;
  const controller = createPhoneLedger(port, {
    capture,
    id: <Table extends IdTable>() => {
      sequence += 1;
      return id<Table>(`00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`);
    },
  });
  return { controller, capture, createAccount, createTransaction, reset };
}

describe("phone ledger controller", () => {
  it("starts with an empty USD total and Recent", () => {
    const { controller } = harness();
    expect(controller.getSnapshot()).toEqual({
      accounts: [],
      recent: [],
      total: money.toMoney("0"),
    });
  });

  it("creates a USD account through the shared defaults", () => {
    const { controller, createAccount } = harness();
    const accountId = controller.createAccount("Cash · USD");

    expect(accountId).toBe(controller.getSnapshot().accounts[0]?.id);
    expect(createAccount.mock.calls[0]?.[0]).toMatchObject({
      name: "Cash · USD",
      currency: currencyCode("USD"),
      kind: "other",
      ownership: "own",
      openingBalance: money.toMoney("0"),
      memo: "",
      isBusiness: false,
    });
  });

  it("refuses to present a combined total when persisted data is not USD", () => {
    const account: PhoneAccount = {
      id: id<"accounts">("11111111-1111-4111-8111-111111111111"),
      name: "Cash · PLN",
      kind: "other",
      currency: currencyCode("PLN"),
      decimals: 2,
      balance: money.toMoney("10"),
    };
    const port: PhoneLedgerPort = {
      listAccounts: () => [account],
      listRecent: () => [],
      createAccount: vi.fn(),
      createTransaction: vi.fn(),
      reset: vi.fn(),
    };

    expect(() =>
      createPhoneLedger(port, {
        capture: vi.fn(),
        id: <Table extends IdTable>() => id<Table>("22222222-2222-4222-8222-222222222222"),
      }),
    ).toThrow(/cannot combine non-USD/);
  });

  it("creates one captured expense and refreshes the total and Recent", () => {
    const { controller, capture, createTransaction } = harness();
    const accountId = controller.createAccount("Cash · USD");
    const transactionId = controller.createExpense("10", accountId);

    expect(capture).toHaveBeenCalledTimes(2);
    expect(createTransaction.mock.calls[0]?.[0]).toMatchObject({
      id: transactionId,
      date: accountingDate("2026-08-23"),
      type: "expense",
      accountId,
      amountOriginal: money.toMoney("10"),
      currency: currencyCode("USD"),
    });
    expect(controller.getSnapshot().total).toBe("-10.00000000");
    expect(controller.getSnapshot().recent[0]?.id).toBe(transactionId);
  });

  it.each(["0", "-1"])("rejects the non-positive expense %s before writing", (amount) => {
    const { controller, createTransaction } = harness();
    const accountId = controller.createAccount("Cash · USD");
    expect(() => controller.createExpense(amount, accountId)).toThrow(/greater than zero/);
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("rejects a missing account before writing", () => {
    const { controller, createTransaction } = harness();
    expect(() =>
      controller.createExpense("10", id<"accounts">("99999999-9999-4999-8999-999999999999")),
    ).toThrow(/Choose an account/);
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("resets, refreshes, and notifies once", () => {
    const { controller, reset } = harness();
    controller.createAccount("Cash · USD");
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.reset();

    expect(reset).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().accounts).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
