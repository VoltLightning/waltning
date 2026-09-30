import { describe, expect, it } from "vitest";
import { seedNames, translatableSeedKey } from "./seed-label.ts";

describe("translatableSeedKey", () => {
  it("names the key of a seeded row that still carries its canonical name", () => {
    expect(translatableSeedKey({ name: "Salary", externalId: "seed:salary" })).toBe("salary");
    expect(translatableSeedKey({ name: "Uncategorized", externalId: "seed:uncategorized" })).toBe(
      "uncategorized",
    );
    expect(translatableSeedKey({ name: "Food", externalId: "seed:food" })).toBe("food");
  });

  it("is null once the person has renamed the row: their text is theirs", () => {
    expect(translatableSeedKey({ name: "Pay", externalId: "seed:salary" })).toBeNull();
  });

  it("is null for a row that is not a starter category, whatever it is called", () => {
    expect(translatableSeedKey({ name: "Salary", externalId: null })).toBeNull();
    expect(translatableSeedKey({ name: "Salary", externalId: undefined })).toBeNull();
    expect(translatableSeedKey({ name: "Salary", externalId: "import:42" })).toBeNull();
  });

  it("is null for a seed tag the taxonomy does not know", () => {
    expect(translatableSeedKey({ name: "Salary", externalId: "seed:nope" })).toBeNull();
  });

  it("translates again when a row is renamed back to its canonical name", () => {
    expect(translatableSeedKey({ name: "Salary", externalId: "seed:salary" })).toBe("salary");
  });

  it("knows every group, leaf and Uncategorized exactly once", () => {
    expect(seedNames.size).toBe(74);
  });
});
