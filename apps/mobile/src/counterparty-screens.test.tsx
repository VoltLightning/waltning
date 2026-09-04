/**
 * @vitest-environment jsdom
 *
 * S12, S13 and S15, rendered against an in-memory ledger — the shape
 * `account-editor-screen.test.tsx` and `screens.test.tsx` already use, in
 * one file because all three screens share the same counterparty fixture.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  createPhoneLedger,
  type PhoneAccount,
  type PhoneCounterparty,
  type PhoneCounterpartyBalance,
  type PhoneLedgerController,
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

// L2 — spies on `emitClientDiagnostic` while keeping the module's other
// exports (`clientFailure`) real, so `debt-screen.tsx`'s own totals-failure
// effect can be counted rather than only observed through its render output.
const emitClientDiagnosticSpy = vi.fn();
vi.mock("@waltning/client/diagnostics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@waltning/client/diagnostics")>();
  return {
    ...actual,
    get emitClientDiagnostic() {
      return emitClientDiagnosticSpy;
    },
  };
});

import CounterpartyDetail from "./counterparty-detail-screen";
import CounterpartyEditor from "./counterparty-editor-screen";
import Debt from "./debt-screen";

const PLN = currencyCode("PLN");
const EUR = currencyCode("EUR");
const TODAY = accountingDate("2026-09-03");
const NINA = id<"counterparties">("11111111-1111-4111-8111-111111111111");
const MAREK = id<"counterparties">("22222222-2222-4222-8222-222222222222");
const ACME = id<"counterparties">("44444444-4444-4444-8444-444444444444");

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
    listCurrencySettings: vi.fn(() => []),
    updateCurrency: vi.fn(),
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

/**
 * H1 — `snapshot.revision` is `0` only until a real `PhoneLedgerController`'s
 * first `refresh()` has completed, and every real one bumps it past `0`
 * synchronously in its own constructor. This wraps a real controller and
 * overrides just the one field a screen's loading branch reads, so a test
 * can render the still-loading state a real controller cannot hold past
 * construction.
 */
function unhydratedController(port: PhoneLedgerPort): PhoneLedgerController {
  const real = controllerOf(port);
  // `useSyncExternalStore` requires a referentially stable `getSnapshot`
  // result across calls that have not actually changed — computed once here,
  // never inline in the returned closure, or React reports an infinite loop.
  const snapshot = { ...real.getSnapshot(), revision: 0 };
  return { ...real, getSnapshot: () => snapshot };
}

beforeEach(() => {
  router.push.mockClear();
  router.back.mockClear();
  router.dismissTo.mockClear();
  useLocalSearchParams.mockReturnValue({});
  emitClientDiagnosticSpy.mockClear();
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

  /**
   * M2 — `money.directionTotals` throws on two rows naming the same currency
   * at two different `decimals` (an invariant violation), and that throw
   * runs inside a `useMemo` above every guard on this screen. It must render
   * as a recoverable error, never crash the screen.
   */
  it("renders a recoverable error, not a crash, when direction totals disagree on decimals", () => {
    const marekRow: PhoneCounterpartyBalance = {
      ...NINA_ROW,
      counterpartyId: MAREK,
      name: "Marek",
      decimals: 3,
      balance: toMoney("-120.00000000"),
    };
    const controller = controllerOf(
      basePort({
        listCounterparties: () => [NINA_COUNTERPARTY, { ...NINA_COUNTERPARTY, id: MAREK }],
        listCounterpartyBalances: () => [NINA_ROW, marekRow],
      }),
    );
    render(
      <LedgerProvider controller={controller}>
        <Debt />
      </LedgerProvider>,
    );
    expect(screen.getByText("Couldn't load your counterparties")).toBeDefined();
    // M — the executor's own English (`/disagree on decimals/`) is
    // diagnostics-only now; a person sees the fixed, translated `why`.
    expect(screen.getByText("Something went wrong totalling what's owed.")).toBeDefined();
  });

  /**
   * L2 — the diagnostic used to sit inside the `useMemo` that computes
   * `directionTotalsResult`, so it re-fired every time that memo recomputed
   * for the *same* still-failing reason (here: a refresh triggered
   * elsewhere, e.g. by another screen, bumping `snapshot.revision` — H1 —
   * without the underlying decimals conflict changing at all). Moved to an
   * effect keyed on the failure's own message, it must emit once for the
   * one distinct failure, not once per render that still happens to fail.
   */
  it("emits the totals-failure diagnostic once per distinct failure, not once per render (L2)", () => {
    const marekRow: PhoneCounterpartyBalance = {
      ...NINA_ROW,
      counterpartyId: MAREK,
      name: "Marek",
      decimals: 3,
      balance: toMoney("-120.00000000"),
    };
    const controller = controllerOf(
      basePort({
        listCounterparties: () => [NINA_COUNTERPARTY, { ...NINA_COUNTERPARTY, id: MAREK }],
        listCounterpartyBalances: () => [NINA_ROW, marekRow],
      }),
    );
    render(
      <LedgerProvider controller={controller}>
        <Debt />
      </LedgerProvider>,
    );
    expect(screen.getByText("Couldn't load your counterparties")).toBeDefined();

    const totalsCalls = () =>
      emitClientDiagnosticSpy.mock.calls.filter(
        ([, event]) => (event as { update?: string }).update === "counterparty_direction_totals",
      );
    expect(totalsCalls()).toHaveLength(1);

    // A second refresh, still failing the same way — never a second emission
    // for a reason already reported.
    act(() => controller.refresh());
    expect(screen.getByText("Couldn't load your counterparties")).toBeDefined();
    expect(totalsCalls()).toHaveLength(1);
  });

  /**
   * L1 — one list, sorted by name, kind never a sort key. `Zeta Corp` sorts
   * alphabetically after both persons — a kind-first sort (the prior "companies
   * by age desc, then by name" comment) would put it first regardless, so this
   * name deliberately does not share the prior bug's blind spot the way an
   * `Acme`/`Marek`/`Nina` fixture would (alphabetically-first company, same
   * result under either rule).
   */
  it("sorts every row by name alone, persons and companies in one list", () => {
    const marekRow: PhoneCounterpartyBalance = {
      ...NINA_ROW,
      counterpartyId: MAREK,
      name: "Marek",
      balance: toMoney("-120.00000000"),
    };
    const zetaRow: PhoneCounterpartyBalance = {
      ...NINA_ROW,
      counterpartyId: ACME,
      name: "Zeta Corp",
      kind: "company",
      balance: toMoney("4200.00000000"),
      ageDays: 62,
      bucket: "61-90",
    };
    const controller = controllerOf(
      basePort({
        listCounterparties: () => [
          NINA_COUNTERPARTY,
          { ...NINA_COUNTERPARTY, id: MAREK, name: "Marek" },
          { ...NINA_COUNTERPARTY, id: ACME, name: "Zeta Corp", kind: "company" },
        ],
        listCounterpartyBalances: () => [NINA_ROW, marekRow, zetaRow],
      }),
    );
    const { container } = render(
      <LedgerProvider controller={controller}>
        <Debt />
      </LedgerProvider>,
    );
    const text = container.textContent ?? "";
    const marekIndex = text.indexOf("Marek");
    const ninaIndex = text.indexOf("Nina");
    const zetaIndex = text.indexOf("Zeta");
    expect(marekIndex).toBeGreaterThanOrEqual(0);
    expect(ninaIndex).toBeGreaterThan(marekIndex);
    expect(zetaIndex).toBeGreaterThan(ninaIndex);
  });

  /**
   * H — nothing enforces the bootstrap that would make this unreachable: a
   * *non-empty* `currencies` list with no `isPivot` row is
   * `architecture/09`'s bootstrap guarantee broken. The totals above read
   * straight off `balances`, not `pivot`, so without this guard they render
   * over an empty row list — "They owe · PLN 840,00" above "All settled".
   * Must surface as a recoverable error instead, and never fall through to
   * either empty state.
   */
  it("shows a recoverable error, never the empty state, when currencies hold no pivot", () => {
    const controller = controllerOf(
      basePort({
        listCurrencies: () => [
          {
            code: PLN,
            name: "Polish Złoty",
            symbol: "zł",
            decimals: 2,
            capturable: true,
            isPivot: false,
          },
        ],
        listCounterparties: () => [NINA_COUNTERPARTY],
        listCounterpartyBalances: () => [NINA_ROW],
      }),
    );
    render(
      <LedgerProvider controller={controller}>
        <Debt />
      </LedgerProvider>,
    );
    expect(screen.getByText("Couldn't read your currencies")).toBeDefined();
    expect(screen.queryByText("All settled")).toBeNull();
    expect(screen.queryByText("No one yet")).toBeNull();
  });

  /**
   * M1 — `snapshot.revision === 0` (the first `refresh()` still in flight)
   * is not the same state as a completed refresh that found no pivot: the
   * old guard read `currencies.length` for this and lied about why, showing
   * "Couldn't read your currencies" while the replica simply had not loaded
   * yet. One wrapping `accessibilityLabel` covers every skeleton row (H1).
   */
  it("shows a loading skeleton, never the no-pivot error, before the first refresh has completed", () => {
    const controller = unhydratedController(basePort());
    render(
      <LedgerProvider controller={controller}>
        <Debt />
      </LedgerProvider>,
    );
    expect(screen.getByRole("progressbar", { name: "Loading debts" })).toBeDefined();
    expect(screen.queryByText("Couldn't read your currencies")).toBeNull();
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

  /**
   * H1 — `balances` used to be memoised on `[ledger, today]` alone, both
   * stable across a session, so a `refresh()` triggered elsewhere (here: a
   * settle, called straight through the controller the way S13's own sheet
   * would) never invalidated it. Nina must drop off the list the moment her
   * one balance settles, not go on showing under a toast that never
   * appeared here — the list itself is the evidence the refresh landed.
   */
  it("drops a counterparty from the list once a settle elsewhere refreshes the ledger", () => {
    let settled = false;
    const controller = controllerOf(
      basePort({
        listCounterparties: () => [NINA_COUNTERPARTY],
        listCounterpartyBalances: () => (settled ? [] : [NINA_ROW]),
        listAccounts: () => [CASH_PLN],
        settleDebt: () => {
          settled = true;
          return { residual: toMoney("0"), overSettled: false };
        },
      }),
    );
    render(
      <LedgerProvider controller={controller}>
        <Debt />
      </LedgerProvider>,
    );
    expect(screen.getByText("Nina")).toBeDefined();

    act(() => {
      controller.settleDebt({
        counterpartyId: NINA,
        accountId: CASH_PLN.id,
        date: TODAY,
        amount: "840",
        currency: PLN,
        dischargesCurrency: PLN,
        dischargesAmount: "840",
        note: "",
        categoryId: null,
      });
    });

    expect(screen.queryByText("Nina")).toBeNull();
    expect(screen.getByText("All settled")).toBeDefined();
  });
});

describe("CounterpartyDetail (S13)", () => {
  beforeEach(() => useLocalSearchParams.mockReturnValue({ id: NINA }));

  /**
   * H — a *non-empty* `currencies` list with no `isPivot` row is not a state
   * this screen can render past: `architecture/09`'s bootstrap guarantee
   * broken must surface as a recoverable error rather than the blank screen
   * `!figures` used to fall through to.
   */
  it("shows a recoverable error, never a blank screen, when currencies hold no pivot", () => {
    const controller = controllerOf(
      basePort({
        listCurrencies: () => [
          {
            code: PLN,
            name: "Polish Złoty",
            symbol: "zł",
            decimals: 2,
            capturable: true,
            isPivot: false,
          },
        ],
        listCounterparties: () => [NINA_COUNTERPARTY],
        listCounterpartyBalances: () => [NINA_ROW],
      }),
    );
    render(
      <LedgerProvider controller={controller}>
        <CounterpartyDetail />
      </LedgerProvider>,
    );
    expect(screen.getByText("Couldn't read your currencies")).toBeDefined();
    expect(screen.queryByText("Nina")).toBeNull();
  });

  /**
   * M1 — an *empty* `currencies` list after a completed refresh
   * (`snapshot.revision > 0`) is the same broken bootstrap guarantee as a
   * non-empty one missing its pivot, not a loading state: `revision` is the
   * signal now, not `currencies.length`, so this case — a replica whose
   * first refresh landed holding no currencies at all — no longer falls
   * through to the loading skeleton.
   */
  it("shows the no-pivot error, never a loading skeleton, once a completed refresh finds no currencies", () => {
    const controller = controllerOf(basePort({ listCurrencies: () => [] }));
    render(
      <LedgerProvider controller={controller}>
        <CounterpartyDetail />
      </LedgerProvider>,
    );
    expect(screen.getByText("Couldn't read your currencies")).toBeDefined();
    expect(screen.queryByRole("progressbar", { name: "Loading counterparty ledger" })).toBeNull();
  });

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

  /**
   * M — a dust-only counterparty (settled at its own currency's scale, M1)
   * has nothing `handleOpenSettle` can default to: the old unfiltered
   * `group?.balances[0]` armed a hidden currency behind an empty Discharges
   * section. Defaulting from the open subset lands on `null` instead, and
   * the sheet states plainly that there is nothing to settle.
   */
  it("shows nothing to settle and disables Settle when the only balance is dust", () => {
    const dustRow: PhoneCounterpartyBalance = { ...NINA_ROW, balance: toMoney("0.004") };
    const controller = controllerOf(
      basePort({
        listCounterparties: () => [NINA_COUNTERPARTY],
        listCounterpartyBalances: () => [dustRow],
        listAccounts: () => [CASH_PLN],
      }),
    );
    render(
      <LedgerProvider controller={controller}>
        <CounterpartyDetail />
      </LedgerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Settle" }));

    const sheet = within(screen.getByLabelText("Settling with Nina"));
    expect(sheet.getByText("Nothing to settle.")).toBeDefined();
    expect(sheet.getByRole("button", { name: "Settle" })).toHaveProperty("disabled", true);
  });

  /**
   * M — the default reads the same *open* subset the sheet lists (M1),
   * never raw array order: two dust rows sort first here, and the one real
   * balance (GBP) is still what gets preselected and settled.
   */
  it("preselects the one open balance even when settled rows are listed first", () => {
    const settleDebt = vi.fn<PhoneLedgerPort["settleDebt"]>(() => ({
      residual: toMoney("0"),
      overSettled: false,
    }));
    const settledPln: PhoneCounterpartyBalance = { ...NINA_ROW, balance: toMoney("0.004") };
    const settledEur: PhoneCounterpartyBalance = {
      ...NINA_ROW,
      currency: EUR,
      balance: toMoney("0.004"),
    };
    const openGbp: PhoneCounterpartyBalance = {
      ...NINA_ROW,
      currency: currencyCode("GBP"),
      balance: toMoney("-45.00000000"),
    };
    const controller = controllerOf(
      basePort({
        listCounterparties: () => [NINA_COUNTERPARTY],
        listCounterpartyBalances: () => [settledPln, settledEur, openGbp],
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
    // One open balance among three — a plain fact, never a radio group —
    // and it is GBP even though the settled PLN row sorts first.
    expect(sheet.queryByRole("radiogroup")).toBeNull();
    expect(sheet.getByText(/GBP · 45.00 · you owe them/)).toBeDefined();

    // GBP is `youOwe` (negative) — the account label follows the balance's
    // own sign (S14 §3), "From" rather than "Into".
    fireEvent.click(sheet.getByRole("button", { name: "From" }));
    fireEvent.click(screen.getByRole("radio", { name: "Cash · PLN" }));
    fireEvent.click(sheet.getByRole("button", { name: "Amount: 0" }));
    fireEvent.click(sheet.getByRole("button", { name: "5" }));
    fireEvent.click(sheet.getByRole("button", { name: "0" }));
    fireEvent.click(sheet.getByRole("button", { name: "Discharges: 0" }));
    fireEvent.click(sheet.getByRole("button", { name: "5" }));
    fireEvent.click(sheet.getByRole("button", { name: "0" }));
    fireEvent.click(sheet.getByRole("button", { name: "Settle" }));

    expect(settleDebt).toHaveBeenCalledOnce();
    expect(settleDebt.mock.calls[0]?.[0]).toMatchObject({ discharges: { currency: "GBP" } });
  });

  /**
   * C1 — the same guard `transfer-screen.test.tsx` covers after #112: the
   * picker shows the uncapturable account muted (S05, by design), and the
   * sheet itself declines it — caption under the chip, Settle disabled.
   */
  it("shows the needsRate caption and disables Settle for an uncapturable account (C1)", () => {
    const controller = controllerOf(
      basePort({
        listCounterparties: () => [NINA_COUNTERPARTY],
        listCounterpartyBalances: () => [NINA_ROW],
        listAccounts: () => [CASH_PLN],
        listCurrencies: () => [
          {
            code: PLN,
            name: "Polish Złoty",
            symbol: "zł",
            decimals: 2,
            capturable: false,
            isPivot: true,
          },
        ],
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
    fireEvent.click(screen.getByRole("radio", { name: "Cash · PLN" }));

    expect(
      sheet.getByText("PLN needs an exchange rate before a transaction can be recorded in it."),
    ).toBeDefined();
    expect(sheet.getByRole("button", { name: "Settle" })).toHaveProperty("disabled", true);
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
    // `AccountPicker` (`accounts/`) is a sibling domain — the screen composes
    // it, so its tile lives outside the sheet's own labelled region, the same
    // way `transfer-screen.test.tsx`'s own `pickFrom` drives it.
    fireEvent.click(sheet.getByRole("button", { name: "Into" }));
    fireEvent.click(screen.getByRole("radio", { name: "Cash · PLN" }));

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

  /**
   * H1 — `balances` used to be memoised on `[ledger, today]` alone, both
   * stable across the sheet's own lifetime, so `settleDebt` → `refresh()`
   * never invalidated it: the `BalanceLedger` behind the sheet kept showing
   * the pre-settle 840,00 row under the very toast confirming it was gone.
   * Settling the whole balance here, against a mutable port that reflects
   * the write, must leave the card reading "All settled", not the stale row.
   */
  it("shows the fresh balance behind the toast — settling in full clears the stale row (H1)", () => {
    let settled = false;
    const settleDebt = vi.fn<PhoneLedgerPort["settleDebt"]>(() => {
      settled = true;
      return { residual: toMoney("0"), overSettled: false };
    });
    const controller = controllerOf(
      basePort({
        listCounterparties: () => [NINA_COUNTERPARTY],
        listCounterpartyBalances: () => (settled ? [] : [NINA_ROW]),
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
    fireEvent.click(screen.getByRole("radio", { name: "Cash · PLN" }));

    fireEvent.click(sheet.getByRole("button", { name: "Amount: 0" }));
    fireEvent.click(sheet.getByRole("button", { name: "8" }));
    fireEvent.click(sheet.getByRole("button", { name: "4" }));
    fireEvent.click(sheet.getByRole("button", { name: "0" }));

    fireEvent.click(sheet.getByRole("button", { name: "Discharges: 0" }));
    fireEvent.click(sheet.getByRole("button", { name: "8" }));
    fireEvent.click(sheet.getByRole("button", { name: "4" }));
    fireEvent.click(sheet.getByRole("button", { name: "0" }));

    fireEvent.click(sheet.getByRole("button", { name: "Settle" }));

    expect(settleDebt).toHaveBeenCalledOnce();
    expect(screen.getByText("Settled. 0.00 PLN settled.")).toBeDefined();
    // The card behind the (now dismissed) sheet re-reads the ledger — the
    // stale 840,00 row is gone, replaced by `BalanceLedger`'s own "All
    // settled" (its own body text, distinct from the history section's).
    expect(screen.getByText("Nothing open with them right now.")).toBeDefined();
    expect(screen.queryByText("840.00", { exact: false })).toBeNull();
  });

  /**
   * M3 — the same H3 fix `resolveCounterpartyFigures` already carries:
   * `settleDischargesDecimals` reads from `snapshot.currencies` first, never
   * a possibly-stale balance row, when the two disagree.
   */
  it("reads discharge decimals from the currency list, not the balance row, when they disagree (M3)", () => {
    const settleDebt = vi.fn<PhoneLedgerPort["settleDebt"]>(() => ({
      residual: toMoney("790"),
      overSettled: false,
    }));
    const controller = controllerOf(
      basePort({
        listCurrencies: () => [
          {
            code: PLN,
            name: "Polish Złoty",
            symbol: "zł",
            decimals: 0,
            capturable: true,
            isPivot: true,
          },
        ],
        listCounterparties: () => [NINA_COUNTERPARTY],
        // `NINA_ROW` itself carries `decimals: 2` — deliberately disagreeing
        // with the currency list above, to prove which one wins.
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
    fireEvent.click(screen.getByRole("radio", { name: "Cash · PLN" }));

    fireEvent.click(sheet.getByRole("button", { name: "Amount: 0" }));
    fireEvent.click(sheet.getByRole("button", { name: "5" }));
    fireEvent.click(sheet.getByRole("button", { name: "0" }));

    fireEvent.click(sheet.getByRole("button", { name: "Discharges: 0" }));
    fireEvent.click(sheet.getByRole("button", { name: "5" }));
    fireEvent.click(sheet.getByRole("button", { name: "0" }));

    fireEvent.click(sheet.getByRole("button", { name: "Settle" }));

    // 0dp, from `snapshot.currencies` — "790", never the balance row's own
    // stale "790.00".
    expect(screen.getByText("Settled. 790 PLN they owe you.")).toBeDefined();
  });

  it("shows the all-settled empty state, keeping the card, when nothing is open", () => {
    const controller = controllerOf(basePort({ listCounterparties: () => [NINA_COUNTERPARTY] }));
    render(
      <LedgerProvider controller={controller}>
        <CounterpartyDetail />
      </LedgerProvider>,
    );
    expect(screen.getByText("Nina")).toBeDefined();
    // L3 — two distinct "All settled" states legitimately coexist here: the
    // ledger card itself (`BalanceLedger`, no rows) and the history section
    // below it (no `debt` rows to list) — both real, both empty for their
    // own reason.
    expect(screen.getAllByText("All settled")).toHaveLength(2);
    // L3 — now genuinely two keys (`ledgerSettled` vs `historySettled`),
    // never one screen's copy silently doubling as the other's: each still
    // carries its own body text, which a test (or a future copy edit) can
    // tell apart even though the two titles read the same.
    expect(screen.getByText("Nothing open with them right now.")).toBeDefined();
    expect(screen.getByText("No debt rows yet: Nina.")).toBeDefined();
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
