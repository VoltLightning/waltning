/**
 * @vitest-environment jsdom
 *
 * The three route screens, rendered under `react-native-web` — which no test
 * could do while each read a module singleton: the ledger arrives through
 * `<LedgerProvider>` now, so a test hands the same screens an in-memory
 * controller and the screens cannot tell.
 *
 * The router is the one platform edge left, and it is mocked rather than
 * wrapped: what these tests assert is what the screens *show* for a given
 * ledger, and where they *ask* to go — not expo-router's own behaviour.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { createPhoneLedger } from "@waltning/client/ledger/create-phone-ledger";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { type CurrencyCode, currencyCode, type Money, toMoney } from "@waltning/core/money";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), back: vi.fn(), dismissTo: vi.fn() };
const useLocalSearchParams = vi.fn(() => ({}));

vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
  useLocalSearchParams: () => useLocalSearchParams(),
}));

import NewAccount from "./account-creation-screen";
import QuickAdd from "./quick-add-screen";
import Today from "./today-screen";

type FakeAccount = {
  id: ReturnType<typeof id<"accounts">>;
  name: string;
  kind: "bank";
  currency: CurrencyCode;
  decimals: number;
  balance: Money;
  capturable: boolean;
};

/** The real controller over an in-memory port — the same shape the app wires. */
function fakeController(initialAccounts: readonly FakeAccount[] = []) {
  let accounts = [...initialAccounts];
  return createPhoneLedger(
    {
      listAccounts: () => accounts,
      listCurrencies: () => [
        {
          code: currencyCode("PLN"),
          name: "Polish Złoty",
          symbol: "zł",
          decimals: 2,
          capturable: true,
        },
      ],
      listRecent: () => [],
      createAccount: (input) => {
        accounts = [
          ...accounts,
          {
            id: input.id,
            name: input.name,
            kind: "bank",
            currency: input.currency,
            decimals: 2,
            balance: input.openingBalance,
            capturable: true,
          },
        ];
      },
      createTransaction: () => undefined,
      reset: () => {
        accounts = [];
      },
    },
    {
      capture: () => ({
        date: accountingDate("2026-09-03"),
        timeZone: "Europe/Warsaw",
        offsetMinutes: 120,
        at: new Date("2026-09-03T10:00:00Z"),
      }),
      id: () => id("11111111-1111-4111-8111-111111111111"),
    },
  );
}

const PLN_ACCOUNT: FakeAccount = {
  id: id<"accounts">("22222222-2222-4222-8222-222222222222"),
  name: "Bank A · PLN",
  kind: "bank",
  currency: currencyCode("PLN"),
  decimals: 2,
  balance: toMoney("0"),
  capturable: true,
};

function withLedger(element: ReactElement, controller = fakeController()) {
  return render(<LedgerProvider controller={controller}>{element}</LedgerProvider>);
}

beforeEach(() => {
  router.push.mockClear();
  router.back.mockClear();
  router.dismissTo.mockClear();
  useLocalSearchParams.mockReturnValue({});
});

describe("Today", () => {
  it("renders the empty ledger with a create-account action that navigates", () => {
    withLedger(<Today />);

    expect(screen.getByText("No accounts yet")).toBeDefined();
    fireEvent.click(screen.getByText("Create account"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/account/new",
      params: { returnTo: "today" },
    });
  });

  it("shows the ledger once an account exists, and enables add", () => {
    withLedger(<Today />, fakeController([PLN_ACCOUNT]));

    expect(screen.queryByText("No accounts yet")).toBeNull();
    expect(screen.getByText("Recent")).toBeDefined();
  });
});

describe("QuickAdd", () => {
  it("offers the ledger's accounts to capture against", () => {
    withLedger(<QuickAdd />, fakeController([PLN_ACCOUNT]));

    expect(screen.getByText("Bank A · PLN")).toBeDefined();
  });
});

describe("NewAccount", () => {
  it("renders the create form over the ledger's currencies", () => {
    useLocalSearchParams.mockReturnValue({ returnTo: "today" });
    withLedger(<NewAccount />);

    expect(screen.getByText(/PLN/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Save" })).toBeDefined();
  });
});
