import { describe, expect, it } from "vitest";
import { zMoney } from "./zod.ts";

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
