/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { expect, it } from "vitest";
import { CurrencyTotals } from "./currency-totals";

const PLN = { currency: "PLN", decimals: 2, balance: money.toMoney("12480.20") };
const BYN = { currency: "BYN", decimals: 2, balance: money.toMoney("8400.00") };
const JPY = { currency: "JPY", decimals: 0, balance: money.toMoney("1200") };

/**
 * `getByText` cannot see these figures: `<Amount>` nests the ISO code in its own
 * `Text`, so the digits and the code are separate nodes and the matcher finds
 * neither whole. Reading `textContent` also lets one assertion cover the figure
 * *and* its label, which is the pairing that matters here.
 *
 * The ` ` is `money.forDisplay`'s group separator, normalised to a plain
 * space so the expectations stay readable. `money.test.ts` pins the character
 * itself.
 */
function textOf(container: HTMLElement): string {
  return (container.textContent ?? "").replace(/ /g, " ");
}

it("renders one figure per currency and no combined total", () => {
  const { container } = render(<CurrencyTotals subtotals={[PLN, BYN]} />);
  const rendered = textOf(container);

  expect(rendered).toContain("12 480.20 PLN");
  expect(rendered).toContain("8 400.00 BYN");
  // 12480.20 + 8400.00 — the figure that would appear if anything summed these.
  expect(rendered).not.toContain("20 880.20");
});

/**
 * The one line that stops a stacked pair from reading as a sum and its part —
 * which is exactly the shape `DualTotal` uses to mean that.
 */
it("says the figures are held separately, but only when there are two", () => {
  const { unmount } = render(<CurrencyTotals subtotals={[PLN, BYN]} />);
  expect(screen.getByText("Held separately — not a total.")).toBeDefined();
  unmount();

  render(<CurrencyTotals subtotals={[PLN]} />);
  expect(screen.queryByText("Held separately — not a total.")).toBeNull();
});

/**
 * Each currency at its own scale. A shared `decimals` would print ¥1 200 as
 * ¥1 200.00 — the same figure claiming a precision the currency does not have.
 */
it("renders each currency at its own scale", () => {
  const { container } = render(<CurrencyTotals subtotals={[JPY, PLN]} />);
  const rendered = textOf(container);

  expect(rendered).toContain("1 200 JPY");
  expect(rendered).toContain("12 480.20 PLN");
});

/**
 * Absent, not zero. With no account there is no currency to print a zero in,
 * and a figure needs one — `0.00` alone is not a balance, it is a number.
 */
it("renders nothing at all before the first account exists", () => {
  const { container } = render(<CurrencyTotals subtotals={[]} />);
  expect(container.textContent).toBe("");
});
