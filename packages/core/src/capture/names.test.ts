/**
 * Name matching — Task 2 of
 * `docs/specification/screens/S05-quick-add.md` §3.
 */

import { describe, expect, it } from "vitest";
import { findName, fold } from "./names.ts";

describe("fold", () => {
  it("lowercases and strips the Polish diacritics this product uses", () => {
    expect(fold("Bank A")).toBe("bank a");
    expect(fold("gotówka")).toBe("gotowka");
    expect(fold("Łódź")).toBe("lodz");
  });
});

describe("longest match wins", () => {
  const bankA = { id: "acc-bank-a", name: "Bank A" };
  const bank = { id: "acc-bank", name: "Bank" };

  it("'Bank A' matches over 'Bank' when both are candidates", () => {
    const found = findName("taxi Bank A wczoraj", [bank, bankA], []);
    expect(found?.value.id).toBe("acc-bank-a");
  });

  it("finds the shorter candidate on its own", () => {
    const found = findName("taxi Bank wczoraj", [bank, bankA], []);
    expect(found?.value.id).toBe("acc-bank");
  });
});

describe("aliases", () => {
  it("'gotówka' alias matches Cash", () => {
    const cash = { id: "acc-cash", name: "Cash", aliases: ["gotówka"] };
    const found = findName("18 gotówka", [cash], []);
    expect(found?.value.id).toBe("acc-cash");
  });
});

describe("exclude spans", () => {
  const cash = { id: "acc-cash", name: "Cash" };

  it("a match fully inside an excluded span is refused — in `grammar.ts` this is the amount's span", () => {
    const text = "Cash desk";
    const found = findName(text, [cash], [[0, 4]]);
    expect(found).toBeNull();
  });

  it("a later, non-excluded occurrence is still found", () => {
    const text = "Cash desk Cash";
    const found = findName(text, [cash], [[0, 4]]);
    expect(found?.span).toEqual([10, 14]);
  });
});

describe("no match", () => {
  it("returns null when nothing in the text matches any candidate", () => {
    expect(findName("lunch", [{ id: "acc-cash", name: "Cash" }], [])).toBeNull();
  });

  it("does not match a substring inside a longer word", () => {
    // "cash" must not match inside "cashier" — word-boundary anchored.
    expect(findName("cashier", [{ id: "acc-cash", name: "Cash" }], [])).toBeNull();
  });
});
