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
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { FIT_MIN_SCALE } from "../../../tokens.ts";
import { Amount, fitScale } from "./amount";

/**
 * The group separator, **as Testing Library sees it.**
 *
 * `money.forDisplay` emits U+00A0, and the DOM holds U+00A0 — but the query's
 * normalizer collapses every `\s` before matching, and `\s` includes it. So an
 * assertion written with the real character never matches, and one written
 * with a plain space matches either character.
 *
 * Which means this file cannot pin the separator, and does not try to.
 * `money.test.ts` does — `forDisplay` is where the choice lives, and it's
 * asserted there against the raw string. What these prove is that the figure
 * arrives grouped at all.
 */
const GROUP = " ";

describe("Amount", () => {
  it("renders at the currency's own precision", () => {
    // `decimals` is a prop rather than a constant 2. Hardcoding two is correct
    // for every currency in this ledger today and wrong for JPY, and the error
    // reads as a formatting quirk.
    render(<Amount value={money.toMoney("1234.56000000")} currency="PLN" decimals={2} />);
    expect(screen.getByText(`1${GROUP}234.56`)).toBeDefined();
  });

  it("renders zero decimals when the currency has none", () => {
    render(<Amount value={money.toMoney("1500.00000000")} currency="JPY" decimals={0} />);
    expect(screen.getByText(`1${GROUP}500`)).toBeDefined();
  });

  it("does not treat negative zero as negative", () => {
    // `-0.00000000` is not a negative balance. `startsWith("-")` says it is,
    // and shows a cleared account in the ink of an overdraft.
    const { container } = render(<Amount value={money.toMoney("-0.00000000")} currency="PLN" />);
    expect(container.textContent).not.toContain("-0.00");
  });

  it("adds a leading + only when asked, and never to zero", () => {
    const { container } = render(
      <Amount value={money.toMoney("0.00000000")} currency="PLN" signed />,
    );
    expect(container.textContent).not.toContain("+");
  });

  it("shows a + on a positive when asked", () => {
    const { container } = render(
      <Amount value={money.toMoney("12.00000000")} currency="PLN" signed />,
    );
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
    const { container } = render(<Amount value={money.toMoney("1.00000000")} currency="PLN" />);
    expect(container.innerHTML).toContain("r-fontVariant");
  });

  /**
   * **A flow and a stock disagree about what a positive number means.**
   *
   * S04's list drew its day totals `kind="auto"`, so a day that cost 500
   * was red and a day that brought 666 in was plain ink — the reader is told
   * which days took from them and nothing at all about the days that paid.
   * `auto` is right for a balance, where a positive figure is what you *have*;
   * a day's total is what *came in*, and it is the same green every other
   * inflow figure in the app already draws.
   *
   * Asserted by class identity rather than by colour: `react-native-web`
   * compiles a style into an atomic class, so the value is not observable —
   * but "`net` on a positive resolves to exactly what `income` resolves to" is,
   * and it is the whole claim.
   */
  it("paints a positive net the colour income is painted, not plain ink", () => {
    const tone = (kind: "auto" | "net" | "income" | "spend" | "transfer", value: string) => {
      const { container } = render(
        <Amount value={money.toMoney(value)} currency="USD" kind={kind} />,
      );
      return container.querySelector("[class]")?.getAttribute("class") ?? "";
    };
    expect(tone("net", "666.00000000")).toBe(tone("income", "666.00000000"));
    expect(tone("net", "666.00000000")).not.toBe(tone("auto", "666.00000000"));
    // The other two ends of the rule: a day that cost money is spend, and a day
    // of transfers between your own accounts netted to nothing and is muted.
    expect(tone("net", "-500.00000000")).toBe(tone("spend", "-500.00000000"));
    expect(tone("net", "0.00000000")).toBe(tone("transfer", "0.00000000"));
  });

  it("never converts — that is FxAmount's job", () => {
    // The split is the whole of P1. A component that could convert would
    // eventually be handed an amount and a rate from different dates, and
    // nothing in its signature would object.
    const { container } = render(<Amount value={money.toMoney("100.00000000")} currency="USD" />);
    expect(container.textContent).toContain("100.00");
    expect(container.textContent).toContain("USD");
  });

  /**
   * `€` alone on its own line, under a figure that had wrapped: the mark was
   * joined to the figure by a plain space, which is a line-break opportunity.
   */
  it("joins the mark to its figure with a no-break space", () => {
    const { container } = render(<Amount value={money.toMoney("12.50")} currency="EUR" />);
    expect(container.textContent).toContain("12.50\u00a0EUR");
    expect(container.textContent).not.toContain("12.50 EUR");
  });

  it("never holds a breakable space inside a twelve-digit figure", () => {
    const { container } = render(
      <Amount value={money.toMoney("-100000000504.20")} currency="EUR" size="hero" fit />,
    );
    expect(container.textContent).not.toMatch(/\d [\d,.]/);
    expect(container.textContent).not.toMatch(/ EUR/);
  });

  it("is one line only when asked to fit", () => {
    const wide = money.toMoney("999999999999.99");
    const plain = render(<Amount value={wide} currency="EUR" />);
    expect(getComputedStyle(plain.getByText(/999/)).whiteSpace).not.toBe("nowrap");
    plain.unmount();
    const fitted = render(<Amount value={wide} currency="EUR" fit />);
    expect(getComputedStyle(fitted.getByText(/999/)).whiteSpace).toBe("nowrap");
  });

  /** A fitted figure appears once, already sized: unseen until its room is known. */
  it("hides a fitted figure until it has a width to fit, and shows it once it does", () => {
    const wide = money.toMoney("999999999999.99");
    const waiting = render(<Amount value={wide} currency="EUR" fit />);
    expect(getComputedStyle(waiting.getByText(/999/)).opacity).toBe("0");
    waiting.unmount();
    const sized = render(<Amount value={wide} currency="EUR" fit fitWidth={200} />);
    expect(getComputedStyle(sized.getByText(/999/)).opacity).not.toBe("0");
  });

  /** *Not measured* and *measured as nothing* are different: the second is drawn, at its floor. */
  it("draws a figure whose room measured as nothing", () => {
    const wide = money.toMoney("999999999999.99");
    const none = render(<Amount value={wide} currency="EUR" fit fitWidth={0} />);
    expect(getComputedStyle(none.getByText(/999/)).opacity).not.toBe("0");
    expect(fitScale("-999 999 999 999.99", "EUR", 38, 12, 0)).toBe(FIT_MIN_SCALE);
    none.unmount();
    const pending = render(<Amount value={wide} currency="EUR" fit fitWidth={null} />);
    expect(getComputedStyle(pending.getByText(/999/)).opacity).toBe("0");
  });

  describe("fitScale", () => {
    const figure = "-100 000 000 504.20";
    it("leaves a figure that already fits at full size", () => {
      expect(fitScale("-504.20", "EUR", 38, 12, 300)).toBe(1);
    });
    it("shrinks a wide figure until it is inside the width", () => {
      const scale = fitScale(figure, "EUR", 38, 12, 290);
      expect(scale).toBeLessThan(0.8);
      expect(scale).toBeGreaterThan(FIT_MIN_SCALE);
    });
    it("stops at the floor rather than shrinking without end", () => {
      expect(fitScale(figure, "EUR", 38, 12, 40)).toBe(FIT_MIN_SCALE);
    });
    it("keeps the widest figure a twelve-digit column can hold readable at 360pt", () => {
      const widest = "-999 999 999 999.99";
      expect(fitScale(widest, "EUR", 38, 12, 290)).toBeGreaterThan(FIT_MIN_SCALE);
    });
    it("does nothing before the width is known", () => {
      expect(fitScale(figure, "EUR", 38, 12, null)).toBe(1);
    });
  });
});
