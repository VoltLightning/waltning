/**
 * Running a backup, and holding the key exactly as long as the screen shows it.
 *
 * **A fresh key per backup, and the app stores no copy.** §5.7 leaves the
 * Android escrow half open and rules out the obvious answer — a Keystore key
 * is non-exportable, so an export keyed from it dies with the device the
 * export existed to outlive — and iCloud Keychain, the iOS half, needs a build
 * that is not Expo Go. What is left is the honest version: the identity is
 * generated here, shown once, and dropped when the screen goes.
 *
 * **"Stores no copy" is a claim about this app, and it stops there.** Two
 * places outside it hold the key anyway, and both belong to the platform: the
 * system clipboard, if the owner copies — on iOS that relays through iCloud —
 * and the snapshot iOS takes of the screen at backgrounding. §5.7's screen
 * capture row and the launch gate's cover are the controls for the second; the
 * first is the owner's to clear. Neither is fixed by pretending otherwise, and
 * an earlier version of this comment did.
 *
 * **The key is on screen before the file leaves.** `hand` presents a share
 * sheet on a phone, so awaiting it first meant the owner could send the
 * ciphertext to iCloud Drive while its only key was still a local `const` —
 * and a back-swipe, a rejection, or the OS reclaiming the screen at that
 * moment lost the key with the file already gone. The order is: encrypt,
 * render the key, hand the file over, then say where it went.
 *
 * The cost of holding nothing is a key per file, which is the reason the
 * fingerprint exists: both carry the same six characters of the recipient — in
 * the filename and on the card — so a folder of backups and a password manager
 * full of keys can be paired without opening either.
 *
 * **The identity lives in React state and nowhere else.** Not in a ref that
 * outlives the render, not in a module-level variable, and not in the manifest
 * — `export.ts` builds that without it on purpose. Leaving the screen is what
 * forgetting looks like, which is also what the card says will happen.
 */

import { fingerprintOf, generateKeyPair } from "@waltning/core/age/keys";
import { type AccountingDate, todayAtOffset } from "@waltning/core/date";
import { errorFromThrown } from "@waltning/core/diagnostics";
import { useCallback, useRef, useState } from "react";
import { type ClientDiagnostics, clientFailure, emitClientDiagnostic } from "../diagnostics.ts";
import type { BackupHandoff, BackupManifest, BackupPort } from "./backup-port.ts";

const ACTION = { scope: "client_action", action: "export_ledger" } as const;

/** The subset of the session this needs — a parameter, so the hook is testable (`architecture/11`). */
export type BackupSession = {
  readonly exportLedger: (options: {
    readonly recipient: string;
    readonly now: Date;
    readonly random: (length: number) => Uint8Array;
    readonly verifyWith: string;
  }) => { readonly file: Uint8Array; readonly manifest: BackupManifest };
};

/**
 * The moment the backup was taken, as the device knows it.
 *
 * `offsetMinutes` rather than a bare `Date` because the filename carries a
 * **day**, and `toISOString().slice(0, 10)` is the expression `core/date.ts`
 * names as C28 by number: at 00:10 in Warsaw it files a backup under
 * yesterday. The same `capture` every write already supplies answers this.
 */
export type BackupClock = {
  readonly at: Date;
  /** Minutes east of UTC. */
  readonly offsetMinutes: number;
};

export type BackupState =
  | { readonly kind: "idle" }
  /** Reading, encrypting and reading back. One pass over the ledger, so it is brief but not instant. */
  | { readonly kind: "working" }
  | {
      readonly kind: "done";
      readonly manifest: BackupManifest;
      /** `AGE-SECRET-KEY-1…` — shown once, held here and nowhere else. */
      readonly identity: string;
      readonly fingerprint: string;
      readonly filename: string;
      /** `null` until the platform has answered — the key renders before this does. */
      readonly handoff: BackupHandoff | null;
    }
  | { readonly kind: "failed"; readonly reason: string };

export type LedgerBackup = {
  readonly state: BackupState;
  readonly run: () => void;
  /** Drops the key from state — what *Done* means on this screen. */
  readonly dismiss: () => void;
};

export function backupFilename(fingerprint: string, day: AccountingDate): string {
  // The day sorts; the fingerprint pairs it with its key.
  return `waltning-${day}-${fingerprint}.age`;
}

export function useLedgerBackup(
  session: BackupSession,
  port: BackupPort,
  clock: () => BackupClock,
  diagnostics?: ClientDiagnostics,
): LedgerBackup {
  const [state, setState] = useState<BackupState>({ kind: "idle" });
  /**
   * The state guard alone was not one: `setState` is asynchronous, so a second
   * tap in the same tick started a second export — two files, two keys, one of
   * them on screen, and an orphaned ciphertext of the whole ledger left
   * wherever the first share sheet put it.
   */
  const running = useRef(false);

  const run = useCallback(() => {
    if (running.current) return;
    running.current = true;
    setState({ kind: "working" });

    // Deliberately not awaited into the caller: the button's whole job is to
    // start this, and the state machine is how it reports.
    void (async () => {
      emitClientDiagnostic(diagnostics, { ...ACTION, phase: "start" });
      try {
        // One turn, so React commits `working` and the button's spinner is on
        // screen before a synchronous pass over the whole ledger begins. The
        // export is CPU-bound and single-threaded; without this the app looks
        // hung for exactly as long as the work takes.
        await new Promise((resolve) => setTimeout(resolve, 0));

        const { identity, recipient } = generateKeyPair(port.random);
        const { at, offsetMinutes } = clock();
        const { file, manifest } = session.exportLedger({
          recipient,
          now: at,
          random: port.random,
          verifyWith: identity,
        });

        const fingerprint = fingerprintOf(recipient);
        const filename = backupFilename(fingerprint, todayAtOffset(at, offsetMinutes));

        // The key first, and only then the file. See the header.
        setState({ kind: "done", manifest, identity, fingerprint, filename, handoff: null });
        // And one more turn, because writing the two in order is not enough:
        // React batches, so without this `hand` — which raises the share sheet
        // — runs before the commit that put the key on screen, and the
        // ordering this whole sequence exists for would hold only in the
        // source.
        await new Promise((resolve) => setTimeout(resolve, 0));

        const handoff = await port.hand(filename, file);
        emitClientDiagnostic(diagnostics, { ...ACTION, phase: "success" });
        // Only if the same backup is still on screen: a dismiss during the
        // share sheet means the key is gone, and putting a destination back
        // on a screen that has forgotten its key would be a backup nobody can
        // open, reported as one that worked.
        setState((current) =>
          current.kind === "done" && current.identity === identity
            ? { ...current, handoff }
            : current,
        );
      } catch (thrown) {
        emitClientDiagnostic(diagnostics, {
          ...ACTION,
          phase: "failure",
          error: clientFailure(thrown),
        });
        // Every message this can carry is one of ours — `age:`, `backup:`, or
        // the platform's file error — and none of them interpolate a ledger
        // value. `errorFromThrown` truncates and strips what a native error
        // might still bring with it.
        setState({ kind: "failed", reason: errorFromThrown(thrown).message });
      } finally {
        running.current = false;
      }
    })();
  }, [session, port, clock, diagnostics]);

  const dismiss = useCallback(() => setState({ kind: "idle" }), []);

  return { state, run, dismiss };
}
