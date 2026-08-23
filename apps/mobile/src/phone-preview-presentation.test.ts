import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "../app");
const today = readFileSync(`${app}/index.native.tsx`, "utf8");
const quickAdd = readFileSync(`${app}/quick-add.native.tsx`, "utf8");
const newAccount = readFileSync(`${app}/account/new.native.tsx`, "utf8");

describe("phone-alone preview presentation", () => {
  it("keeps the accepted Today slice visible in source", () => {
    expect(today).toContain('label: "Create account"');
    expect(today).toContain('currency="USD"');
    expect(today).toContain('title="Recent"');
    expect(today).toContain('router.push("/quick-add")');
    expect(today).toContain("snapshot.total");
  });

  it("offers exactly three appearance choices and confirms destructive reset", () => {
    expect(today).toContain('{ value: "system", label: "System" }');
    expect(today).toContain('{ value: "light", label: "Light" }');
    expect(today).toContain('{ value: "dark", label: "Dark" }');
    expect(today).toContain('label="Reset preview data"');
    expect(today).toContain('label="Delete preview data"');
    expect(today).toContain("Delete every account and transaction from this phone?");
    expect(today).toContain("Appearance could not be saved.");
  });

  it("keeps deferred capture and dashboard affordances out", () => {
    const deferred = [
      "PeriodPicker",
      "Voice",
      "Scan",
      "Sync status",
      "Shared total",
      "FxAmount",
      "TabBar",
    ];
    for (const affordance of deferred) {
      expect(`${today}\n${quickAdd}`).not.toContain(affordance);
    }
  });

  it("collapses successful flows instead of leaving stale drafts behind", () => {
    expect(quickAdd).toContain('router.dismissTo("/")');
    expect(newAccount).toContain("router.dismissTo(");
  });
});
