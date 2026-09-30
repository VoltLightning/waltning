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

/** The one account that can take a row, or `null` when there are none or several. */
export function soleEligibleAccount(accounts: readonly DefaultAccountCandidate[]): string | null {
  const eligible = accounts.filter((account) => account.capturable && account.archived !== true);
  const [only, ...rest] = eligible;
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
