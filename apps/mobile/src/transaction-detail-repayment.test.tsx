/**
 * @vitest-environment jsdom
 *
 * §6.6, S14 on the transaction page — over a **real** ledger. Picking a
 * repayment category on an existing row does not patch the row into it
 * (`update_transaction` refuses that, naming `settle_debt`): the row's own
 * figures settle the person's open debt and the original is replaced by the
 * settlement, so the balance goes down by it and no reverse debt appears.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { currencyCode } from "@waltning/core/money";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = {
  push: vi.fn(),
  back: vi.fn(),
  canGoBack: () => true,
  dismissTo: vi.fn(),
  replace: vi.fn(),
};
let routeId = "";

vi.mock("expo-router/ui", () => ({
  useTabTrigger: () => ({ trigger: { isFocused: false }, switchTab: vi.fn() }),
}));

vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
  useLocalSearchParams: () => ({ id: routeId }),
  useGlobalSearchParams: () => ({}),
  useNavigation: () => ({ isFocused: () => true }),
}));

const { default: TransactionDetail } = await import("./transaction-detail-screen");
const { createJourneyLedger } = await import("./journeys/journey-harness");
type JourneyLedger = ReturnType<typeof createJourneyLedger>;

const PLN = currencyCode("PLN");

let ledger: JourneyLedger;
let nina: string;
let account: string;

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

const balances = () =>
  ledger.controller
    .listCounterpartyBalances(deviceRuntime().capture().date)
    .filter((row) => row.counterpartyId === nina);

beforeEach(() => {
  ledger = createJourneyLedger();
  const { controller } = ledger;
  const today = deviceRuntime().capture().date;
  ok(
    controller.setManualRate({
      base: "USD",
      quote: "PLN",
      from: today,
      to: today,
      rate: "4.00",
      overwriteManual: true,
      today,
    }),
  );
  controller.refresh();
  account = ok(
    controller.createAccount({
      name: "Cash · PLN",
      currency: PLN,
      kind: "cash",
      ownership: "own",
      isBusiness: false,
      openingBalance: "0",
      openingDate: null,
      memo: "",
      groupId: null,
    }),
  ).id;
  nina = ok(
    controller.createCounterparty({
      name: "Nina",
      kind: "person",
      settlementCurrency: PLN,
      contact: null,
      note: "",
    }),
  ).id;
  router.dismissTo.mockClear();
});

afterEach(() => ledger.close());

function capture(type: "income" | "expense", amount: string, seedKey: string, debt: boolean) {
  return ok(
    ledger.controller.createTransaction({
      type,
      amount,
      accountId: account,
      categoryId: categoryId(seedKey),
      enteredName: "",
      date: deviceRuntime().capture().date,
      note: "",
      isBusiness: false,
      counterpartyId: debt ? nina : null,
      obligationCounterpartyId: debt ? nina : null,
      obligationRole: debt ? "debt" : null,
    }),
  ).id;
}

function openAndPickRepayment(rowId: string) {
  routeId = rowId;
  render(
    <LedgerProvider controller={ledger.controller}>
      <TransactionDetail />
    </LedgerProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Category/ }));
  fireEvent.change(screen.getByLabelText("Search…"), { target: { value: "repayment rec" } });
  fireEvent.click(screen.getByRole("radio", { name: "Repayment received" }));
}

describe("a repayment picked on an existing row is settle_debt", () => {
  it("settles the open debt with the row's figures and replaces the row", () => {
    capture("expense", "100", "lent-out", true);
    const plain = capture("income", "100", "salary", false);
    openAndPickRepayment(plain);

    fireEvent.click(screen.getByRole("button", { name: "Who?" }));
    fireEvent.click(screen.getByRole("button", { name: "Nina" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const open = balances().filter((row) => Number(row.balance) !== 0);
    expect(open, "the debt is discharged and no reverse one was opened").toEqual([]);
    expect(ledger.controller.getTransaction(plain as never), "the original is replaced").toBeNull();
    expect(router.dismissTo).toHaveBeenCalled();
  });

  it("refuses it, naming why, when the person owes nothing — and leaves the row alone", () => {
    const plain = capture("income", "100", "salary", false);
    openAndPickRepayment(plain);

    fireEvent.click(screen.getByRole("button", { name: "Who?" }));
    fireEvent.click(screen.getByRole("button", { name: "Nina" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText(/Nothing to settle with Nina/)).toBeDefined();
    expect(ledger.controller.getTransaction(plain as never)).not.toBeNull();
    expect(balances()).toEqual([]);
  });
});
