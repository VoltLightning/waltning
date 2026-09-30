import { expect, it } from "vitest";
import { formatRate } from "./format-rate";

it("renders the storage form's dot as-is in English", () => {
  expect(formatRate("4.0231", "en")).toBe("4.0231");
});

it("renders the decimal mark as a comma in Polish — the reader it is mostly for", () => {
  expect(formatRate("4.0231", "pl")).toBe("4,0231");
});

it("holds to 4dp regardless of how many the storage string carries", () => {
  expect(formatRate("3.75560000", "en")).toBe("3.7556");
});

/** Rounded once: 8 dp and then 4 dp turned 3.768049999999 into 3.7681. */
it("rounds once, from the full-precision rate", () => {
  expect(formatRate("3.768049999999", "en")).toBe("3.7680");
  expect(formatRate("3.768049999999", "de")).toBe("3,7680");
});

it("keeps the digits past the eighth when asked for more than eight", () => {
  expect(formatRate("0.123456789012", "en", 12)).toBe("0.123456789012");
});
