/**
 * @vitest-environment jsdom
 *
 * S12, S13 and S15, rendered against an in-memory ledger — the shape
 * `account-editor-screen.test.tsx` and `screens.test.tsx` already use, in
 * one file because all three screens share the same counterparty fixture.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  createPhoneLedger,
  type PhoneAccount,
  type PhoneCounterparty,
  type PhoneCounterpartyBalance,
  type PhoneLedgerPort,
  type PhoneSearchPage,
} from "@waltning/client/ledger/create-phone-ledger";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { accountingDate } from "@waltning/core/date";
import { type Id, id } from "@waltning/core/id";
import { currencyCode, toMoney } from "@waltning/core/money";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), back: vi.fn(), dismissTo: vi.fn() };
const useLocalSearchParams = vi.fn(() => ({}));

vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
  useLocalSearchParams: () => useLocalSearchParams(),
}));

import CounterpartyDetail from "./counterparty-detail-screen";
import CounterpartyEditor from "./counterparty-editor-screen";
import Debt from "./debt-screen";

const PLN = currencyCode("PLN");
const EUR = currencyCode("EUR");
const TODAY = accountingDate("2026-09-03");
const NINA = id<"counterparties">("11111111-1111-4111-8111-111111111111");
const MAREK = id<"counterparties">("22222222-2222-4222-8222-222222222222");

const NINA_ROW: PhoneCounterpartyBalance = {
  counterpartyId: NINA,
  name: "Nina",
  kind: "person",
  settlementCurrency: PLN,
  currency: PLN,
  decimals: 2,
  balance: toMoney("840.00000000"),
  ageDays: null,
  bucket: null,
};

const NINA_COUNTERPARTY: PhoneCounterparty = {
  id: NINA,
  name: "Nina",
  kind: "person",
  settlementCurrency: PLN,
  contact: null,
  note: "",
  archived: false,
  version: 1,
};

/** S14's own "Into"/"From" picker — one capturable account, in the balance's own currency. */
const CASH_PLN: PhoneAccount = {
  id: id<"accounts">("33333333-3333-4333-8333-333333333333"),
  name: "Cash · PLN",
  kind: "cash",
  currency: PLN,
  decimals: 2,
  balance: toMoney("0"),
  groupId: null,
  ownership: "own",
  isBusiness: false,
  archived: false,
  expectedBalance: null,
  openingBalance: toMoney("0"),
  openingDate: null,
  memo: "",
  version: 1,
};

/**
 * The BLOCKER's own case (finding 1) — Nina settles in EUR, holds PLN +840
 * (no PLN rate on the replica) and EUR −120. `EUR` is this fixture's pivot,
 * so it is exactly the PLN leg that has nothing to convert with.
 */
const NINA_MIXED_ROWS: readonly PhoneCounterpartyBalance[] = [
  { ...NINA_ROW, currency: PLN, settlementCurrency: EUR, balance: toMoney("840.00000000") },
  { ...NINA_ROW, currency: EUR, settlementCurrency: EUR, balance: toMoney("-120.00000000") },
];

const EUR_PIVOT_CURRENCY = {
  code: EUR,
  name: "Euro",
  symbol: "€",
  decimals: 2,
  capturable: true,
  isPivot: true,
} as const;

const EMPTY_PAGE: PhoneSearchPage = {
  rows: [],
  nextCursor: undefined,
  total: { count: 0, currencies: [] },
};

/**
 * Every `PhoneLedgerPort` method, defaulted to the emptiest honest answer —
 * the same shape `screens.test.tsx`'s own `fakeController` builds, so a test
 * overrides only what it is actually about.
 */
function basePort(overrides: Partial<PhoneLedgerPort> = {}): PhoneLedgerPort {
  return {
    listAccounts: () => [],
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
    listGroups: () => [],
    listRecent: () => [],
    listCategories: () => [],
    listCategoryTree: () => [],
    listCounterparties: () => [],
    listPayeeHistory: () => [],
    listCounterpartyBalances: () => [],
    listCounterpartyMerges: () => [],
    listDistinctCounterpartyPairs: () => [],
    listNetWorth: () => [],
    readPeriodSpend: () => [],
    listUnsettledClearing: () => [],
    balanceAsOf: () => toMoney("0"),
    searchTransactions: () => EMPTY_PAGE,
    createAccount: () => undefined,
    createTransaction: () => undefined,
    createCategory: () => undefined,
    categorizeBatch: () => undefined,
    getTransaction: () => null,
    updateTransaction: () => undefined,
    deleteTransaction: () => undefined,
    setTransactionLines: () => undefined,
    updateAccount: () => undefined,
    archiveAccount: () => undefined,
    reconcileAccount: () => undefined,
    createGroup: () => undefined,
    readRate: () => null,
    readCoverage: () => [],
    listFxRates: () => [],
    addCurrency: () => undefined,
    archiveCurrency: () => undefined,
    setRateSource: () => undefined,
    setPinned: () => undefined,
    changePivot: () => undefined,
    setManualRate: () => ({ written: 0, replacedManual: 0 }),
    clearManualRate: () => ({ deleted: 0 }),
    createCounterparty: () => undefined,
    updateCounterparty: () => undefined,
    mergeCounterparties: () => undefined,
    unmergeCounterparties: () => undefined,
    recordDistinctCounterparties: () => undefined,
    settleDebt: () => ({ residual: toMoney("0"), overSettled: false }),
    listFullCategoryTree: () => [],
    listCategoryUsage: () => new Map(),
    readCategoryReferenceCounts: () => ({ transactions: 0, lines: 0, rules: 0 }),
    renameCategory: () => undefined,
    reparentCategory: () => undefined,
    convertLeafGroup: () => undefined,
    mergeCategories: () => undefined,
    archiveCategory: () => undefined,
    readCrossRate: () => null,
    reset: () => undefined,
    ...overrides,
  };
}

function controllerOf(port: PhoneLedgerPort) {
  return createPhoneLedger(port, {
    capture: () => ({
      date: TODAY,
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-09-03T10:00:00Z"),
    }),
    id: () => id("99999999-9999-4999-8999-999999999999"),
  });
}

beforeEach(() => {
  router.push.mockClear();
  router.back.mockClear();
  router.dismissTo.mockClear();
  useLocalSearchParams.mockReturnValue({});
});

describe("Debt (S12)", () => {
  it("shows a counterparty row and the two direction totals", () => {
    const controller = controllerOf(
      basePort({
        listCounterparties: () => [NINA_COUNTERPARTY],
        listCounterpartyBalances: () => [NINA_ROW],
      }),
    );
    render(
      <LedgerProvider controller={controller}>
        <Debt />
      </LedgerProvider>,
    );
    expect(screen.getByText("Nina")).toBeDefined();
    expect(screen.getByText("owes you")).toBeDefined();
  });

  it("shows the first-run empty state with nothing on the ledger", () => {
    const controller = controllerOf(basePort());
    render(
      <LedgerProvider controller={controller}>
        <Debt />
      </LedgerProvider>,
    );
    expect(screen.getByText("No one yet")).toBeDefined();
  });

  it("shows the 'all settled' empty state — counterparties exist, nothing is open", () => {
    const controller = controllerOf(
      basePort({
        listCounterparties: () => [NINA_COUNTERPARTY],
        listCounterpartyBalances: () => [],
      }),
    );
    render(
      <LedgerProvider controller={controller}>
        <Debt />
      </LedgerProvider>,
    );
    expect(screen.getByText("All settled")).toBeDefined();
  });

  /**
   * The BLOCKER (finding 1) — Nina holds PLN +840 (no rate) and EUR −120.
   * The old fallback rendered a single wrong net, *−120,00 € you owe*.
   * `CounterpartyRow` must show both balances stacked instead, and the
   * segment filter must classify her from those balances, not a net that
   * does not exist.
   */
  it("never substitutes one currency's balance for the net — the balances stack, each with its own direction", () => {
    const controller = controllerOf(
      basePort({
        listCurrencies: () => [EUR_PIVOT_CURRENCY],
        listCounterparties: () => [{ ...NINA_COUNTERPARTY, settlementCurrency: EUR }],
        listCounterpartyBalances: () => NINA_MIXED_ROWS,
        readRate: () => null,
      }),
    );
    render(
      <LedgerProvider controller={controller}>
        <Debt />
      </LedgerProvider>,
    );
    expect(screen.getByText("Nina")).toBeDefined();
    // Both directions render — the true, un-folded position — never a
    // single "you owe" standing in for the whole thing.
    expect(screen.getByText("owes you")).toBeDefined();
    expect(screen.getByText("you owe")).toBeDefined();
  });

  it("shows Nina under both They owe and You owe when her balances split both ways", () => {
    const controller = controllerOf(
      basePort({
        listCurrencies: () => [EUR_PIVOT_CURRENCY],
        listCounterparties: () => [{ ...NINA_COUNTERPARTY, settlementCurrency: EUR }],
        listCounterpartyBalances: () => NINA_MIXED_ROWS,
        readRate: () => null,
      }),
    );
    render(
      <LedgerProvider controller={controller}>
        <Debt />
      </LedgerProvider>,
    );

    fireEvent.click(screen.getByText("They owe"));
    expect(screen.getByText("Nina")).toBeDefined();

    fireEvent.click(screen.getByText("You owe"));
    expect(screen.getByText("Nina")).toBeDefined();
  });
});

describe("CounterpartyDetail (S13)", () => {
  beforeEach(() => useLocalSearchParams.mockReturnValue({ id: NINA }));

  it("shows the card, the ledger, and defaults history to debt rows", () => {
    const controller = controllerOf(
      basePort({
        listCounterparties: () => [NINA_COUNTERPARTY],
        listCounterpartyBalances: () => [NINA_ROW],
        searchTransactions: (filter) =>
          filter.counterpartyRole === "debt"
            ? { rows: [], nextCursor: undefined, total: { count: 1, currencies: [] } }
            : { rows: [], nextCursor: undefined, total: { count: 2, currencies: [] } },
      }),
    );
    render(
      <LedgerProvider controller={controller}>
        <CounterpartyDetail />
      </LedgerProvider>,
    );
    expect(screen.getByText("Nina")).toBeDefined();
    expect(screen.getByText("debts only · 1 other rows")).toBeDefined();
  });

  it("opens the SettleSheet when Settle is tapped", () => {
    const controller = controllerOf(
      basePort({
        listCounterparties: () => [NINA_COUNTERPARTY],
        listCounterpartyBalances: () => [NINA_ROW],
        listAccounts: () => [CASH_PLN],
      }),
    );
    render(
      <LedgerProvider controller={controller}>
        <CounterpartyDetail />
      </LedgerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Settle" }));
    expect(screen.getByText("Settling with Nina")).toBeDefined();
  });

  it("settles through the sheet — counterpartyId, the picked discharges, and the toast", () => {
    const settleDebt = vi.fn<PhoneLedgerPort["settleDebt"]>(() => ({
      residual: toMoney("790.00"),
      overSettled: false,
    }));
    const controller = controllerOf(
      basePort({
        listCounterparties: () => [NINA_COUNTERPARTY],
        listCounterpartyBalances: () => [NINA_ROW],
        listAccounts: () => [CASH_PLN],
        settleDebt,
      }),
    );
    render(
      <LedgerProvider controller={controller}>
        <CounterpartyDetail />
      </LedgerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Settle" }));

    const sheet = within(screen.getByLabelText("Settling with Nina"));
    fireEvent.click(sheet.getByRole("button", { name: "Into" }));
    fireEvent.click(sheet.getByRole("radio", { name: "Cash · PLN" }));

    fireEvent.click(sheet.getByRole("button", { name: "Amount: 0" }));
    fireEvent.click(sheet.getByRole("button", { name: "5" }));
    fireEvent.click(sheet.getByRole("button", { name: "0" }));

    fireEvent.click(sheet.getByRole("button", { name: "Discharges: 0" }));
    fireEvent.click(sheet.getByRole("button", { name: "5" }));
    fireEvent.click(sheet.getByRole("button", { name: "0" }));

    fireEvent.click(sheet.getByRole("button", { name: "Settle" }));

    expect(settleDebt).toHaveBeenCalledOnce();
    const input = settleDebt.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      counterpartyId: NINA,
      accountId: CASH_PLN.id,
      discharges: { currency: PLN, amount: toMoney("50") },
    });

    // P5 — the residual named in words, never a bare sign.
    expect(screen.getByText("Settled. 790.00 PLN they owe you.")).toBeDefined();
  });

  it("shows the all-settled empty state, keeping the card, when nothing is open", () => {
    const controller = controllerOf(basePort({ listCounterparties: () => [NINA_COUNTERPARTY] }));
    render(
      <LedgerProvider controller={controller}>
        <CounterpartyDetail />
      </LedgerProvider>,
    );
    expect(screen.getByText("Nina")).toBeDefined();
    expect(screen.getByText("All settled")).toBeDefined();
  });

  /** The BLOCKER (finding 1), on S13 — no net line when the fold is incomplete. */
  it("omits the net line entirely rather than showing a wrong one (P1)", () => {
    const controller = controllerOf(
      basePort({
        listCurrencies: () => [EUR_PIVOT_CURRENCY],
        listCounterparties: () => [{ ...NINA_COUNTERPARTY, settlementCurrency: EUR }],
        listCounterpartyBalances: () => NINA_MIXED_ROWS,
        readRate: () => null,
      }),
    );
    render(
      <LedgerProvider controller={controller}>
        <CounterpartyDetail />
      </LedgerProvider>,
    );
    expect(screen.getByText("Nina")).toBeDefined();
    // The two held balances still render, honestly — it is only the derived
    // "net in EUR" line that is absent, never computed from an incomplete fold.
    expect(screen.getByText("-120.00", { exact: false })).toBeDefined();
    expect(screen.getByText("840.00", { exact: false })).toBeDefined();
    expect(screen.queryByText("net in EUR")).toBeNull();
  });

  /** Finding 4 — S13's overflow lists a live merge and unmerges it. */
  it("lists a live merge and unmerges it, with the shared toast (finding 4)", () => {
    const unmergeCounterparties = vi.fn<PhoneLedgerPort["unmergeCounterparties"]>(() => undefined);
    const MERGE_ID = "33333333-3333-4333-8333-333333333333";
    const controller = controllerOf(
      basePort({
        listCounterparties: () => [NINA_COUNTERPARTY],
        listCounterpartyBalances: () => [NINA_ROW],
        listCounterpartyMerges: () => [
          {
            mergeId: id("33333333-3333-4333-8333-333333333333"),
            loserName: "Marek",
            mergedAt: new Date("2026-08-23T10:00:00Z"),
            movedCount: 3,
          },
        ],
        unmergeCounterparties,
      }),
    );
    render(
      <LedgerProvider controller={controller}>
        <CounterpartyDetail />
      </LedgerProvider>,
    );

    expect(screen.getByText("Merged Marek into this record · 3 rows")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Unmerge" }));

    expect(unmergeCounterparties).toHaveBeenCalledWith(
      expect.objectContaining({ mergeId: MERGE_ID }),
      expect.anything(),
    );
    expect(screen.getByText("Merge undone — the record is restored.")).toBeDefined();
  });
});

describe("CounterpartyEditor (S15)", () => {
  it("creates a new counterparty from the typed name", () => {
    const createCounterparty = vi.fn<PhoneLedgerPort["createCounterparty"]>(() => undefined);
    const controller = controllerOf(basePort({ createCounterparty }));
    render(
      <LedgerProvider controller={controller}>
        <CounterpartyEditor />
      </LedgerProvider>,
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Marek" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(createCounterparty).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Marek" }),
      expect.anything(),
    );
  });

  it("prefills the existing counterparty's fields in edit mode", () => {
    useLocalSearchParams.mockReturnValue({ id: NINA });
    const controller = controllerOf(basePort({ listCounterparties: () => [NINA_COUNTERPARTY] }));
    render(
      <LedgerProvider controller={controller}>
        <CounterpartyEditor />
      </LedgerProvider>,
    );
    expect(screen.getByDisplayValue("Nina")).toBeDefined();
    expect(screen.getByRole("button", { name: "Archive" })).toBeDefined();
  });

  it("surfaces a near-match warning on blur of the name field", () => {
    const controller = controllerOf(
      basePort({
        listCounterparties: () => [{ ...NINA_COUNTERPARTY, id: MAREK, name: "Ninna" }],
      }),
    );
    render(
      <LedgerProvider controller={controller}>
        <CounterpartyEditor />
      </LedgerProvider>,
    );
    const nameField = screen.getByLabelText("Name");
    fireEvent.change(nameField, { target: { value: "Nina" } });
    fireEvent.blur(nameField);
    expect(screen.getByText("Ninna")).toBeDefined();
    expect(screen.getByText("This is the same one")).toBeDefined();
  });

  /** Finding 2 — a stale version reaches form-level text, never a byField bucket nothing renders. */
  it("shows a stale version as form-level text on save (finding 2)", () => {
    useLocalSearchParams.mockReturnValue({ id: NINA });
    const updateCounterparty = vi.fn<PhoneLedgerPort["updateCounterparty"]>(() => {
      throw new Error("update_counterparty: stale version — read 1, row is at 2");
    });
    const controller = controllerOf(
      basePort({
        listCounterparties: () => [NINA_COUNTERPARTY],
        updateCounterparty,
      }),
    );
    render(
      <LedgerProvider controller={controller}>
        <CounterpartyEditor />
      </LedgerProvider>,
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Nina B." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("This counterparty changed elsewhere");
  });

  /** Finding 2 — an open-balance refusal on archive shows the executor's own message on a Toast. */
  it("shows an open-balance refusal on archive as a Toast (finding 2)", () => {
    useLocalSearchParams.mockReturnValue({ id: NINA });
    const updateCounterparty = vi.fn<PhoneLedgerPort["updateCounterparty"]>((input) => {
      if (input.patch.archived) {
        throw new Error(
          "update_counterparty: archiving is for settled relationships — an open balance exists",
        );
      }
    });
    const controller = controllerOf(
      basePort({
        listCounterparties: () => [NINA_COUNTERPARTY],
        updateCounterparty,
      }),
    );
    render(
      <LedgerProvider controller={controller}>
        <CounterpartyEditor />
      </LedgerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    expect(
      screen.getByText("Archiving is for settled relationships — this still has an open balance."),
    ).toBeDefined();
  });

  /**
   * Finding 5 — record a pair, reopen the editor, the match does not fire.
   * The read path this finding adds (`listDistinctCounterpartyPairs`, read
   * on `refresh()`) is what makes this true *across sessions* — not the
   * in-memory `dismissedIds` a single session already handled on its own.
   */
  it("records a distinct pair, and it is not asked about again after reopening (finding 5)", () => {
    useLocalSearchParams.mockReturnValue({ id: NINA });
    let recordedPairs: readonly (readonly [Id<"counterparties">, Id<"counterparties">])[] = [];
    const recordDistinctCounterparties = vi.fn<PhoneLedgerPort["recordDistinctCounterparties"]>(
      (input) => {
        recordedPairs = [...recordedPairs, [input.aId, input.bId]];
      },
    );
    const port = () =>
      basePort({
        listCounterparties: () => [
          NINA_COUNTERPARTY,
          { ...NINA_COUNTERPARTY, id: MAREK, name: "Ninna" },
        ],
        recordDistinctCounterparties,
        listDistinctCounterpartyPairs: () => recordedPairs,
      });

    const first = render(
      <LedgerProvider controller={controllerOf(port())}>
        <CounterpartyEditor />
      </LedgerProvider>,
    );
    const nameField = first.getByLabelText("Name");
    fireEvent.change(nameField, { target: { value: "Nina" } });
    fireEvent.blur(nameField);
    expect(first.getByText("Ninna")).toBeDefined();
    fireEvent.click(first.getByText("These are different"));
    expect(recordDistinctCounterparties).toHaveBeenCalledWith(
      expect.objectContaining({ aId: NINA, bId: MAREK }),
      expect.anything(),
    );
    first.unmount();

    // Reopen — a fresh screen, a fresh session, the pair now on the snapshot.
    render(
      <LedgerProvider controller={controllerOf(port())}>
        <CounterpartyEditor />
      </LedgerProvider>,
    );
    const reopenedNameField = screen.getByLabelText("Name");
    fireEvent.change(reopenedNameField, { target: { value: "Nina" } });
    fireEvent.blur(reopenedNameField);

    expect(screen.queryByText("Ninna")).toBeNull();
  });
});
