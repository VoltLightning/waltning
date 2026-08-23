/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.restoreAllMocks());

async function freshDiagnostics() {
  vi.resetModules();
  return import("./diagnostics.ts");
}

describe("the Metro diagnostic sink", () => {
  it("prints one plain structured record with the complete cause", async () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { mobileDiagnostics } = await freshDiagnostics();
    output.mockClear();

    mobileDiagnostics({
      scope: "local_write",
      phase: "failure",
      boundary: "replica",
      operation: "create_account",
      seq: 1,
      error: {
        name: "DrizzleError",
        message: "Failed to run commit",
        cause: { name: "Error", message: "database is busy", code: "SQLITE_BUSY" },
      },
    });

    expect(output).toHaveBeenCalledOnce();
    const rendered = String(output.mock.calls[0]?.[0]);
    expect(rendered).not.toContain("%c");
    expect(rendered).toContain('"boundary":"replica"');
    expect(rendered).toContain('"message":"database is busy"');
    expect(rendered).toContain('"code":"SQLITE_BUSY"');
  });

  it("keeps LogTape warnings but suppresses its startup notice", async () => {
    const output = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await freshDiagnostics();

    expect(JSON.stringify(output.mock.calls)).not.toContain("LogTape loggers are configured");
  });
});
