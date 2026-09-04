/**
 * @vitest-environment jsdom
 *
 * S16's editor and its reconcile sheet, rendered against an in-memory
 * ledger — the shape `screens.test.tsx` already uses, in its own file for
 * the same reason `accounts-screen.test.tsx` is: a fixture shape neither
 * shares.
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  createPhoneLedger,
  type PhoneLedgerPort,
} from "@waltning/client/ledger/create-phone-ledger";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode, toMoney } from "@waltning/core/money";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), back: vi.fn(), dismissTo: vi.fn() };
const useLocalSearchParams = vi.fn(() => ({ id: "11111111-1111-4111-8111-111111111111" }));

vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
  useLocalSearchParams: () => useLocalSearchParams(),
}));

import AccountEditorScreen from "./account-editor-screen";

const PLN = currencyCode("PLN");

const ACCOUNT = {
  id: id<"accounts">("11111111-1111-4111-8111-111111111111"),
  name: "Bank A · PLN",
  kind: "bank" as const,
  currency: PLN,
  decimals: 2,
  balance: toMoney("1240.50"),
  groupId: null,
  ownership: "own" as const,
  isBusiness: false,
  archived: false,
  expectedBalance: null,
  openingBalance: toMoney("1240.50"),
  openingDate: null,
  memo: "",
  version: 3,
};

function fakeController(overrides: {
  updateAccount?: PhoneLedgerPort["updateAccount"];
  archiveAccount?: PhoneLedgerPort["archiveAccount"];
  reconcileAccount?: PhoneLedgerPort["reconcileAccount"];
  balanceAsOf?: PhoneLedgerPort["balanceAsOf"];
}) {
  const port: PhoneLedgerPort = {
    listAccounts: () => [ACCOUNT],
    listCurrencies: () => [
      { code: PLN, name: "Polish Złoty", symbol: "zł", decimals: 2, capturable: true },
    ],
    listGroups: () => [],
    listRecent: () => [],
    listCategories: () => [],
    listCategoryTree: () => [],
    listCounterparties: () => [],
    listPayeeHistory: () => [],
    listNetWorth: () => [],
    readPeriodSpend: () => [],
    listUnsettledClearing: () => [],
    listCounterpartyBalances: () => [],
    balanceAsOf: overrides.balanceAsOf ?? (() => ACCOUNT.balance),
    createAccount: vi.fn(),
    createTransaction: vi.fn(),
    createCategory: vi.fn(),
    updateAccount: overrides.updateAccount ?? vi.fn(),
    archiveAccount: overrides.archiveAccount ?? vi.fn(),
    reconcileAccount: overrides.reconcileAccount ?? vi.fn(),
    createGroup: vi.fn(),
    createCounterparty: vi.fn(),
    updateCounterparty: vi.fn(),
    mergeCounterparties: vi.fn(),
    unmergeCounterparties: vi.fn(),
    recordDistinctCounterparties: vi.fn(),
    settleDebt: vi.fn(() => ({ residual: toMoney("0"), overSettled: false })),
    searchTransactions: () => ({
      rows: [],
      nextCursor: undefined,
      total: { count: 0, currencies: [] },
    }),
    categorizeBatch: () => undefined,
    getTransaction: () => null,
    updateTransaction: () => undefined,
    deleteTransaction: () => undefined,
    setTransactionLines: () => undefined,
    readRate: () => null,
    readCoverage: () => [],
    listFxRates: () => [],
    addCurrency: vi.fn(),
    archiveCurrency: vi.fn(),
    setRateSource: vi.fn(),
    setPinned: vi.fn(),
    changePivot: vi.fn(),
    setManualRate: vi.fn(() => ({ written: 0, replacedManual: 0 })),
    clearManualRate: vi.fn(() => ({ deleted: 0 })),
    listFullCategoryTree: vi.fn(() => []),
    listCategoryUsage: vi.fn(() => new Map()),
    readCategoryReferenceCounts: vi.fn(() => ({ transactions: 0, lines: 0, rules: 0 })),
    renameCategory: vi.fn(),
    reparentCategory: vi.fn(),
    convertLeafGroup: vi.fn(),
    mergeCategories: vi.fn(),
    archiveCategory: vi.fn(),
    reset: vi.fn(),
  };
  return createPhoneLedger(port, {
    capture: () => ({
      date: accountingDate("2026-09-03"),
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-09-03T10:00:00Z"),
    }),
    id: () => id("22222222-2222-4222-8222-222222222222"),
  });
}

function withLedger(overrides: Parameters<typeof fakeController>[0] = {}) {
  return render(
    <LedgerProvider controller={fakeController(overrides)}>
      <AccountEditorScreen />
    </LedgerProvider>,
  );
}

beforeEach(() => {
  router.back.mockClear();
  router.dismissTo.mockClear();
  useLocalSearchParams.mockReturnValue({ id: "11111111-1111-4111-8111-111111111111" });
});

describe("AccountEditorScreen", () => {
  it("opens the editor pre-filled with the account's own fields", () => {
    withLedger();
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Bank A · PLN");
    expect(screen.getByText("PLN zł")).toBeDefined();
  });

  it("renders nothing for an id the active list does not hold", () => {
    useLocalSearchParams.mockReturnValue({ id: "does-not-exist" });
    const { container } = withLedger();
    expect(container.textContent).toBe("");
  });

  it("saves a patch through updateAccount and goes back", async () => {
    const updateAccount = vi.fn<PhoneLedgerPort["updateAccount"]>();
    withLedger({ updateAccount });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bank A · renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateAccount).toHaveBeenCalledTimes(1));
    expect(updateAccount.mock.calls[0]?.[0]).toMatchObject({
      id: ACCOUNT.id,
      version: 3,
      patch: { name: "Bank A · renamed" },
    });
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("resolves a stale-version refusal to a translated form-level message", () => {
    const updateAccount = vi.fn<PhoneLedgerPort["updateAccount"]>(() => {
      throw new Error("update_account: stale version — read 3, row is at 4");
    });
    withLedger({ updateAccount });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bank A · renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("This account changed elsewhere");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("archives and dismisses to the register with a Toast message", async () => {
    const archiveAccount = vi.fn<PhoneLedgerPort["archiveAccount"]>();
    withLedger({ archiveAccount });
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(archiveAccount).toHaveBeenCalledTimes(1));
    expect(archiveAccount.mock.calls[0]?.[0]).toMatchObject({ id: ACCOUNT.id, version: 3 });
    expect(router.dismissTo).toHaveBeenCalledWith({
      pathname: "/accounts",
      params: { message: "Account archived." },
    });
  });

  it("opens Reconcile and saves the observed balance through reconcileAccount", async () => {
    const reconcileAccount = vi.fn<PhoneLedgerPort["reconcileAccount"]>();
    withLedger({ reconcileAccount });
    fireEvent.click(screen.getByRole("button", { name: "Reconcile…" }));

    const sheet = within(screen.getByLabelText("Reconcile"));
    expect(sheet.getByText("Bank A · PLN")).toBeDefined();
    fireEvent.change(sheet.getByLabelText("You observed"), { target: { value: "1198.30" } });
    fireEvent.click(sheet.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(reconcileAccount).toHaveBeenCalledTimes(1));
    expect(reconcileAccount.mock.calls[0]?.[0]).toMatchObject({
      accountId: ACCOUNT.id,
      observedBalance: "1198.30000000",
    });
  });

  it("refolds the Computed figure through balanceAsOf when the sheet's date moves", () => {
    const today = deviceRuntime().capture().date;
    const balanceAsOf = vi.fn<PhoneLedgerPort["balanceAsOf"]>((_accountId, asOf) =>
      asOf === "2026-08-15" ? toMoney("900.00") : ACCOUNT.balance,
    );
    withLedger({ balanceAsOf });
    fireEvent.click(screen.getByRole("button", { name: "Reconcile…" }));

    const sheet = within(screen.getByLabelText("Reconcile"));
    expect(balanceAsOf).toHaveBeenCalledWith(ACCOUNT.id, today);
    expect(sheet.getByText("1 240.50")).toBeDefined();

    fireEvent.change(sheet.getByLabelText("As of"), { target: { value: "2026-08-15" } });

    expect(balanceAsOf).toHaveBeenCalledWith(ACCOUNT.id, "2026-08-15");
    expect(sheet.getByText("900.00")).toBeDefined();
    expect(sheet.queryByText("1 240.50")).toBeNull();
  });

  it("renders a zero-difference reconcile refusal on the observed field", () => {
    const reconcileAccount = vi.fn<PhoneLedgerPort["reconcileAccount"]>(() => {
      throw new Error("reconcile_account: nothing to reconcile — the ledger already says 1240.50");
    });
    withLedger({ reconcileAccount });
    fireEvent.click(screen.getByRole("button", { name: "Reconcile…" }));
    const sheet = within(screen.getByLabelText("Reconcile"));
    fireEvent.change(sheet.getByLabelText("You observed"), { target: { value: "1240.50" } });
    fireEvent.click(sheet.getByRole("button", { name: "Save" }));

    expect(screen.getByText("The ledger already shows this balance.")).toBeDefined();
  });
});
