/**
 * **The forced file.** Everything Expo-specific about this client, in one place.
 *
 * `architecture/11`: an app is a delivery mechanism, not a place logic lives.
 * The seam is *does this file name a platform* — and these are the only lines in
 * the client that do. `Platform.OS`, `__DEV__` and `EXPO_PUBLIC_*` exist in
 * Expo and not in Vite, which reads `import.meta.env` instead.
 *
 * An `apps/web` written tomorrow needs its own version of this file and nothing
 * else from `apps/mobile/src/`. That is the whole point: when the §14.6 fork is
 * taken, this is the size of the duplication.
 */

// The API client that used to live here — `resolveApiBaseUrl`, `createApiClient`,
// `isStaleBundle` — left with the API-reading dashboard: the browser preview
// reads its own ledger now, and the API surface returns with `#e7`. The
// helpers kept their homes and their tests in `packages/client/src/transport/`.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAppearance } from "@waltning/client/appearance/create-appearance";
import { previewResetEnabled } from "@waltning/client/appearance/preview-reset";
import { createDisplayCurrencyPreference } from "@waltning/client/currencies/display-currency";
import { createDevicePreference } from "@waltning/client/device/create-device-preference";
import { createLastCapturePreference } from "@waltning/client/transactions/last-capture";
import { pivotCurrency } from "@waltning/core/currencies";
import type { CurrencyCode } from "@waltning/core/money";
import {
  type FloatPosition,
  parseFloatPosition,
  serializeFloatPosition,
} from "@waltning/ui/shell/float-geometry";
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
 * Save's haptic — a no-op on the web build.
 *
 * `expo-haptics` names a platform the same way `expo-localization` does above:
 * its binding is native, and the web half of this seam is simply nothing —
 * pressing Save on a browser has no haptic engine to reach for. Kept as a
 * function rather than a conditional import so `quick-add-screen.tsx` calls
 * one name on every platform and never asks which build it is in.
 */
export function saveHaptic(): void {}

/**
 * The browser's ordered language preferences.
 *
 * **`navigator.languages`, not `expo-localization`** — this is the web half of
 * the seam, and the browser answers the question itself. Reaching for the Expo
 * module here would pull `expo-modules-core` into the web bundle for a value
 * the platform already has, and its native binding does not exist off-device:
 * importing it is what broke `platform.test.tsx`, the test that exists to prove
 * these platform reads are wired at all.
 *
 * Guarded because `navigator` is absent in a Node render and `languages` is
 * absent in older engines. An empty list is a real answer, and `resolveLocale`
 * falls back to English on one.
 */
export const DEVICE_LOCALES: readonly string[] =
  typeof navigator === "undefined" ? [] : [...(navigator.languages ?? [])];

/**
 * `N` focuses the desk command bar from anywhere (`screens/S05-quick-add.md`
 * §7 Web) — a global keyboard listener, which is a platform read the same way
 * `DEVICE_LOCALES` above is: `window` exists on the web build and not on a
 * phone, so this file is where the seam is named (`architecture/11`).
 * `tabs-shell.tsx`'s own `DeskCommandBar` calls this to move focus onto its own `<CommandBar>`
 * ref; it never touches `window` itself.
 *
 * **Skipped while another field already has focus.** `N` is a letter someone
 * types into the note field, the payee field, anywhere — stealing focus out
 * from under a keystroke meant for that field would be exactly the kind of
 * global shortcut this pattern is usually criticised for. `INPUT`,
 * `TEXTAREA` and `contentEditable` are the three shapes a typable field takes
 * in this bundle (`react-native-web`'s own `TextInput` renders the first two).
 *
 * **L6 — three more things a bare letter shortcut has to decide**, decided
 * here and tested in `platform.test.ts` rather than inherited:
 *
 * - **`event.repeat` is ignored.** Holding `n` down autorepeats at the OS's
 *   rate; every repeat would re-focus a bar already focused, and on a slow
 *   render that is a stream of focus moves nobody asked for. The first press
 *   is the intention.
 * - **A composition in progress is ignored** (`isComposing`, and the `229`
 *   keyCode browsers send while an IME is mid-word). Typing Japanese, Korean
 *   or Chinese produces `keydown` events whose `key` is a letter and whose
 *   meaning belongs to the IME; stealing focus mid-composition destroys the
 *   word being composed.
 * - **An open sheet or dialog swallows it.** Every sheet in this app is a
 *   `BottomSheet` → RN's `Modal`, which RNW renders as `role="dialog"` with
 *   `aria-modal` and a focus trap; a shortcut that pulled focus to a bar
 *   *behind* a modal would move focus out of that trap, which is the thing a
 *   modal exists to prevent. There is no sheet provider to read an open count
 *   from, so the DOM is asked directly: **any** `[role="dialog"]` in the
 *   document means one is open. That is deliberately wider than *"the focused
 *   element is inside a dialog"* — RNW's own focus trap can park focus on a
 *   `FocusBracket` that sits *outside* the `[role="dialog"]` node it wraps
 *   (`ModalFocusTrap` renders the brackets as siblings of `ModalContent`), so
 *   an `activeElement` test would let the hotkey through in exactly the case
 *   it exists to catch. RNW sets the role only while a `Modal` is visible, so
 *   a closed sheet leaves nothing behind.
 *
 * Guarded the same way `DEVICE_LOCALES` is: a jsdom-less render (a Node SSR
 * pass, a non-DOM test) has no `window` to attach to, and the correct answer
 * there is "the hotkey never fires," not a crash.
 */
export function subscribeCommandBarHotkey(onTrigger: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== "n" && event.key !== "N") return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.repeat) return;
    if (event.isComposing || event.keyCode === COMPOSING_KEY_CODE) return;
    const target = event.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
    }
    if (document.querySelector(DIALOG_SELECTOR) !== null) return;
    event.preventDefault();
    onTrigger();
  }

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}

/**
 * The `keydown` `keyCode` every browser sends while an IME is composing — the
 * one reliable signal in the browsers that leave `isComposing` false on the
 * first keystroke of a composition. Named because `229` alone reads like a
 * magic number.
 */
const COMPOSING_KEY_CODE = 229;

/** What an open sheet looks like in the DOM — RNW's `Modal` sets this while, and only while, it is visible. */
const DIALOG_SELECTOR = '[role="dialog"]';
