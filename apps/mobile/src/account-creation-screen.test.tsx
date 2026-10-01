/**
 * @vitest-environment jsdom
 *
 * S16 §4 — a second-currency account takes its rate **inside the account
 * form**: one line under the currency grid, saved together with the account,
 * and the form never leaves. The ledger is the real controller over an
 * in-memory port, so what is asserted is what was written and in which order.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { createPhoneLedger } from "@waltning/client/ledger/create-phone-ledger";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { basePort } from "@waltning/client/ledger/test-port";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode, unitsPerPivot } from "@waltning/core/money";
import { beforeEach, expect, it, vi } from "vitest";

const router = {
  push: vi.fn(),
  back: vi.fn(),
  canGoBack: () => true,
  dismissTo: vi.fn(),
};

vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
  useLocalSearchParams: () => ({ returnTo: "accounts" }),
}));

import NewAccount from "./account-creation-screen";

const USD = currencyCode("USD");
const EUR = currencyCode("EUR");

const USD_ROW = {
  code: USD,
  name: "US Dollar",
  symbol: "$",
  decimals: 2,
  capturable: true,
  isPivot: true,
};
const EUR_ROW = {
  code: EUR,
  name: "Euro",
  symbol: "€",
  decimals: 2,
  capturable: false,
  isPivot: false,
};
const CURRENCIES = [USD_ROW, EUR_ROW];
/** The device's own calendar — the day the screen dates the rate by. */
const TODAY = deviceRuntime().capture().date;

type Calls = string[];

function render_(options: {
  calls: Calls;
  setManualRate?: () => { written: number; replacedManual: number };
  readRate?: () => null | {
    rate: ReturnType<typeof unitsPerPivot>;
    source: string;
    asOf: ReturnType<typeof accountingDate>;
    carriedDays: number;
  };
  listFxRates?: () => readonly {
    base: typeof USD;
    quote: typeof EUR;
    date: ReturnType<typeof accountingDate>;
    rate: ReturnType<typeof unitsPerPivot>;
    source: string;
  }[];
  currencies?: typeof CURRENCIES;
  createAccount?: () => void;
}) {
  const { calls } = options;
  const port = basePort({
    listCurrencies: () => options.currencies ?? CURRENCIES,
    readRate: options.readRate ?? (() => null),
    listFxRates: options.listFxRates ?? (() => []),
    setManualRate:
      options.setManualRate ??
      ((input) => {
        calls.push(`rate ${input.quote} ${input.rate} ${input.from}`);
        return { written: 1, replacedManual: 0 };
      }),
    createAccount:
      options.createAccount ??
      ((input) => {
        calls.push(`account ${input.name} ${input.currency}`);
      }),
  });
  const controller = createPhoneLedger(port, {
    capture: () => ({
      date: accountingDate("2026-09-03"),
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-09-03T10:00:00Z"),
    }),
    id: () => id("33333333-3333-4333-8333-333333333333"),
  });
  return render(
    <LedgerProvider controller={controller}>
      <NewAccount />
    </LedgerProvider>,
  );
}

beforeEach(() => {
  router.push.mockClear();
  router.dismissTo.mockClear();
});

it("writes the typed rate and then the account, in one save, and never leaves for S18", () => {
  const calls: Calls = [];
  render_({ calls });

  fireEvent.click(screen.getByRole("radio", { name: /^EUR/ }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bank A" } });
  fireEvent.change(screen.getByLabelText("Rate · EUR per USD"), { target: { value: "0.92" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(calls).toEqual([`rate EUR 0.92 ${TODAY}`, "account Bank A EUR"]);
  expect(router.push).not.toHaveBeenCalled();
  expect(router.dismissTo).toHaveBeenCalledWith("/accounts");
});

it("refuses without a rate: a field error on the rate line, the name kept, nothing written", () => {
  const calls: Calls = [];
  render_({ calls });

  fireEvent.click(screen.getByRole("radio", { name: /^EUR/ }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bank A" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(calls).toEqual([]);
  expect(screen.getByText("Required")).toBeDefined();
  expect(screen.getByLabelText("Name")).toHaveProperty("value", "Bank A");
  expect(router.push).not.toHaveBeenCalled();
  expect(router.dismissTo).not.toHaveBeenCalled();
});

it("keeps the form, the name and the rate when the rate write is refused, and writes no account", () => {
  const calls: Calls = [];
  render_({
    calls,
    setManualRate: () => {
      throw new Error("set_manual_rate: refused");
    },
  });

  fireEvent.click(screen.getByRole("radio", { name: /^EUR/ }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bank A" } });
  fireEvent.change(screen.getByLabelText("Rate · EUR per USD"), { target: { value: "0.92" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(calls).toEqual([]);
  expect(screen.getByText("set_manual_rate: refused")).toBeDefined();
  expect(screen.getByLabelText("Name")).toHaveProperty("value", "Bank A");
  expect(screen.getByLabelText("Rate · EUR per USD")).toHaveProperty("value", "0.92");
  expect(router.dismissTo).not.toHaveBeenCalled();
});

it("shows the last rate the ledger held as a reference, and writes only what is typed", () => {
  const calls: Calls = [];
  render_({
    calls,
    listFxRates: () => [
      {
        base: USD,
        quote: EUR,
        date: accountingDate("2026-06-01"),
        rate: unitsPerPivot("0.9100"),
        source: "ecb",
      },
      {
        base: USD,
        quote: EUR,
        date: accountingDate("2026-06-10"),
        rate: unitsPerPivot("0.920000000000"),
        source: "ecb",
      },
      {
        base: USD,
        quote: EUR,
        date: accountingDate("2026-06-11"),
        rate: unitsPerPivot("0.920000000000"),
        source: "carried_forward",
      },
    ],
  });

  fireEvent.click(screen.getByRole("radio", { name: /^EUR/ }));
  // The newest real row (not the carried copy after it), at four places.
  expect(screen.getByText("reference 0.9200 · ecb · 2026-06-10")).toBeDefined();
  expect(screen.getByLabelText("Rate · EUR per USD")).toHaveProperty("value", "");
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bank A" } });
  fireEvent.change(screen.getByLabelText("Rate · EUR per USD"), { target: { value: "0.93" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(calls).toEqual([`rate EUR 0.93 ${TODAY}`, "account Bank A EUR"]);
});

it("draws no rate line when today already has a usable rate", () => {
  const calls: Calls = [];
  render_({
    calls,
    currencies: [USD_ROW, { ...EUR_ROW, capturable: true }],
    readRate: () => ({
      rate: unitsPerPivot("0.92"),
      source: "ecb",
      asOf: accountingDate("2026-09-03"),
      carriedDays: 0,
    }),
  });

  fireEvent.click(screen.getByRole("radio", { name: /^EUR/ }));
  expect(screen.queryByLabelText("Rate · EUR per USD")).toBeNull();
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bank A" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(calls).toEqual(["account Bank A EUR"]);
});

it("states an account refusal that is not a field's on the form, with everything typed kept", () => {
  const calls: Calls = [];
  render_({
    calls,
    createAccount: () => {
      throw new Error("accounts: refused by a constraint");
    },
  });

  fireEvent.click(screen.getByRole("radio", { name: /^EUR/ }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bank A" } });
  fireEvent.change(screen.getByLabelText("Rate · EUR per USD"), { target: { value: "0.92" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(screen.getByText("accounts: refused by a constraint")).toBeDefined();
  expect(screen.getByLabelText("Name")).toHaveProperty("value", "Bank A");
  expect(screen.getByLabelText("Rate · EUR per USD")).toHaveProperty("value", "0.92");
  expect(router.dismissTo).not.toHaveBeenCalled();
});
