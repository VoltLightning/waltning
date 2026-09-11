/** @vitest-environment jsdom */

/**
 * `TransferComposer` — S31 §3 on the deck's anatomy: a *Leaves* card holding
 * the typed amount and the two legs as rows, an *Arrives* card across
 * currencies holding the destination, the rate used and what it costs. The
 * rules the older layout carried (§7.5's derived rate, §9.1's fee apart from
 * the margin, §14.6's refusal, the same-account refusal) are asserted here
 * against the cards that carry them now.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { crossRate, toMoney } from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n/provider";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles";
import { TransferComposer, type TransferComposerProps } from "./transfer-composer";

function base(): TransferComposerProps {
  return {
    accounts: [
      {
        id: "acc-usd",
        name: "Household · USD",
        currency: "USD",
        symbol: "$",
        decimals: 2,
        balance: toMoney("12480.20"),
        capturable: true,
      },
      {
        id: "acc-pln",
        name: "Cash · PLN",
        currency: "PLN",
        symbol: "zł",
        decimals: 2,
        balance: toMoney("1240"),
        capturable: true,
      },
    ],
    fromAccountId: "acc-usd",
    onOpenFromAccountPicker: vi.fn(),
    toAccountId: "acc-pln",
    onOpenToAccountPicker: vi.fn(),
    onSwap: vi.fn(),
    amountRaw: "150",
    onAmountChange: vi.fn(),
    toAmountRaw: "565,20",
    onToAmountChange: vi.fn(),
    referenceRate: {
      rate: crossRate("3.8100"),
      source: "nbp",
      date: "2026-08-12",
      carriedDays: 0,
      manual: false,
    },
    fee: "",
    onFeeChange: vi.fn(),
    date: "2026-08-12",
    onDateChange: vi.fn(),
    today: "2026-08-12",
    note: "",
    onNoteChange: vi.fn(),
  };
}

function draw(overrides: Partial<TransferComposerProps> = {}) {
  const props = { ...base(), ...overrides };
  render(
    <ThemeProvider theme={light}>
      <I18nProvider>
        <TransferComposer {...props} />
      </I18nProvider>
    </ThemeProvider>,
  );
  return props;
}

const textOf = (wanted: string) =>
  screen.getByText((_, element) => element?.textContent === wanted);

it("draws the two legs as rows with their balances, and the amount over them", () => {
  draw();
  expect(screen.getByRole("button", { name: "From: Household · USD" })).toBeDefined();
  expect(screen.getByRole("button", { name: "To: Cash · PLN" })).toBeDefined();
  expect(screen.getByText(/12.480[.,]20/)).toBeDefined();
  expect(screen.getByLabelText("Amount")).toHaveProperty("value", "150");
  expect(screen.getByText("$")).toBeDefined();
});

it("shows the rate used, its unit, what it costs, and the reference beside it", () => {
  draw();
  // 565.20 ÷ 150 = 3.7680 PLN per USD, against the reference 3.8100.
  expect(screen.getByText("3.7680")).toBeDefined();
  expect(screen.getByText("PLN per USD")).toBeDefined();
  expect(screen.getByText("reference 3.8100 · NBP · August 12, 2026")).toBeDefined();
  // §4a: margin_pivot = 150 − 565.20 ÷ 3.8100 ≈ 1.6535 USD — the source
  // currency, which is what the money left in — a cost, drawn as money that
  // left, in words and in ink.
  expect(screen.getByText("Costs you")).toBeDefined();
  expect(textOf("-1.65 USD")).toBeDefined();
  expect(screen.getByText("NBP · August 12, 2026")).toBeDefined();
});

/**
 * **The fee is in the source currency (§9.1), and so is the margin's pivot
 * leg** — the two add without a conversion. An earlier line added a 5 USD
 * fee to a 6.30 PLN margin and labelled the sum *11.30 PLN*, for a cost of
 * 25.35 PLN.
 */
it("adds the stated fee into what it costs, in the source currency (§9.1)", () => {
  draw({ fee: "5" });
  expect(textOf("-6.65 USD")).toBeDefined();
});

it("calls a transfer that beat the reference a saving, with its sign in words and in ink (§7.5)", () => {
  // 150 USD arrived as 580 PLN: 3.8667 against 3.8100 — better than the
  // reference by 150 − 580 ÷ 3.81 ≈ −2.23 USD.
  draw({ toAmountRaw: "580" });
  expect(screen.getByText("Saves you")).toBeDefined();
  expect(screen.queryByText("Costs you")).toBeNull();
  expect(textOf("+2.23 USD")).toBeDefined();
});

it("states a refusal it could place on no field, over the cards", () => {
  draw({ fieldErrors: { byField: {}, formLevel: ["Something the replica refused."] } });
  expect(screen.getByRole("alert")).toBeDefined();
  expect(screen.getByText("Something the replica refused.")).toBeDefined();
});

it("reads the locale's mark as the mark: a stray numpad dot after a complete figure is dropped", () => {
  const props = draw();
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "500.00," } });
  expect(props.onAmountChange).toHaveBeenCalledWith("500,00");
});

it("folds what the system keyboard typed onto the draft's own shape, on either leg", () => {
  const props = draw();
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "1,240.509" } });
  expect(props.onAmountChange).toHaveBeenCalledWith("1240,50");
  fireEvent.change(screen.getByLabelText("Destination amount"), { target: { value: "565.2" } });
  expect(props.onToAmountChange).toHaveBeenCalledWith("565,2");
});

it("collapses to one card for a same-currency transfer", () => {
  draw({
    accounts: [
      { id: "acc-a", name: "Cash · PLN", currency: "PLN", decimals: 2, capturable: true },
      { id: "acc-b", name: "Savings · PLN", currency: "PLN", decimals: 2, capturable: true },
    ],
    fromAccountId: "acc-a",
    toAccountId: "acc-b",
    toAmountRaw: "150",
    referenceRate: undefined,
  });
  expect(screen.queryByLabelText("Destination amount")).toBeNull();
  expect(screen.queryByText("Rate used")).toBeNull();
});

it("refuses the same account both sides, inline, on the To row", () => {
  draw({ toAccountId: "acc-usd" });
  expect(screen.getByText("A transfer needs two different accounts.")).toBeDefined();
});

it("shows the reference as the rate used until both amounts exist, and no cost", () => {
  draw({ amountRaw: "", toAmountRaw: "" });
  expect(screen.getByText("3.8100")).toBeDefined();
  expect(screen.queryByText("Costs you")).toBeNull();
  expect(screen.queryByText(/^reference/)).toBeNull();
});

it("has no rate tile at all offline with nothing held (§6)", () => {
  draw({ referenceRate: undefined, toAmountRaw: "" });
  expect(screen.queryByText("Rate used")).toBeNull();
  expect(screen.queryByText("Costs you")).toBeNull();
});

it("states the realized rate from the two typed amounts alone, with no reference held", () => {
  draw({ referenceRate: undefined });
  expect(screen.getByText("3.7680")).toBeDefined();
  expect(screen.queryByText("Costs you")).toBeNull();
});

it("marks a person's own correction on the provenance (H2)", () => {
  draw({
    referenceRate: {
      rate: crossRate("3.8100"),
      source: "manual",
      date: "2026-08-10",
      carriedDays: 2,
      manual: true,
    },
  });
  expect(screen.getByText("MANUAL · carried 2 d from August 10, 2026")).toBeDefined();
  // The leg shown is the manual one, so the source already says it.
  expect(screen.queryByText("Manual")).toBeNull();
});

it("tags a correction on the other leg, whose source the provenance does not name (H2)", () => {
  draw({
    referenceRate: {
      rate: crossRate("3.8100"),
      source: "nbp",
      date: "2026-08-12",
      carriedDays: 0,
      manual: true,
    },
  });
  expect(screen.getByText("NBP · August 12, 2026")).toBeDefined();
  expect(screen.getByText("Manual")).toBeDefined();
});

it("swaps the two accounts with one control", () => {
  const props = draw();
  fireEvent.click(screen.getByRole("button", { name: "Swap direction" }));
  expect(props.onSwap).toHaveBeenCalledOnce();
});

it("opens the from/to account picker through callbacks rather than rendering it", () => {
  const props = draw();
  fireEvent.click(screen.getByRole("button", { name: "From: Household · USD" }));
  expect(props.onOpenFromAccountPicker).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "To: Cash · PLN" }));
  expect(props.onOpenToAccountPicker).toHaveBeenCalledOnce();
});

it("keeps fee, date and note behind one row, and summarises them there", () => {
  const props = draw({ fee: "5", date: "2026-08-01" });
  expect(
    screen.getByRole("button", { name: "More details: Fee 5 · August 1, 2026" }),
  ).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: /^More details/ }));
  fireEvent.click(screen.getByRole("button", { name: "Fee: 5" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Fee" }), { target: { value: "7" } });
  expect(props.onFeeChange).toHaveBeenCalledWith("7");
});

it("carries an unparsable fee's caption onto the folded row, so it is never hidden", () => {
  draw({ fee: "1,234.56" });
  expect(screen.getByText("Enter a number, or leave it blank.")).toBeDefined();
});

it("states the needsRate refusal when the From account cannot be captured (§14.6)", () => {
  const onSetRate = vi.fn();
  const [usd, pln] = base().accounts;
  draw({
    accounts: [
      { ...(usd as TransferComposerProps["accounts"][number]), capturable: false },
      pln as TransferComposerProps["accounts"][number],
    ],
    onSetRate,
  });
  expect(
    screen.getByText("USD needs an exchange rate before a transaction can be recorded in it."),
  ).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Set a USD rate" }));
  expect(onSetRate).toHaveBeenCalledOnce();
});

it("renders byField.accountId under the From row when it is not the banner's own sentence", () => {
  draw({ fieldErrors: { byField: { accountId: ["Some other refusal"] }, formLevel: [] } });
  expect(screen.getByText("Some other refusal")).toBeDefined();
});
