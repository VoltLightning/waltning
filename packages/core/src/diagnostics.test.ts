import { describe, expect, it } from "vitest";
import { describeDiagnosticError, emitDiagnostic } from "./diagnostics.ts";

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

  it("names the shape of an object with no message, and never its values", () => {
    const described = describeDiagnosticError({ accountName: "Private account", balance: "12.00" });

    expect(described).toEqual({
      name: "ThrownValue",
      message: "[Object thrown with accountName, balance]",
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
