/**
 * The account Quick add fills in before anyone has chosen one.
 *
 * `screens/S05-quick-add.md` §9.2: the **last-used** account fills the row
 * inside its four-hour window (`useLastUsedAccount`). When that rule names
 * nothing — a fresh ledger, or a gap longer than the window — and **exactly one**
 * account can take the row, that account fills it instead. With one account
 * there is nothing to choose between, so the row is not a question; with two
 * it stays empty, because a guess between them is the stale default the window
 * exists to prevent.
 *
 * Either way the row is machine-filled: it says so in its label, and one tap
 * changes it.
 */

import type { DevicePreferenceController } from "../../device/create-device-preference/create-device-preference.ts";
import {
  type LastCapture,
  type LastUsedAccountCandidate,
  useLastUsedAccount,
} from "../last-capture/last-capture.ts";

/** What this rule needs to know about an account. */
export type DefaultAccountCandidate = LastUsedAccountCandidate & {
  /** An archived account takes no new rows; absent counts as live. */
  archived?: boolean;
};

/**
 * The one account the picker would offer, or `null` when there are none or
 * several.
 *
 * **Every live account counts, rated or not.** Whether an account can take a
 * row today (`capturable` — its currency has a rate) is a separate question
 * the needs-rate banner and Save's gate already answer; counting only rated
 * accounts would fill a pivot-currency account whenever a foreign one lacks a
 * rate, and a purchase in the foreign currency would be saved against it.
 * `archived` cannot be true from the screen (the snapshot's account list
 * already leaves archived ones out); it is checked so the rule stands alone.
 */
export function soleEligibleAccount(accounts: readonly DefaultAccountCandidate[]): string | null {
  const live = accounts.filter((account) => account.archived !== true);
  const [only, ...rest] = live;
  return only !== undefined && rest.length === 0 ? only.id : null;
}

/** The account to fill with, or `null` when the row should stay a question. */
export function useDefaultAccount(
  pref: DevicePreferenceController<LastCapture>,
  now: number,
  accounts: readonly DefaultAccountCandidate[],
): string | null {
  const lastUsed = useLastUsedAccount(pref, now, accounts);
  return lastUsed ?? soleEligibleAccount(accounts);
}
