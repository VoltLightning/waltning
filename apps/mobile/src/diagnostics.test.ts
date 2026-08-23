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
    const record = JSON.parse(rendered);
    expect(rendered).not.toContain("%c");
    expect(rendered).toContain('"boundary":"replica"');
    expect(rendered).toContain('"message":"database is busy"');
    expect(rendered).toContain('"code":"SQLITE_BUSY"');
    expect(record.message).toBe("create_account failed at replica");
  });

  it("names successful events by their most specific safe identity", async () => {
    const output = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { mobileDiagnostics } = await freshDiagnostics();
    output.mockClear();

    mobileDiagnostics({ scope: "client_action", phase: "success", action: "create_account" });
    mobileDiagnostics({
      scope: "client_state",
      phase: "success",
      update: "phone_ledger_refresh",
    });
    mobileDiagnostics({
      scope: "api_request",
      phase: "response",
      requestId: "request-safe",
      method: "GET",
      path: "/trpc/accounts.list",
      status: 200,
      durationMs: 12,
    });
    mobileDiagnostics({ scope: "ledger_startup", phase: "success", stage: "ready" });
    mobileDiagnostics({ scope: "app_startup", phase: "success", component: "root" });

    const messages = output.mock.calls.map((call) => JSON.parse(String(call[0])).message);
    expect(messages).toEqual([
      "create_account completed",
      "phone_ledger_refresh completed",
      "GET /trpc/accounts.list completed",
      "ledger_startup ready completed",
      "app_startup root completed",
    ]);
  });

  it("keeps LogTape warnings but suppresses its startup notice", async () => {
    const output = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await freshDiagnostics();

    expect(JSON.stringify(output.mock.calls)).not.toContain("LogTape loggers are configured");
  });
});
