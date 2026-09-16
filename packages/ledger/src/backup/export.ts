/**
 * Producing the export — and reading it back before calling it one.
 *
 * **The file is decrypted and checked against the database, not against
 * itself.** A backup nobody has opened is a hypothesis (`S30`'s own words
 * about restore drills, at the smallest scale there is). The first spelling of
 * this check compared the decrypted document's row counts with the counts of
 * the in-memory document that produced it — which proves the JSON
 * round-tripped, something the AEAD tag already proves, and would have
 * reported a complete success for a reader that silently dropped a row. So the
 * comparison is against `liveCounts`: a second, independent `SELECT count(*)`
 * per table, over both files, that never passed through the writer.
 *
 * It is a check on the bytes that are about to be written, before they are
 * handed anywhere. It does not — and cannot from here — verify what the
 * platform did with them afterwards.
 *
 * **What it does not do:** choose a key, keep one, or decide where the file
 * goes. §14.3 wants one vendor never holding both halves, so the key's
 * custody is the app's decision and the ciphertext's destination is the
 * owner's; this module is handed a recipient and hands back bytes.
 */

import { decrypt as ageDecrypt, encrypt as ageEncrypt } from "@waltning/core/age/format";
import type { RandomBytes } from "@waltning/core/age/keys";
import type { LedgerSchema } from "../open.ts";
import {
  BACKUP_FORMAT,
  BACKUP_TABLES,
  type BackupDocument,
  liveCounts,
  liveTables,
  parseBackup,
  type ReadStores,
  readBackup,
  serialiseBackup,
} from "./document.ts";

export type ExportOptions = {
  /** `age1…` — the public half. The identity never reaches this module. */
  readonly recipient: string;
  readonly now: Date;
  /** The platform's CSPRNG. `expo-crypto` on the phone; never a global read from here. */
  readonly random: RandomBytes;
  /**
   * The identity, for the read-back only.
   *
   * It is a parameter rather than something derived, because verifying with a
   * key this module computed would check that the file opens with the key it
   * just used — not that it opens with the key the owner was shown. Those are
   * the same value and different claims, and only the second one is the
   * backup's promise.
   */
  readonly verifyWith: string;
};

export type LedgerExport = {
  /** The age file — what gets written to disk and handed to the share sheet. */
  readonly file: Uint8Array;
  /** What it holds, for the screen and for the record. Never the key. */
  readonly manifest: ExportManifest;
};

export type ExportManifest = {
  readonly createdAt: string;
  readonly recipient: string;
  readonly bytes: number;
  /** Rows per table, summing to `entries` for the ones a person would call entries. */
  readonly counts: Readonly<Record<string, number>>;
  readonly transactions: number;
  /** Unsent intent — the half of the export that exists nowhere else. */
  readonly outboxEntries: number;
};

export function exportLedger<TRun, TSchema extends LedgerSchema>(
  stores: ReadStores<TRun, TSchema>,
  options: ExportOptions,
): LedgerExport {
  refuseUnknownTables(stores);

  const backup = readBackup(stores, { recipient: options.recipient, now: options.now });
  const file = ageEncrypt(serialiseBackup(backup), options.recipient, options.random);
  const readBackDocument = openAgain(file, options.verifyWith);

  againstTheDatabase(readBackDocument.counts, liveCounts(stores));

  return { file, manifest: manifestOf(readBackDocument, file.length) };
}

/**
 * A table in the file that this build's schema map has never heard of.
 *
 * It means the database was written by a newer app, and the export would
 * silently leave that table out — the one failure mode a backup must not have,
 * because nothing downstream can notice a table that was never mentioned.
 * `migrate.ts` refuses a database from the future for the same reason and in
 * the same words.
 */
function refuseUnknownTables<TRun, TSchema extends LedgerSchema>(
  stores: ReadStores<TRun, TSchema>,
): void {
  const known = new Set([...BACKUP_TABLES.replica, ...BACKUP_TABLES.outbox]);
  const extra = liveTables(stores).filter((name) => !known.has(name));
  if (extra.length > 0) {
    throw new Error(
      `backup: these files hold tables this build does not know about (${extra.join(", ")}) — a database written by a newer app. Install the newer build before exporting`,
    );
  }
}

/** The ciphertext, opened with the key the owner will be shown — never one derived here. */
function openAgain(file: Uint8Array, identity: string): BackupDocument {
  try {
    return parseBackup(ageDecrypt(file, identity), { format: BACKUP_FORMAT });
  } catch (error) {
    // `cause` keeps the underlying age or parse failure for the log while the
    // message says the thing the owner needs to know.
    throw new Error("backup: the export was written but could not be read back", { cause: error });
  }
}

/**
 * What came out of the ciphertext against what the database says it holds.
 *
 * Counts rather than deep equality: it survives a format that gains a field,
 * and every way this can go wrong — a reader that lost a row, a dropped table,
 * a write that truncated — changes one.
 */
function againstTheDatabase(
  found: Readonly<Record<string, number>>,
  live: Readonly<Record<string, number>>,
): void {
  for (const [name, count] of Object.entries(live)) {
    if (found[name] !== count) {
      throw new Error(
        `backup: ${name} holds ${count} rows and the file came back with ${found[name]}`,
      );
    }
  }
  if (Object.keys(found).length !== Object.keys(live).length) {
    throw new Error("backup: the file read back with a different set of tables");
  }
}

/** Built from the document that came **out of the file**, so it describes what was written. */
function manifestOf(backup: BackupDocument, bytes: number): ExportManifest {
  return {
    createdAt: backup.createdAt,
    recipient: backup.recipient,
    bytes,
    counts: backup.counts,
    transactions: backup.counts["transactions"] ?? 0,
    outboxEntries: backup.counts["outbox"] ?? 0,
  };
}
