/**
 * @vitest-environment jsdom
 *
 * S31 · Transfer — the phone path. Same harness shape as
 * `quick-add-screen.test.tsx`: a real `createPhoneLedger` over a fake port,
 * rendered under `<LedgerProvider>`, driven through `fireEvent`.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import {
  createPhoneLedger,
  type PhoneAccount,
  type PhoneLedgerPort,
} from "@waltning/client/ledger/create-phone-ledger";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode, pivotPerUnit, toMoney, unitsPerPivot } from "@waltning/core/money";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), back: vi.fn(), dismissTo: vi.fn() };
const useLocalSearchParams = vi.fn(() => ({}));

vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
  useLocalSearchParams: () => useLocalSearchParams(),
}));

import Transfer from "./transfer-screen";

const USD = currencyCode("USD");
const PLN = currencyCode("PLN");
const EUR = currencyCode("EUR");
const GBP = currencyCode("GBP");

const HOUSEHOLD: PhoneAccount = {
  id: id<"accounts">("11111111-1111-4111-8111-111111111111"),
  name: "Household · USD",
  kind: "bank",
  currency: USD,
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

const CASH: PhoneAccount = {
  ...HOUSEHOLD,
  id: id<"accounts">("22222222-2222-4222-8222-222222222222"),
  name: "Cash · PLN",
  kind: "cash",
  currency: PLN,
};

/** H1 — a second cross-currency destination, its own reference rate distinct from PLN's. */
const TRIP: PhoneAccount = {
  ...HOUSEHOLD,
  id: id<"accounts">("44444444-4444-4444-8444-444444444444"),
  name: "Trip · EUR",
  kind: "cash",
  currency: EUR,
};

/** H1 — a currency `readCrossRate` holds nothing for, offline (S31 §6). */
const OTHER: PhoneAccount = {
  ...HOUSEHOLD,
  id: id<"accounts">("66666666-6666-4666-8666-666666666666"),
  name: "Other · GBP",
  kind: "cash",
  currency: GBP,
};

/** H1 — a second USD account: switching *From* onto it never changes the currency pair. */
const VACATION: PhoneAccount = {
  ...HOUSEHOLD,
  id: id<"accounts">("77777777-7777-4777-8777-777777777777"),
  name: "Vacation · USD",
};

function fakeController(
  overrides: {
    createTransaction?: PhoneLedgerPort["createTransaction"];
    accounts?: readonly PhoneAccount[];
    capturableUsd?: boolean;
  } = {},
) {
  const port: PhoneLedgerPort = {
    listAccounts: () => overrides.accounts ?? [HOUSEHOLD, CASH],
    listCurrencies: () => [
      {
        code: USD,
        name: "US Dollar",
        symbol: "$",
        decimals: 2,
        capturable: overrides.capturableUsd ?? true,
        isPivot: true,
      },
      {
        code: PLN,
        name: "Polish Złoty",
        symbol: "zł",
        decimals: 2,
        capturable: true,
        isPivot: false,
      },
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
    balanceAsOf: () => toMoney("0"),
    createAccount: vi.fn(),
    createTransaction: overrides.createTransaction ?? vi.fn(),
    createCategory: vi.fn(),
    updateAccount: vi.fn(),
    archiveAccount: vi.fn(),
    reconcileAccount: vi.fn(),
    createGroup: vi.fn(),
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
    readRate: vi.fn(() => null),
    // S31 §9's own worked example: 3.8100 PLN per USD, `readCrossRate`'s
    // pivot-per-unit direction — multiply the USD leg by this to reach PLN.
    // USD→EUR is a second, distinct reference (H1's re-prefill tests); GBP
    // holds nothing, matching offline-with-no-rate (S31 §6).
    // H2 — both legs, matching `PhoneCrossRate`'s own `legs: { from, to }`
    // shape post-fix. Both sides carry the same source/asOf/carriedDays
    // here, so `crossRateProvenance` reports exactly what the flattened
    // fixture used to before H2's split.
    readCrossRate: vi.fn(({ from, to }) => {
      if (from === USD && to === PLN) {
        const leg = {
          rate: unitsPerPivot("1"),
          source: "nbp",
          asOf: accountingDate("2026-08-12"),
          carriedDays: 0,
        };
        return { rate: pivotPerUnit("3.8100"), legs: { from: leg, to: leg } };
      }
      if (from === USD && to === EUR) {
        const leg = {
          rate: unitsPerPivot("1"),
          source: "nbp",
          asOf: accountingDate("2026-08-12"),
          carriedDays: 0,
        };
        return { rate: pivotPerUnit("0.9200"), legs: { from: leg, to: leg } };
      }
      return null;
    }),
    readCoverage: vi.fn(() => []),
    listFxRates: vi.fn(() => []),
    addCurrency: vi.fn(),
    archiveCurrency: vi.fn(),
    setRateSource: vi.fn(),
    setPinned: vi.fn(),
    changePivot: vi.fn(),
    setManualRate: vi.fn(() => ({ written: 0, replacedManual: 0 })),
    clearManualRate: vi.fn(() => ({ deleted: 0 })),
    createCounterparty: vi.fn(),
    updateCounterparty: vi.fn(),
    mergeCounterparties: vi.fn(),
    unmergeCounterparties: vi.fn(),
    recordDistinctCounterparties: vi.fn(),
    settleDebt: vi.fn(() => ({ residual: toMoney("0"), overSettled: false })),
    listCounterpartyBalances: vi.fn(() => []),
    listFullCategoryTree: vi.fn(() => []),
    listCategoryUsage: vi.fn(() => new Map()),
    readCategoryReferenceCounts: vi.fn(() => ({ transactions: 0, lines: 0, rules: 0 })),
    renameCategory: vi.fn(),
    reparentCategory: vi.fn(),
    convertLeafGroup: vi.fn(),
    mergeCategories: vi.fn(),
    archiveCategory: vi.fn(),
    listCounterpartyMerges: vi.fn(() => []),
    listDistinctCounterpartyPairs: vi.fn(() => []),
    listCurrencySettings: vi.fn(() => []),
    updateCurrency: vi.fn(),
    reset: vi.fn(),
  };
  return createPhoneLedger(port, {
    capture: () => ({
      date: accountingDate("2026-08-12"),
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-08-12T10:00:00Z"),
    }),
    id: () => id("33333333-3333-4333-8333-333333333333"),
  });
}

function withLedger(overrides: Parameters<typeof fakeController>[0] = {}) {
  return render(
    <LedgerProvider controller={fakeController(overrides)}>
      <Transfer />
    </LedgerProvider>,
  );
}

/** Keypad's own glyphs — `.` is English's decimal mark, mapped to the canonical `,` key. */
function tapKeys(...glyphs: readonly string[]) {
  for (const glyph of glyphs) fireEvent.click(screen.getByRole("button", { name: glyph }));
}

/**
 * `AccountPicker` (`accounts/`) — a tile's own accessible name is the
 * account's name alone, matching every other call site's tiles
 * (`account-picker.test.tsx`), not the `Chip`'s "Account: …" convention its
 * own trigger button still carries before a pick.
 */
function pickFrom(name: string) {
  fireEvent.click(screen.getByRole("button", { name: /^From/ }));
  fireEvent.click(screen.getByRole("radio", { name }));
}

function pickTo(name: string) {
  fireEvent.click(screen.getByRole("button", { name: /^To/ }));
  fireEvent.click(screen.getByRole("radio", { name }));
}

beforeEach(() => {
  router.push.mockClear();
  router.back.mockClear();
  router.dismissTo.mockClear();
  useLocalSearchParams.mockReturnValue({});
});

describe("Transfer — the phone path", () => {
  it("refuses the same account both sides, inline, before Save", () => {
    withLedger();
    pickFrom("Household · USD");
    pickTo("Household · USD");

    expect(screen.getByText("A transfer needs two different accounts.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
  });

  /**
   * S31 §9's own worked example: 150 USD → 565.20 PLN at reference 3.8100 —
   * the destination is pre-filled from the reference (571.50) and then
   * edited to the bank's own figure, the way §3 says a person actually uses
   * this screen. The margin renders at 6.30 zł-equivalent (`money.margin`'s
   * own worked arithmetic, converted into the destination currency).
   */
  it("shows the bank's margin once the destination is typed over the reference prefill", () => {
    const createTransaction = vi.fn();
    withLedger({ createTransaction });

    pickFrom("Household · USD");
    pickTo("Cash · PLN");

    fireEvent.click(screen.getByRole("button", { name: "Amount: 0" }));
    tapKeys("1", "5", "0");

    // Pre-filled from the reference: 150 × 3.8100 = 571.50.
    expect(screen.getByText("571.50")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Destination amount: 571.50" }));
    tapKeys("Delete", "Delete", "Delete", "Delete", "Delete", "Delete");
    tapKeys("5", "6", "5", ".", "2", "0");
    expect(screen.getByText("565.20")).toBeDefined();

    // §4a: margin_pivot = 150 − 565.20 ÷ 3.8100 ≈ 1.6535 USD ≈ 6.30 PLN.
    // With no fee typed, the footer's Total repeats the same figure.
    expect(screen.getAllByText((_, element) => element?.textContent === "6.30 PLN")).toHaveLength(
      2,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(createTransaction).toHaveBeenCalledOnce();
    const draft = createTransaction.mock.calls[0]?.[0];
    expect(draft).toMatchObject({
      type: "transfer",
      accountId: HOUSEHOLD.id,
      amountOriginal: "150.00000000",
      currency: USD,
      toAccountId: CASH.id,
      toAmount: "565.20000000",
      toCurrency: PLN,
    });
    expect(draft?.toFxRate).toBeUndefined();
    expect(router.dismissTo).toHaveBeenCalledWith("/");
  });

  /**
   * C2 — `TransferComposer` used to run `money.toMoney` on the fee's raw
   * typed text in render; a letter threw before the screen ever showed a
   * caption. `parseAmount` is the boundary now, and Save must reflect that
   * the fee has not (yet) resolved to a number.
   */
  it("shows a caption and disables Save for an unparsable fee, without throwing (C2)", () => {
    withLedger();
    pickFrom("Household · USD");
    pickTo("Cash · PLN");
    fireEvent.click(screen.getByRole("button", { name: "Amount: 0" }));
    tapKeys("1", "5", "0");

    expect(() =>
      fireEvent.change(screen.getByLabelText("Fee"), { target: { value: "5 z" } }),
    ).not.toThrow();

    expect(screen.getByText("Enter a number, or leave it blank.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
  });

  /**
   * M3 — "5," used to parse to "5.", a shape the contract's `zMoney` refuses;
   * the fee field must read it the same as any other unparsable fee (C2),
   * not carry a stray "." past the caption and into a write the server would
   * bounce.
   */
  it("shows the same caption for a fee left mid-typed at a trailing separator (M3)", () => {
    withLedger();
    pickFrom("Household · USD");
    pickTo("Cash · PLN");
    fireEvent.click(screen.getByRole("button", { name: "Amount: 0" }));
    tapKeys("1", "5", "0");

    fireEvent.change(screen.getByLabelText("Fee"), { target: { value: "5," } });

    expect(screen.getByText("Enter a number, or leave it blank.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
  });

  /**
   * H1 — a destination amount typed against one currency pair must not
   * survive a change to either leg. Three shapes, one behind each `it`: the
   * pair collapses to same-currency, a new cross-currency pair with its own
   * reference re-prefills, and one with no reference held clears outright.
   */
  describe("H1 — the destination amount is reset on either account change", () => {
    it("collapses to the source figure when the pair becomes same-currency", () => {
      const savingsPln: PhoneAccount = {
        ...CASH,
        id: id<"accounts">("55555555-5555-4555-8555-555555555555"),
        name: "Savings · PLN",
      };
      const createTransaction = vi.fn();
      withLedger({ accounts: [HOUSEHOLD, CASH, savingsPln], createTransaction });

      pickFrom("Household · USD");
      pickTo("Cash · PLN");
      fireEvent.click(screen.getByRole("button", { name: "Amount: 0" }));
      tapKeys("1", "5", "0");
      fireEvent.click(screen.getByRole("button", { name: "Destination amount: 571.50" }));
      tapKeys("Delete", "Delete", "Delete", "Delete", "Delete", "Delete");
      tapKeys("5", "6", "5", ".", "2", "0");
      expect(screen.getByText("565.20")).toBeDefined();

      // Both legs land on PLN — the destination field disappears (§3), and
      // the stale 565.20 must not survive into the write as a PLN figure.
      pickFrom("Savings · PLN");
      expect(screen.queryByRole("button", { name: /^Destination amount/ })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      const draft = createTransaction.mock.calls[0]?.[0];
      expect(draft?.toAmount).toBe("150.00000000");
    });

    /**
     * H1 — the bug itself: `computeToAmountPrefill` used to run on *every*
     * account change, discarding a hand-typed destination even when the
     * currency pair never moved. Switching *From* to another USD account
     * changes nothing about the pair (USD → PLN, still), so the figure a
     * person just typed must survive untouched.
     */
    it("keeps a hand-edited destination when the From account changes but the currency pair does not", () => {
      withLedger({ accounts: [HOUSEHOLD, CASH, VACATION] });

      pickFrom("Household · USD");
      pickTo("Cash · PLN");
      fireEvent.click(screen.getByRole("button", { name: "Amount: 0" }));
      tapKeys("1", "5", "0");
      fireEvent.click(screen.getByRole("button", { name: "Destination amount: 571.50" }));
      tapKeys("Delete", "Delete", "Delete", "Delete", "Delete", "Delete");
      tapKeys("5", "6", "5", ".", "2", "0");
      expect(screen.getByText("565.20")).toBeDefined();

      pickFrom("Vacation · USD");
      expect(screen.getByText("565.20")).toBeDefined();
      expect(screen.queryByText("571.50")).toBeNull();
    });

    it("re-prefills from the new pair's own reference rate", () => {
      withLedger({ accounts: [HOUSEHOLD, CASH, TRIP] });

      pickFrom("Household · USD");
      pickTo("Cash · PLN");
      fireEvent.click(screen.getByRole("button", { name: "Amount: 0" }));
      tapKeys("1", "5", "0");
      fireEvent.click(screen.getByRole("button", { name: "Destination amount: 571.50" }));
      tapKeys("Delete", "Delete", "Delete", "Delete", "Delete", "Delete");
      tapKeys("5", "6", "5", ".", "2", "0");
      expect(screen.getByText("565.20")).toBeDefined();

      // USD→EUR's own reference is 0.9200 — 150 × 0.9200 = 138.00, not the
      // PLN figure just typed and not PLN's own reference either.
      pickTo("Trip · EUR");
      expect(screen.getByText("138.00")).toBeDefined();
      expect(screen.queryByText("565.20")).toBeNull();
    });

    it("clears the destination when the new pair has no reference held offline", () => {
      withLedger({ accounts: [HOUSEHOLD, CASH, OTHER] });

      pickFrom("Household · USD");
      pickTo("Cash · PLN");
      fireEvent.click(screen.getByRole("button", { name: "Amount: 0" }));
      tapKeys("1", "5", "0");
      fireEvent.click(screen.getByRole("button", { name: "Destination amount: 571.50" }));
      tapKeys("Delete", "Delete", "Delete", "Delete", "Delete", "Delete");
      tapKeys("5", "6", "5", ".", "2", "0");
      expect(screen.getByText("565.20")).toBeDefined();

      pickTo("Other · GBP");
      expect(screen.getByRole("button", { name: "Destination amount: 0" })).toBeDefined();
    });
  });

  /**
   * M2 — the realized rate used to be gated behind `referenceRate`, so it
   * rendered `0,0000` offline with nothing held even though both typed
   * amounts were enough to derive it on their own (S31 §6).
   */
  it("renders the realized rate from the two typed amounts alone, with no reference held (M2)", () => {
    withLedger({ accounts: [HOUSEHOLD, CASH, OTHER] });

    pickFrom("Household · USD");
    pickTo("Other · GBP");
    fireEvent.click(screen.getByRole("button", { name: "Amount: 0" }));
    tapKeys("1", "0", "0");
    fireEvent.click(screen.getByRole("button", { name: "Destination amount: 0" }));
    tapKeys("8", "0");

    expect(screen.getByText("0.8000")).toBeDefined();
    expect(screen.queryByText("0.0000")).toBeNull();
  });

  /**
   * M4 — closes the source leg: a zero source amount disables Save the same
   * way a zero destination already does, before the write ever reaches the
   * contract's own refine.
   */
  it("disables Save for a zero source amount (M4)", () => {
    withLedger();
    pickFrom("Household · USD");
    pickTo("Cash · PLN");

    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
  });

  /**
   * H3 — a typed `0` fee is the same as no fee: the controller drops it
   * rather than sending a zero the contract's `> 0` refine would refuse.
   */
  it("drops a zero fee from the write rather than sending it (H3)", () => {
    const createTransaction = vi.fn();
    withLedger({ createTransaction });
    pickFrom("Household · USD");
    pickTo("Cash · PLN");
    fireEvent.click(screen.getByRole("button", { name: "Amount: 0" }));
    tapKeys("1", "5", "0");
    fireEvent.change(screen.getByLabelText("Fee"), { target: { value: "0" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(createTransaction).toHaveBeenCalledOnce();
    const draft = createTransaction.mock.calls[0]?.[0];
    expect(draft && "fee" in draft).toBe(false);
  });

  /**
   * `H` — the controller refuses `create_transaction` on `accountId` (the
   * *from* leg) before the write when the account holds no rate (§14.6);
   * Save must not be tappable while that refusal is already knowable.
   */
  it("disables Save and shows the needsRate caption when the From account can't be captured (SPEC.md §14.6)", () => {
    withLedger({ capturableUsd: false });
    pickFrom("Household · USD");
    pickTo("Cash · PLN");

    expect(
      screen.getByText("USD needs an exchange rate before a transaction can be recorded in it."),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
  });

  it("collapses to one amount for a same-currency transfer", () => {
    const secondAccount: PhoneAccount = {
      ...CASH,
      id: id<"accounts">("55555555-5555-4555-8555-555555555555"),
      name: "Savings · PLN",
    };
    withLedger({ accounts: [CASH, secondAccount] });
    pickFrom("Cash · PLN");
    pickTo("Savings · PLN");

    expect(screen.queryByRole("button", { name: /^Destination amount/ })).toBeNull();
  });
});
