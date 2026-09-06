import { describe, expect, it } from "vitest";
import { describeDiagnosticError, emitDiagnostic, errorFromThrown } from "./diagnostics.ts";

describe("diagnostic errors", () => {
  it("keeps native cause chains and codes while removing URL queries", () => {
    const cause = Object.assign(
      new Error("fetch https://pi.example/trpc/op.write?input=private failed"),
      { code: "NETWORK_DOWN" },
    );
    const error = new Error("request wrapper failed", { cause });

    const described = describeDiagnosticError(error);

    expect(described.cause).toMatchObject({
      name: "Error",
      message: "fetch https://pi.example/trpc/op.write?[redacted] failed",
      code: "NETWORK_DOWN",
    });
    expect(JSON.stringify(described)).not.toContain("input=private");
  });

  /**
   * The web SQLite worker rejects with a plain object, and every one of them
   * used to reach the startup failure screen as `[object Object]` — the whole
   * explanation of why the ledger would not open.
   */
  it("reads the error-shaped fields of a thrown non-Error", () => {
    expect(describeDiagnosticError({ code: "SQLITE_BUSY", message: "database is locked" })).toEqual(
      {
        name: "ThrownValue",
        message: "database is locked",
        code: "SQLITE_BUSY",
      },
    );
    expect(
      describeDiagnosticError({ name: "WorkerError", message: "worker did not answer" }),
    ).toEqual({ name: "WorkerError", message: "worker did not answer" });
  });

  /** A thrown string is its own message — there is no other field it could be. */
  it("carries a thrown string through as the message", () => {
    expect(describeDiagnosticError("database is locked")).toEqual({
      name: "ThrownValue",
      message: "database is locked",
    });
    expect(describeDiagnosticError(404)).toEqual({
      name: "ThrownValue",
      message: "[number thrown: 404]",
    });
  });

  it("counts the shape of an object with no message, and never its values", () => {
    const described = describeDiagnosticError({ accountName: "Private account", balance: "12.00" });

    expect(described).toEqual({
      name: "ThrownValue",
      message: "[Object thrown with 2 field(s)]",
    });
    expect(JSON.stringify(described)).not.toContain("Private account");
    expect(JSON.stringify(described)).not.toContain("12.00");
    expect(described.message).not.toContain("[object Object]");
  });

  it("survives a null prototype and an empty object", () => {
    expect(describeDiagnosticError(Object.create(null)).message).toBe("[object thrown, no fields]");
    expect(describeDiagnosticError({}).message).toBe("[Object thrown, no fields]");
    expect(describeDiagnosticError(null).message).toBe("[null thrown]");
    expect(describeDiagnosticError(undefined).message).toBe("[undefined thrown]");
  });

  it("bounds a message that would otherwise be a transcript", () => {
    const described = describeDiagnosticError(new Error("x".repeat(1000)));

    expect(described.message).toHaveLength(301);
    expect(described.message.endsWith("…")).toBe(true);
  });

  /**
   * A dictionary keyed by data, not by schema — the one shape where a field
   * *name* is itself the ledger. A regex over key syntax passed the two-word
   * case and printed every one-word label; only a fixed list can tell them
   * apart, so the single ASCII token is the case that matters here.
   */
  it("prints a key only from the fixed list, never one derived from data", () => {
    for (const label of ["Some Counterparty", "Acme", "Zabka", "acct_1234567890"]) {
      const described = describeDiagnosticError({ [label]: "duplicate" });

      expect(described.message).toBe("[Object thrown with 1 field(s)]");
      expect(JSON.stringify(described)).not.toContain(label);
    }

    // A reportable name still prints, and what sits beside it is only counted.
    expect(describeDiagnosticError({ errno: 1, Acme: "dup" }).message).toBe(
      "[Object thrown with errno, +1 other field(s)]",
    );
    expect(describeDiagnosticError(["a", "b", "c"]).message).toBe("[Array(3) thrown]");
  });

  it("does not let a broken sink affect its caller", () => {
    expect(() =>
      emitDiagnostic(
        () => {
          throw new Error("sink failed");
        },
        { safe: true },
      ),
    ).not.toThrow();
  });
});

describe("errorFromThrown", () => {
  /**
   * The failure screen renders `error.message` and nothing else, so a message
   * that says nothing is a screen that says nothing.
   */
  it("never returns an error with an empty message", () => {
    expect(errorFromThrown(new Error("")).message).toBe("Error with no message");
    expect(errorFromThrown("").message).toBe("[empty string thrown]");
    expect(errorFromThrown({}).message).toBe("[Object thrown, no fields]");
  });

  /** `code` is often the only identifying field, and the log had it while the screen did not. */
  it("carries the code into the message the screen shows", () => {
    expect(errorFromThrown({ code: "SQLITE_BUSY" }).message).toBe(
      "[Object thrown with code] (SQLITE_BUSY)",
    );
    expect(errorFromThrown({ Acme: "dup" }).message).toBe("[Object thrown with 1 field(s)]");
    expect(errorFromThrown(Object.assign(new Error("is locked"), { code: 5 })).message).toBe(
      "is locked (5)",
    );
  });

  it("returns an error that already says everything unchanged", () => {
    const error = new Error("the pre-journal rebuild did not take");

    expect(errorFromThrown(error)).toBe(error);
  });

  it("keeps the name, and the original as the cause, when it has to restate", () => {
    const error = Object.assign(new Error("is locked"), { code: "SQLITE_BUSY" });
    error.name = "NoModificationAllowedError";

    const restated = errorFromThrown(error);

    expect(restated.name).toBe("NoModificationAllowedError");
    expect(restated.cause).toBe(error);
  });

  /**
   * The exact string the browser used to show. It cannot arrive any more —
   * the driver patch sends the worker's own `name`/`message` — but nothing
   * here should be able to produce it either.
   */
  it("never produces the string that started all this", () => {
    for (const thrown of [{ a: 1 }, {}, [], Object.create(null), "", 0]) {
      expect(errorFromThrown(thrown).message).not.toContain("[object Object]");
    }
  });
});
