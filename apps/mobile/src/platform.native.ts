/** Native-only platform wiring for the phone-alone preview. */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAppearance } from "@waltning/client/appearance/create-appearance";
import { previewResetEnabled } from "@waltning/client/appearance/preview-reset";
import type { BackupPort } from "@waltning/client/backup/backup-port";
import { createDisplayCurrencyPreference } from "@waltning/client/currencies/display-currency";
import { createDevicePreference } from "@waltning/client/device/create-device-preference";
import { createDeskScopePreference } from "@waltning/client/ledger/desk-scope";
import {
  type AppLockAttempt,
  type AppLockEnrolment,
  createAppLock,
} from "@waltning/client/security/app-lock";
import { createLastCapturePreference } from "@waltning/client/transactions/last-capture";
import { pivotCurrency } from "@waltning/core/currencies";
import type { CurrencyCode } from "@waltning/core/money";
import {
  type FloatPosition,
  parseFloatPosition,
  serializeFloatPosition,
} from "@waltning/ui/shell/float-geometry";
import { setStringAsync } from "expo-clipboard";
import { getRandomBytes } from "expo-crypto";
import { getDocumentAsync } from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as LocalAuthentication from "expo-local-authentication";
import { getLocales } from "expo-localization";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { AppState } from "react-native";
import { mobileDiagnostics } from "./diagnostics.ts";

const APPEARANCE_KEY = "waltning.appearance";

export const appearance = createAppearance(
  {
    get: () => AsyncStorage.getItem(APPEARANCE_KEY),
    set: (preference) => AsyncStorage.setItem(APPEARANCE_KEY, preference),
  },
  mobileDiagnostics,
);

const FLOAT_POSITION_KEY = "waltning.floatPosition";

/** Where the floating add button sits on this device — §2.9's device preference. */
export const floatPosition = createDevicePreference<FloatPosition>(
  {
    get: () => AsyncStorage.getItem(FLOAT_POSITION_KEY),
    set: (value) => AsyncStorage.setItem(FLOAT_POSITION_KEY, value),
  },
  { parse: parseFloatPosition, serialize: serializeFloatPosition },
  mobileDiagnostics,
);

const DESK_SCOPE_KEY = "waltning.deskScope";

/**
 * `S01` §3's scope segment — `DeskBand` writes it, `dashboard-screen.tsx`
 * reads it. See the web half's own note: a device preference, never a
 * registry write, and the only thing the band and the widgets under
 * `<TabSlot>` can both reach.
 */
export const deskScope = createDeskScopePreference(
  {
    get: () => AsyncStorage.getItem(DESK_SCOPE_KEY),
    set: (value) => AsyncStorage.setItem(DESK_SCOPE_KEY, value),
  },
  mobileDiagnostics,
);

export const PREVIEW_RESET_ENABLED = previewResetEnabled(
  __DEV__,
  process.env["EXPO_PUBLIC_ENABLE_PREVIEW_RESET"],
);

const LAST_CAPTURE_KEY = "waltning.lastCapture";

/** D4b's last-used account, within S05 §9.2's four-hour window. */
export const lastCapture = createLastCapturePreference(
  {
    get: () => AsyncStorage.getItem(LAST_CAPTURE_KEY),
    set: (value) => AsyncStorage.setItem(LAST_CAPTURE_KEY, value),
  },
  mobileDiagnostics,
);

const DISPLAY_CURRENCY_KEY = "waltning.displayCurrency";

/**
 * H1 — the live pivot, wired by `phone-ledger.native.ts` / `phone-ledger.web.ts`
 * once their ledger session exists. This file loads first (both ledger files
 * import `displayCurrency` from here), so the reader starts as "nothing yet"
 * and is replaced exactly once `setLivePivotReader` runs — never re-imported
 * the other way, which would cycle `platform.ts` through the ledger files.
 */
let livePivotReader: () => CurrencyCode | null = () => null;

/** Called once by the phone's ledger session: `currencies.find(isPivot)` over its live snapshot. */
export function setLivePivotReader(reader: () => CurrencyCode | null): void {
  livePivotReader = reader;
}

/**
 * M2 — the same indirection as `livePivotReader`, for the ledger's write
 * notifications. `displayCurrency`'s own `subscribe` calls through this on
 * every mount, so it always reaches whatever `setLivePivotSubscriber`
 * currently holds — the real `phoneLedger.subscribe` once the ledger session
 * has wired it, a no-op before that.
 */
let livePivotSubscribe: (listener: () => void) => () => void = () => () => {};

/** Called once by the phone's ledger session: its own controller's `subscribe`, so `change_pivot` reaches a mounted display-currency consumer live. */
export function setLivePivotSubscriber(subscribe: (listener: () => void) => () => void): void {
  livePivotSubscribe = subscribe;
}

/**
 * `SPEC.md` §7.0's header toggle — a device preference, never a registry
 * write. The live pivot (`livePivotReader`) is the fallback until something
 * is chosen or `initializeFromPinned` runs; `pivotCurrency.code`
 * (`@waltning/core/currencies` — USD) is only the seed used before the
 * ledger session is ready to answer at all (H1 — a fresh install whose
 * ledger pivot is PLN must render PLN, not this build-time seed).
 */
export const displayCurrency = createDisplayCurrencyPreference(
  {
    get: () => AsyncStorage.getItem(DISPLAY_CURRENCY_KEY),
    set: (value) => AsyncStorage.setItem(DISPLAY_CURRENCY_KEY, value),
  },
  () => livePivotReader(),
  pivotCurrency.code,
  {
    subscribeToLedger: (listener) => livePivotSubscribe(listener),
    diagnostics: mobileDiagnostics,
  },
);

/**
 * §5.7's launch gate, over the device's own authentication.
 *
 * **`getEnrolledLevelAsync`, never `isEnrolledAsync`** — the spec's own
 * row: the boolean reports a PIN-protected Android as unenrolled and would
 * lock out a device that is behaving correctly. `disableDeviceFallback`
 * stays off so the passcode is the fallback, not an app PIN; and
 * `biometricsSecurityLevel: "strong"` is Android's own line in the same row.
 * The reasons the platform gives are folded onto the four the screen can
 * say something about.
 */
function enrolmentOf(level: LocalAuthentication.SecurityLevel): AppLockEnrolment {
  if (level === LocalAuthentication.SecurityLevel.NONE) return "none";
  if (level === LocalAuthentication.SecurityLevel.SECRET) return "secret";
  return "biometric";
}

function attemptOf(result: LocalAuthentication.LocalAuthenticationResult): AppLockAttempt {
  if (result.success) return { ok: true };
  switch (result.error) {
    case "user_cancel":
    case "app_cancel":
    case "system_cancel":
    // The prompt went away without a match, by the person's hand or the
    // clock's: "try again" is right, "not recognised" is not.
    case "user_fallback":
    case "timeout":
      return { ok: false, reason: "cancelled" };
    case "lockout":
      return { ok: false, reason: "lockout" };
    case "not_available":
    case "not_enrolled":
    case "passcode_not_set":
    case "no_space":
    case "invalid_context":
      return { ok: false, reason: "unavailable" };
    default:
      return { ok: false, reason: "failed" };
  }
}

export const appLock = createAppLock(
  {
    authenticator: {
      enrolment: async () => enrolmentOf(await LocalAuthentication.getEnrolledLevelAsync()),
      // `strong` where the device has strong biometrics, `weak` where it
      // has only class-2 ones: asking for `strong` on a device that cannot
      // give it is `not_available` every time, and a gate nobody can pass
      // is a lockout. The device credential is the fallback either way.
      authenticate: async (prompt) => {
        const level = await LocalAuthentication.getEnrolledLevelAsync();
        return attemptOf(
          await LocalAuthentication.authenticateAsync({
            promptMessage: prompt.message,
            // Honoured on iOS; Android draws its own negative button while
            // the device credential is the fallback.
            cancelLabel: prompt.cancel,
            disableDeviceFallback: false,
            biometricsSecurityLevel:
              level === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG ? "strong" : "weak",
          }),
        );
      },
    },
    currentAppState: () => {
      const state = AppState.currentState;
      return state === "inactive" || state === "background" ? state : "active";
    },
    subscribeAppState: (listener) => {
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active" || state === "inactive" || state === "background") listener(state);
      });
      return () => subscription.remove();
    },
    now: () => Date.now(),
  },
  mobileDiagnostics,
);

/** S05 §7: haptic on Save. `platform.ts`'s web half no-ops this same name. */
export function saveHaptic(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/**
 * The device's ordered language preferences.
 *
 * **A platform read, so it lives here** — `expo-localization` names a platform
 * and `architecture/11` says that is the whole test for this file. What it
 * returns is BCP-47 tags in the order the person set them; choosing among them
 * is `ui/i18n/locales`'s `resolveLocale`, which is pure and tested.
 *
 * Read once at module scope rather than per render: `getLocales()` is a
 * synchronous bridge call, and the system language cannot change without
 * restarting the app.
 */
export const DEVICE_LOCALES: readonly string[] = getLocales().map((locale) => locale.languageTag);

/**
 * `N`'s own hotkey — `platform.ts`'s web half. A phone has no hardware
 * keyboard listening globally the way a browser tab does (§9's "no keypad, no
 * dock" is the *desk* command bar's own web-only home,
 * `screens/S05-quick-add.md` §3), so the native build never wires this and
 * `tabs-shell.tsx`'s own `DeskCommandBar` calls the identical name for nothing.
 */
export function subscribeCommandBarHotkey(_onTrigger: () => void): () => void {
  return () => {};
}

/* ── §14.3 · the app-owned encrypted export ───────────────────────────────── */

/**
 * The three things a backup needs from a phone: unpredictable bytes, a way to
 * hand the file to its owner, and a clipboard.
 *
 * **`getRandomBytes` rather than anything reading `crypto`.** `polyfills.ts`
 * installs `randomUUID` and nothing else, so a global read would throw on the
 * device and nowhere else — the failure `random.ts` exists to stop repeating.
 *
 * **The file goes in the app's own container first, and only then to the share
 * sheet.** §5.7 keeps app data out of the system photo library and out of any
 * directory the platform shares by default; `expo-sharing` is what lets a
 * person move it deliberately instead of the OS doing it for them.
 *
 * **Cache, not documents, and one file at a time.** The ciphertext is a copy
 * the owner is expected to take elsewhere; leaving it in `Documents` would put
 * a second copy of the whole ledger inside the app forever, and — until §5.7's
 * backup-exclusion row lands, which needs a build that is ours — inside the
 * device backup too. The cache is the one directory where the OS reclaiming it
 * is the correct outcome. Each export clears the last one for the same reason:
 * a folder quietly accumulating whole-ledger ciphertexts is the opposite of
 * what this feature is for.
 */
const BACKUPS = new Directory(Paths.cache, "backups");

export const backupPort: BackupPort = {
  random: (length) => getRandomBytes(length),
  hand: async (name, bytes) => {
    // `intermediates` because the cache directory itself may be absent on a
    // cold start, and `idempotent` because it usually is not.
    BACKUPS.create({ intermediates: true, idempotent: true });
    for (const stale of BACKUPS.list()) stale.delete();

    const file = new File(BACKUPS, name);
    file.create({ overwrite: true });
    file.write(bytes);

    // A folder name, never the URI: that string is rendered on the card, and
    // a container path is both unreadable and a device identifier.
    const where = "Files · this app";
    if (!(await isAvailableAsync())) {
      // Not a failure. The file is written and confirmed; a device with no
      // share sheet is one where the owner fetches it over a cable.
      return { confirmed: true, where };
    }
    await shareAsync(file.uri, {
      mimeType: "application/octet-stream",
      dialogTitle: name,
      UTI: "public.data",
    });
    return { confirmed: true, where };
  },
  /**
   * The system picker, reading the file into memory.
   *
   * `base64` then decoded rather than a byte read: `expo-file-system` reads a
   * *path*, and a picked document's URI on Android is a content:// grant that
   * a `File` cannot open. The ciphertext is single-digit megabytes, so one
   * copy in memory is the cheaper problem.
   */
  pick: async () => {
    const result = await getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset === undefined) return null;
    const file = new File(asset.uri);
    return { name: asset.name, bytes: await file.bytes() };
  },
  /** `setStringAsync` answers whether it took it, and the card renders the answer. */
  clipboard: (value) => setStringAsync(value),
};
