import { describe, expect, it } from "vitest";
import { debtIntent, debtIntentOf, effectiveRole, seedKeyOf } from "./debt-intent.ts";

describe("debtIntent — §6.6, keyed by the seed key", () => {
  it.each([
    ["borrowed", "owe", false],
    ["repayment-made", "owe", true],
    ["lent-out", "owed", false],
    ["repayment-received", "owed", true],
  ] as const)("%s is a debt on the %s side (settles: %s)", (key, direction, settles) => {
    expect(debtIntent(key)).toEqual({ role: "debt", direction, settles });
  });

  it.each(["salary", "groceries", "gift-received", "refund", "constructor", "", "Borrowed"])(
    "%s is not a debt",
    (key) => {
      expect(debtIntent(key)).toBeNull();
    },
  );

  it("reads nothing from no key", () => {
    expect(debtIntent(null)).toBeNull();
    expect(debtIntent(undefined)).toBeNull();
  });

  it("reads the seed key out of the external id, and only out of a seed tag", () => {
    expect(seedKeyOf("seed:borrowed")).toBe("borrowed");
    expect(seedKeyOf("mm:borrowed")).toBeNull();
    expect(seedKeyOf(null)).toBeNull();
    expect(debtIntentOf("seed:lent-out")?.direction).toBe("owed");
    // A category a person made and named "Borrowed" carries no tag.
    expect(debtIntentOf(null)).toBeNull();
  });
});

describe("effectiveRole — the category's role is derived, the person's own is kept", () => {
  const borrowed = debtIntent("borrowed");

  it("a debt category makes the role debt", () => {
    expect(effectiveRole(null, borrowed)).toBe("debt");
  });

  it("another category takes it back: nothing chosen, nothing left", () => {
    expect(effectiveRole(null, null)).toBeNull();
  });

  it("a role chosen by hand survives every category change", () => {
    expect(effectiveRole("contribution", null)).toBe("contribution");
    expect(effectiveRole("debt", null)).toBe("debt");
  });

  it("a debt category outranks a different chosen role, and gives it back afterwards", () => {
    expect(effectiveRole("contribution", borrowed)).toBe("debt");
    expect(effectiveRole("contribution", null)).toBe("contribution");
  });
});
