/**
 * What a backup *is* — the document's shape, named once.
 *
 * `packages/ledger` writes and reads it, `packages/client` carries one between
 * the two steps of a restore, and `packages/ui` renders what it says about
 * itself. Three packages, and none of them may import the others: `ledger` is
 * the engine, `client` must never depend on it (a browser bundle would carry
 * SQLite), and `ui` depends on neither.
 *
 * So the shape lives in the floor. It is a **wire format** — a thing written
 * to a file today and read by a different build of this app in a year — which
 * is exactly what `protocol.ts` makes core's business.
 *
 * It was mirrored by hand in `client` first, with a compile-time assertion
 * pinning the copy to the original. That works and is what this package
 * already does for `PhoneCurrency` and its neighbours — but those mirror types
 * that genuinely belong to the engine. A backup's shape belongs to no single
 * package, and a type nobody owns is the one that drifts.
 */

/**
 * A row as it travels: column name to value, exactly as SQLite returned it.
 *
 * Mutable, and that is SQLite's answer rather than a choice — a row comes back
 * from `SELECT *` as a plain object, and freezing it would buy nothing a
 * reader of this file does not already have.
 */
export type BackupRow = Record<string, string | number | null>;

export type BackupDocument = {
  /** The literal `"waltning-ledger"`, so a wrong file is named as one before anything is parsed. */
  readonly kind: "waltning-ledger";
  readonly format: number;
  /** When the export ran, in UTC. Not an accounting date — this one is a timestamp. */
  readonly createdAt: string;
  /** `PRAGMA user_version` of each store, so a restore can refuse a backup from a newer build. */
  readonly schema: { readonly replica: number; readonly outbox: number };
  /** Which key opens this file, restated in the plaintext so a restore can say *this is not yours*. */
  readonly recipient: string;
  /** Row counts per table, written before the rows and checked against them on restore. */
  readonly counts: Readonly<Record<string, number>>;
  readonly replica: Readonly<Record<string, readonly BackupRow[]>>;
  readonly outbox: Readonly<Record<string, readonly BackupRow[]>>;
};

/**
 * What a document says about itself — shown before a restore writes anything,
 * and after an export has written something. Never the key.
 */
export type BackupManifest = {
  readonly createdAt: string;
  readonly recipient: string;
  readonly bytes: number;
  readonly counts: Readonly<Record<string, number>>;
  readonly transactions: number;
  /** Unsent intent — the half of a backup that exists nowhere else. */
  readonly outboxEntries: number;
};
