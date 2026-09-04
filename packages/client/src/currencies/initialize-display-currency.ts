/**
 * Wires `initializeFromPinned` — `display-currency.ts`'s own default — to
 * `listCurrencySettings`' live `pinned` column.
 *
 * **Only ever writes the first pinned currency (M6).** Nothing pinned is
 * never "persist the pivot": `getSnapshot`'s own `value ?? pivot` fallback
 * already answers "nothing chosen yet" without writing anything, live on
 * every read. A write here would freeze on whatever the pivot happened to be
 * at that one boot, surviving a later `change_pivot`, which never touches
 * this store.
 *
 * **Hydrates first, always.** `createDevicePreference`'s own `getSnapshot`
 * reads `null` for "nothing stored" and for "haven't read the disk yet" —
 * the same value. Calling `initializeFromPinned` before `hydrate()` resolves
 * would see that `null`, write today's pinned default, and in doing so
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

  // M6 — nothing pinned is not "write the pivot". `getSnapshot`'s own
  // fallback (`value ?? pivot`) already answers "nothing chosen" live; a
  // write here would persist today's pivot and freeze the header on it
  // after a later `change_pivot`, which never touches a stored preference.
  if (pinned.length > 0) {
    displayCurrency.initializeFromPinned(pinned);
  }
}
