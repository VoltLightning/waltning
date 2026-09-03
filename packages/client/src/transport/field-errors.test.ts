import { createAccountInput } from "@waltning/core/registry/inputs";
import { describe, expect, it } from "vitest";
import { fieldErrorsFromZod, mapFieldErrors } from "./field-errors.ts";

describe("mapFieldErrors", () => {
  it("puts a known path on its field and an unknown one at form level", () => {
    const map = mapFieldErrors(
      [
        { path: "name", message: "too short" },
        { path: "openingDate", message: "not a date" },
        { path: "lines.2.amount", message: "must sum" },
      ],
      ["name", "currency", "openingDate"],
    );
    expect(map.byField).toEqual({ name: ["too short"], openingDate: ["not a date"] });
    expect(map.formLevel).toEqual(["lines.2.amount: must sum"]);
  });

  it("matches the whole dotted path, never the last segment", () => {
    const map = mapFieldErrors([{ path: "lines.2.amount", message: "x" }], ["amount"]);
    expect(map.byField).toEqual({});
    expect(map.formLevel).toHaveLength(1);
  });

  it("collects several messages on one field in order", () => {
    const map = mapFieldErrors(
      [
        { path: "name", message: "too short" },
        { path: "name", message: "must be unique" },
      ],
      ["name"],
    );
    expect(map.byField).toEqual({ name: ["too short", "must be unique"] });
    expect(map.formLevel).toEqual([]);
  });
});

describe("fieldErrorsFromZod", () => {
  it("turns a ZodError's issues into dotted paths, and anything else into null", () => {
    const err = createAccountInput.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      name: "",
      currency: "PLN",
    }).error;
    expect(fieldErrorsFromZod(err)?.[0]?.path).toBe("name");
    expect(fieldErrorsFromZod(new Error("x"))).toBeNull();
  });
});
