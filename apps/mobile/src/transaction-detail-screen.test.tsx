/**
 * @vitest-environment jsdom
 *
 * `TransactionDetail` (S09) — the states table in full: found and editable,
 * a save that reaches the ledger, a stale-version refusal, delete with no
 * undo, and a row that no longer exists.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  createPhoneLedger,
  type PhoneLedgerPort,
} from "@waltning/client/ledger/create-phone-ledger";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { basePort } from "@waltning/client/ledger/test-port";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode, toMoney } from "@waltning/core/money";
import { I18nProvider } from "@waltning/ui/i18n/provider";
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
        hasEntries: false,
        inTotal: true,
        color: null,
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
        hasEntries: false,
        inTotal: true,
        color: null,
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
  toAmount: null,
  toCurrency: null,
  fee: null,
  paidAmount: null,
  paidCurrency: null,
  paidDecimals: null,
  categoryId: null,
  categoryName: null,
  categoryExternalId: null,
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
  /**
   * **A transaction is a transaction.** A transfer opens the same fields card
   * as every other type, with its own rows in it, and saves from it: there is
   * no second screen a transfer is sent to.
   */
  it("edits a transfer on the same card — its legs move together", () => {
    const updateTransaction = vi.fn<PhoneLedgerPort["updateTransaction"]>();
    const transfer = {
      ...DETAIL,
      type: "transfer" as const,
      enteredName: "",
      accountId: ACCOUNT_B,
      accountName: "Bank A · PLN",
      toAccountId: ACCOUNT,
      toAccountName: "Cash · PLN",
      amount: toMoney("-400.00"),
      toAmount: toMoney("400.00"),
      toCurrency: PLN,
    };
    withLedger(<TransactionDetail />, fakeController(transfer, { updateTransaction }));

    expect(screen.queryByRole("button", { name: /^Category/ }), "no category").toBeNull();
    expect(screen.getByRole("button", { name: "From: Bank A · PLN" })).toBeDefined();
    expect(screen.getByRole("button", { name: "To: Cash · PLN" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Amount: 400.00" }));
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "450" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(updateTransaction).toHaveBeenCalledTimes(1);
    expect(updateTransaction.mock.calls[0]?.[0].patch).toMatchObject({
      amountOriginal: expect.anything(),
      toAmount: expect.anything(),
    });
  });

  it("shows the hero amount and the fields of the row it was pushed for", () => {
    withLedger(<TransactionDetail />);
    // The band says the figure; the header line it folds into only draws it,
    // hidden from assistive technology, which hears the header by its date.
    const spoken = screen
      .getAllByText("-48.90")
      .filter((node) => node.closest('[aria-hidden="true"]') === null);
    expect(spoken).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "August 6, 2026" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Shop / payee: Café A" })).toBeDefined();
  });

  it("saves a changed field, and the new value reads back", () => {
    withLedger(<TransactionDetail />);

    fireEvent.click(screen.getByRole("button", { name: "Shop / payee: Café A" }));
    fireEvent.change(screen.getByLabelText("Shop / payee"), {
      target: { value: "Café A · Downtown" },
    });
    // The only `Save` on screen: `LinesCard` renders none while it holds no
    // lines and none have been added.
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("button", { name: "Shop / payee: Café A · Downtown" })).toBeDefined();
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

    fireEvent.click(screen.getByRole("button", { name: "Shop / payee: Café A" }));
    fireEvent.change(screen.getByLabelText("Shop / payee"), { target: { value: "Bakery A" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "This transaction changed elsewhere — reload it before saving.",
    );
  });

  /**
   * **A write from elsewhere is a conflict, never silently undone.** The
   * header re-reads the row on every ledger change, but the draft keeps the
   * version it started from — so a save after another device's edit is
   * refused, where sending the fresh version would have written the stale
   * draft over it.
   */
  it("refuses a save after the row changed elsewhere, rather than overwriting it", () => {
    const controller = fakeController(DETAIL);
    withLedger(<TransactionDetail />, controller);

    act(() => {
      controller.updateTransaction(id<"transactions">(TXN), 1, { note: "Elsewhere" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Shop / payee: Café A" }));
    fireEvent.change(screen.getByLabelText("Shop / payee"), { target: { value: "Bakery A" } });
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
    fireEvent.click(screen.getByRole("button", { name: "With whom" }));
    fireEvent.click(screen.getByRole("button", { name: "Nina" }));
    expect(screen.getByRole("button", { name: "With whom: Nina" })).toBeDefined();
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

  /**
   * S09 §3 — the *Who* card follows the pick. A counterparty chosen here is a
   * draft until Save, and the card above the fields must not go on asking
   * *Who was this with?* after one is chosen: it names the person, and offers
   * to change them (one counterparty per transaction — a second pick replaces).
   */
  it("the context card names the chosen counterparty and offers to change it", () => {
    const nina = id<"counterparties">("99999999-9999-4999-8999-999999999999");
    const tomasz = id<"counterparties">("88888888-8888-4888-8888-888888888888");
    const person = (counterpartyId: typeof nina, name: string) => ({
      id: counterpartyId,
      name,
      kind: "person" as const,
      settlementCurrency: null,
      contact: null,
      note: "",
      archived: false,
      version: 1,
    });
    withLedger(
      <TransactionDetail />,
      fakeController(DETAIL, {
        listCounterparties: () => [person(nina, "Nina"), person(tomasz, "Tomasz")],
      }),
    );

    expect(screen.getByText("Who was this with?")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "With whom" }));
    fireEvent.click(screen.getByRole("button", { name: "Nina" }));

    expect(screen.queryByText("Who was this with?")).toBeNull();
    expect(screen.getAllByText("Nina").length).toBeGreaterThan(0);
    // The pick is a draft: the card says so, and counts this row among theirs.
    expect(screen.getByText("Not saved yet")).toBeDefined();
    expect(screen.getByText(/× 1|1×/)).toBeDefined();

    // Change replaces: the same picker, and the card now names the second person.
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.click(screen.getByRole("button", { name: "Tomasz" }));
    expect(screen.queryByText("Who was this with?")).toBeNull();
    expect(screen.getAllByText("Tomasz").length).toBeGreaterThan(0);
    expect(screen.queryByText("Nina")).toBeNull();
  });

  /** §3 — the amount row is seeded in the reader's mark, at the account's scale. */
  it("seeds the amount field with the locale's decimal mark", () => {
    render(
      <I18nProvider locale="de">
        <LedgerProvider controller={fakeController(DETAIL)}>
          <TransactionDetail />
        </LedgerProvider>
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Betrag: 48,90" }));
    expect((screen.getByLabelText("Betrag") as HTMLInputElement).value).toBe("48,90");
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

/**
 * §6.6 — S09 follows the category. Picking one of the four debt categories
 * (by its seed tag, not its name) makes the row a debt and asks Who?, which is
 * required; the pick is held in the card until Save so the category, the
 * person and the role are written together.
 */
describe("TransactionDetail — a debt category", () => {
  const GROUP = id<"categories">("aaaaaaaa-aaaa-4aaa-8aaa-000000000010");
  const LENT = id<"categories">("aaaaaaaa-aaaa-4aaa-8aaa-000000000011");
  const GROCERIES = id<"categories">("aaaaaaaa-aaaa-4aaa-8aaa-000000000012");
  const TRAVEL = id<"categories">("aaaaaaaa-aaaa-4aaa-8aaa-000000000013");
  const NINA = id<"counterparties">("bbbbbbbb-bbbb-4bbb-8bbb-000000000001");
  const TOMASZ = id<"counterparties">("bbbbbbbb-bbbb-4bbb-8bbb-000000000002");
  const node = (
    nodeId: typeof LENT,
    name: string,
    externalId: string | null,
    parentId = GROUP,
  ) => ({
    id: nodeId,
    parentId,
    name,
    kind: "expense" as const,
    isLeaf: true,
    sort: 0,
    externalId,
  });

  function debtLedger(
    updateTransaction: PhoneLedgerPort["updateTransaction"],
    detail: Partial<NonNullable<FakeDetail>> = {},
  ) {
    return fakeController(
      { ...DETAIL, categoryId: GROCERIES, categoryName: "Groceries", ...detail },
      {
        updateTransaction,
        listCategories: () => [
          { id: LENT, name: "Money I handed over", kind: "expense", externalId: "seed:lent-out" },
          { id: GROCERIES, name: "Groceries", kind: "expense", externalId: "seed:groceries" },
          { id: TRAVEL, name: "Travel", kind: "expense", externalId: "seed:travel" },
        ],
        listCategoryTree: () => [
          {
            id: GROUP,
            parentId: null,
            name: "Loans",
            kind: "expense",
            isLeaf: false,
            sort: 0,
            externalId: null,
          },
          node(LENT, "Money I handed over", "seed:lent-out"),
          node(GROCERIES, "Groceries", "seed:groceries"),
          node(TRAVEL, "Travel", "seed:travel"),
        ],
        listCounterparties: () => [
          {
            id: NINA,
            name: "Nina",
            kind: "person" as const,
            settlementCurrency: null,
            contact: null,
            note: "",
            archived: false,
            version: 1,
          },
          {
            id: TOMASZ,
            name: "Tomasz",
            kind: "person" as const,
            settlementCurrency: null,
            contact: null,
            note: "",
            archived: false,
            version: 1,
          },
        ],
      },
    );
  }

  function pickLentOut() {
    fireEvent.click(screen.getByRole("button", { name: /^Category/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Money I handed over" }));
  }

  it("holds the pick, asks Who?, and refuses Save until a person is named", () => {
    const updateTransaction = vi.fn();
    withLedger(<TransactionDetail />, debtLedger(updateTransaction));

    pickLentOut();
    // Held, not written: the category changes with the role and the person.
    expect(updateTransaction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Category: Money I handed over" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Who?" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Choose who this is with.")).toBeDefined();
    expect(updateTransaction).not.toHaveBeenCalled();
  });

  it("writes the category, the person and the debt role together", () => {
    const updateTransaction = vi.fn();
    withLedger(<TransactionDetail />, debtLedger(updateTransaction));

    pickLentOut();
    fireEvent.click(screen.getByRole("button", { name: "Who?" }));
    fireEvent.click(screen.getByRole("button", { name: "Nina" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(updateTransaction).toHaveBeenCalledOnce();
    // One row, one pick: the person is who it was with and who the debt is with.
    expect(updateTransaction.mock.calls[0]?.[0].patch).toMatchObject({
      categoryId: LENT,
      counterpartyId: NINA,
      obligationCounterpartyId: NINA,
      obligationRole: "debt",
    });
  });

  it("draws one row for the person, and With whom is back on the category you leave for", () => {
    withLedger(<TransactionDetail />, debtLedger(vi.fn()));

    expect(screen.getByRole("button", { name: /^With whom/ })).toBeDefined();
    pickLentOut();
    expect(screen.queryByRole("button", { name: /^With whom/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Who?" })).toBeDefined();
  });

  it("keeps the person as With whom when the held category is switched back", () => {
    const updateTransaction = vi.fn<PhoneLedgerPort["updateTransaction"]>();
    withLedger(<TransactionDetail />, debtLedger(updateTransaction));

    pickLentOut();
    fireEvent.click(screen.getByRole("button", { name: "Who?" }));
    fireEvent.click(screen.getByRole("button", { name: "Nina" }));
    fireEvent.click(screen.getByRole("button", { name: /^Category/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Groceries" }));

    expect(screen.getByRole("button", { name: "With whom: Nina" })).toBeDefined();

    // The held pick is gone, so what is saved is the person as With whom and no
    // obligation at all — a person with no role is a row that cannot sync.
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(updateTransaction).toHaveBeenCalledOnce();
    const patch = updateTransaction.mock.calls[0]?.[0].patch;
    expect(patch).toMatchObject({ counterpartyId: NINA });
    expect(patch).not.toHaveProperty("obligationCounterpartyId");
    expect(patch).not.toHaveProperty("obligationRole");
  });

  it("keeps an obligation picked by hand when one plain category is swapped for another", () => {
    const updateTransaction = vi.fn<PhoneLedgerPort["updateTransaction"]>();
    // A saved Lent out row: leaving it holds every later pick in the card.
    withLedger(
      <TransactionDetail />,
      debtLedger(updateTransaction, {
        categoryId: LENT,
        categoryName: "Money I handed over",
        obligationCounterpartyId: NINA,
        counterpartyName: "Nina",
        obligationRole: "debt",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /^Category/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Groceries" }));
    fireEvent.click(screen.getByRole("button", { name: /^Owes/ }));
    fireEvent.click(screen.getByRole("button", { name: "Tomasz" }));
    fireEvent.click(screen.getByRole("button", { name: /^Category/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Travel" }));

    // Groceries to Travel never left a debt category, so the person on Owes stays.
    expect(screen.getByRole("button", { name: "Owes: Tomasz" })).toBeDefined();
  });

  it("does the same when the held debt is followed by a third category", () => {
    const updateTransaction = vi.fn<PhoneLedgerPort["updateTransaction"]>();
    withLedger(<TransactionDetail />, debtLedger(updateTransaction));

    pickLentOut();
    fireEvent.click(screen.getByRole("button", { name: "Who?" }));
    fireEvent.click(screen.getByRole("button", { name: "Nina" }));
    fireEvent.click(screen.getByRole("button", { name: /^Category/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Travel" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const patch = updateTransaction.mock.calls[0]?.[0].patch;
    expect(patch).toMatchObject({ categoryId: TRAVEL, counterpartyId: NINA });
    expect(patch).not.toHaveProperty("obligationCounterpartyId");
    expect(patch).not.toHaveProperty("obligationRole");
  });
});
