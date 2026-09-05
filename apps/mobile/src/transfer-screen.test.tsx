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
import { basePort } from "@waltning/client/ledger/test-port";
import { accountingDate, addDays, todayIn } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { crossRate, currencyCode, toMoney, unitsPerPivot } from "@waltning/core/money";
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

/** H2/L5 — a third currency, so a *second* switch has a genuinely different rate to re-derive against. */
const SAVINGS_EUR: PhoneAccount = {
  ...HOUSEHOLD,
  id: id<"accounts">("99999999-9999-4999-8999-999999999999"),
  name: "Savings · EUR",
  kind: "bank",
  currency: EUR,
};

function fakeController(
  overrides: {
    createTransaction?: PhoneLedgerPort["createTransaction"];
    accounts?: readonly PhoneAccount[];
    capturableUsd?: boolean;
    /** H1 — a date-aware fixture, for the "no rate on this date" scenario. */
    readCrossRate?: PhoneLedgerPort["readCrossRate"];
  } = {},
) {
  const port = basePort({
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
      {
        code: EUR,
        name: "Euro",
        symbol: "€",
        decimals: 2,
        capturable: true,
        isPivot: false,
      },
    ],
    createTransaction: overrides.createTransaction ?? (() => undefined),
    // S31 §9's own worked example: 3.8100 PLN per USD, `readCrossRate`'s
    // triangulated direction (M1) — multiply the USD leg by this to reach PLN.
    // USD→EUR is a second, distinct reference (H1's re-prefill tests, and
    // H2/L5's own re-derivation ones); GBP holds nothing, matching
    // offline-with-no-rate (S31 §6).
    // H2 — both legs, matching `PhoneCrossRate`'s own `legs: { from, to }`
    // shape post-fix. Both sides carry the same source/asOf/carriedDays
    // here, so `crossRateProvenance` reports exactly what the flattened
    // fixture used to before H2's split.
    readCrossRate:
      overrides.readCrossRate ??
      (({ from, to }) => {
        if (from === USD && to === PLN) {
          const leg = {
            rate: unitsPerPivot("1"),
            source: "nbp",
            asOf: accountingDate("2026-08-12"),
            carriedDays: 0,
          };
          return { rate: crossRate("3.8100"), legs: { from: leg, to: leg } };
        }
        if (from === USD && to === EUR) {
          const leg = {
            rate: unitsPerPivot("1"),
            source: "nbp",
            asOf: accountingDate("2026-08-12"),
            carriedDays: 0,
          };
          return { rate: crossRate("0.9200"), legs: { from: leg, to: leg } };
        }
        return null;
      }),
  });
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
   * H1 — the date-reprice effect used to return early with no rate for the
   * newly-chosen date, leaving the destination standing at whatever the
   * *previous* date's rate produced — a stale `to_amount` with no
   * provenance behind it any more, still saveable. Today holds a rate for
   * this pair; Yesterday, in this fixture, holds none.
   */
  it("clears the destination and disables Save when the chosen date has no rate (H1)", () => {
    // `transfer-screen.tsx`'s own `today` comes from `deviceRuntime()`'s real
    // clock, not from this fixture's `capture` (that one only stamps an
    // outbox entry at save time) — so "today" and "yesterday" here must be
    // computed the same way the screen computes them, not hard-coded.
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const today = todayIn(timeZone);
    const yesterday = addDays(today, -1);
    const readCrossRate = vi.fn(
      ({ from, to, date }: { from: string; to: string; date: string }) => {
        if (from === USD && to === PLN && date === today) {
          const leg = {
            rate: unitsPerPivot("1"),
            source: "nbp",
            asOf: today,
            carriedDays: 0,
          };
          return { rate: crossRate("3.8100"), legs: { from: leg, to: leg } };
        }
        return null;
      },
    );
    withLedger({ readCrossRate });

    pickFrom("Household · USD");
    pickTo("Cash · PLN");

    fireEvent.click(screen.getByRole("button", { name: "Amount: 0" }));
    tapKeys("1", "5", "0");

    // Pre-filled from Today's own reference: 150 × 3.8100 = 571.50.
    expect(screen.getByText("571.50")).toBeDefined();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", false);

    fireEvent.click(screen.getByRole("button", { name: "Date: Today" }));
    fireEvent.click(screen.getByRole("button", { name: "Yesterday" }));

    expect(readCrossRate).toHaveBeenCalledWith(
      expect.objectContaining({ from: USD, to: PLN, date: yesterday }),
    );
    // Yesterday has no rate for this pair — the stale prefill must not
    // survive the date change, and Save must refuse a cross-currency write
    // with nothing behind its destination figure.
    expect(screen.queryByText("571.50")).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
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

  /**
   * L — `createTransaction`'s own H2 mirror for `fee` (M,
   * `create-phone-ledger.ts`) sets `messageKey: "transactions.
   * tooManyDecimals"`; this screen used to render `result.fieldErrors`
   * straight through (the raw, unperiod-terminated builder string), the same
   * gap `quick-add-screen.tsx`'s own `resolveFieldErrorMessage` already
   * closed for Quick add. The trailing period is `en.ts`'s own copy — its
   * presence is what tells the two apart.
   */
  it("resolves a fee refusal's messageKey through the same translation Quick add uses (L)", () => {
    const createTransaction = vi.fn();
    withLedger({ createTransaction });

    pickFrom("Household · USD");
    pickTo("Cash · PLN");
    fireEvent.click(screen.getByRole("button", { name: "Amount: 0" }));
    tapKeys("1", "5", "0");
    fireEvent.change(screen.getByLabelText("Fee"), { target: { value: "0,125" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(createTransaction).not.toHaveBeenCalled();
    expect(screen.getByText("USD holds 2 decimal places — this amount has more.")).toBeDefined();
  });

  /**
   * H1 — a fee that fails `parseAmount` ("1,234.56", "1.2.3", "12.", "abc")
   * used to be dropped silently and the transfer saved with no fee at all.
   * Save now disables the same way it already does for every other refusal
   * this screen can see coming, and a direct tap (were it reachable) still
   * refuses rather than dropping the field.
   */
  it.each(["abc", "1.2.3", "12.", "1,234.56"])(
    "disables Save and never drops a malformed fee %s",
    (feeRaw) => {
      const createTransaction = vi.fn();
      withLedger({ createTransaction });

      pickFrom("Household · USD");
      pickTo("Cash · PLN");
      fireEvent.click(screen.getByRole("button", { name: "Amount: 0" }));
      tapKeys("1", "5", "0");
      fireEvent.change(screen.getByLabelText("Fee"), { target: { value: feeRaw } });

      expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
    },
  );

  it("an empty fee is not invalid — Save stays available with no fee typed", () => {
    const createTransaction = vi.fn();
    withLedger({ createTransaction });

    pickFrom("Household · USD");
    pickTo("Cash · PLN");
    fireEvent.click(screen.getByRole("button", { name: "Amount: 0" }));
    tapKeys("1", "5", "0");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(createTransaction).toHaveBeenCalledOnce();
    expect(createTransaction.mock.calls[0]?.[0]).not.toHaveProperty("fee");
  });

  /**
   * H2 — the destination leg used to keep the *previous* currency's
   * converted figure across a `To` switch. 100 USD × 3.8100 auto-fills
   * 381.00 against PLN; switching `To` to a EUR account must re-derive the
   * figure for the new pair (100 × 0.9200 = 92.00), never write 381.00 into
   * a EUR leg.
   */
  it("re-derives the destination amount when the To account switches currency (H2)", () => {
    const createTransaction = vi.fn();
    withLedger({ createTransaction, accounts: [HOUSEHOLD, CASH, SAVINGS_EUR] });

    pickFrom("Household · USD");
    pickTo("Cash · PLN");
    fireEvent.click(screen.getByRole("button", { name: "Amount: 0" }));
    tapKeys("1", "0", "0");
    expect(screen.getByText("381.00")).toBeDefined();

    pickTo("Savings · EUR");
    expect(screen.getByText("92.00")).toBeDefined();
    expect(screen.queryByText("381.00")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(createTransaction).toHaveBeenCalledOnce();
    expect(createTransaction.mock.calls[0]?.[0]).toMatchObject({
      toAccountId: SAVINGS_EUR.id,
      toAmount: "92.00000000",
      toCurrency: EUR,
    });
  });

  /** H2 — the same re-derivation, switching the `From` leg instead. */
  it("re-derives the destination amount when the From account switches currency (H2)", () => {
    withLedger({ accounts: [HOUSEHOLD, CASH, SAVINGS_EUR] });

    pickFrom("Cash · PLN");
    pickTo("Savings · EUR");
    // PLN → EUR has no rate in this fixture (only USD → PLN, USD → EUR do),
    // so the destination starts empty rather than a wrong estimate.
    fireEvent.click(screen.getByRole("button", { name: "Amount: 0" }));
    tapKeys("1", "0", "0");
    expect(screen.queryByRole("button", { name: /^Destination amount: [1-9]/ })).toBeNull();

    pickFrom("Household · USD");
    // Now USD → EUR has a rate: 100 × 0.9200 = 92.00, the new pair's own
    // figure — never whatever the PLN → EUR leg would have held (nothing,
    // here, but never a stale carry-over either).
    expect(screen.getByText("92.00")).toBeDefined();
  });

  /**
   * L5 — the same refuse-when-over-scale rule `quick-add-screen.tsx`'s own
   * `handleComposerAccountChange` states for its account chip, on the
   * transfer screen's own two: a switch to a smaller scale never silently
   * carries an already-typed figure past what the new account can hold.
   */
  it("refuses a From switch that would carry the typed amount past the new account's scale (L5)", () => {
    const secondPln: PhoneAccount = {
      ...CASH,
      id: id<"accounts">("77777777-7777-4777-8777-777777777777"),
      name: "Zero-dp · PLN",
      decimals: 0,
    };
    withLedger({ accounts: [HOUSEHOLD, secondPln] });

    pickFrom("Household · USD");
    fireEvent.click(screen.getByRole("button", { name: "Amount: 0" }));
    tapKeys("1", "0", ".", "5", "0");

    pickFrom("Zero-dp · PLN");

    expect(screen.getByText("PLN holds 0 decimal places — this amount has more.")).toBeDefined();
    // The switch was refused outright — the From account stays as it was.
    expect(screen.getByRole("button", { name: /^From: Household/ })).toBeDefined();
  });

  /**
   * L6 — the same rule, for `feeRaw`: `fee` carries no currency of its own,
   * it is always the *From* leg's own currency, so `handleFromAccountChange`
   * must guard it exactly the way it already guards `amountRaw`. It used to
   * guard only the amount, silently carrying an over-scale fee onto a
   * narrower account.
   */
  it("refuses a From switch that would carry the typed fee past the new account's scale (L6)", () => {
    const secondPln: PhoneAccount = {
      ...CASH,
      id: id<"accounts">("77777777-7777-4777-8777-777777777777"),
      name: "Zero-dp · PLN",
      decimals: 0,
    };
    withLedger({ accounts: [HOUSEHOLD, secondPln] });

    pickFrom("Household · USD");
    fireEvent.change(screen.getByLabelText("Fee"), { target: { value: "1.50" } });

    pickFrom("Zero-dp · PLN");

    expect(screen.getByText("PLN holds 0 decimal places — this amount has more.")).toBeDefined();
    // The switch was refused outright — the From account stays as it was.
    expect(screen.getByRole("button", { name: /^From: Household/ })).toBeDefined();
  });

  it("refuses a To switch that would carry a typed destination past the new account's scale (L5)", () => {
    const zeroDpEur: PhoneAccount = {
      ...SAVINGS_EUR,
      id: id<"accounts">("88888888-8888-4888-8888-888888888888"),
      name: "Zero-dp · EUR",
      decimals: 0,
    };
    withLedger({ accounts: [HOUSEHOLD, CASH, zeroDpEur] });

    pickFrom("Household · USD");
    pickTo("Cash · PLN");
    fireEvent.click(screen.getByRole("button", { name: "Amount: 0" }));
    tapKeys("1", "0", "0");
    // Type over the reference prefill — only an edited destination figure
    // is checked; the auto-filled path is re-derived, never compared.
    fireEvent.click(screen.getByRole("button", { name: "Destination amount: 381.00" }));
    tapKeys("Delete", "Delete", "Delete", "Delete", "Delete", "Delete");
    tapKeys("5", "0", ".", "5", "0");

    pickTo("Zero-dp · EUR");

    expect(screen.getByText("EUR holds 0 decimal places — this amount has more.")).toBeDefined();
    expect(screen.getByRole("button", { name: /^To: Cash/ })).toBeDefined();
  });

  /**
   * L4 — a server-side WA016 refusal (`assert_amount_scale`) is routed to
   * the field it actually named through `columnOf`'s structural read of the
   * envelope's own `details.column` (`DomainError.details`,
   * `apps/api/src/common/pg-errors.ts`'s own M3 fix) — never by parsing
   * `error.message`, which `create-phone-ledger.ts`'s own header now
   * explains was the actual bug: a `^`-anchored regex shaped for this exact
   * (unprefixed) Postgres text could never also match the phone's own
   * `scale.ts` refusals, which carry an operation-name prefix. A server
   * envelope carries no `currency`/`decimals` pair to interpolate a
   * templated sentence with (unlike a local `LocalRefusal`, which does), so
   * this lands on the field with the server's own message shown verbatim
   * rather than a blank-filled template.
   */
  it("routes a server-side scale refusal on toAmount to the destination field (L4)", () => {
    const createTransaction = vi.fn(() => {
      throw Object.assign(
        new Error("to_amount 381.125 holds more decimal places than PLN allows (2) (H2)"),
        { details: { column: "to_amount" } },
      );
    });
    withLedger({ createTransaction });

    pickFrom("Household · USD");
    pickTo("Cash · PLN");
    fireEvent.click(screen.getByRole("button", { name: "Amount: 0" }));
    tapKeys("1", "0", "0");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      screen.getByText("to_amount 381.125 holds more decimal places than PLN allows (2) (H2)"),
    ).toBeDefined();
  });
});
