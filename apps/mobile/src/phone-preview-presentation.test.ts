import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "../app");
const src = resolve(app, "../src");
const today = readFileSync(`${src}/today-screen.tsx`, "utf8");
const quickAdd = readFileSync(`${src}/quick-add-screen.tsx`, "utf8");
const newAccount = readFileSync(`${src}/account-creation-screen.tsx`, "utf8");
const controls = readFileSync(resolve(app, "../src/preview-appearance-controls.tsx"), "utf8");
const nativePlatform = readFileSync(resolve(app, "../src/platform.native.ts"), "utf8");
const nativeLedger = readFileSync(resolve(app, "../src/phone-ledger.native.ts"), "utf8");
const webLedger = readFileSync(resolve(app, "../src/phone-ledger.web.ts"), "utf8");
const english = readFileSync(resolve(app, "../../../packages/ui/src/i18n/en.ts"), "utf8");
const tabsLayout = readFileSync(resolve(app, "(tabs)/_layout.tsx"), "utf8");
// The `+` handler and the phone/desk furniture switch (`DESK1`) moved out of
// the route file and into `tabs-shell.tsx` — see that file's own doc for why
// `(tabs)/_layout.tsx` stays the one file naming `expo-router`'s tab JSX.
const tabsShell = readFileSync(resolve(app, "../src/tabs-shell.tsx"), "utf8");

describe("phone-alone preview presentation", () => {
  it("keeps the accepted Today slice visible in source", () => {
    expect(today).toContain('label: t("routes.createAccount")');
    // C2 replaced the combined-currency `CurrencyTotals` hero with
    // `money.netWorth`'s mine/ours split, per currency — `DualTotal` stacked
    // the way `CurrencyTotals` stacked, never a summed total.
    expect(today).toContain("snapshot.netWorth.map");
    expect(today).toContain('title={t("shell.recent")}');
    // The `+` is not wired here — `(tabs)/_layout.tsx` mounts one
    // `FloatingAdd` above the whole tab slot, so it survives a tab switch
    // rather than remounting with this screen.
    expect(today).not.toContain("FloatingAdd");
    expect(tabsShell).toContain('router.push("/quick-add")');
    // The route file composes `<TabsShell>` and wires none of it itself.
    expect(tabsLayout).toContain("<TabsShell");
    expect(tabsLayout).not.toContain('router.push("/quick-add")');
    // The hero is per-currency figures, never a summed total. `snapshot.total`
    // was a `money.sum` over every balance labelled USD, which only held
    // because a throw refused any account that was not in dollars.
    expect(today).not.toContain("snapshot.total");
  });

  /**
   * **One file per route, and the data source is injected.** The screens used
   * to exist twice — a native half reading a module singleton and a web half
   * reading the API or redirecting away — which was a data-source split
   * wearing a platform costume. Now each screen reads the ledger from
   * context, and the platform variants live where the platform actually
   * differs: the two `phone-ledger` modules.
   */
  it("keeps every screen a single file reading the ledger from context", () => {
    for (const screen of [today, quickAdd, newAccount]) {
      expect(screen).toContain("useLedgerController()");
      expect(screen).not.toContain("requirePhoneLedger");
      // Subscribed, never a one-shot read: a write on a sibling route lands
      // in this screen the moment the router returns to it.
      expect(screen).toContain("usePhoneLedger(ledger)");
      expect(screen).not.toContain("getSnapshot()");
    }
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

  /**
   * `PeriodHeader` and *ours* (§3's shared total) shipped in C2 — the S04
   * hero and period row this profile always specified, so they moved out of
   * this list. `PeriodPicker` (granularity, presets, an arbitrary range)
   * stays deferred: `PeriodHeader`'s arrows step a month and nothing here
   * opens a sheet.
   */
  it("keeps deferred capture and dashboard affordances out", () => {
    const deferred = ["PeriodPicker", "Voice", "Scan", "Sync status", "FxAmount", "TabBar"];
    for (const affordance of deferred) {
      expect(`${today}\n${quickAdd}`).not.toContain(affordance);
    }
  });

  it("keeps backend wiring out of the phone-alone surface, on both platforms", () => {
    const previewSurface = `${today}\n${quickAdd}\n${newAccount}\n${nativePlatform}\n${webLedger}`;
    for (const backendMarker of [
      "createApiClient",
      "resolveApiBaseUrl",
      "EXPO_PUBLIC_API_URL",
      "useAccounts",
      "useTransactions",
    ]) {
      expect(previewSurface).not.toContain(backendMarker);
    }
  });

  it("collapses successful flows instead of leaving stale drafts behind", () => {
    expect(quickAdd).toContain('router.dismissTo("/")');
    expect(newAccount).toContain("router.dismissTo(");
  });

  it("keeps SQLite and its safety copies in Expo's project-scoped documents", () => {
    expect(nativeLedger).toContain('new Directory(Paths.document, "SQLite")');
    expect(nativeLedger).toContain(
      "databaseDirectory.create({ idempotent: true, intermediates: true })",
    );
    expect(nativeLedger).toContain("openDatabaseSync(filename, undefined, databaseDirectoryPath)");
    expect(nativeLedger).toContain("deleteDatabaseSync(path, databaseDirectoryPath)");
    expect(nativeLedger).not.toContain("decodeURIComponent");
    expect(nativeLedger).not.toContain("defaultDatabaseDirectory");
  });

  /**
   * The browser's ledger is the same engine with a different way of holding
   * files: no WAL (declared, and verified by `open.ts`), and copies through
   * the backup API because the OPFS pool hides its files from any filesystem.
   */
  it("gives the browser the same engine, declared honestly", () => {
    expect(webLedger).toContain('journalMode: "rollback"');
    expect(webLedger).toContain("backupDatabaseSync({ sourceDatabase: source");
    expect(webLedger).toContain("createLocalLedgerSession");
    expect(webLedger).toContain("PHONE_LEDGER_AVAILABLE = true");
    // The browser never reaches for a filesystem the pool does not have.
    expect(webLedger).not.toContain("expo-file-system");
  });
});
