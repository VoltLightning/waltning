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

describe("C1 — thousands grouping is optional, never mandatory", () => {
  it("a bare four-digit integer — '1000' is one number, not '100'", () => {
    expect(findAmount("1000")?.amount).toBe("1000.00000000");
  });

  it("an ungrouped decimal past three integer digits — '1234.56'", () => {
    expect(findAmount("1234.56")?.amount).toBe("1234.56000000");
  });

  it("a bare five-digit integer — '12345'", () => {
    expect(findAmount("12345")?.amount).toBe("12345.00000000");
  });

  it("a correctly space-grouped amount still matches whole — '1 234.56'", () => {
    const found = findAmount("1 234.56");
    expect(found?.amount).toBe("1234.56000000");
    expect(found?.span).toEqual([0, 8]);
  });

  it("two different punctuation marks never both group — '1.234,56' reads the first as the decimal mark, per the grammar's own rule that whitespace is the one thousands separator", () => {
    // `.` is read as the decimal mark the instant it appears (the grammar's
    // stated locale rule), so this is the number `1.234` — `,56` is left
    // over, not folded in as a second thousands group.
    const found = findAmount("1.234,56");
    expect(found?.amount).toBe("1.23400000");
    expect(found?.span).toEqual([0, 5]);
  });
});

describe("L1 — a grouping chain starts from a 1–3 digit head, and only from one", () => {
  it("'1234 567 cash' reads 1234 and leaves 567 outside the amount's own span", () => {
    // The defect this closes: `\d+(?:[ ]\d{3})*` welded the two into
    // `1234567`, a figure a thousand times either of the numbers typed, with
    // nothing left over for the reader to notice.
    const found = findAmount("1234 567 cash");
    expect(found?.amount).toBe("1234.00000000");
    expect(found?.span).toEqual([0, 4]);
  });

  it("'1000 2000 cash' takes the first number only — the second is payee text, not a second thousands group", () => {
    const found = findAmount("1000 2000 cash");
    expect(found?.amount).toBe("1000.00000000");
    expect(found?.span).toEqual([0, 4]);
  });

  it("a real three-group chain still matches whole — '1 234 567'", () => {
    const found = findAmount("1 234 567");
    expect(found?.amount).toBe("1234567.00000000");
    expect(found?.span).toEqual([0, 9]);
  });
});

describe("L2 — an ISO date's digits are never the amount", () => {
  it("a leading '2026-08-10' is skipped and the money after it is found", () => {
    const found = findAmount("2026-08-10 48.90 cash coffee");
    expect(found?.amount).toBe("48.90000000");
    expect(found?.span).toEqual([11, 16]);
  });

  it("mid-line too — the minus rule alone would have read the year off '2026'", () => {
    const found = findAmount("coffee 2026-08-10 48.90 cash");
    expect(found?.amount).toBe("48.90000000");
  });

  it("a date-shaped token is a date to both readers or to neither — '9999-99-99' has no amount in it", () => {
    // `isoDateSpans` makes `findDate`'s own `accountingDate` call, so the two
    // can never disagree about which token is a date. Calendar validity is
    // `zod.ts#zAccountingDate`'s, at the contract edge — not this grammar's.
    expect(findAmount("9999-99-99")).toBeNull();
  });
});

describe("the first-number rule", () => {
  it("'2 coffees 18' binds to 2, not 18 — a known, documented cost of a grammar with no notion of 'looks like a price'", () => {
    const found = findAmount("2 coffees 18");
    expect(found?.amount).toBe("2.00000000");
    expect(found?.span).toEqual([0, 1]);
  });
});
