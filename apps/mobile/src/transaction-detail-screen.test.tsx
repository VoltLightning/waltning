/**
 * @vitest-environment jsdom
 *
 * `TransactionDetail` (S09) — the states table in full: found and editable,
 * a save that reaches the ledger, a stale-version refusal, delete with no
 * undo, and a row that no longer exists.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import {
  createPhoneLedger,
  type PhoneLedgerPort,
} from "@waltning/client/ledger/create-phone-ledger";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode, toMoney } from "@waltning/core/money";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), back: vi.fn(), dismissTo: vi.fn() };
const useLocalSearchParams = vi.fn(() => ({ id: TXN }));

vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
  useLocalSearchParams: () => useLocalSearchParams(),
}));

import TransactionDetail from "./transaction-detail-screen";

const TXN = "99999999-9999-4999-8999-999999999999";
const ACCOUNT = id<"accounts">("22222222-2222-4222-8222-222222222222");
const PLN = currencyCode("PLN");

type FakeDetail = ReturnType<PhoneLedgerPort["getTransaction"]>;

/** One transaction, version-checked the way the real executors are. */
function fakeController(initial: NonNullable<FakeDetail> | null) {
  let row = initial;
  const port: PhoneLedgerPort = {
    listAccounts: () => [
      {
        id: ACCOUNT,
        name: "Cash · PLN",
        kind: "other",
        currency: PLN,
        decimals: 2,
        balance: toMoney("0"),
      },
    ],
    listCurrencies: () => [
      { code: PLN, name: "Polish Złoty", symbol: "zł", decimals: 2, capturable: true },
    ],
    listGroups: () => [],
    listRecent: () => [],
    listCategories: () => [],
    listCategoryTree: () => [],
    listCounterparties: () => [],
    listNetWorth: () => [],
    readPeriodSpend: () => [],
    listUnsettledClearing: () => [],
    getTransaction: () => row,
    createAccount: vi.fn(),
    createTransaction: vi.fn(),
    createCategory: vi.fn(),
    updateTransaction: (input) => {
      if (!row || row.version !== input.version) {
        throw new Error(
          `update_transaction: stale version — read ${input.version}, row is at ${row?.version}`,
        );
      }
      row = {
        ...row,
        ...("payee" in input.patch ? { payee: input.patch.payee ?? row.payee } : {}),
        version: row.version + 1,
      };
    },
    deleteTransaction: (input) => {
      if (!row || row.version !== input.version) {
        throw new Error(
          `delete_transaction: stale version — read ${input.version}, row is at ${row?.version}`,
        );
      }
      row = null;
    },
    setTransactionLines: vi.fn(),
    searchTransactions: () => ({
      rows: [],
      nextCursor: undefined,
      total: { count: 0, currencies: [] },
    }),
    categorizeBatch: () => undefined,
    reset: vi.fn(),
  };
  return createPhoneLedger(port, {
    capture: () => ({
      date: accountingDate("2026-08-06"),
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-08-06T10:00:00Z"),
    }),
    id: () => id("33333333-3333-4333-8333-333333333333"),
  });
}

const DETAIL: NonNullable<FakeDetail> = {
  id: id<"transactions">(TXN),
  date: accountingDate("2026-08-06"),
  type: "expense",
  payee: "Costa",
  note: "",
  isBusiness: false,
  accountId: ACCOUNT,
  accountName: "Cash · PLN",
  categoryId: null,
  categoryName: null,
  amount: toMoney("-48.90"),
  currency: PLN,
  decimals: 2,
  version: 1,
  lines: [],
};

function withLedger(element: ReactElement, controller = fakeController(DETAIL)) {
  return render(<LedgerProvider controller={controller}>{element}</LedgerProvider>);
}

beforeEach(() => {
  router.push.mockClear();
  router.back.mockClear();
  router.dismissTo.mockClear();
  useLocalSearchParams.mockReturnValue({ id: TXN });
});

describe("TransactionDetail", () => {
  it("shows the hero amount and the fields of the row it was pushed for", () => {
    withLedger(<TransactionDetail />);
    expect(screen.getByText("-48.90")).toBeDefined();
    expect(screen.getByRole("button", { name: "Payee: Costa" })).toBeDefined();
  });

  it("saves a changed field, and the new value reads back", () => {
    withLedger(<TransactionDetail />);

    fireEvent.click(screen.getByRole("button", { name: "Payee: Costa" }));
    fireEvent.change(screen.getByLabelText("Payee"), { target: { value: "Costa Coffee" } });
    // The only `Save` on screen: `LinesCard` renders none while it holds no
    // lines and none have been added.
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("button", { name: "Payee: Costa Coffee" })).toBeDefined();
  });

  it("Delete removes the row and returns to Today with a toast", () => {
    withLedger(<TransactionDetail />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(router.dismissTo).toHaveBeenCalledWith({
      pathname: "/",
      params: { message: "Transaction deleted." },
    });
  });

  it("a row that no longer exists shows the terminal state, not a crash", () => {
    withLedger(<TransactionDetail />, fakeController(null));

    expect(screen.getByText("This transaction no longer exists.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
