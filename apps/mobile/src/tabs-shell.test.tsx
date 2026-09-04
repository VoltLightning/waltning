/**
 * @vitest-environment jsdom
 *
 * `<TabsShell>` across the breakpoint (`DESK1`, `02-tokens` §2.10) — a real
 * resize, matching `use-breakpoint.test.tsx`, over a fixed `<TabSlot>` stub.
 * `expo-router/ui`'s tab triggers are mocked the way `use-tab-bar-items.
 * test.tsx` already mocks them: what this asserts is what the shell renders
 * for a given width, not `expo-router`'s own behaviour.
 */

import { act, render, screen } from "@testing-library/react";
import { createPhoneLedger } from "@waltning/client/ledger/create-phone-ledger";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { toMoney } from "@waltning/core/money";
import { installPhoneLayout, settleLayout } from "@waltning/ui/shell/floating-add.test-support";
import { Text } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Module scope, before the first render — `react-native-web` creates its
// `ResizeObserver` once and keeps it, so `FloatingAdd` (which renders nothing
// until it knows its layer's size) can only ever be measured if this runs
// before that first mount.
installPhoneLayout();

const switchTab = {
  today: vi.fn(),
  ledger: vi.fn(),
  calendar: vi.fn(),
  debt: vi.fn(),
  settings: vi.fn(),
};
let focused: "today" | "ledger" | "calendar" | "debt" | "settings" = "today";

vi.mock("expo-router/ui", () => ({
  useTabTrigger: ({ name }: { name: "today" | "ledger" | "calendar" | "debt" | "settings" }) => ({
    trigger: { isFocused: name === focused },
    switchTab: switchTab[name],
  }),
}));

vi.mock("expo-router", () => ({
  router: { push: vi.fn(), back: vi.fn(), dismissTo: vi.fn() },
}));

const { TabsShell, handleSelectType } = await import("./tabs-shell");
const { router } = await import("expo-router");

function fakeController() {
  return createPhoneLedger(
    {
      listAccounts: () => [],
      listCurrencies: () => [],
      listGroups: () => [],
      listRecent: () => [],
      listCategories: () => [],
      listCategoryTree: () => [],
      listFullCategoryTree: () => [],
      listCategoryUsage: () => new Map(),
      readCategoryReferenceCounts: () => ({ transactions: 0, lines: 0, rules: 0 }),
      listCounterparties: () => [],
      listPayeeHistory: () => [],
      listNetWorth: () => [],
      readPeriodSpend: () => [],
      listUnsettledClearing: () => [],
      listCounterpartyBalances: () => [],
      balanceAsOf: () => toMoney("0"),
      searchTransactions: () => ({
        rows: [],
        nextCursor: undefined,
        total: { count: 0, currencies: [] },
      }),
      categorizeBatch: () => undefined,
      createAccount: () => undefined,
      createTransaction: () => undefined,
      createCategory: () => undefined,
      getTransaction: () => null,
      updateTransaction: () => undefined,
      deleteTransaction: () => undefined,
      setTransactionLines: () => undefined,
      updateAccount: () => undefined,
      archiveAccount: () => undefined,
      reconcileAccount: () => undefined,
      createGroup: () => undefined,
      readRate: () => null,
      readCrossRate: () => null,
      listCurrencySettings: () => [],
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
      renameCategory: () => undefined,
      reparentCategory: () => undefined,
      convertLeafGroup: () => undefined,
      mergeCategories: () => undefined,
      archiveCategory: () => undefined,
      reset: () => undefined,
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

/**
 * `configurable: true`: a test that resizes twice redefines this property
 * twice, and the second `defineProperty` throws on a non-configurable one.
 */
function resizeTo(width: number) {
  Object.defineProperty(document.documentElement, "clientWidth", {
    value: width,
    configurable: true,
  });
  window.dispatchEvent(new Event("resize"));
}

beforeEach(() => {
  focused = "today";
});

describe("TabsShell", () => {
  it("renders the phone tab bar and add button at 390, and DeskBand at 1440", async () => {
    // Set before the first render — `useWindowDimensions`' initial state
    // reads `Dimensions.get`, which only re-measures on the process's first
    // call; every later call answers from the cache until a `resize` fires.
    resizeTo(390);

    render(
      <LedgerProvider controller={fakeController()}>
        <TabsShell slot={<Text>Route content</Text>} />
      </LedgerProvider>,
    );
    await settleLayout();

    expect(screen.getByText("Route content")).toBeDefined();
    expect(screen.getByRole("button", { name: "Add" })).toBeDefined();
    expect(screen.queryByText("Add — press N")).toBeNull();

    act(() => resizeTo(1440));

    expect(screen.getByText("Route content")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
    expect(screen.getByText("Add — press N")).toBeDefined();
  });
});

/**
 * `FloatingAdd`'s long-press picker (S05 §9.1) routes through this function —
 * tested directly rather than through a simulated `Gesture.LongPress`, which
 * the jsdom gesture-handler stub has no timing model for (`floating-add.test.
 * tsx`'s own note on the same gap).
 */
describe("handleSelectType", () => {
  it("routes Transfer to /transfer", () => {
    handleSelectType("transfer");
    expect(router.push).toHaveBeenCalledWith("/transfer");
  });

  it("routes Income to /quick-add with its type named in the route", () => {
    handleSelectType("income");
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/quick-add",
      params: { type: "income" },
    });
  });

  it("routes Expense to the ordinary /quick-add default", () => {
    handleSelectType("expense");
    expect(router.push).toHaveBeenCalledWith("/quick-add");
  });
});
