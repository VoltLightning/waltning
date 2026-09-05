/**
 * `parseCapture` — Task 4 of
 * `docs/specification/screens/S05-quick-add.md` §3. The examples
 * below are the card's own: `"coffee 18 cash"`, `flows/J02-daily-capture.md`
 * and `screens/S05-quick-add.md` §3's `"48.90 cash coffee yesterday"` and
 * `"1 240,50 zł taxi Bank A wczoraj"`.
 */

import { describe, expect, it } from "vitest";
import { accountingDate } from "../date.ts";
import { type CaptureContext, parseCapture } from "./grammar.ts";

const TODAY = accountingDate("2026-09-03"); // Thursday

const CASH = { id: "acc-cash", name: "Cash", currency: "PLN", aliases: ["gotówka"] };
const BANK_A = { id: "acc-bank-a", name: "Bank A", currency: "PLN" };

const baseContext: CaptureContext = {
  accounts: [CASH, BANK_A],
  categories: [{ id: "cat-food", name: "Food" }],
  defaultAccountId: null,
  today: TODAY,
  locale: "en",
};

describe("the headline example", () => {
  it("'coffee 18 cash'", () => {
    const parsed = parseCapture("coffee 18 cash", baseContext);
    expect(parsed).toMatchObject({
      ok: true,
      amount: "18.00000000",
      accountId: "acc-cash",
      categoryId: null,
      date: "2026-09-03",
      payee: "coffee",
    });
  });
});

describe("S05's examples", () => {
  it("'48.90 cash coffee yesterday'", () => {
    const parsed = parseCapture("48.90 cash coffee yesterday", baseContext);
    expect(parsed).toMatchObject({
      ok: true,
      amount: "48.90000000",
      accountId: "acc-cash",
      date: "2026-09-02",
      payee: "coffee",
    });
  });

  it("'taxi 1 240,50 zł Bank A wczoraj'", () => {
    const parsed = parseCapture("taxi 1 240,50 zł Bank A wczoraj", baseContext);
    expect(parsed).toMatchObject({
      ok: true,
      amount: "1240.50000000",
      accountId: "acc-bank-a",
      date: "2026-09-02",
      payee: "taxi",
    });
  });
});

describe("C1 — an ungrouped amount past three digits resolves whole", () => {
  it("'1000 cash coffee'", () => {
    const parsed = parseCapture("1000 cash coffee", baseContext);
    expect(parsed).toMatchObject({ ok: true, amount: "1000.00000000", payee: "coffee" });
  });

  it("'1234.56 cash coffee'", () => {
    const parsed = parseCapture("1234.56 cash coffee", baseContext);
    expect(parsed).toMatchObject({ ok: true, amount: "1234.56000000", payee: "coffee" });
  });

  it("'12345 cash coffee'", () => {
    const parsed = parseCapture("12345 cash coffee", baseContext);
    expect(parsed).toMatchObject({ ok: true, amount: "12345.00000000", payee: "coffee" });
  });

  it("'1 234.56 cash coffee' — already grouped, still whole", () => {
    const parsed = parseCapture("1 234.56 cash coffee", baseContext);
    expect(parsed).toMatchObject({ ok: true, amount: "1234.56000000", payee: "coffee" });
  });

  it("'1.234,56 cash coffee' — two marks never both group: the first is the decimal mark", () => {
    // The grammar's own locale rule (`amount.ts`'s `NUMBER` doc): whitespace is
    // the one thousands separator, so a `.` or `,` is always the decimal mark.
    // `1.234` is the first number and the amount; `,56` is a second number
    // token the first-number rule discards, never a second thousands group.
    const parsed = parseCapture("1.234,56 cash coffee", baseContext);
    expect(parsed).toMatchObject({ ok: true, amount: "1.23400000", payee: "coffee" });
  });
});

describe("failure reasons", () => {
  it("'lunch' has no amount", () => {
    const parsed = parseCapture("lunch", baseContext);
    expect(parsed).toMatchObject({ ok: false, reason: "no_amount" });
  });

  it("'18' with no default account and no name in the text", () => {
    const parsed = parseCapture("18", baseContext);
    expect(parsed).toMatchObject({ ok: false, reason: "no_account" });
  });

  it("'18 usd cash' — cash is PLN, usd does not match", () => {
    const parsed = parseCapture("18 usd cash", baseContext);
    expect(parsed).toMatchObject({
      ok: false,
      reason: "currency_mismatch",
      partial: { accountId: "acc-cash" },
    });
  });

  it("too_much_unmatched — more than six stray tokens even with a valid amount and account", () => {
    const parsed = parseCapture("18 cash one two three four five six seven", baseContext);
    expect(parsed).toMatchObject({
      ok: false,
      reason: "too_much_unmatched",
      partial: { amount: "18.00000000", accountId: "acc-cash" },
    });
    if (!parsed.ok) {
      expect(parsed.unmatched.length).toBe(7);
    }
  });
});

describe("a default account fills in when no name is in the text", () => {
  it("resolves via defaultAccountId", () => {
    const context: CaptureContext = { ...baseContext, defaultAccountId: "acc-cash" };
    const parsed = parseCapture("18 lunch", context);
    expect(parsed).toMatchObject({ ok: true, accountId: "acc-cash", payee: "lunch" });
  });
});

describe("a category name binds too", () => {
  it("'coffee 18 cash food' — Food is bound and dropped from the payee", () => {
    const parsed = parseCapture("coffee 18 cash food", baseContext);
    expect(parsed).toMatchObject({
      ok: true,
      categoryId: "cat-food",
      payee: "coffee",
    });
  });
});
