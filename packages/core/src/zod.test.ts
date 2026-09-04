import { describe, expect, it } from "vitest";
import { zAccountingDate, zFee, zMoney, zPivotPerUnit, zUnitsPerPivot } from "./zod.ts";

describe("zMoney", () => {
  it("accepts the largest numeric(20,8) magnitude", () => {
    expect(zMoney.parse("999999999999.99999999")).toBe("999999999999.99999999");
    expect(zMoney.parse("-999999999999.99999999")).toBe("-999999999999.99999999");
  });

  it.each(["1000000000000", "-1000000000000", "999999999999.999999999"])(
    "rejects %s after storage-scale rounding would overflow numeric(20,8)",
    (value) => {
      expect(zMoney.safeParse(value).success).toBe(false);
    },
  );
});

describe("zFee (M2)", () => {
  it("accepts a positive fee", () => {
    expect(zFee.parse("5.00")).toBe("5.00000000");
  });

  it("refuses a negative fee — a fee is never a rebate wearing the wrong sign", () => {
    const result = zFee.safeParse("-5.00");
    expect(result.success).toBe(false);
    expect(result.success ? undefined : result.error.issues[0]?.message).toContain(
      "greater than zero",
    );
  });

  /**
   * M2 — `transactions_fee_positive` is `fee > 0`, strictly: "no fee" is
   * `NULL`, never a typed `0`. A caller meaning "no fee" omits the field.
   */
  it("refuses a zero fee", () => {
    const result = zFee.safeParse("0");
    expect(result.success).toBe(false);
    expect(result.success ? undefined : result.error.issues[0]?.message).toContain(
      "greater than zero",
    );
  });

  /**
   * M2 — a genuinely negative fee that rounds to `"-0.00000000"` at storage
   * scale used to read as non-negative (`dec("-0.00000000").gte(0)` is
   * `true`), admitting it. Checked on the original string, before rounding.
   */
  it("refuses a fee that is negative before rounding, even once rounding would erase the sign", () => {
    const result = zFee.safeParse("-0.0000000001");
    expect(result.success).toBe(false);
  });

  /**
   * M2 — the opposite direction: a tiny positive fee that rounds *down* to
   * exactly zero at `numeric(20,8)` is "no fee" wearing a fee's own field,
   * checked again after `zMoney`'s own rounding.
   */
  it("refuses a fee that rounds down to zero at storage scale", () => {
    const result = zFee.safeParse("0.000000001");
    expect(result.success).toBe(false);
  });
});

describe("zUnitsPerPivot", () => {
  // BLOCKER — a zero or negative rate makes `toPivotByDivision` divide by
  // zero (or flip the sign), and `Infinity` branded as `Money` reaches a
  // screen. Refused at the contract, not downstream.
  it.each(["0", "-1", "0.0"])("refuses %s — a rate must be strictly positive", (value) => {
    const result = zUnitsPerPivot.safeParse(value);

    expect(result.success).toBe(false);
    expect(result.success ? undefined : result.error.issues[0]?.message).toContain(
      "units per pivot",
    );
  });

  it("accepts the smallest positive rate", () => {
    expect(zUnitsPerPivot.parse("0.000000000001")).toBe("0.000000000001");
  });
});

describe("zPivotPerUnit", () => {
  // The reciprocal brand has the same hole: `fxRate`/`toFxRate` on
  // `createTransactionInput` are `zPivotPerUnit`, and a zero or negative
  // value there is just as nonsensical a rate.
  it.each(["0", "-1", "0.0"])("refuses %s — a rate must be strictly positive", (value) => {
    const result = zPivotPerUnit.safeParse(value);

    expect(result.success).toBe(false);
    expect(result.success ? undefined : result.error.issues[0]?.message).toContain(
      "pivot per unit",
    );
  });

  it("accepts the smallest positive rate", () => {
    expect(zPivotPerUnit.parse("0.000000000001")).toBe("0.000000000001");
  });
});

describe("zAccountingDate — M3, a real calendar day, not only the shape", () => {
  it("accepts an ordinary date and a leap day", () => {
    expect(zAccountingDate.parse("2026-03-12")).toBe("2026-03-12");
    expect(zAccountingDate.parse("2024-02-29")).toBe("2024-02-29");
  });

  it.each(["2026-02-31", "2026-02-30", "2026-04-31", "2026-13-01", "2026-00-01", "2023-02-29"])(
    "refuses %s — the shape matches and the day is not real",
    (value) => {
      const result = zAccountingDate.safeParse(value);
      expect(result.success).toBe(false);
      expect(result.success ? undefined : result.error.issues[0]?.message).toContain(
        "not a real calendar date",
      );
    },
  );
});
