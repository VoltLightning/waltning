/**
 * The account Quick add fills in for you, and for how long that stays fair.
 *
 * `screens/S05-quick-add.md` §9.2 (decided in this PR — the section itself
 * used to end "window length is unset; a few hours is the intent, not a
 * specification"): last-used, but only inside a **four-hour** window. Past
 * that the chip is empty and Save is disabled until someone chooses — a stale
 * default is most likely wrong exactly when the person has been somewhere
 * else since, and that is also when they are least likely to notice it.
 *
 * A device preference (`create-device-preference.ts`'s own category, `SPEC.md`
 * via `02-tokens` §2.9): stored like the appearance setting, never a registry
 * operation, never synced. `apps/mobile/src/platform.ts` is where the store
 * itself (`AsyncStorage`) is wired in — this file only knows the shape.
 */

import {
  createDevicePreference,
  type DevicePreferenceController,
  type DevicePreferenceSnapshot,
  type DevicePreferenceStore,
} from "../device/create-device-preference.ts";
import { useDevicePreference } from "../device/use-device-preference.ts";
import type { ClientDiagnostics } from "../diagnostics.ts";

/** S05 §9.2, decided: four hours, not "a few". */
export const LAST_USED_WINDOW_MS = 4 * 60 * 60 * 1000;

/** What the preference holds — the account, and when it was captured into. */
export type LastCapture = {
  accountId: string;
  /** Epoch milliseconds — a system instant, not an accounting date (§7.0a is about the other kind of time). */
  at: number;
};

function parseLastCapture(raw: string): LastCapture | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { accountId, at } = value as Record<string, unknown>;
  if (typeof accountId !== "string" || accountId === "") return null;
  if (!Number.isFinite(at)) return null;
  return { accountId, at: at as number };
}

function serializeLastCapture(capture: LastCapture): string {
  return JSON.stringify(capture);
}

/** `createDevicePreference` specialised to the last-capture shape. */
export function createLastCapturePreference(
  store: DevicePreferenceStore,
  diagnostics?: ClientDiagnostics,
): DevicePreferenceController<LastCapture> {
  return createDevicePreference(
    store,
    { parse: parseLastCapture, serialize: serializeLastCapture },
    diagnostics,
  );
}

/** The one fact a capturable account needs for this hook to consider it. */
export type LastUsedAccountCandidate = { id: string; capturable: boolean };

/**
 * The last-used account id, or `null` when the window has passed, the
 * account is gone, or nothing has been captured yet.
 *
 * **Three ways to read `null`, one behaviour.** The chip is empty and Save is
 * disabled the same way whether nothing was ever saved, the four hours ran
 * out, or the account was archived since — S05 §9.2 does not distinguish
 * them, and neither does this. `accounts` is expected to already exclude
 * archived ones (`PhoneLedgerSnapshot#accounts` does), so an archived
 * account falls out of the `find` below rather than needing its own check.
 */
export function useLastUsedAccount(
  pref: DevicePreferenceController<LastCapture>,
  now: number,
  accounts: readonly LastUsedAccountCandidate[],
): string | null {
  const snapshot: DevicePreferenceSnapshot<LastCapture> = useDevicePreference(pref);
  const value = snapshot.value;
  if (!value) return null;
  if (now - value.at >= LAST_USED_WINDOW_MS) return null;
  const account = accounts.find((candidate) => candidate.id === value.accountId);
  if (!account || !account.capturable) return null;
  return account.id;
}
