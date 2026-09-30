import { describe, expect, it } from "vitest";
import { formatAmountDraft, parseAmount } from "./amount-field";

describe("formatAmountDraft — a stored figure, seeded into a field", () => {
  it.each([
    ["en", "400.00"],
    ["de", "400,00"],
    ["pl", "400,00"],
    ["ru", "400,00"],
    ["be", "400,00"],
  ] as const)("writes eight stored decimals as two, in the %s mark", (locale, shown) => {
    expect(formatAmountDraft("400.00000000", 2, locale)).toBe(shown);
  });

  it("follows the currency's decimals, stays ungrouped, keeps the sign, and leaves empty empty", () => {
    expect(formatAmountDraft("1234567.5", 2, "de")).toBe("1234567,50");
    expect(formatAmountDraft("1234", 0, "en")).toBe("1234");
    expect(formatAmountDraft("-48.9", 2, "pl")).toBe("-48,90");
    expect(formatAmountDraft("", 2, "en")).toBe("");
  });

  it("is read back by parseAmount as the same figure", () => {
    expect(parseAmount(formatAmountDraft("400.00000000", 2, "de"))).toBe("400.00");
  });
});
