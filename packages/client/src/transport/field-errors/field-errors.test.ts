import { createAccountInput, createTransactionInput } from "@waltning/core/registry/inputs";
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

  /**
   * S09's own case: `update_transaction`'s stale-version refusal names no
   * field (`refusalFromThrow` in `create-phone-ledger.ts` sends `path: ""`),
   * so it prints bare — never `": the row moved"` with a leading colon.
   */
  it("prints an empty path's message bare, with no leading colon", () => {
    const map = mapFieldErrors(
      [{ path: "", message: "the row moved under the writer" }],
      ["payee", "date"],
    );
    expect(map.formLevel).toEqual(["the row moved under the writer"]);
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

  /**
   * L-b — `zAccountingDate`'s calendar refusal is the one issue this carries
   * a catalogue key for, because the command bar's input is free text and
   * `2026-02-31` is a line a person will send. Zod's English literal survives
   * beside it as `message`; the key is what lets a screen say it in Polish.
   */
  it("tags a calendar-invalid date with transactions.badDate, and nothing else", () => {
    const bad = createTransactionInput.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      date: "2026-02-31",
      type: "expense",
      accountId: "22222222-2222-4222-8222-222222222222",
      amountOriginal: "48.90",
      currency: "PLN",
      payee: "coffee",
    }).error;
    const errors = fieldErrorsFromZod(bad);
    expect(errors).toEqual([
      { path: "date", message: "not a real calendar date", messageKey: "transactions.badDate" },
    ]);
  });

  it("a shape refusal on the same field keeps Zod's own text — the key is the calendar's alone", () => {
    const bad = createTransactionInput.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      date: "nope",
      type: "expense",
      accountId: "22222222-2222-4222-8222-222222222222",
      amountOriginal: "48.90",
      currency: "PLN",
      payee: "coffee",
    }).error;
    const shape = fieldErrorsFromZod(bad)?.find((error) => error.messageKey === undefined);
    expect(shape?.path).toBe("date");
    expect(shape?.message).toContain("YYYY-MM-DD");
  });

  it("another field's own refusal is never tagged", () => {
    const err = createAccountInput.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      name: "",
      currency: "PLN",
    }).error;
    expect(fieldErrorsFromZod(err)?.every((error) => error.messageKey === undefined)).toBe(true);
  });
});
