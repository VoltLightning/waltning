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
import { basePort } from "@waltning/client/ledger/test-port";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode, toMoney } from "@waltning/core/money";
import {
  SafeAreaProvider,
  useSafeArea,
  WindowInsetsProvider,
} from "@waltning/ui/primitives/safe-area";
import { BottomSheet } from "@waltning/ui/shell/bottom-sheet";
import { installPhoneLayout, settleLayout } from "@waltning/ui/shell/floating-add.test-support";
import { useFloatingClearance } from "@waltning/ui/shell/floating-clearance";
import { floating } from "@waltning/ui/tokens";
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
  debt: vi.fn(),
  settings: vi.fn(),
};
let focused: "today" | "ledger" | "debt" | "settings" = "today";

vi.mock("expo-router/ui", () => ({
  useTabTrigger: ({ name }: { name: "today" | "ledger" | "debt" | "settings" }) => ({
    trigger: { isFocused: name === focused },
    switchTab: switchTab[name],
  }),
}));

vi.mock("expo-router", () => ({
  router: { push: vi.fn(), back: vi.fn(), dismissTo: vi.fn() },
}));

const { TabsShell, handleSelectType } = await import("./tabs-shell");
const { displayCurrency } = await import("./platform");
const { router } = await import("expo-router");

const CHF = currencyCode("CHF");
const EUR = currencyCode("EUR");
const PLN = currencyCode("PLN");

const BANK_B_EUR: PhoneAccount = {
  id: id<"accounts">("55555555-5555-4555-8555-555555555555"),
  name: "Bank B · EUR",
  kind: "bank",
  currency: EUR,
  decimals: 2,
  balance: toMoney("2100.00"),
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

/** One EUR account and nothing else — the ledger M-B is about. */
const EUR_ONLY: PhoneAccount[] = [BANK_B_EUR];

/**
 * Two held currencies, in the order `subtotalsOf` folds them: a `CHF` savings
 * account opened first at `40.00`, and an `EUR` card at `-9 000.00` opened
 * second. The two candidate rules disagree on this fixture on purpose — order
 * says `CHF`, magnitude says `EUR` — so the assertion below pins which one the
 * band actually follows.
 */
const TWO_CURRENCIES: PhoneAccount[] = [
  {
    ...BANK_B_EUR,
    id: id<"accounts">("66666666-6666-4666-8666-666666666666"),
    name: "Savings · CHF",
    currency: CHF,
    balance: toMoney("40.00"),
  },
  { ...BANK_B_EUR, name: "Card B · EUR", kind: "card", balance: toMoney("-9000.00") },
];

function fakeController(
  overrides: {
    accounts?: readonly PhoneAccount[];
    categories?: readonly PhoneCategory[];
    createTransaction?: PhoneLedgerPort["createTransaction"];
  } = {},
) {
  const accounts = overrides.accounts ?? [];
  return createPhoneLedger(
    basePort({
      listAccounts: () => accounts,
      // A ledger with no account has no currency either — DESK2's command bar
      // needs both before it can resolve a line.
      listCurrencies: () =>
        accounts.length === 0
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
      listCategories: () => overrides.categories ?? [],
      createTransaction: overrides.createTransaction ?? (() => undefined),
    }),
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

/**
 * `displayCurrency` is a module singleton, so a `set` in one test is still in
 * force in the next one — the two hero tests below chose different currencies
 * and only passed in the order they happen to be declared in. Reset to `PLN`,
 * the seeded pivot, so every test starts from the same preference whether it
 * names one or not.
 */
beforeEach(async () => {
  focused = "today";
  await displayCurrency.set(PLN);
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

  /**
   * Every tab root but Today wears the shell's own title band
   * (`05-composites` §5.1). Ledger and Debt used to draw nothing at all, so
   * their content began 22px from the top of the device with no name on it.
   * Two matches: the bar's own label, and the header above the slot.
   */
  it("titles every tab but Today from the shell", async () => {
    focused = "ledger";
    resizeTo(390);
    render(
      <LedgerProvider controller={fakeController()}>
        <TabsShell slot={<Text>Route content</Text>} />
      </LedgerProvider>,
    );
    await settleLayout();

    expect(screen.getAllByText("Ledger")).toHaveLength(2);
  });

  /**
   * H1: the clearance for the floating button used to be a `GroundPanel`
   * default, which gave it to ten stack routes with no button anywhere near
   * them and to the startup screen, which renders before a tab shell exists.
   * It comes from the shell now, and only where the button is mounted — the
   * phone branch, never the desk one, which draws no button at all (§2.10).
   */
  it("tells the page under it how much room the floating button needs, and only there", async () => {
    focused = "ledger";
    resizeTo(390);
    render(
      <LedgerProvider controller={fakeController()}>
        <TabsShell slot={<ClearanceProbe />} />
      </LedgerProvider>,
    );
    await settleLayout();

    expect(screen.getByText(`clearance: ${floating.clearance}`)).toBeDefined();

    act(() => resizeTo(1440));

    expect(screen.getByText("clearance: 0")).toBeDefined();
  });

  /**
   * L1-new: `GroundPanel` clears the home-indicator inset because it is the
   * screen's own bottom edge, and under this shell it is not — the `TabBar`
   * is, and it already pads itself by the same number. The slot is handed a
   * cleared bottom so the inset is paid once; the sides and the top stay the
   * device's, because a landscape notch is still on one of them.
   */
  it("hands the slot a bottom the tab bar has already cleared", async () => {
    focused = "ledger";
    resizeTo(390);
    render(
      <DeviceInsets insets={NOTCHED}>
        <LedgerProvider controller={fakeController()}>
          <TabsShell slot={<InsetProbe />} />
        </LedgerProvider>
      </DeviceInsets>,
    );
    await settleLayout();

    expect(screen.getByText("insets: 59/0/0/0")).toBeDefined();
  });

  /**
   * The composition nothing composed. `SlotInsets` is right for the page and
   * wrong for an overlay: a `BottomSheet` opened from a tab screen is a
   * `Modal` over the whole window, but its children are the same React tree,
   * so it inherited the slot's zeroed bottom and stopped clearing the home
   * indicator — 22pt where 56 was specified, and on Android a field behind
   * the navigation bar's own buttons. The sheet's own unit tests could not
   * see it: they handed the component the device's insets directly, which is
   * a combination the shell never produces.
   */
  it("gives a sheet opened from a tab screen the device's bottom, not the slot's", async () => {
    focused = "ledger";
    resizeTo(390);
    render(
      <DeviceInsets insets={NOTCHED}>
        <LedgerProvider controller={fakeController()}>
          <TabsShell slot={<SheetProbe />} />
        </LedgerProvider>
      </DeviceInsets>,
    );
    await settleLayout();

    // space.x5 (22) + the device's 34 — the slot's own bottom is 0.
    expect(screen.getByTestId("bottom-sheet").style.paddingBottom).toBe("56px");
  });

  /** Today's hero band is a better header than a word, so it keeps it. */
  it("leaves Today to its own hero band", async () => {
    focused = "today";
    resizeTo(390);
    render(
      <LedgerProvider controller={fakeController()}>
        <TabsShell slot={<Text>Route content</Text>} />
      </LedgerProvider>,
    );
    await settleLayout();

    // The tab's own label, and nothing above the slot repeating it.
    expect(screen.getAllByText("Today")).toHaveLength(1);
  });

  /**
   * **M9.** The landing route is one router tab and two screens — `S04 Today`
   * under 1024, `S01 Dashboard` at and above it. The band read `Today` above
   * a Dashboard, because the nav label came straight from `useTabBarItems`,
   * which has no idea how wide the window is.
   */
  it("labels the landing route Today on the phone and Dashboard on the desk", async () => {
    resizeTo(390);
    render(
      <LedgerProvider controller={fakeController()}>
        <TabsShell slot={<Text>Route content</Text>} />
      </LedgerProvider>,
    );
    await settleLayout();

    expect(screen.getByText("Today")).toBeDefined();
    expect(screen.queryByText("Dashboard")).toBeNull();

    act(() => resizeTo(1440));

    expect(screen.getByText("Dashboard")).toBeDefined();
    expect(screen.queryByText("Today")).toBeNull();
  });

  /**
   * **M-B.** The hero read §7.0's display currency and rendered *nothing* when
   * the ledger held no subtotal in it — so a ledger entirely in EUR, with the
   * pivot left at the seeded PLN, showed a desk band with no figure at all.
   * That is indistinguishable from an empty ledger on the one screen whose
   * job is to state your position.
   *
   * It falls back to a currency the ledger does hold, states that currency's
   * code beside the figure, and captions what it is not.
   */
  it("falls back to a held currency when the display currency has no subtotal, and says so", async () => {
    await displayCurrency.set(PLN);
    resizeTo(1440);
    render(
      <LedgerProvider controller={fakeController({ accounts: EUR_ONLY })}>
        <TabsShell slot={<Text>Route content</Text>} />
      </LedgerProvider>,
    );
    await settleLayout();

    expect(screen.getByText("2 100.00"), "the held figure, not a vanished hero").toBeDefined();
    expect(screen.getByText("EUR"), "and the code it is actually in").toBeDefined();
    expect(screen.getByText("no balance in PLN"), "captioned as a fallback").toBeDefined();
  });

  /**
   * **M-1.** Which held currency it falls back to is a decision, and the
   * decision is the ledger's own order — `design-system/05` row 12's rule for
   * `CurrencyTotals`, which the hero now shares. Ranking by magnitude would
   * lead with the `EUR` card here, and that comparison cannot be made: the
   * band has no rate between `CHF` and `EUR`, or the display currency would
   * have been honoured in the first place.
   */
  it("falls back to the first held currency in ledger order, not the largest", async () => {
    await displayCurrency.set(PLN);
    resizeTo(1440);
    render(
      <LedgerProvider controller={fakeController({ accounts: TWO_CURRENCIES })}>
        <TabsShell slot={<Text>Route content</Text>} />
      </LedgerProvider>,
    );
    await settleLayout();

    expect(screen.getByText("CHF"), "the first subtotal the ledger folds").toBeDefined();
    expect(
      screen.queryByText("EUR"),
      "not the larger figure, which nothing can compare",
    ).toBeNull();
    expect(screen.getByText("no balance in PLN")).toBeDefined();
  });

  /** The preference is honoured whenever the ledger can honour it — no caption then. */
  it("leads with the display currency, uncaptioned, when the ledger holds it", async () => {
    await displayCurrency.set(EUR);
    resizeTo(1440);
    render(
      <LedgerProvider controller={fakeController({ accounts: EUR_ONLY })}>
        <TabsShell slot={<Text>Route content</Text>} />
      </LedgerProvider>,
    );
    await settleLayout();

    expect(screen.getByText("2 100.00")).toBeDefined();
    expect(screen.queryByText(/no balance in/)).toBeNull();
  });

  /** No accounts at all is the one case with nothing to fall back to. */
  it("renders no hero before the first account", async () => {
    await displayCurrency.set(PLN);
    resizeTo(1440);
    render(
      <LedgerProvider controller={fakeController()}>
        <TabsShell slot={<Text>Route content</Text>} />
      </LedgerProvider>,
    );
    await settleLayout();

    expect(screen.queryByText(/no balance in/)).toBeNull();
    expect(screen.queryByText("mine")).toBeNull();
  });
});

/** A slot that reports what the shell told it — the clearance, as a string. */
function ClearanceProbe() {
  return <Text>clearance: {useFloatingClearance()}</Text>;
}

/** A slot that opens the overlay the page's own insets must not reach. */
function SheetProbe() {
  return (
    <BottomSheet visible title="Filter" onDismiss={noop}>
      <Text>rows</Text>
    </BottomSheet>
  );
}

function noop() {}

/** A notched phone, as the device would report it. */
const NOTCHED = { top: 59, right: 0, bottom: 34, left: 0 };

/** The same, for the insets the slot is actually handed. */
function InsetProbe() {
  const insets = useSafeArea();
  return (
    <Text>
      insets: {insets.top}/{insets.right}/{insets.bottom}/{insets.left}
    </Text>
  );
}

/** `apps/mobile`'s own provider is the platform read; this stands in for it. */
function DeviceInsets({ insets, children }: { insets: typeof NOTCHED; children: React.ReactNode }) {
  return (
    <WindowInsetsProvider insets={insets}>
      <SafeAreaProvider insets={insets}>{children}</SafeAreaProvider>
    </WindowInsetsProvider>
  );
}

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

      const input = screen.getByRole("combobox");
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

    const input = screen.getByRole("combobox");
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
