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
const english = readFileSync(resolve(app, "../../../packages/ui/src/i18n/en.ts"), "utf8");

describe("phone-alone preview presentation", () => {
  it("keeps the accepted Today slice visible in source", () => {
    expect(today).toContain('label: t("routes.createAccount")');
    expect(today).toContain("<CurrencyTotals subtotals={snapshot.subtotals} />");
    expect(today).toContain('title={t("shell.recent")}');
    expect(today).toContain('router.push("/quick-add")');
    // The hero is a list of subtotals, not a figure. `snapshot.total` was a
    // `money.sum` over every balance labelled USD, which only held because a
    // throw refused any account that was not in dollars.
    expect(today).not.toContain("snapshot.total");
  });

  /**
   * **The words moved; the presentation did not.** Every string here now lives
   * in `packages/ui/src/i18n/en.ts`, so this asserts the *keys* the screen
   * reaches for and `i18n.test.tsx` asserts that each key has a word in every
   * language. Asserting the English text here again would pin the copy in two
   * places and make a translation a two-file change.
   */
  it("offers exactly three appearance choices and confirms destructive reset", () => {
    expect(controls).toContain('{ value: "system", label: t("preview.system") }');
    expect(controls).toContain('{ value: "light", label: t("preview.light") }');
    expect(controls).toContain('{ value: "dark", label: t("preview.dark") }');
    // The reset is two steps and the second one is the destructive word.
    expect(controls).toContain('label={t("preview.resetAction")}');
    expect(controls).toContain('label={t("preview.resetTitle")}');
    expect(controls).toContain('title={t("preview.resetPrompt")}');
    expect(controls).toContain('title={t("preview.appearanceFailed")}');

    // …and the words themselves exist, in both languages.
    expect(english).toContain(
      'resetPrompt: "Delete every account and transaction from this phone?"',
    );
    expect(english).toContain('appearanceFailed: "Appearance could not be saved."');
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
