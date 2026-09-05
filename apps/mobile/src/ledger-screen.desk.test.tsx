/**
 * @vitest-environment jsdom
 *
 * `Ledger` at desk width — S10 §3/§7 web. `ledger-screen.test.tsx` covers
 * the phone body (the default jsdom width, well under `breakpoint.desk`);
 * this file resizes to prove the desk branch, the same `resizeTo` real-resize
 * technique `use-breakpoint.test.tsx` uses rather than mocking the hook.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  createPhoneLedger,
  type PhoneLedgerPort,
  type PhoneSearchTransaction,
} from "@waltning/client/ledger/create-phone-ledger";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { basePort } from "@waltning/client/ledger/test-port";
import { id } from "@waltning/core/id";
import { currencyCode } from "@waltning/core/money";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), back: vi.fn(), dismissTo: vi.fn() };
const useLocalSearchParams = vi.fn(() => ({}) as { account?: string });

vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
  useLocalSearchParams: () => useLocalSearchParams(),
}));

import Ledger from "./ledger-screen";

const PLN = currencyCode("PLN");
const ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");
const EATING_OUT = id<"categories">("66666666-6666-4666-8666-666666666666");
const TODAY = deviceRuntime().capture().date;

function expenseRow(overrides: Partial<PhoneSearchTransaction> = {}): PhoneSearchTransaction {
  return {
    id: id<"transactions">("22222222-2222-4222-8222-222222222222"),
    date: TODAY,
    type: "expense",
    payee: "Corner Bakery",
    note: "",
    categoryName: "Eating out",
    accountId: ACCOUNT,
    accountName: "Bank A · PLN",
    toAccountId: null,
    toAccountName: null,
    amount: "-48.90000000" as never,
    currency: PLN,
    decimals: 2,
    toAmount: null,
    toCurrency: null,
    toDecimals: null,
    isBusiness: false,
    isCapital: false,
    // §14.4b — an unrecognised payee, which is what "Corner Bakery" is
    // against the bundled catalogue. `RECOGNISED_ROW` below is the other
    // half.
    brandKey: null,
    counterpartyRole: null,
    ...overrides,
  };
}

/**
 * A payee the bundled catalogue does recognise (§14.4b, S10 §4) — so the
 * desk table's identity column can be checked against the mark the offline
 * matcher resolved rather than only against the monogram fallback.
 */
function recognisedRow(): PhoneSearchTransaction {
  return expenseRow({
    id: id<"transactions">("44444444-4444-4444-8444-444444444444"),
    payee: "ORLEN",
    brandKey: "orlen",
  });
}

/**
 * The port's own `searchTransactions`, cursor included — a one-argument
 * stand-in was enough while nothing paged, and C1's drain pages.
 */
type FakeSearch = PhoneLedgerPort["searchTransactions"];

const ARCHIVED_SHARED = id<"accounts">("33333333-3333-4333-8333-333333333333");

const LIVE_ACCOUNT = {
  id: ACCOUNT,
  name: "Bank A · PLN",
  kind: "checking",
  currency: PLN,
  ownership: "own",
  isBusiness: false,
  archived: false,
  memo: "",
};

/** H4's own fixture — archived, and shared. Its transactions are still live. */
const ARCHIVED_SHARED_ACCOUNT = {
  id: ARCHIVED_SHARED,
  name: "Bank B · EUR",
  kind: "checking",
  currency: PLN,
  ownership: "shared",
  isBusiness: false,
  archived: true,
  memo: "",
};

function fakeController(search: FakeSearch, overrides: Partial<PhoneLedgerPort> = {}) {
  const port: PhoneLedgerPort = basePort({
    // The real port honours `includeArchived`; the fake must too, or H4's
    // whole shape (a row whose account is only in the archived list)
    // cannot be set up at all.
    listAccounts: (options) =>
      (options?.includeArchived === true
        ? [LIVE_ACCOUNT, ARCHIVED_SHARED_ACCOUNT]
        : [LIVE_ACCOUNT]) as never,
    listCategories: () => [{ id: EATING_OUT, name: "Eating out", kind: "expense" } as never],
    listCategoryTree: () => [
      {
        id: EATING_OUT,
        parentId: null,
        name: "Eating out",
        kind: "expense",
        isLeaf: true,
        sort: 0,
      },
    ],
    searchTransactions: search,
    ...overrides,
  });
  return createPhoneLedger(port, {
    capture: () => ({
      date: TODAY,
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date(),
    }),
    id: () => id("55555555-5555-4555-8555-555555555555"),
  });
}

function withLedger(element: ReactElement, controller: ReturnType<typeof fakeController>) {
  return render(<LedgerProvider controller={controller}>{element}</LedgerProvider>);
}

const COUNTERPARTY = id<"counterparties">("44444444-4444-4444-8444-444444444444");

/**
 * Enough of a snapshot for §4's last two controls to have something to
 * offer — a `Select` with only its "every one of them" option cannot be
 * used to activate a dimension.
 */
const EVERY_DIMENSION_SNAPSHOT = {
  listCurrencies: () =>
    [{ code: PLN, name: "Polish Złoty", symbol: "zł", decimals: 2, isPivot: true }] as never,
  listCounterparties: () => [{ id: COUNTERPARTY, name: "Nina Placeholder" }] as never,
};

/**
 * Turn on every one of §4's seven dimensions. Two arrive seeded — the
 * account from the route param and the month from the desk branch's initial
 * state — and the other five are switched on through the rail, the way a
 * reader would.
 */
function activateEveryFilterDimension() {
  // `text` reaches the query 250 ms after the keystroke, so the clock has to
  // move for it to count as active at all (`use-debounced-value.ts`).
  vi.useFakeTimers();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Corner" } });
  act(() => {
    vi.advanceTimersByTime(500);
  });
  vi.useRealTimers();

  fireEvent.click(screen.getByRole("tab", { name: "Business" }));

  fireEvent.click(screen.getAllByRole("button", { name: "Category" })[0] as HTMLElement);
  fireEvent.click(screen.getByRole("checkbox", { name: "Eating out" }));

  fireEvent.click(screen.getAllByRole("button", { name: /Currency/ })[0] as HTMLElement);
  fireEvent.click(screen.getByRole("radio", { name: "PLN" }));

  fireEvent.click(screen.getAllByRole("button", { name: /Person or company/ })[0] as HTMLElement);
  fireEvent.click(screen.getByRole("radio", { name: "Nina Placeholder" }));
}

/**
 * Every piece of text the document held at any point, not only at the end —
 * a `MutationObserver` rather than a component, because a component can only
 * see the commits it is itself re-rendered in, and a sibling of `<Ledger />`
 * is re-rendered in none of them.
 *
 * `takeRecords()` is what makes it synchronous: the callback would arrive in
 * a microtask after the test's own assertions, and the queue can be drained
 * by hand instead. What is read is the *records* — an added node, a changed
 * text node — never the live DOM, which by then holds only the final state.
 */
function textSeenWhile(render: () => void): readonly string[] {
  const observer = new MutationObserver(() => {});
  observer.observe(document.body, {
    childList: true,
    characterData: true,
    // L (round 4) — **the whole point of the helper.** A `characterData`
    // record names the text node that changed, not the text it changed
    // *from*, so reading `record.target.textContent` at drain time reads
    // the node's *final* value: every intermediate this exists to catch had
    // already been overwritten by the time it was read, and "the caption is
    // never briefly wrong" was an assertion that could not fail. `oldValue`
    // is the value the observer captured at the moment of the change, and
    // it is only recorded when this option asks for it.
    characterDataOldValue: true,
    subtree: true,
  });
  render();
  const seen: string[] = [];
  for (const record of observer.takeRecords()) {
    if (record.type === "characterData") seen.push(record.oldValue ?? "");
    // `NodeList` is indexed rather than iterable under this tsconfig's lib.
    record.addedNodes.forEach((node) => {
      seen.push(node.textContent ?? "");
    });
  }
  observer.disconnect();
  return seen;
}

/** `use-breakpoint.test.tsx`'s own real-resize technique. */
function resizeTo(width: number) {
  Object.defineProperty(document.documentElement, "clientWidth", {
    value: width,
    configurable: true,
  });
  window.dispatchEvent(new Event("resize"));
}

beforeEach(() => {
  router.push.mockClear();
  useLocalSearchParams.mockReturnValue({});
  resizeTo(1440);
});

afterEach(() => {
  resizeTo(390);
});

describe("Ledger at desk width", () => {
  it("renders the table's column headers instead of the phone list", () => {
    const rows = [expenseRow()];
    const controller = fakeController(() => ({
      rows,
      nextCursor: undefined,
      total: { count: 1, currencies: [] },
    }));
    withLedger(<Ledger />, controller);

    expect(screen.getByRole("button", { name: "Payee" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Amount" })).toBeDefined();
    expect(screen.getByText("Corner Bakery")).toBeDefined();
  });

  /**
   * §14.4b, S10 §4 — the desk table draws the same `BrandIcon` the phone
   * row does, from the key the port already carries. Read by the mark,
   * because the badge is hidden from the accessibility tree: the
   * catalogue's `"O"` for a payee it knows, `monogramFor`'s `"C"` for one
   * it does not.
   */
  it("draws each row's brand mark in the identity column", () => {
    const rows = [recognisedRow(), expenseRow()];
    const controller = fakeController(() => ({
      rows,
      nextCursor: undefined,
      total: { count: 2, currencies: [] },
    }));
    withLedger(<Ledger />, controller);

    expect(screen.getByText("ORLEN")).toBeDefined();
    expect(screen.getByText("O")).toBeDefined();
    expect(screen.getByText("C")).toBeDefined();
  });

  it("shows the filter rail — search, period stepper, accounts, categories, scope", () => {
    const controller = fakeController(() => ({
      rows: [],
      nextCursor: undefined,
      total: { count: 0, currencies: [] },
    }));
    withLedger(<Ledger />, controller);

    expect(screen.getByRole("searchbox")).toBeDefined();
    expect(screen.getByLabelText("Previous period")).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Account" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Category" }).length).toBeGreaterThan(0);
  });

  /**
   * §4 names six filter dimensions; the rail shipped with four. M (round 1):
   * currency, counterparty and an arbitrary date range join them, and the
   * rail scrolls in its own right so 1024×640 can reach the bottom of the
   * stack.
   */
  it("the rail carries every §4 dimension, inside a scroller of its own", () => {
    const controller = fakeController(() => ({
      rows: [],
      nextCursor: undefined,
      total: { count: 0, currencies: [] },
    }));
    withLedger(<Ledger />, controller);

    // `Select`'s trigger names itself "<field>: <value>" once it has one,
    // and both of these open on their own "every one of them" option.
    expect(screen.getAllByRole("button", { name: /Currency/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Person or company/ }).length).toBeGreaterThan(0);
    // §4's arbitrary range — reachable at desk width only through the rail,
    // since the desk branch never opens the phone's bottom sheet.
    expect(screen.getByLabelText("From")).toBeDefined();
    expect(screen.getByLabelText("To")).toBeDefined();

    // `react-native-web` renders a `ScrollView` as a scrolling div; the
    // assertion is that the rail *is* one, not that jsdom computed a
    // particular `overflow` for it.
    const rail = screen.getByTestId("ledger-desk-rail");
    expect(rail.className).toMatch(/r-overflow/);
  });

  it("a filter arriving from another screen is shown as a chip in the rail, not applied silently", () => {
    useLocalSearchParams.mockReturnValue({ account: ACCOUNT });
    const controller = fakeController((filter) => {
      const filtered = (filter.accountIds?.length ?? 0) > 0;
      return {
        rows: [],
        nextCursor: undefined,
        total: { count: filtered ? 0 : 5, currencies: [] },
      };
    });
    withLedger(<Ledger />, controller);

    // The rail's own `MultiSelect` shows the account as its selected token —
    // the "shown, not silently applied" treatment at desk width (S10 §3 web).
    expect(screen.getByText("Bank A · PLN")).toBeDefined();
    expect(screen.getByRole("button", { name: "Clear all" })).toBeDefined();
  });

  it("sorting by a column header reorders the rows", () => {
    const rows = [
      expenseRow({ id: id("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), payee: "Zed", date: TODAY }),
      expenseRow({ id: id("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"), payee: "Abe", date: TODAY }),
    ];
    const controller = fakeController(() => ({
      rows,
      nextCursor: undefined,
      total: { count: 2, currencies: [] },
    }));
    withLedger(<Ledger />, controller);

    fireEvent.click(screen.getByRole("button", { name: "Payee" }));
    const cells = screen.getAllByText(/^(Zed|Abe)$/);
    expect(cells.map((cell) => cell.textContent)).toEqual(["Abe", "Zed"]);
  });

  it("a row click pushes the transaction detail route", () => {
    const rows = [expenseRow()];
    const controller = fakeController(() => ({
      rows,
      nextCursor: undefined,
      total: { count: 1, currencies: [] },
    }));
    withLedger(<Ledger />, controller);

    fireEvent.click(screen.getByText("Corner Bakery"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/transaction/[id]",
      params: { id: rows[0]?.id },
    });
  });

  it("shift-click selects a range, and a batch categorise lands as one categorize_batch call", () => {
    const rows = [
      expenseRow({ id: id("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), payee: "Row A" }),
      expenseRow({ id: id("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"), payee: "Row B" }),
      expenseRow({ id: id("cccccccc-cccc-4ccc-8ccc-cccccccccccc"), payee: "Row C" }),
    ];
    const categorizeBatch = vi.fn<PhoneLedgerPort["categorizeBatch"]>(() => undefined);
    const controller = fakeController(
      () => ({ rows, nextCursor: undefined, total: { count: rows.length, currencies: [] } }),
      { categorizeBatch },
    );
    withLedger(<Ledger />, controller);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Row A" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Row C" }), { shiftKey: true });

    expect(screen.getByText("3 selected")).toBeDefined();

    fireEvent.click(screen.getByText("Categorise"));
    fireEvent.click(screen.getByRole("radio", { name: /Eating out/ }));

    expect(screen.getByText("Categorise 3 transactions as Eating out?")).toBeDefined();

    fireEvent.click(screen.getByText("Approve"));

    expect(categorizeBatch).toHaveBeenCalledTimes(1);
    const [input] = categorizeBatch.mock.calls[0] ?? [];
    expect(new Set(input?.transactionIds)).toEqual(new Set(rows.map((row) => row.id)));
    expect(input?.categoryId).toBeDefined();
    expect(screen.getByText("3 transactions recategorised")).toBeDefined();
    // The selection cleared on approve — the bar renders nothing at count 0.
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  /* ── C1 · the table loads the whole filtered period ─────────────────── */

  /**
   * A paged fake, fifty rows at a time, exactly as `search_transactions`
   * pages. The largest amount lives in the *last* generated row: a sort that
   * only ever saw a first page — the C1 bug — could not promote it, and the
   * `FlatList` renders only its first fifty, so finding that payee on screen
   * at all is the assertion.
   */
  function thousandRowPort(count: number) {
    const rows = Array.from({ length: count }, (_, i) => {
      const last = i === count - 1;
      const cents = String((i * 37) % 9500).padStart(3, "0");
      return expenseRow({
        id: id<"transactions">(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`),
        payee: last ? "Peak payee" : `Row ${i}`,
        amount: (last
          ? "-999999.00000000"
          : `-${cents.slice(0, -2)}.${cents.slice(-2)}0000`) as never,
      });
    });
    const searchTransactions = vi.fn<FakeSearch>((_filter, cursor) => {
      const start = cursor === undefined ? 0 : rows.findIndex((row) => row.id === cursor.id) + 1;
      const page = rows.slice(start, start + 50);
      const last = page[page.length - 1];
      return {
        rows: page,
        nextCursor:
          start + page.length < rows.length && last !== undefined
            ? { date: last.date, id: last.id }
            : undefined,
        total: { count: rows.length, currencies: [] },
      };
    });
    return { rows, searchTransactions };
  }

  it("loads every page of the filtered period, and sorts by amount over all 1,000", () => {
    const { searchTransactions } = thousandRowPort(1000);
    const controller = fakeController(searchTransactions);

    const started = performance.now();
    withLedger(<Ledger />, controller);
    // Row 999 is far past the `FlatList`'s own first window — not on screen
    // until the sort brings it to the top.
    expect(screen.queryByText("Peak payee")).toBeNull();

    // One click — ascending. Every row here is an expense, so the largest
    // magnitude is the *smallest* signed amount and sorts to the top.
    fireEvent.click(screen.getByRole("button", { name: "Amount" }));
    const elapsed = performance.now() - started;

    expect(screen.getByText("Peak payee")).toBeDefined();
    // Twenty pages of fifty — the whole period, not the first page.
    expect(searchTransactions.mock.calls.length).toBeGreaterThanOrEqual(20);
    /**
     * And **one** drain, not two (M1, round 2). The month used to be applied
     * by an effect after the first query had already gone out unbounded, so
     * mounting drained the whole ledger and then drained the month — twice
     * the work, and a window in which the header and the rows disagreed.
     * A drain is a first page with no `countOnly`: §4's exclusion counts are
     * first pages too, and six of the seven carry a date filter — telling
     * them apart by the filter they are asked *without* left the assertion
     * one accidentally-date-free dimension away from being wrong (L7, round
     * 3). `countOnly` is what actually distinguishes them: a drain reads
     * rows, a count reads a count.
     */
    const drains = searchTransactions.mock.calls.filter(
      ([, cursor, options]) => cursor === undefined && options?.countOnly !== true,
    );
    expect(drains).toHaveLength(1);
    // Generous on purpose: this asserts "no accidental O(n²) and no per-row
    // re-query", not real-device latency. `packages/core`'s own
    // `ledger-table.perf.test.ts` budgets the comparator itself.
    expect(elapsed).toBeLessThan(10_000);
  });

  it("past the cap it says so — the header and a banner both, never a silent truncation", () => {
    const { searchTransactions } = thousandRowPort(5100);
    const controller = fakeController(searchTransactions);
    withLedger(<Ledger />, controller);

    expect(screen.getByText(/showing/)).toBeDefined();
    expect(screen.getByRole("alert").textContent).toMatch(/Narrow the filter/);
  });

  /**
   * L2 (round 2) — a drain that stopped because a page came back empty is
   * not a drain that hit the cap. Both leave a cursor set; only one of them
   * is something narrowing the filter would fix, so telling the reader to
   * narrow a filter here would be advice that cannot work.
   */
  it("a page that comes back empty is reported as incomplete, not as capped", () => {
    const rows = Array.from({ length: 50 }, (_, i) =>
      expenseRow({
        id: id<"transactions">(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`),
        payee: `Row ${i}`,
      }),
    );
    // First page: fifty rows and a cursor. Second page: a cursor still, and
    // no rows at all — a port disagreeing with itself.
    const searchTransactions = vi.fn<FakeSearch>((_filter, cursor) => ({
      rows: cursor === undefined ? rows : [],
      nextCursor: { date: TODAY, id: rows[49]?.id ?? ("x" as never) },
      total: { count: 900, currencies: [] },
    }));
    withLedger(<Ledger />, fakeController(searchTransactions));

    const alerts = screen.getAllByRole("alert").map((node) => node.textContent ?? "");
    expect(alerts.some((message) => /came back empty/.test(message))).toBe(true);
    expect(alerts.some((message) => /Narrow the filter/.test(message))).toBe(false);
  });

  /**
   * §4, both surfaces (M3, round 2) — an active control says how many rows
   * it is keeping off screen. One control is enough to prove the wiring: the
   * count is a subtraction of two `search_transactions` totals, and the
   * dimension a control belongs to is the only thing that varies.
   */
  it("an active filter says how many rows it excludes", () => {
    const rows = [expenseRow()];
    const searchTransactions = vi.fn<FakeSearch>((filter) => ({
      rows,
      nextCursor: undefined,
      // Without the date range there are ten more rows; with it, one.
      total: { count: filter.from === undefined ? 11 : 1, currencies: [] },
    }));
    withLedger(<Ledger />, fakeController(searchTransactions));

    // The desk branch opens on the current month, so `dateRange` is the one
    // active control on first paint.
    expect(screen.getByText("Excludes 10 rows")).toBeDefined();
  });

  /**
   * M2 (round 3) — and it says it *once*, right.
   *
   * The count is a subtraction from the count on screen, and on the commit a
   * filter changes in, that count still belongs to the *previous* filter:
   * the screen re-renders with the new filter before the effect that
   * re-queries has run. Subtracting it published a number that was wrong
   * about a set nobody was looking at — 12 here, where the truth is 15 —
   * and paid a full round of queries to produce it, then another to correct
   * it. A caption that is briefly wrong is the review's own "looks like
   * health": both renders are plausible and only one is true.
   *
   * The fake answers four ways, so the stale subtraction and the true one
   * cannot land on the same number by accident. Honest limit: under React 19
   * the *painted* wrongness turns out not to be reachable from this
   * screen — the search's own state update lands before the counts effect
   * first runs, so what round 2's shape actually cost was the doubled round
   * of queries below, not a visibly wrong caption. This states the property
   * anyway, over every text the document ever held, because the arrangement
   * that would paint one is a plausible future edit rather than a
   * hypothetical.
   */
  it("the exclusion note is never briefly wrong on the way to being right", () => {
    const searchTransactions = vi.fn<FakeSearch>((filter) => {
      const dated = filter.from !== undefined;
      const mine = filter.scope === "mine";
      const count = mine ? (dated ? 5 : 20) : dated ? 8 : 30;
      return { rows: [expenseRow()], nextCursor: undefined, total: { count, currencies: [] } };
    });
    withLedger(<Ledger />, fakeController(searchTransactions));

    // The month alone: 30 rows in the ledger, 8 in September.
    expect(screen.getByText("Excludes 22 rows")).toBeDefined();

    const seen = textSeenWhile(() => {
      // By role, not by text: "Mine" is also a value in the table's own
      // scope column (§6.7), and this is the rail's segment.
      fireEvent.click(screen.getByRole("tab", { name: "Mine" }));
    });

    // The vacuity guard, and the proof the helper reads what it claims to:
    // this is the text the caption held *before* the click, which is only
    // in `seen` if the observer captured the value at the moment it
    // changed. Reading `record.target.textContent` at drain time yields the
    // node's final value instead — "Excludes 15 rows" — and every
    // intermediate, including the wrong one below, is invisible.
    expect(seen.some((text) => text.includes("Excludes 22 rows"))).toBe(true);
    // 20 of the reader's own rows in the whole ledger, 5 this month.
    expect(screen.getByText("Excludes 15 rows")).toBeDefined();
    expect(screen.getByText("Excludes 3 rows")).toBeDefined();
    // 20 − 8: the new query's total against the old filter's count.
    expect(seen.some((text) => text.includes("Excludes 12 rows"))).toBe(false);
  });

  /**
   * M2's other half — one round of counts per filter change, one query per
   * active dimension. Seven dimensions is the whole of §4, and the shape
   * that made the old code expensive: every one of them re-ran when the
   * subtrahend moved, which it did on every drain.
   */
  it("one countOnly query per active dimension, once per filter change", () => {
    useLocalSearchParams.mockReturnValue({ account: ACCOUNT });
    const searchTransactions = vi.fn<FakeSearch>(() => ({
      rows: [expenseRow()],
      nextCursor: undefined,
      total: { count: 1, currencies: [] },
    }));
    withLedger(<Ledger />, fakeController(searchTransactions, EVERY_DIMENSION_SNAPSHOT));

    // Two dimensions arrive seeded — the account from the route param (S10
    // §2) and the month from the desk branch's own initial state.
    activateEveryFilterDimension();

    searchTransactions.mockClear();
    // One more change, and count what it costs.
    fireEvent.click(screen.getByRole("tab", { name: "Shared" }));

    const counts = searchTransactions.mock.calls.filter(([, , options]) => options?.countOnly);
    expect(counts).toHaveLength(7);
    // And exactly one of them per dimension — a second round would be the
    // same seven again.
    expect(new Set(counts.map(([filter]) => JSON.stringify(filter))).size).toBe(7);
  });

  /**
   * L1 (round 3) — an empty ledger is a first run whatever the rail says.
   *
   * The desk branch opens on the current month, so `hasActiveFilter` is true
   * from the first paint: a brand-new install was offered *"No matching
   * transactions · Clear filters"* — an instruction that would have changed
   * nothing, since there is nothing to filter. The unfiltered count is what
   * tells the two apart, and it is already being asked for.
   */
  it("an empty ledger shows the first-run state, not a filtered one, under the seeded month", () => {
    const searchTransactions = vi.fn<FakeSearch>(() => ({
      rows: [],
      nextCursor: undefined,
      total: { count: 0, currencies: [] },
    }));
    withLedger(<Ledger />, fakeController(searchTransactions));

    expect(screen.getByText("No transactions yet")).toBeDefined();
    expect(screen.queryByText("No matching transactions")).toBeNull();
    // And the count that decided it is a count, not a page of the whole
    // ledger read to be thrown away (M3).
    const unfiltered = searchTransactions.mock.calls.filter(
      ([filter]) => filter.from === undefined && filter.scope === undefined,
    );
    expect(unfiltered.length).toBeGreaterThan(0);
    for (const call of unfiltered) expect(call[2]).toEqual({ countOnly: true });
  });

  /**
   * And the other side of it: a ledger that *does* hold rows, filtered down
   * to none, still says so — L1 must not swallow the filtered state.
   */
  it("a non-empty ledger filtered down to nothing still says the filter is why", () => {
    const searchTransactions = vi.fn<FakeSearch>((filter) => ({
      rows: [],
      nextCursor: undefined,
      total: { count: filter.from === undefined ? 9 : 0, currencies: [] },
    }));
    withLedger(<Ledger />, fakeController(searchTransactions));

    expect(screen.getByText("No matching transactions")).toBeDefined();
    expect(screen.queryByText("No transactions yet")).toBeNull();
  });

  /* ── C2 layer 1 · a mixed batch never reaches a category tree ────────── */

  it("a selection spanning income and expense is refused before the tree opens", () => {
    const rows = [
      expenseRow({ id: id("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), payee: "An expense" }),
      expenseRow({
        id: id("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
        payee: "An income",
        type: "income",
        amount: "9200.00000000" as never,
      }),
    ];
    const categorizeBatch = vi.fn<PhoneLedgerPort["categorizeBatch"]>(() => undefined);
    const controller = fakeController(
      () => ({ rows, nextCursor: undefined, total: { count: 2, currencies: [] } }),
      { categorizeBatch },
    );
    withLedger(<Ledger />, controller);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select An expense" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select An income" }));

    expect(screen.getByRole("alert").textContent).toMatch(/income and expense/);

    fireEvent.click(screen.getByText("Categorise"));
    // No tree, no confirm, no write — the refusal is the first layer of three.
    expect(screen.queryByRole("radio")).toBeNull();
    expect(categorizeBatch).not.toHaveBeenCalled();
  });

  /**
   * L10 (round 2) — the other dead end. `selectionKind` is `null` for a
   * selection nothing in it can take a category, and *Categorise* then did
   * nothing at all, which reads as a broken button rather than as a refusal.
   *
   * Reaching that state takes a row that *becomes* uncategorisable while it
   * is selected — the checkbox and the range both refuse to select a
   * transfer in the first place. One id, two shapes across a filter change,
   * which is exactly what a reclassification arriving from another surface
   * would look like here.
   */
  it("a selection whose rows can no longer take a category refuses out loud", () => {
    const ROW = id<"transactions">("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    let reclassified = false;
    const controller = fakeController(() => ({
      rows: [
        reclassified
          ? expenseRow({ id: ROW, payee: "Row A", type: "transfer", toAccountName: "Cash" })
          : expenseRow({ id: ROW, payee: "Row A" }),
      ],
      nextCursor: undefined,
      total: { count: 1, currencies: [] },
    }));
    withLedger(<Ledger />, controller);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Row A" }));
    expect(screen.getByText("1 selected")).toBeDefined();

    reclassified = true;
    // Any filter change re-runs the query; the stepper is the one that needs
    // no debounce to land.
    fireEvent.click(screen.getByRole("button", { name: "Next period" }));

    expect(
      screen.getAllByRole("alert").some((node) => /never carry one/.test(node.textContent ?? "")),
    ).toBe(true);
  });

  it("an all-income selection is offered the income tree, not the expense one", () => {
    const rows = [
      expenseRow({
        id: id("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
        payee: "An income",
        type: "income",
        amount: "9200.00000000" as never,
      }),
    ];
    const controller = fakeController(
      () => ({ rows, nextCursor: undefined, total: { count: 1, currencies: [] } }),
      {
        listCategoryTree: () => [
          {
            id: id<"categories">("77777777-7777-4777-8777-777777777777"),
            parentId: null,
            name: "Salary",
            kind: "income",
            isLeaf: true,
            sort: 0,
          },
          {
            id: EATING_OUT,
            parentId: null,
            name: "Eating out",
            kind: "expense",
            isLeaf: true,
            sort: 1,
          },
        ],
      },
    );
    withLedger(<Ledger />, controller);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select An income" }));
    fireEvent.click(screen.getByText("Categorise"));

    expect(screen.getByRole("radio", { name: /Salary/ })).toBeDefined();
    expect(screen.queryByRole("radio", { name: /Eating out/ })).toBeNull();
  });

  /* ── H4 · an archived shared account still reads as shared ───────────── */

  it("a row in an archived shared account is scoped Shared, not Mine", () => {
    const rows = [
      expenseRow({
        id: id("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
        payee: "Old shared row",
        accountId: ARCHIVED_SHARED,
        accountName: "Bank B · EUR",
      }),
    ];
    const controller = fakeController(() => ({
      rows,
      nextCursor: undefined,
      total: { count: 1, currencies: [] },
    }));
    withLedger(<Ledger />, controller);

    // The scope *filter* joins accounts in SQL with no archived exclusion, so
    // this row answers "Shared" there; the column must agree with it. Both
    // words also appear once each as scope segments in the rail, so the
    // counts — not their presence — are what distinguish the row's own cell.
    expect(screen.getAllByText("Shared")).toHaveLength(2);
    expect(screen.getAllByText("Mine")).toHaveLength(1);
  });

  /* ── H5 · the period label is the filter ─────────────────────────────── */

  it("the very first query carries the current month, and Clear all returns the label to All time", () => {
    // One row, not none: the empty state asks `searchTransactions({})` for an
    // unfiltered count of its own, which would be a phantom "no date filter"
    // call among these.
    const rows = [expenseRow()];
    const searchTransactions = vi.fn<FakeSearch>(() => ({
      rows,
      nextCursor: undefined,
      total: { count: 1, currencies: [] },
    }));
    withLedger(<Ledger />, fakeController(searchTransactions));

    /**
     * `calls[0]`, not the last call (M1, round 2). The month is seeded
     * through `useLedgerFilters`' own `initial`, so it is in the state the
     * *first* query is built from — there is no earlier, unbounded query and
     * no second render correcting one. An unparseable or absent date is
     * dropped on the way to the port (`create-phone-ledger.ts`'s own
     * `isAccountingDate` guard), so a real month filter arrives as two real
     * dates and no filter arrives as none.
     */
    const first = searchTransactions.mock.calls[0]?.[0];
    expect(first?.from).toBe(`${TODAY.slice(0, 7)}-01`);
    expect(first?.to).toBeDefined();
    // The stepper names the month it is actually filtering.
    expect(screen.getByText(/2026/)).toBeDefined();

    searchTransactions.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

    expect(screen.getByText("All time")).toBeDefined();
    const cleared = searchTransactions.mock.calls[0]?.[0];
    expect(cleared?.from).toBeUndefined();
    expect(cleared?.to).toBeUndefined();
  });

  /* ── H6 · a range holds only what is checked ─────────────────────────── */

  it("a shift-click range skips a transfer, and the count matches the checkboxes", () => {
    const rows = [
      expenseRow({ id: id("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), payee: "Row A" }),
      expenseRow({
        id: id("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
        payee: "A transfer",
        type: "transfer",
        toAccountName: "Cash",
      }),
      expenseRow({ id: id("cccccccc-cccc-4ccc-8ccc-cccccccccccc"), payee: "Row C" }),
    ];
    const controller = fakeController(() => ({
      rows,
      nextCursor: undefined,
      total: { count: rows.length, currencies: [] },
    }));
    withLedger(<Ledger />, controller);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Row A" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Row C" }), { shiftKey: true });

    // Two checkboxes exist and two are checked — the transfer has none, so a
    // count of three would name a row the reader cannot see or unselect.
    expect(screen.getByText("2 selected")).toBeDefined();
    const checked = screen
      .getAllByRole("checkbox")
      .filter((box) => box.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(2);
  });

  /* ── M · the confirm states what is being overwritten ────────────────── */

  it("the confirm names the categories the batch is leaving, and what already matches", () => {
    const rows = [
      expenseRow({
        id: id("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
        payee: "Row A",
        categoryName: "Groceries",
      }),
      expenseRow({
        id: id("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
        payee: "Row B",
        categoryName: null,
      }),
      expenseRow({
        id: id("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
        payee: "Row C",
        categoryName: "Eating out",
      }),
    ];
    const controller = fakeController(() => ({
      rows,
      nextCursor: undefined,
      total: { count: rows.length, currencies: [] },
    }));
    withLedger(<Ledger />, controller);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Row A" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Row C" }), { shiftKey: true });
    fireEvent.click(screen.getByText("Categorise"));
    fireEvent.click(screen.getByRole("radio", { name: /Eating out/ }));

    // L4 (round 2) — `Eating out` is the *destination*, so it is not listed
    // as a category the batch is leaving. "from … Eating out → Eating out"
    // named the target as an origin and read as a no-op.
    expect(screen.getByText("from Groceries, Uncategorised → Eating out")).toBeDefined();
    expect(screen.getByText("1 row already Eating out")).toBeDefined();
  });

  it("J then Enter opens the first row via the keyboard alone", () => {
    const rows = [expenseRow()];
    const controller = fakeController(() => ({
      rows,
      nextCursor: undefined,
      total: { count: 1, currencies: [] },
    }));
    withLedger(<Ledger />, controller);

    const scroller = screen.getByTestId("ledger-table-scroller");
    fireEvent.keyDown(scroller, { key: "j" });
    fireEvent.keyDown(scroller, { key: "Enter" });

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/transaction/[id]",
      params: { id: rows[0]?.id },
    });
  });
});
