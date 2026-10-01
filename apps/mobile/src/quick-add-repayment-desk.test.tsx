/**
 * @vitest-environment jsdom
 *
 * §6.6 — a repayment's rate is read for **the day the row is written on**, not
 * today. On the desk form the date is typed: a repayment dated before the only
 * rate the ledger holds has no rate to convert at, and says so, where a read at
 * today's date would have found one and valued a January settlement at
 * September's rate.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { currencyCode } from "@waltning/core/money";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const router = {
  push: vi.fn(),
  back: vi.fn(),
  canGoBack: () => true,
  dismissTo: vi.fn(),
  replace: vi.fn(),
};

vi.mock("expo-router/ui", () => ({
  useTabTrigger: () => ({ trigger: { isFocused: false }, switchTab: vi.fn() }),
}));

vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
  useLocalSearchParams: () => ({}),
  useGlobalSearchParams: () => ({}),
  useNavigation: () => ({ isFocused: () => true }),
}));

const { default: QuickAdd } = await import("./quick-add-screen");
const { createJourneyLedger } = await import("./journeys/journey-harness");
type JourneyLedger = ReturnType<typeof createJourneyLedger>;

function resizeTo(width: number) {
  Object.defineProperty(document.documentElement, "clientWidth", {
    value: width,
    configurable: true,
  });
  window.dispatchEvent(new Event("resize"));
}
beforeAll(() => resizeTo(1440));
afterAll(() => resizeTo(390));

const PLN = currencyCode("PLN");
const EUR = currencyCode("EUR");
let ledger: JourneyLedger;
let nina: string;

function ok<T>(result: T): Exclude<T, { fieldErrors: unknown }> {
  if (typeof result === "object" && result !== null && "fieldErrors" in result) {
    throw new Error(JSON.stringify(result.fieldErrors));
  }
  // The refusal shape is excluded above; what is left is the success one.
  return result as Exclude<T, { fieldErrors: unknown }>;
}

function categoryId(seedKey: string): string {
  const found = ledger.controller
    .getSnapshot()
    .categories.find((candidate) => candidate.externalId === `seed:${seedKey}`);
  if (!found) throw new Error(`no seed category ${seedKey}`);
  return found.id;
}

beforeEach(() => {
  ledger = createJourneyLedger();
  const { controller } = ledger;
  const today = deviceRuntime().capture().date;
  // The only rates the ledger holds are for today: nothing earlier to carry forward.
  for (const [quote, rate] of [
    ["PLN", "4.00"],
    ["EUR", "1.00"],
  ] as const) {
    ok(
      controller.setManualRate({
        base: "USD",
        quote,
        from: today,
        to: today,
        rate,
        overwriteManual: true,
        today,
      }),
    );
  }
  controller.refresh();
  const account = (name: string, currency: typeof PLN) =>
    ok(
      controller.createAccount({
        name,
        currency,
        kind: "cash",
        ownership: "own",
        isBusiness: false,
        openingBalance: "0",
        openingDate: null,
        memo: "",
        groupId: null,
      }),
    ).id;
  const pln = account("Cash · PLN", PLN);
  account("Bank B · EUR", EUR);
  nina = ok(
    controller.createCounterparty({
      name: "Nina",
      kind: "person",
      settlementCurrency: PLN,
      contact: null,
      note: "",
    }),
  ).id;
  ok(
    controller.createTransaction({
      type: "expense",
      amount: "100",
      accountId: pln,
      categoryId: categoryId("lent-out"),
      enteredName: "",
      date: today,
      note: "",
      isBusiness: false,
      counterpartyId: nina,
      obligationCounterpartyId: nina,
      obligationRole: "debt",
    }),
  );
  router.dismissTo.mockClear();
});

afterEach(() => ledger.close());

describe("the rate is read at the row's own date (desk form)", () => {
  it("refuses a repayment dated before any rate exists, though today has one", () => {
    render(
      <LedgerProvider controller={ledger.controller}>
        <QuickAdd />
      </LedgerProvider>,
    );
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: /^Account/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Bank B · EUR" }));
    fireEvent.click(screen.getByRole("tab", { name: "Income" }));
    fireEvent.click(screen.getByRole("button", { name: /^Category/ }));
    fireEvent.change(screen.getByLabelText("Search…"), { target: { value: "repayment rec" } });
    fireEvent.click(screen.getByRole("radio", { name: "Repayment received" }));
    fireEvent.click(screen.getByRole("button", { name: "Who?" }));
    fireEvent.click(screen.getByRole("radio", { name: "Nina" }));
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getAllByText(/No exchange rate for PLN/).length).toBeGreaterThan(0);
    expect(router.dismissTo).not.toHaveBeenCalled();
  });
});
