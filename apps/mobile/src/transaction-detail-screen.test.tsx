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
import { basePort } from "@waltning/client/ledger/test-port";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode, toMoney } from "@waltning/core/money";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = {
  push: vi.fn(),
  back: vi.fn(),
  canGoBack: () => true,
  dismissTo: vi.fn(),
};
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

/**
 * One transaction, version-checked the way the real executors are.
 * `overrides` replaces individual port methods — the stale-version test
 * below wants an `updateTransaction` that always refuses, not one this
 * harness's own version bookkeeping would have to be tricked into.
 */
const ACCOUNT_B = id<"accounts">("55555555-5555-4555-8555-555555555555");

function fakeController(
  initial: NonNullable<FakeDetail> | null,
  overrides: Partial<PhoneLedgerPort> = {},
) {
  let row = initial;
  const port = basePort({
    listAccounts: () => [
      {
        id: ACCOUNT,
        name: "Cash · PLN",
        kind: "other",
        currency: PLN,
        decimals: 2,
        balance: toMoney("0"),
        groupId: null,
        ownership: "own",
        isBusiness: false,
        archived: false,
        hidden: false,
        inTotal: true,
        capturable: true,
        expectedBalance: null,
        version: 1,
        openingBalance: toMoney("0"),
        openingDate: null,
        memo: "",
      },
      {
        id: ACCOUNT_B,
        name: "Bank A · PLN",
        kind: "bank",
        currency: PLN,
        decimals: 2,
        balance: toMoney("0"),
        groupId: null,
        ownership: "own",
        isBusiness: false,
        archived: false,
        hidden: false,
        inTotal: true,
        capturable: true,
        expectedBalance: null,
        version: 1,
        openingBalance: toMoney("0"),
        openingDate: null,
        memo: "",
      },
    ],
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
    getTransaction: () => row,
    updateTransaction: (input) => {
      if (!row || row.version !== input.version) {
        throw new Error(
          `update_transaction: stale version — read ${input.version}, row is at ${row?.version}`,
        );
      }
      row = {
        ...row,
        ...("enteredName" in input.patch
          ? { enteredName: input.patch.enteredName ?? row.enteredName }
          : {}),
        ...("accountId" in input.patch
          ? {
              accountId: input.patch.accountId ?? row.accountId,
              accountName: input.patch.accountId === ACCOUNT_B ? "Bank A · PLN" : row.accountName,
            }
          : {}),
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
    ...overrides,
  });
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
  enteredName: "Café A",
  note: "",
  isBusiness: false,
  accountId: ACCOUNT,
  accountName: "Cash · PLN",
  toAccountId: null,
  toAccountName: null,
  categoryId: null,
  categoryName: null,
  counterpartyId: null,
  counterpartyIdentityName: null,
  obligationCounterpartyId: null,
  counterpartyName: null,
  obligationRole: null,
  isCapital: false,
  brandKey: null,
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
    // The band says the figure; the header line it folds into only draws it,
    // hidden from assistive technology, which hears the header by its date.
    const spoken = screen
      .getAllByText("-48.90")
      .filter((node) => node.closest('[aria-hidden="true"]') === null);
    expect(spoken).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "August 6, 2026" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Payee: Café A" })).toBeDefined();
  });

  it("saves a changed field, and the new value reads back", () => {
    withLedger(<TransactionDetail />);

    fireEvent.click(screen.getByRole("button", { name: "Payee: Café A" }));
    fireEvent.change(screen.getByLabelText("Payee"), {
      target: { value: "Café A · Downtown" },
    });
    // The only `Save` on screen: `LinesCard` renders none while it holds no
    // lines and none have been added.
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("button", { name: "Payee: Café A · Downtown" })).toBeDefined();
  });

  /**
   * `mapFieldErrors` used to print `": message"` for a refusal naming no
   * field — `refusalFromThrow`'s own `path: ""` — because its form-level
   * fallback always prefixed the path. Fixed in
   * `packages/client/src/transport/field-errors.ts`; this is the same
   * refusal reaching the actual screen, alert text asserted exactly.
   */
  it("a stale version reaches the screen as the bare message — no leading colon", () => {
    const controller = fakeController(DETAIL, {
      updateTransaction: () => {
        throw new Error("update_transaction: stale version — read 1, row is at 2");
      },
    });
    withLedger(<TransactionDetail />, controller);

    fireEvent.click(screen.getByRole("button", { name: "Payee: Café A" }));
    fireEvent.change(screen.getByLabelText("Payee"), { target: { value: "Bakery A" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "This transaction changed elsewhere — reload it before saving.",
    );
  });

  /**
   * `L` — the account row used to hold a flat `Select`; it now escapes to
   * `AccountPicker` (`accounts/`) the same way `category` already does,
   * grouped and capturable-tinted (`account-picker.test.tsx` covers the
   * sheet itself).
   */
  it("reassigns the account through AccountPicker, and the pick reads back", () => {
    withLedger(<TransactionDetail />);

    fireEvent.click(screen.getByRole("button", { name: "Account: Cash · PLN" }));
    fireEvent.click(screen.getByRole("radio", { name: "Bank A · PLN" }));
    expect(screen.getByRole("button", { name: "Account: Bank A · PLN" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("button", { name: "Account: Bank A · PLN" })).toBeDefined();
  });

  /**
   * §6.6 — the person a row is about, and what they are to it. Both were
   * held back while nothing read them; `update_transaction`'s patch carried
   * them all along.
   */
  it("attaches a counterparty and its role, and both read back", () => {
    withLedger(
      <TransactionDetail />,
      fakeController(DETAIL, {
        listCounterparties: () => [
          {
            id: id<"counterparties">("99999999-9999-4999-8999-999999999999"),
            name: "Nina",
            kind: "person" as const,
            settlementCurrency: null,
            contact: null,
            note: "",
            archived: false,
            version: 1,
          },
        ],
      }),
    );

    // §6.6.1 — **two rows, because they are two questions.** *Counterparty* is
    // who it was with; naming somebody there owes them nothing, and no role
    // appears. *Owes* is the obligation, and only that one brings a role with
    // it. S09 is the one surface where the two can name different parties —
    // paying a shop for a friend — which is why the rows are separate rather
    // than one field with a role hanging off it.
    fireEvent.click(screen.getByRole("button", { name: "Counterparty" }));
    fireEvent.click(screen.getByRole("button", { name: "Nina" }));
    expect(screen.getByRole("button", { name: "Counterparty: Nina" })).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Role" }),
      "naming somebody owes them nothing",
    ).toBeNull();

    // Nobody owes yet, so the chip asks; once somebody is named it is a row.
    fireEvent.click(screen.getByRole("button", { name: "Someone owes" }));
    fireEvent.click(screen.getByRole("button", { name: "Nina" }));
    expect(screen.getByRole("button", { name: "Owes: Nina" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Role" }));
    fireEvent.click(screen.getByRole("radio", { name: "Debt — expected back" }));
    expect(screen.getByRole("button", { name: "Role: Debt — expected back" })).toBeDefined();
  });

  /** §6.8's one-off, whose only producer is this screen. */
  it("offers the one-off flag, off until it is set here", () => {
    withLedger(<TransactionDetail />);
    const toggle = screen.getByRole("checkbox", { name: "One-off" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("Delete removes the row and returns to Today with a toast", () => {
    withLedger(<TransactionDetail />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(router.dismissTo).toHaveBeenCalledWith({
      pathname: "/",
      params: { message: "Transaction deleted.", nonce: expect.any(String) },
    });
  });

  it("a row that no longer exists shows the terminal state, not a crash", () => {
    withLedger(<TransactionDetail />, fakeController(null));

    expect(screen.getByText("This transaction no longer exists.")).toBeDefined();
    // **One** way back, not two. The state used to carry a `Back` action of
    // its own under a navigation band that already had one; the header is the
    // screen's now and carries the only one.
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
