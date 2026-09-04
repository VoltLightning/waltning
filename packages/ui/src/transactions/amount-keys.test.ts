import { describe, expect, it } from "vitest";
import { applyKey } from "./amount-keys.ts";

describe("applyKey — one keypad tap folded onto the raw string", () => {
  it("appends a digit", () => {
    expect(applyKey("4", "8")).toBe("48");
  });

  it("replaces a leading zero with the next digit", () => {
    expect(applyKey("0", "5")).toBe("5");
  });

  it("lets a comma follow a leading zero rather than replacing it", () => {
    expect(applyKey("0", ",")).toBe("0,");
  });

  it("starts a value from nothing with a comma as 0,", () => {
    expect(applyKey("", ",")).toBe("0,");
  });

  it("ignores a second comma", () => {
    expect(applyKey("48,90", ",")).toBe("48,90");
  });

  it("deletes the last character", () => {
    expect(applyKey("48,9", "delete")).toBe("48,");
  });

  it("deletes down to an empty string, a real value", () => {
    expect(applyKey("0", "delete")).toBe("");
    expect(applyKey("", "delete")).toBe("");
  });

  it("caps a 2-decimal currency at two fraction digits", () => {
    expect(applyKey("48,9", "0")).toBe("48,90");
    expect(applyKey("48,90", "5")).toBe("48,90");
  });

  it("allows more fraction digits for a currency with more decimals", () => {
    expect(applyKey("1,23", "4", 4)).toBe("1,234");
    expect(applyKey("1,2345", "6", 4)).toBe("1,2345");
  });

  it("refuses every fraction digit for a zero-decimal currency", () => {
    expect(applyKey("1,", "2", 0)).toBe("1,");
    // The comma itself is unaffected by `decimals` — only the digits past it are.
    expect(applyKey("1", ",", 0)).toBe("1,");
  });

  it("builds a whole capture the way a person types it", () => {
    let raw = "";
    for (const key of ["4", "8", ",", "9", "0"] as const) raw = applyKey(raw, key);
    expect(raw).toBe("48,90");
  });
});
