/**
 * @vitest-environment jsdom
 *
 * §6.6, S14 — a repayment is `settle_debt`, end to end over a **real** ledger
 * (the journey harness's `LocalLedgerSession`, not a port double): the real
 * executor reads the live balance, stamps the discharge in the debt's own
 * currency, checks the direction and states over-settlement.
 *
 * Nina owes 100 PLN. Repayment received of 25 EUR settles against the PLN debt
 * (4 PLN to the euro here) and opens no reverse EUR debt; 30 EUR over-settles
 * and says so; with no debt at all the repayment is refused on Who?.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { currencyCode } from "@waltning/core/money";
import { FormAlertHost } from "@waltning/ui/primitives/form-alert-host";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = {
  push: vi.fn(),
  back: vi.fn(),
  canGoBack: () => true,
  dismissTo: vi.fn(),
  replace: vi.fn(),
};

// The harness mounts the tab shell too; its trigger hook is the part of
// `expo-router/ui` this file does not need.
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

const PLN = currencyCode("PLN");
const EUR = currencyCode("EUR");

let ledger: JourneyLedger;
let nina: string;
let plnAccount: string;

function categoryId(seedKey: string): string {
  const found = ledger.controller
    .getSnapshot()
    .categories.find((candidate) => candidate.externalId === `seed:${seedKey}`);
  if (!found) throw new Error(`no seed category ${seedKey}`);
  return found.id;
}

function ok<T>(result: T): Exclude<T, { fieldErrors: unknown }> {
  if (typeof result === "object" && result !== null && "fieldErrors" in result) {
    throw new Error(JSON.stringify(result.fieldErrors));
  }
  // The refusal shape is excluded above; what is left is the success one.
  return result as Exclude<T, { fieldErrors: unknown }>;
}

beforeEach(() => {
  ledger = createJourneyLedger();
  const { controller } = ledger;
  const today = deviceRuntime().capture().date;
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
  // §14.6 — a non-pivot currency needs a rate the replica holds, quoted against
  // the pivot (USD). 1 USD = 4 PLN = 1 EUR, so 1 EUR is 4 PLN.
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
  plnAccount = account("Cash · PLN", PLN);
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
  router.dismissTo.mockClear();
  router.push.mockClear();
});

afterEach(() => ledger.close());

/** Nina owes 100 PLN: the lend, written through the same controller Quick add uses. */
function lend100() {
  ok(
    ledger.controller.createTransaction({
      type: "expense",
      amount: "100",
      accountId: plnAccount,
      categoryId: categoryId("lent-out"),
      enteredName: "",
      date: deviceRuntime().capture().date,
      note: "",
      isBusiness: false,
      counterpartyId: nina,
      obligationCounterpartyId: nina,
      obligationRole: "debt",
    }),
  );
}

function balances() {
  return ledger.controller.getSnapshot().accounts.length // read a snapshot so the controller has refreshed
    ? ledger.controller.listCounterpartyBalances(deviceRuntime().capture().date)
    : [];
}

/** Quick add, over the real ledger, on its Income tab with a repayment filled in. */
function fillRepayment(amount: string) {
  render(
    <LedgerProvider controller={ledger.controller}>
      <FormAlertHost>
        <QuickAdd />
      </FormAlertHost>
    </LedgerProvider>,
  );
  fireEvent.click(screen.getByRole("tab", { name: "Income" }));
  fireEvent.change(screen.getByLabelText(/^How much\?/), { target: { value: amount } });
  fireEvent.click(screen.getByRole("button", { name: /^Into/ }));
  fireEvent.click(screen.getByRole("radio", { name: "Bank B · EUR" }));
  fireEvent.click(screen.getByRole("button", { name: /^Category/ }));
  fireEvent.change(screen.getByLabelText("Search…"), { target: { value: "repayment rec" } });
  fireEvent.click(screen.getByRole("radio", { name: "Repayment received" }));
  fireEvent.click(screen.getByRole("button", { name: /^Who\?/ }));
  fireEvent.click(screen.getByRole("button", { name: /^Counterparty/ }));
  fireEvent.click(screen.getByText("Nina"));
}

describe("a repayment is settle_debt, over the real ledger", () => {
  it("settles a PLN debt with a EUR repayment and opens no reverse EUR debt", () => {
    lend100();
    fillRepayment("25");
    expect(screen.getByText("Settles what Nina owes you, in PLN.")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Save income" }));

    const rows = balances().filter((row) => row.counterpartyId === nina);
    // The PLN debt is discharged, and no EUR line was opened by the EUR cash that moved.
    expect(rows.filter((row) => row.currency === EUR)).toEqual([]);
    const pln = rows.find((row) => row.currency === PLN);
    expect(pln === undefined || Number(pln.balance) === 0).toBe(true);
    expect(router.dismissTo).toHaveBeenCalled();
  });

  it("states over-settlement before it commits, and the balance flips the other way", () => {
    lend100();
    fillRepayment("30");
    // 30 EUR is 120 PLN against 100 owed.
    expect(screen.getByText(/Becomes 20\.00\sPLN the other way\./)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Save income" }));

    const pln = balances().find((row) => row.counterpartyId === nina && row.currency === PLN);
    expect(Number(pln?.balance)).toBe(-20);
    expect(balances().some((row) => row.currency === EUR)).toBe(false);
  });

  it("refuses a repayment typed in a foreign currency rather than reading it in the account's (§7.8)", () => {
    lend100();
    fillRepayment("25");
    fireEvent.click(
      screen.getByRole("button", { name: "Currency of the amount: EUR. Change it." }),
    );
    fireEvent.click(screen.getByRole("radio", { name: /^PLN/ }));

    fireEvent.click(screen.getByRole("button", { name: "Save income" }));

    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(
      screen.getAllByText(/A repayment is recorded in the account's currency/).length,
    ).toBeGreaterThan(0);
    expect(
      balances().find((row) => row.counterpartyId === nina && row.currency === PLN)?.balance,
    ).toBe("100.00000000");

    // Back to the account's own currency, and it settles.
    fireEvent.click(
      screen.getByRole("button", { name: "Currency of the amount: PLN. Change it." }),
    );
    fireEvent.click(screen.getByRole("radio", { name: /^EUR/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save income" }));
    expect(router.dismissTo).toHaveBeenCalled();
  });

  it("refuses a repayment from somebody who owes nothing, naming why, and writes nothing", () => {
    fillRepayment("25");
    expect(screen.getByText(/Nothing to settle with Nina/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Save income" }));

    expect(balances().filter((row) => row.counterpartyId === nina)).toEqual([]);
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(
      screen.getAllByText(/Nothing to settle with Nina/).length,
      "the reason stays on the Who? row after Save",
    ).toBeGreaterThan(0);
  });
});
