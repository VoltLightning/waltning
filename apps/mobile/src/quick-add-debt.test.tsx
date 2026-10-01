/**
 * @vitest-environment jsdom
 *
 * §6.6 — picking *Borrowed*, *Lent out* or a repayment makes the entry a
 * debt and asks **Who?** on the spot. Its own file because a successful save
 * writes the real device clock into the `lastCapture` singleton, which the
 * sibling file's ordering notes are careful about.
 *
 * The categories are named *Money from friends* and the like on purpose: the
 * rule reads the seed tag, so a renamed (or translated) seed category still
 * counts and a category someone made and *called* "Borrowed" does not.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import {
  createPhoneLedger,
  type PhoneCategory,
  type PhoneCounterparty,
  type PhoneLedgerPort,
} from "@waltning/client/ledger/create-phone-ledger";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { basePort } from "@waltning/client/ledger/test-port";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode, toMoney } from "@waltning/core/money";
import { FormAlertHost } from "@waltning/ui/primitives/form-alert-host";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = {
  push: vi.fn(),
  back: vi.fn(),
  canGoBack: () => true,
  dismissTo: vi.fn(),
  replace: vi.fn(),
};
const useLocalSearchParams = vi.fn(() => ({}));

vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
  useLocalSearchParams: () => useLocalSearchParams(),
}));

import QuickAdd from "./quick-add-screen";

const PLN = currencyCode("PLN");
const ACCOUNT = {
  id: id<"accounts">("11111111-1111-4111-8111-111111111111"),
  name: "Cash · PLN",
  kind: "cash" as const,
  currency: PLN,
  decimals: 2,
  balance: toMoney("0"),
  groupId: null,
  ownership: "own" as const,
  isBusiness: false,
  archived: false,
  hidden: false,
  hasEntries: false,
  inTotal: true,
  color: null,
  expectedBalance: null,
  openingBalance: toMoney("0"),
  openingDate: null,
  memo: "",
  version: 1,
};

const cat = (n: string, name: string, kind: "income" | "expense", externalId: string | null) =>
  ({
    id: id<"categories">(`aaaaaaaa-aaaa-4aaa-8aaa-${n.padStart(12, "0")}`),
    name,
    kind,
    externalId,
  }) satisfies PhoneCategory;

const BORROWED = cat("1", "Money from friends", "income", "seed:borrowed");
const REPAYMENT_RECEIVED = cat("2", "Money back", "income", "seed:repayment-received");
const SALARY = cat("3", "Salary", "income", "seed:salary");
/** Named like the seed category, but a person made it: no tag, so no debt. */
const OWN_BORROWED = cat("4", "Borrowed", "income", null);
const LENT_OUT = cat("5", "Lent out", "expense", "seed:lent-out");
const CATEGORIES = [BORROWED, REPAYMENT_RECEIVED, SALARY, OWN_BORROWED, LENT_OUT];

const NINA: PhoneCounterparty = {
  id: id<"counterparties">("bbbbbbbb-bbbb-4bbb-8bbb-000000000001"),
  name: "Nina",
  kind: "person",
  settlementCurrency: null,
  contact: null,
  note: "",
  archived: false,
  version: 1,
};

function withLedger(
  overrides: {
    createTransaction?: PhoneLedgerPort["createTransaction"];
    balances?: PhoneLedgerPort["listCounterpartyBalances"];
  } = {},
) {
  const port = basePort({
    listAccounts: () => [ACCOUNT],
    listCurrencies: () => [
      {
        code: PLN,
        name: "Polish Złoty",
        symbol: "zł",
        decimals: 2,
        capturable: true,
        isPivot: true,
      },
    ],
    listCategories: () => CATEGORIES,
    listCounterparties: () => [NINA],
    listCounterpartyBalances: overrides.balances ?? (() => []),
    createTransaction: overrides.createTransaction ?? (() => undefined),
  });
  const controller = createPhoneLedger(port, {
    capture: () => ({
      date: accountingDate("2026-09-03"),
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-09-03T10:00:00Z"),
    }),
    id: () => id("22222222-2222-4222-8222-222222222222"),
  });
  return render(
    <LedgerProvider controller={controller}>
      <FormAlertHost>
        <QuickAdd />
      </FormAlertHost>
    </LedgerProvider>,
  );
}

function typeAmount(value: string) {
  fireEvent.change(screen.getByLabelText("How much?"), { target: { value } });
}

function pickCategory(name: string) {
  fireEvent.click(screen.getByRole("radio", { name }));
}

function pickNina() {
  fireEvent.click(screen.getByRole("button", { name: /^Who\?/ }));
  fireEvent.click(screen.getByRole("button", { name: /^Counterparty/ }));
  fireEvent.click(screen.getByText("Nina"));
}

function save(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

beforeEach(() => {
  router.push.mockClear();
  router.dismissTo.mockClear();
  useLocalSearchParams.mockReturnValue({});
});

describe("QuickAdd — a debt category asks Who? (§6.6)", () => {
  it("asks Who? for Borrowed, and refuses Save on that row until a person is picked", () => {
    const createTransaction = vi.fn();
    withLedger({ createTransaction });
    fireEvent.click(screen.getByRole("tab", { name: "Income" }));
    typeAmount("5");

    expect(screen.queryByRole("button", { name: /^Who\?/ })).toBeNull();
    pickCategory("Money from friends");
    expect(screen.getByRole("button", { name: /^Who\?/ })).toBeDefined();

    save("Save income");
    expect(screen.getByText("Choose who this is with.")).toBeDefined();
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("saves the row as a debt with the person on both links", () => {
    const createTransaction = vi.fn();
    withLedger({ createTransaction });
    fireEvent.click(screen.getByRole("tab", { name: "Income" }));
    typeAmount("5");
    pickCategory("Money from friends");
    pickNina();
    save("Save income");

    expect(createTransaction).toHaveBeenCalledOnce();
    expect(createTransaction.mock.calls[0]?.[0]).toMatchObject({
      type: "income",
      categoryId: BORROWED.id,
      counterpartyId: NINA.id,
      obligationCounterpartyId: NINA.id,
      obligationRole: "debt",
    });
  });

  it("takes the role back when the category changes to Salary, keeping nobody's debt", () => {
    const createTransaction = vi.fn();
    withLedger({ createTransaction });
    fireEvent.click(screen.getByRole("tab", { name: "Income" }));
    typeAmount("5");
    pickCategory("Money from friends");
    pickNina();
    pickCategory("Salary");

    expect(screen.queryByRole("button", { name: /^Who\?/ })).toBeNull();
    save("Save income");

    // Nina stays as who it was *with*; the debt, which only the category
    // asked for, is gone — the input schema drops an absent pair.
    const sent = createTransaction.mock.calls[0]?.[0];
    expect(sent).toMatchObject({ categoryId: SALARY.id, counterpartyId: NINA.id });
    expect(sent.obligationRole).toBeUndefined();
    expect(sent.obligationCounterpartyId).toBeUndefined();
  });

  it("does not take back a role the person chose by hand", () => {
    const createTransaction = vi.fn();
    withLedger({ createTransaction });
    fireEvent.click(screen.getByRole("tab", { name: "Income" }));
    typeAmount("5");
    pickCategory("Salary");
    // The person row under More details, with the role picked by hand.
    fireEvent.click(screen.getByRole("button", { name: /^More details/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Person/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Counterparty/ }));
    fireEvent.click(screen.getByText("Nina"));
    fireEvent.click(screen.getByRole("radio", { name: "Debt — expected back" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    pickCategory("Money from friends");
    // Under the debt category the role is the category's: Who? is asked, with Nina already on it.
    expect(screen.getByRole("button", { name: "Who?: Nina" })).toBeDefined();
    pickCategory("Salary");
    expect(screen.queryByRole("button", { name: /^Who\?/ })).toBeNull();
    save("Save income");

    // …and leaving it leaves the role the person chose by hand where they put it.
    expect(createTransaction.mock.calls[0]?.[0]).toMatchObject({
      categoryId: SALARY.id,
      obligationCounterpartyId: NINA.id,
      obligationRole: "debt",
    });
  });

  it("reads the seed tag, not the name: a category someone made and called Borrowed is not a debt", () => {
    withLedger();
    fireEvent.click(screen.getByRole("tab", { name: "Income" }));
    // The seeded category, renamed: still a debt, so Who? is asked…
    pickCategory("Money from friends");
    expect(screen.getByRole("button", { name: /^Who\?/ })).toBeDefined();
    // …and the one a person made and called Borrowed is not.
    pickCategory("Borrowed");
    expect(screen.queryByRole("button", { name: /^Who\?/ })).toBeNull();
  });

  it("asks Who? for Lent out on an expense too", () => {
    const createTransaction = vi.fn();
    withLedger({ createTransaction });
    typeAmount("150");
    pickCategory("Lent out");
    pickNina();
    save("Save expense");

    expect(createTransaction.mock.calls[0]?.[0]).toMatchObject({
      type: "expense",
      categoryId: LENT_OUT.id,
      obligationCounterpartyId: NINA.id,
      obligationRole: "debt",
    });
  });

  // The repayment path (settle_debt, hint, no-debt refusal, over-settlement) is
  // `quick-add-repayment.test.tsx`, over a real ledger rather than a port double.

  it("sends the category and the kind along when Who? creates a person, and they come back", () => {
    withLedger();
    fireEvent.click(screen.getByRole("tab", { name: "Income" }));
    typeAmount("5");
    pickCategory("Money from friends");
    fireEvent.click(screen.getByRole("button", { name: /^Who\?/ }));
    fireEvent.click(screen.getByRole("button", { name: "+ New person or company" }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/counterparty/new",
      params: expect.objectContaining({
        returnTo: "quick-add",
        type: "income",
        categoryId: BORROWED.id,
      }),
    });
  });
});
