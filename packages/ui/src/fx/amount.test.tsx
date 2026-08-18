/**
 * @vitest-environment jsdom
 *
 * `<Amount>` — the component every figure in the system renders through.
 *
 * The cases below are the ones a figure gets wrong silently: the wrong number
 * of decimal places, a minus sign that disagrees with the value, and a missing
 * tabular numeral that only shows up as a column that will not line up.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Amount } from "./amount";

describe("Amount", () => {
  it("renders at the currency's own precision", () => {
    // `decimals` is a prop rather than a constant 2. Hardcoding two is correct
    // for every currency in this ledger today and wrong for JPY, and the error
    // reads as a formatting quirk.
    render(<Amount value="1234.56000000" currency="PLN" decimals={2} />);
    expect(screen.getByText("1234.56")).toBeDefined();
  });

  it("renders zero decimals when the currency has none", () => {
    render(<Amount value="1500.00000000" currency="JPY" decimals={0} />);
    expect(screen.getByText("1500")).toBeDefined();
  });

  it("does not treat negative zero as negative", () => {
    // `-0.00000000` is not a negative balance. `startsWith("-")` says it is,
    // and shows a cleared account in the ink of an overdraft.
    const { container } = render(<Amount value="-0.00000000" currency="PLN" />);
    expect(container.textContent).not.toContain("-0.00");
  });

  it("adds a leading + only when asked, and never to zero", () => {
    const { container } = render(<Amount value="0.00000000" currency="PLN" signed />);
    expect(container.textContent).not.toContain("+");
  });

  it("shows a + on a positive when asked", () => {
    const { container } = render(<Amount value="12.00000000" currency="PLN" signed />);
    expect(container.textContent).toContain("+12.00");
  });

  it("carries a font-variant — §2.2 calls tabular numerals mandatory", () => {
    // react-native-web compiles `fontVariant` into an atomic class rather than
    // an inline style, so the *value* is not observable in the DOM. This
    // asserts only that the declaration reached the style system.
    //
    // The assertion that actually matters is in `tests/design-system.test.ts`,
    // at source level: no component may format money except through `Amount`.
    // That is the regression worth catching — a `<Text>{amount}</Text>` written
    // in a hurry, with no tabular numerals and a column that will not align.
    const { container } = render(<Amount value="1.00000000" currency="PLN" />);
    expect(container.innerHTML).toContain("r-fontVariant");
  });

  it("never converts — that is FxAmount's job", () => {
    // The split is the whole of P1. A component that could convert would
    // eventually be handed an amount and a rate from different dates, and
    // nothing in its signature would object.
    const { container } = render(<Amount value="100.00000000" currency="USD" />);
    expect(container.textContent).toContain("100.00");
    expect(container.textContent).toContain("USD");
  });
});
