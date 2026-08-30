import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "../app");
const src = resolve(app, "../src");
const today = readFileSync(`${src}/today-screen.native.tsx`, "utf8");
const quickAdd = readFileSync(`${src}/quick-add-screen.native.tsx`, "utf8");
const newAccount = readFileSync(`${src}/account-creation-screen.native.tsx`, "utf8");
const controls = readFileSync(resolve(app, "../src/preview-appearance-controls.tsx"), "utf8");
const nativePlatform = readFileSync(resolve(app, "../src/platform.native.ts"), "utf8");
const phoneLedger = readFileSync(resolve(app, "../src/phone-ledger.native.ts"), "utf8");

describe("phone-alone preview presentation", () => {
  it("keeps the accepted Today slice visible in source", () => {
    expect(today).toContain('label: "Create account"');
    expect(today).toContain("<CurrencyTotals subtotals={snapshot.subtotals} />");
    expect(today).toContain('title="Recent"');
    expect(today).toContain('router.push("/quick-add")');
    // The hero is a list of subtotals, not a figure. `snapshot.total` was a
    // `money.sum` over every balance labelled USD, which only held because a
    // throw refused any account that was not in dollars.
    expect(today).not.toContain("snapshot.total");
  });

  it("offers exactly three appearance choices and confirms destructive reset", () => {
    expect(controls).toContain('{ value: "system", label: "System" }');
    expect(controls).toContain('{ value: "light", label: "Light" }');
    expect(controls).toContain('{ value: "dark", label: "Dark" }');
    expect(controls).toContain('label="Reset preview data"');
    expect(controls).toContain('label="Delete preview data"');
    expect(controls).toContain("Delete every account and transaction from this phone?");
    expect(controls).toContain("Appearance could not be saved.");
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

  it("keeps backend wiring out of the native phone-alone surface", () => {
    const nativeSurface = `${today}\n${quickAdd}\n${newAccount}\n${nativePlatform}`;
    for (const backendMarker of [
      "createApiClient",
      "resolveApiBaseUrl",
      "EXPO_PUBLIC_API_URL",
      "useAccounts",
      "useTransactions",
    ]) {
      expect(nativeSurface).not.toContain(backendMarker);
    }
  });

  it("collapses successful flows instead of leaving stale drafts behind", () => {
    expect(quickAdd).toContain('router.dismissTo("/")');
    expect(newAccount).toContain("router.dismissTo(");
  });

  it("keeps SQLite and its safety copies in Expo's project-scoped documents", () => {
    expect(phoneLedger).toContain('new Directory(Paths.document, "SQLite")');
    expect(phoneLedger).toContain(
      "databaseDirectory.create({ idempotent: true, intermediates: true })",
    );
    expect(phoneLedger).toContain("openDatabaseSync(filename, undefined, databaseDirectoryPath)");
    expect(phoneLedger).toContain("deleteDatabaseSync(path, databaseDirectoryPath)");
    expect(phoneLedger).not.toContain("decodeURIComponent");
    expect(phoneLedger).not.toContain("defaultDatabaseDirectory");
  });
});
