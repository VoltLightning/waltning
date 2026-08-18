/**
 * @vitest-environment jsdom
 *
 * `AmountField` — where the comma meets the decimal point.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AmountField, parseAmount } from "./amount-field";

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

  it("renders with a currency affix", () => {
    render(<AmountField label="Amount" currency="PLN" onChange={() => undefined} />);
    expect(screen.getByText("PLN")).toBeDefined();
  });
});
