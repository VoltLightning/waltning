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

  it("does not inspect arbitrary thrown objects", () => {
    expect(describeDiagnosticError({ accountName: "Private account" })).toEqual({
      name: "ThrownValue",
      message: "[object Object]",
    });
    expect(describeDiagnosticError("Private account")).toEqual({
      name: "ThrownValue",
      message: "[string thrown]",
    });
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
