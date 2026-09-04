/**
 * Wires `initializeFromPinned` — `display-currency.ts`'s own default,
 * previously never called from anywhere real. `apps/mobile/src/platform.ts`
 * seeds `createDisplayCurrencyPreference` with the bootstrap constant
 * (`pivotCurrency.code`, USD) as its fallback — correct only until the first
 * device that runs `change_pivot`, after which a fresh install of the same
 * ledger would default to the wrong currency forever, because the seed
 * constant never learns the pivot changed.
 *
 * **§7.0's own default, from the live reader**: the first pinned currency,
 * else the live pivot — `listCurrencySettings`' own `pinned`/`isPivot`
 * columns, not the constant `platform.ts` was built with.
 *
 * **Hydrates first, always.** `createDevicePreference`'s own `getSnapshot`
 * reads `null` for "nothing stored" and for "haven't read the disk yet" —
 * the same value. Calling `initializeFromPinned` before `hydrate()` resolves
 * would see that `null`, write today's pinned/pivot default, and in doing so
 * bump the preference's generation — which makes the *real* stored choice,
 * still in flight from disk, arrive too late to ever apply
 * (`create-device-preference.ts`'s own `generationAtRead` guard). Awaiting
 * `hydrate()` first is what keeps a stored choice from being silently
 * overwritten by this default.
 */

import type { CurrencyCode } from "@waltning/core/money";
import type { DisplayCurrencyController } from "./display-currency.ts";

export type PinnableCurrencyRow = { code: CurrencyCode; pinned: boolean; isPivot: boolean };

export async function initializeDisplayCurrencyFromLedger(
  displayCurrency: DisplayCurrencyController,
  listCurrencySettings: () => readonly PinnableCurrencyRow[],
): Promise<void> {
  await displayCurrency.hydrate();

  const settings = listCurrencySettings();
  const pinned = settings.filter((row) => row.pinned).map((row) => row.code);
  const pivot = settings.find((row) => row.isPivot);

  displayCurrency.initializeFromPinned(pivot ? [...pinned, pivot.code] : pinned);
}
