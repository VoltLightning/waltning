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
