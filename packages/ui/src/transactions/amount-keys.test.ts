import { describe, expect, it } from "vitest";
import { applyKey, sanitizeAmount } from "./amount-keys.ts";

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

describe("sanitizeAmount — a typed string folded onto the same shape", () => {
  it("keeps digits, one mark, and the account's fraction digits", () => {
    expect(sanitizeAmount("1 240,509 zł", 2)).toBe("1240,50");
    expect(sanitizeAmount("48,90", 2)).toBe("48,90");
  });

  it("accepts either mark and writes the draft's own", () => {
    expect(sanitizeAmount("48.9", 2)).toBe("48,9");
    expect(sanitizeAmount("48,9", 2)).toBe("48,9");
  });

  /**
   * **A paste is a thousandfold error waiting to happen.** With both kinds of
   * separator in the string the last one is the mark and the other is
   * grouping; one kind repeated is grouping throughout. The first pass took
   * the first separator met as the mark and read `1,240.50` as `1,24`.
   */
  it("reads a grouped paste as the number it is", () => {
    expect(sanitizeAmount("1,240.50", 2)).toBe("1240,50");
    expect(sanitizeAmount("1.240,50", 2)).toBe("1240,50");
    expect(sanitizeAmount("1.240.500", 2)).toBe("1240500");
    expect(sanitizeAmount("1,240,500.5", 2)).toBe("1240500,5");
  });

  it("cuts the fraction for a currency with no fraction digits, never concatenating it", () => {
    expect(sanitizeAmount("1200.50", 0)).toBe("1200");
    expect(sanitizeAmount(".5", 0)).toBe("");
  });

  it("puts a zero before a leading mark and drops a leading zero before a digit", () => {
    expect(sanitizeAmount(",5", 2)).toBe("0,5");
    expect(sanitizeAmount("05", 2)).toBe("5");
    expect(sanitizeAmount("00,5", 2)).toBe("0,5");
    expect(sanitizeAmount("0", 2)).toBe("0");
  });

  it("ignores a sign and letters — the sign is the kind's, never typed", () => {
    expect(sanitizeAmount("-48,90", 2)).toBe("48,90");
    expect(sanitizeAmount("abc", 2)).toBe("");
  });

  it("is empty for an emptied field, which is the resting state", () => {
    expect(sanitizeAmount("", 2)).toBe("");
  });
});
