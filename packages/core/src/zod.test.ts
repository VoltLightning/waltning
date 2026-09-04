import { describe, expect, it } from "vitest";
import { zMoney, zPivotPerUnit, zUnitsPerPivot } from "./zod.ts";

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
