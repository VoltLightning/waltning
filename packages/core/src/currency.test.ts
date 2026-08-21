/**
 * `CurrencyCode` — four columns held one, and all four were the same type as
 * `payee`.
 */

import { describe, expect, it } from "vitest";
import { currencyCode } from "./money.ts";

describe("a currency code is not any string", () => {
  it("refuses a payee", () => {
    expect(() => currencyCode("Bank A")).toThrow(/ISO 4217/);
  });

  it("refuses the wrong length or case", () => {
    expect(() => currencyCode("PL")).toThrow();
    expect(() => currencyCode("PLNN")).toThrow();
    // Lower case is refused here on purpose: `zCurrencyCode` upper-cases at the
    // request boundary, so anything reaching this constructor has been through
    // that or is a literal someone wrote by hand.
    expect(() => currencyCode("pln")).toThrow();
  });

  it("accepts a code", () => {
    expect(currencyCode("PLN")).toBe("PLN");
  });
});
