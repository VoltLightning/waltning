/**
 * Putting a backup back, from the owner's side of it.
 *
 * **Two steps, and the gap between them is the point.** A restore overwrites a
 * ledger; the owner sees what is in the file — when it was taken, how many
 * entries, how many unsent captures — *before* anything is written, and says
 * yes to that rather than to a filename. `S30`'s own shape: a manifest you
 * read before the decision, not a receipt for one already made.
 *
 * **The key is typed, never remembered.** `use-ledger-backup.ts` keeps no copy
 * of the identity by design, so the only place it can come from is the owner —
 * out of a password manager, into a field. The file names its own recipient's
 * fingerprint, so a wrong key is told apart from a wrong file before either is
 * blamed.
 *
 * **Every failure here is a sentence, not a code.** This screen is reached on
 * the worst day someone has with this app, and *"age: this key does not open
 * this file"* is the difference between trying the other key and concluding
 * the ledger is gone.
 */

import { decrypt } from "@waltning/core/age/format";
import { fingerprintOf, recipientOf } from "@waltning/core/age/keys";
import type {
  BackupDocument as BackupContents,
  BackupManifest,
} from "@waltning/core/backup/contract";
import { errorFromThrown } from "@waltning/core/diagnostics";
import { useCallback, useRef, useState } from "react";
import { type ClientDiagnostics, clientFailure, emitClientDiagnostic } from "../diagnostics.ts";
import type { BackupPort } from "./backup-port.ts";

const ACTION = { scope: "client_action", action: "restore_ledger" } as const;

/** The subset of the session this needs — a parameter, so the hook is testable. */
export type RestoreSession = {
  /**
   * Reads a decrypted document and writes both stores, or throws. Structural
   * for this package's standing reason: it never imports `@waltning/ledger`.
   */
  readonly restoreLedger: (backup: BackupContents) => { readonly counts: Record<string, number> };
  /** Turns decrypted bytes into a document, throwing on anything that is not one. */
  readonly readBackup: (bytes: Uint8Array) => BackupContents;
  /** What the file says about itself, for the confirm step. */
  readonly describeBackup: (backup: BackupContents) => BackupManifest;
};

export type RestoreState =
  | { readonly kind: "idle" }
  /** A file is chosen and opened; this is what it holds, and nothing is written yet. */
  | {
      readonly kind: "ready";
      readonly filename: string;
      readonly manifest: BackupManifest;
      readonly fingerprint: string;
    }
  | { readonly kind: "working" }
  | { readonly kind: "done"; readonly counts: Readonly<Record<string, number>> }
  | { readonly kind: "failed"; readonly reason: string };

export type LedgerRestore = {
  readonly state: RestoreState;
  /** Choose a file and open it with `key`. Writes nothing. */
  readonly open: (key: string) => void;
  /** Write it. Only meaningful from `ready`. */
  readonly apply: () => void;
  readonly dismiss: () => void;
};

export function useLedgerRestore(
  session: RestoreSession,
  port: BackupPort,
  diagnostics?: ClientDiagnostics,
): LedgerRestore {
  const [state, setState] = useState<RestoreState>({ kind: "idle" });
  /** The opened document, held between the two steps and nowhere else. */
  const opened = useRef<BackupContents | null>(null);
  const running = useRef(false);

  const open = useCallback(
    (key: string) => {
      if (running.current) return;
      running.current = true;

      void (async () => {
        try {
          const picked = await port.pick();
          if (picked === null) {
            // A dismissed picker is not a failure; the screen goes back to
            // asking rather than reporting something went wrong.
            setState({ kind: "idle" });
            return;
          }

          const trimmed = key.trim();
          if (trimmed === "") {
            setState({ kind: "failed", reason: "restore: no key" });
            return;
          }

          // `recipientOf` also validates the key's checksum, so a transposed
          // character is *that is not the key* rather than a tag failure.
          const fingerprint = fingerprintOf(recipientOf(trimmed));
          const backup = session.readBackup(decrypt(picked.bytes, trimmed));
          opened.current = backup;

          setState({
            kind: "ready",
            filename: picked.name,
            manifest: session.describeBackup(backup),
            fingerprint,
          });
        } catch (thrown) {
          emitClientDiagnostic(diagnostics, {
            ...ACTION,
            phase: "failure",
            error: clientFailure(thrown),
          });
          setState({ kind: "failed", reason: errorFromThrown(thrown).message });
        } finally {
          running.current = false;
        }
      })();
    },
    [session, port, diagnostics],
  );

  const apply = useCallback(() => {
    const backup = opened.current;
    if (backup === null || running.current) return;
    running.current = true;
    setState({ kind: "working" });

    void (async () => {
      emitClientDiagnostic(diagnostics, { ...ACTION, phase: "start" });
      try {
        // One turn, so the spinner is committed before a synchronous pass over
        // the whole ledger — `use-ledger-backup.ts`'s own reason.
        await new Promise((resolve) => setTimeout(resolve, 0));
        const { counts } = session.restoreLedger(backup);
        emitClientDiagnostic(diagnostics, { ...ACTION, phase: "success" });
        setState({ kind: "done", counts });
      } catch (thrown) {
        emitClientDiagnostic(diagnostics, {
          ...ACTION,
          phase: "failure",
          error: clientFailure(thrown),
        });
        setState({ kind: "failed", reason: errorFromThrown(thrown).message });
      } finally {
        running.current = false;
        opened.current = null;
      }
    })();
  }, [session, diagnostics]);

  const dismiss = useCallback(() => {
    opened.current = null;
    setState({ kind: "idle" });
  }, []);

  return { state, open, apply, dismiss };
}
