/**
 * @vitest-environment jsdom
 *
 * `AmountField` — where the comma meets the decimal point.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n/provider";
import { AmountField, parseAmount } from "./amount-field";

function noop() {}

describe("parseAmount — comma decimal", () => {
  it("takes the separator the keyboard gives", () => {
    // Polish keyboards give `,`; numeric keypads often give `.`. Both are typed
    // in practice and both mean the same thing.
    expect(parseAmount("1234,56")).toBe("1234.56");
    expect(parseAmount("1234.56")).toBe("1234.56");
  });

  it("refuses two separators rather than guessing", () => {
    // `1.234,56` and `1,234.56` are the same characters and different numbers.
    // Guessing is how an amount gets multiplied by a thousand.
    expect(parseAmount("1.234,56")).toBeNull();
    expect(parseAmount("1,234.56")).toBeNull();
  });

  it("returns null rather than NaN for what is not an amount", () => {
    // A field returning `NaN` pushes the decision about bad input onto whoever
    // forgot to check for it.
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("-")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount(".")).toBeNull();
  });

  it("keeps a decimal string, never a number", () => {
    const parsed = parseAmount("0,10");
    expect(typeof parsed).toBe("string");
    expect(parsed).toBe("0.10");
  });

  /**
   * M3 — "5," used to normalize to "5.", a shape `zMoney` refuses (its regex
   * requires a digit after the mark once one is typed). Still mid-entry, the
   * same "not yet a number" state `"."` alone already returns `null` for.
   */
  it("refuses a trailing separator rather than a shape zMoney would reject", () => {
    expect(parseAmount("5,")).toBeNull();
    expect(parseAmount("5.")).toBeNull();
    expect(parseAmount("-5,")).toBeNull();
  });

  it("refuses a trailing separator with nothing typed after it (M1)", () => {
    // "48," and "0," are not yet amounts — `zMoney`'s own regex requires at
    // least one digit after the point, and Save must agree before the write
    // ever sees them.
    expect(parseAmount("48,")).toBeNull();
    expect(parseAmount("0,")).toBeNull();
    expect(parseAmount("48.")).toBeNull();
  });

  /**
   * M4 — a leading separator (",5") normalized to ".5", a shape `zMoney`
   * refuses (its regex requires a digit *before* the mark, `^-?\d+(\.\d+)?$`).
   * Unlike a trailing separator, this is a complete, real number as typed —
   * it belongs on the accepted side of the refusal, in the shape the
   * contract already takes.
   */
  it("accepts a leading separator, filling in the whole part (M4)", () => {
    expect(parseAmount(",5")).toBe("0.5");
    expect(parseAmount(".5")).toBe("0.5");
    expect(parseAmount("-,5")).toBe("-0.5");
    expect(parseAmount("-.5")).toBe("-0.5");
  });

  it("refuses more than twelve integer digits, matching zMoney's own refine (M1)", () => {
    expect(parseAmount("999999999999")).toBe("999999999999"); // twelve nines — the boundary itself
    expect(parseAmount("1000000000000")).toBeNull(); // thirteen digits
    expect(parseAmount("1234567890123,45")).toBeNull();
  });

  /**
   * L — the twelve-digit cap counts by *significance*, not by character:
   * `zMoney`'s own refine compares the numeric value, so a run of leading
   * zeros must not count toward the cap the way `.length` alone would.
   */
  it("does not count leading zeros toward the twelve-digit cap (L)", () => {
    expect(parseAmount("0000000000001")).toBe("0000000000001"); // 1 significant digit, 13 characters
    expect(parseAmount("00000000000000000001,50")).toBe("00000000000000000001.50");
    // Twelve significant digits, padded with a leading zero — still admitted.
    expect(parseAmount("0999999999999")).toBe("0999999999999");
    // Thirteen significant digits, once the leading zero is stripped — still refused.
    expect(parseAmount("09999999999999")).toBeNull();
  });

  it("renders with a currency affix", () => {
    render(<AmountField label="Amount" currency="PLN" onChange={noop} />);
    expect(screen.getByText("PLN")).toBeDefined();
  });
});

describe("AmountField — hero variant", () => {
  it("renders the raw typed string with the locale's decimal mark", () => {
    render(<AmountField variant="hero" label="Amount" currency="PLN" value="48,90" />);
    expect(screen.getByText("48.90")).toBeDefined();
    expect(screen.getByText("PLN")).toBeDefined();
  });

  it("follows the Polish decimal mark under the Polish locale", () => {
    render(
      <I18nProvider locale="pl">
        <AmountField variant="hero" label="Amount" currency="PLN" value="48,90" />
      </I18nProvider>,
    );
    expect(screen.getByText("48,90")).toBeDefined();
  });

  it("shows 0 at rest, never a blank hero", () => {
    render(<AmountField variant="hero" label="Amount" value="" />);
    expect(screen.getByText("0")).toBeDefined();
  });

  it("carries no affix when the currency is not yet known", () => {
    render(<AmountField variant="hero" label="Amount" value="48,90" />);
    expect(screen.queryByText("PLN")).toBeNull();
  });

  it("has no editable input — the value is read out, not typed", () => {
    render(<AmountField variant="hero" label="Amount" currency="PLN" value="48,90" />);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("carries the accessibility label once, on the Pressable, when it is tappable", () => {
    const { container } = render(
      <AmountField variant="hero" label="Amount" currency="PLN" value="48,90" onPress={noop} />,
    );
    // One name for the control, not the button and its inner View both
    // announcing "Amount: 48.90" — a screen reader would read it twice.
    const labelled = container.querySelectorAll('[aria-label="Amount: 48.90"]');
    expect(labelled).toHaveLength(1);
    expect(labelled[0]?.getAttribute("role")).toBe("button");
  });
});
