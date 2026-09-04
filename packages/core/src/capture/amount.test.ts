/**
 * The amount grammar, isolated from account/category/date binding — Task 1 of
 * `docs/specification/screens/S05-quick-add.md` §3.
 */

import { describe, expect, it } from "vitest";
import { findAmount } from "./amount.ts";

describe("the headline case", () => {
  it("finds the amount in 'coffee 18 cash'", () => {
    const found = findAmount("coffee 18 cash");
    expect(found?.amount).toBe("18.00000000");
    expect(found?.span).toEqual([7, 9]);
    expect(found?.currency).toBeNull();
  });
});

describe("thousands grouping and a currency token", () => {
  it("parses '1 240,50 zł taxi' — space-grouped, comma decimal, zł currency", () => {
    const found = findAmount("1 240,50 zł taxi");
    expect(found?.amount).toBe("1240.50000000");
    expect(found?.currency).toBe("zł");
  });

  it("groups on a no-break space too", () => {
    const found = findAmount("1 240,50 zł");
    expect(found?.amount).toBe("1240.50000000");
  });

  it("does not read a four-letter account name as a currency", () => {
    // "cash" must bind as an account (`grammar.ts`), never as a currency —
    // the currency token is capped at three letters for exactly this reason.
    const found = findAmount("48.90 cash coffee");
    expect(found?.amount).toBe("48.90000000");
    expect(found?.currency).toBeNull();
  });
});

describe("decimal separators", () => {
  it("a dot decimal — '18.5'", () => {
    expect(findAmount("18.5")?.amount).toBe("18.50000000");
  });

  it("a comma decimal — '18,5'", () => {
    expect(findAmount("18,5")?.amount).toBe("18.50000000");
  });

  it("a bare fraction with no integer part — ',5' → 0.5", () => {
    const found = findAmount(",5");
    expect(found?.amount).toBe("0.50000000");
    expect(found?.span).toEqual([0, 2]);
  });
});

describe("no amount", () => {
  it("'coffee' has no number at all", () => {
    expect(findAmount("coffee")).toBeNull();
  });

  it("a bare minus refuses the match rather than reading off the sign", () => {
    // "negative is not a capture" — Task 1. The wrong implementation returns
    // 18 by simply not looking at the character before the digits.
    expect(findAmount("-18")).toBeNull();
  });
});

describe("the first-number rule", () => {
  it("'2 coffees 18' binds to 2, not 18 — a known, documented cost of a grammar with no notion of 'looks like a price'", () => {
    const found = findAmount("2 coffees 18");
    expect(found?.amount).toBe("2.00000000");
    expect(found?.span).toEqual([0, 1]);
  });
});
