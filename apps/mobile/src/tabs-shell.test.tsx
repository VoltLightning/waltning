/**
 * @vitest-environment jsdom
 *
 * `<TabsShell>` across the breakpoint (`DESK1`, `02-tokens` §2.10) — a real
 * resize, matching `use-breakpoint.test.tsx`, over a fixed `<TabSlot>` stub.
 * `expo-router/ui`'s tab triggers are mocked the way `use-tab-bar-items.
 * test.tsx` already mocks them: what this asserts is what the shell renders
 * for a given width, not `expo-router`'s own behaviour.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  createPhoneLedger,
  type PhoneAccount,
  type PhoneCategory,
  type PhoneLedgerPort,
} from "@waltning/client/ledger/create-phone-ledger";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode, toMoney } from "@waltning/core/money";
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

function fakeController(
  overrides: {
    accounts?: readonly PhoneAccount[];
    categories?: readonly PhoneCategory[];
    createTransaction?: PhoneLedgerPort["createTransaction"];
  } = {},
) {
  return createPhoneLedger(
    {
      listAccounts: () => overrides.accounts ?? [],
      listCurrencies: () =>
        (overrides.accounts ?? []).length === 0
          ? []
          : [
              {
                code: currencyCode("PLN"),
                name: "Polish Złoty",
                symbol: "zł",
                decimals: 2,
                capturable: true,
                isPivot: true,
              },
            ],
      listGroups: () => [],
      listRecent: () => [],
      listCategories: () => overrides.categories ?? [],
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
      listCounterpartyMerges: () => [],
      listDistinctCounterpartyPairs: () => [],
      balanceAsOf: () => toMoney("0"),
      searchTransactions: () => ({
        rows: [],
        nextCursor: undefined,
        total: { count: 0, currencies: [] },
      }),
      categorizeBatch: () => undefined,
      createAccount: () => undefined,
      createTransaction: overrides.createTransaction ?? (() => undefined),
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
      changePivot: () => ({ droppedDates: 0 }),
      setManualRate: () => ({ written: 0, replacedManual: 0 }),
      clearManualRate: () => ({ deleted: 0 }),
      updateCurrency: vi.fn(),
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

const CASH: PhoneAccount = {
  id: id<"accounts">("33333333-3333-4333-8333-333333333333"),
  name: "Cash",
  kind: "cash",
  currency: currencyCode("PLN"),
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
 * DESK2 — `screens/S05-quick-add.md` §3's "Web — ≥1024px", from the keyboard
 * alone: `DeskBand`'s command-bar slot is `<CommandBar>` once an account
 * exists, and the S05 example line reaches `create_transaction` with the
 * resolved row.
 */
describe("DeskCommandBar (DESK2)", () => {
  it("S05's own example line saves the right row on Enter", () => {
    // `DeskCommandBar` reads "today" from the device's own calendar (§7.0a) —
    // `deviceRuntime()`, not the fixed capture `fakeController`'s
    // `createPhoneLedger` runtime hands the ledger's write path — so
    // "yesterday" is only a fixed date once the system clock itself is.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T12:00:00Z")); // Thursday.
    try {
      resizeTo(1440);
      const createTransaction = vi.fn();
      render(
        <LedgerProvider controller={fakeController({ accounts: [CASH], createTransaction })}>
          <TabsShell slot={<Text>Route content</Text>} />
        </LedgerProvider>,
      );

      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "48.90 cash coffee yesterday" } });
      // D1 resolved it live — the chips render before Enter is ever pressed.
      expect(screen.getByText("Cash")).toBeDefined();
      // L4 — the date chip is a reading of the line, not the ISO string.
      expect(screen.getByText("Sep 2")).toBeDefined();

      fireEvent.keyDown(input, { key: "Enter" });

      expect(createTransaction).toHaveBeenCalledOnce();
      const [written] = createTransaction.mock.calls[0] as [Record<string, unknown>];
      expect(written).toMatchObject({
        type: "expense",
        accountId: CASH.id,
        amountOriginal: "48.90000000",
        payee: "coffee",
        date: "2026-09-02",
      });
      // A save clears the bar for the next line.
      expect(input).toHaveProperty("value", "");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a line with no amount refuses with the reason under the bar, and never reaches the controller", () => {
    resizeTo(1440);
    const createTransaction = vi.fn();
    render(
      <LedgerProvider controller={fakeController({ accounts: [CASH], createTransaction })}>
        <TabsShell slot={<Text>Route content</Text>} />
      </LedgerProvider>,
    );

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "coffee" } });
    expect(screen.getByText("No amount found — start the line with a number.")).toBeDefined();

    fireEvent.keyDown(input, { key: "Enter" });

    expect(createTransaction).not.toHaveBeenCalled();
    expect(input).toHaveProperty("value", "coffee");
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
