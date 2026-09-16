/**
 * What a platform has to provide for a backup to leave the device.
 *
 * Three members, because three things here genuinely differ between a phone
 * and a browser and nothing else does: where unpredictable bytes come from,
 * what *handing a file to its owner* means, and whether there is a clipboard.
 * Everything between — reading both stores, building the document, encrypting,
 * checking it back against the database — is the same code on every target,
 * which is `architecture/11`'s claim applied to the one feature where getting
 * it wrong means a backup that exists on one platform.
 *
 * **Randomness is a parameter and not a global**, for the reason `random.ts`
 * gives: the phone has no `crypto` global beyond the `randomUUID`
 * `polyfills.ts` installs, so anything reaching for `getRandomValues` — here or
 * inside a dependency — throws on the device and nowhere else.
 */

import type { RandomBytes } from "@waltning/core/age/keys";

export type BackupPort = {
  /** The platform's CSPRNG. `expo-crypto` on the phone, `crypto.getRandomValues` in a browser. */
  readonly random: RandomBytes;
  /**
   * Put the file where its owner can take it.
   *
   * On a phone that is the app's own container plus the share sheet; in a
   * browser it is a download. **It resolves once the platform has been asked**,
   * not once the owner has finished deciding where to send it: a share sheet
   * someone dismisses is not a failed backup, and a screen that waited for a
   * destination would report one.
   */
  readonly hand: (name: string, bytes: Uint8Array) => Promise<BackupHandoff>;
  /**
   * The system clipboard, or `null` where this platform has none.
   *
   * `null` rather than a function that quietly does nothing: the card hides
   * the copy affordance when it is absent, and the key stays selectable. A
   * copy button that fails silently is worse than no copy button when the
   * string it would have taken has no second copy anywhere — and on the web a
   * page served over plain HTTP has no `navigator.clipboard` at all.
   *
   * Resolves `false` when the platform refused; the card says so rather than
   * rendering success and failure identically.
   */
  readonly clipboard: ((value: string) => Promise<boolean>) | null;
};

/**
 * What an export's shape is, once it has been made.
 *
 * **Structural rather than imported from `@waltning/ledger`**, which is this
 * package's standing rule — `create-phone-ledger.ts` declares `PhoneCurrency`
 * and its neighbours the same way and for the same reason: a client that
 * imports the SQLite engine to name a type has taken a dependency on the
 * engine, and a browser bundle would carry it. It mirrors `ExportManifest`
 * field for field.
 */
export type BackupManifest = {
  readonly createdAt: string;
  readonly recipient: string;
  readonly bytes: number;
  readonly counts: Readonly<Record<string, number>>;
  readonly transactions: number;
  readonly outboxEntries: number;
};

export type BackupHandoff = {
  /**
   * Whether the platform confirmed the file exists.
   *
   * True on a phone, which writes it and gets an error if it cannot. **False
   * in a browser**, which is handed a download and never says what became of
   * it — a blocked pop-up, a full disk and a saved file are indistinguishable
   * from the page. Reporting `true` there claimed a landing nothing observed,
   * and the screen said *Backed up* over a file that might not exist.
   */
  readonly confirmed: boolean;
  /** Where it landed, in words a person can act on — a folder name, never a URI. */
  readonly where: string;
};
