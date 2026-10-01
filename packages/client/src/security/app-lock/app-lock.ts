/**
 * `createAppLock` — the launch gate `SPEC.md` §5.7 puts in front of the
 * ledger, as a state machine the platform feeds and the layout reads.
 *
 * **It is not a login.** The session token (E6) decides whether the phone may
 * talk to the server; this decides whether the person *holding* the phone may
 * read what it already has — every account by name, every counterparty with a
 * balance, the whole ledger with entered name text. A stolen unlocked phone is a
 * total disclosure that never touches the network, and the perimeter does
 * nothing about it. So the gate is the device's own authentication —
 * biometrics with the device passcode as the fallback, never an app PIN —
 * and there is no database key to unwrap behind it: the file is protected by
 * the platform (§5.7's file-protection row), and this is the UI's half.
 *
 * **Enrolment decides whether there is a gate at all.** A device with no
 * secret set has nothing to authenticate against, so the ledger opens — the
 * gate cannot be stronger than the device it runs on, and refusing to open
 * would lock the owner out of their own data for a setting they never chose.
 * Read from the platform's *enrolled level* and never from a bare
 * "is enrolled" boolean, which on Android reports a PIN-protected device as
 * unenrolled and would lock out a device that is behaving correctly.
 *
 * **Leaving the app covers the ledger; staying away re-locks it.** The moment
 * the app goes to the background the cover is drawn, so the app switcher's
 * snapshot is the cover and not a balance. Coming back within
 * `RELOCK_AFTER_MS` lifts the cover without asking; longer than that and the
 * ledger is locked again. The grace exists for the calculator, the camera and
 * the message that arrived mid-capture — a gate that asked on every return
 * would be a gate people learn to hate, and then to disable.
 *
 * **A cancelled prompt leaves the ledger locked, not a stale screen behind a
 * sheet.** `locked` is a state the layout renders as the whole screen; the
 * ledger's tree is not on the page until the first unlock, and after it, it
 * is under an opaque cover. Cancelling is answered with the reason and the
 * button to try again, and nothing else.
 *
 * In `packages/client` because nothing here names a platform: the
 * authenticator, the app-state feed and the clock all arrive as parameters,
 * which is also what makes every transition testable without a device.
 */

import { type ClientDiagnostics, clientFailure, emitClientDiagnostic } from "../../diagnostics.ts";

/** How long the app may be away before coming back asks again. */
export const RELOCK_AFTER_MS = 30_000;
/**
 * How long enrolment may take to answer before the gate stops waiting. A
 * platform that never answers cannot gate either, so the ledger opens — with
 * the failure on the log — rather than a blank ground standing forever.
 */
export const ENROLMENT_TIMEOUT_MS = 5_000;

/**
 * How long the stored answer (and the ledger-history probe) may take to come
 * back. **Separate from `ENROLMENT_TIMEOUT_MS` because it fails the other
 * way**: a platform that cannot say whether it is enrolled cannot gate, so the
 * ledger opens; a store that cannot say what the owner chose has not said *no*,
 * so the ledger locks.
 */
export const CHOICE_TIMEOUT_MS = 5_000;

/** What the device can ask for. `none` is a device with no secret set — nothing to gate with. */
export type AppLockEnrolment = "none" | "secret" | "biometric";

/**
 * What the device will ask of the person — the words the first-run question
 * and the Settings row use. `either` is a device that offers both a
 * fingerprint and a face, or one that cannot say which; `passcode` is a
 * device with a secret but no biometric enrolled.
 */
export type AppLockMethod = "fingerprint" | "face" | "either" | "passcode";

/** Why an attempt did not unlock — the words the screen chooses from. */
export type AppLockFailure = "cancelled" | "failed" | "lockout" | "unavailable";

export type AppLockAttempt = { ok: true } | { ok: false; reason: AppLockFailure };

/** The strings the platform's own prompt needs, in the reader's language. */
export type AppLockPrompt = { message: string; cancel: string };

export type AppLockAuthenticator = {
  enrolment: () => Promise<AppLockEnrolment>;
  authenticate: (prompt: AppLockPrompt) => Promise<AppLockAttempt>;
  /**
   * Which biometric the device offers, for the wording of the first-run
   * question. A platform that cannot say is `either`.
   */
  method?: () => Promise<AppLockMethod>;
};

/** The three states a platform reports; `inactive` is iOS's own transitional one. */
export type AppActivity = "active" | "inactive" | "background";

export type AppLockPlatform = {
  /** `null` where the platform has no device authentication to offer — the browser. */
  authenticator: AppLockAuthenticator | null;
  subscribeAppState: (listener: (state: AppActivity) => void) => () => void;
  /**
   * The **wall** clock, in milliseconds — `Date.now()`, never
   * `performance.now()`. The grace is measured across a background stay, and
   * a monotonic clock stops while the device sleeps (`mach_absolute_time`,
   * `CLOCK_MONOTONIC`): eight hours in a drawer read as the two seconds the
   * phone was awake, and the ledger opened with no prompt. A wall clock can
   * be set backwards during the same stay — so a stay that comes out
   * negative locks too, the same way a long one does.
   */
  now: () => number;
  /**
   * Where the app is right now — read when the listener is attached, so a
   * start while the app is already away (a remount in the background) counts
   * the stay from then rather than never.
   */
  currentAppState?: () => AppActivity;
  /**
   * The owner's answer to the first-run question, stored on this device and
   * never synced. **Absent, the gate is always on** where the device can gate.
   * Only a clean "nothing stored" on a device with no ledger data may ask;
   * every other reading — a failed read, a timeout, a value that is neither
   * `on` nor `off`, nothing stored beside existing ledger data — is a locked
   * gate, because an unreadable answer is not a *no*.
   */
  choice?: AppLockChoice;
};

export type AppLockChoice = {
  /** The raw stored string, `null` when nothing is stored. Rejects when the store cannot be read. */
  read: () => Promise<string | null>;
  /** Rejects when the answer could not be stored. */
  write: (enabled: boolean) => Promise<void>;
  /** Whether this device already holds ledger data — an install older than the question. */
  hasHistory: () => Promise<boolean>;
};

export type AppLockSnapshot =
  /** Enrolment not yet answered. Nothing is drawn but the blank. */
  | { status: "checking" }
  /**
   * The device can gate and the person has not been asked whether to. The
   * first-run question stands where the ledger would; no biometric is
   * requested until it is answered.
   */
  | { status: "asking"; method: AppLockMethod }
  /** No gate — no device secret, no device, or the owner chose none. */
  | { status: "open" }
  | {
      status: "locked";
      /** The platform's prompt is up; a second tap must not raise a second one. */
      prompting: boolean;
      /** The last attempt's reason, for the line under the button. */
      failure: AppLockFailure | null;
      /** Whether the ledger has been shown at all this launch — the layout mounts it only after. */
      opened: boolean;
    }
  | {
      status: "unlocked";
      /** The app is away; draw the cover so the switcher's snapshot is not a balance. */
      covered: boolean;
    };

export type AppLockController = {
  getSnapshot: () => AppLockSnapshot;
  subscribe: (listener: () => void) => () => void;
  /**
   * Reads enrolment (once) and settles on `open` or `locked`; listens to the
   * app's state until `dispose`. Safe to call again after a `dispose` — the
   * listener comes back, the enrolment read does not.
   */
  start: () => Promise<void>;
  /** Raises the platform's prompt. A no-op unless `locked` and not already prompting. */
  unlock: (prompt: AppLockPrompt) => Promise<void>;
  /** Locks now, from wherever the app is — a setting's own control, later. */
  lock: () => void;
  /**
   * The owner's answer — the first-run question's Yes / Not now, and
   * Settings' switch. Accepted only from `asking`, `open` and `unlocked`,
   * never from `locked`. Yes arms the gate and opens the ledger for this
   * launch (they have just said so; the prompt comes on the next lock).
   * **Turning a gate off asks the device first** — whoever holds an unlocked
   * phone must not be able to disarm the lock with a tap — except from a
   * fresh device that has no ledger data to protect. Resolves `false` when
   * nothing changed (refused, cancelled, or not accepted in this state).
   */
  answer: (enabled: boolean, prompt: AppLockPrompt) => Promise<boolean>;
  /** Whether the gate is on — what Settings' row says. */
  enabled: () => boolean;
  /**
   * What the device would gate with, or `null` where there is nothing to
   * gate with (no secret, or the browser) — Settings shows the switch only
   * for a device that can honour it. Settled once `start` has.
   */
  method: () => AppLockMethod | null;
  /** Stops listening to the platform. */
  dispose: () => void;
};

export function createAppLock(
  platform: AppLockPlatform,
  diagnostics?: ClientDiagnostics,
): AppLockController {
  let snapshot: AppLockSnapshot = { status: "checking" };
  let started: Promise<void> | undefined;
  let gated = false;
  // What the device can gate with; `null` until enrolment answers, and where
  // there is nothing to gate with.
  let deviceMethod: AppLockMethod | null = null;
  let opened = false;
  let hiddenAt: number | null = null;
  // Which lock a prompt was raised for: a lock by hand while the prompt is
  // up starts a new one, and the old prompt's answer describes nothing.
  let generation = 0;
  const listeners = new Set<() => void>();

  const publish = (next: AppLockSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const lockNow = (failure: AppLockFailure | null = null) => {
    hiddenAt = null;
    generation += 1;
    publish({ status: "locked", prompting: false, failure, opened });
  };

  const onAppState = (state: AppActivity) => {
    if (snapshot.status !== "unlocked") return;
    const now = platform.now();
    if (state !== "active") {
      // The first departure starts the clock; `inactive` then `background`
      // must not restart it.
      if (hiddenAt === null) hiddenAt = now;
      if (!snapshot.covered) publish({ status: "unlocked", covered: true });
      return;
    }
    if (hiddenAt !== null) {
      const away = now - hiddenAt;
      // Backwards is a clock that was set while the app was away, and a stay
      // whose length is unknown is treated as a long one.
      if (away < 0 || away >= RELOCK_AFTER_MS) {
        lockNow();
        return;
      }
    }
    hiddenAt = null;
    if (snapshot.covered) publish({ status: "unlocked", covered: false });
  };

  let unsubscribe: (() => void) | null = null;
  const listen = () => {
    if (unsubscribe !== null || !gated) return;
    unsubscribe = platform.subscribeAppState(onAppState);
    // Attached while the app is already away: the stay started now, as far
    // as this gate can know, and the cover goes up.
    const current = platform.currentAppState?.();
    if (current !== undefined && current !== "active") onAppState(current);
  };

  const arm = () => {
    gated = true;
    listen();
    lockNow();
  };

  const start = () => {
    // A second start — StrictMode's, or a remount's — reads nothing again
    // but must listen again: `dispose` took the listener with it.
    if (started) {
      listen();
      return started;
    }
    const { authenticator } = platform;
    if (authenticator === null) {
      publish({ status: "open" });
      started = Promise.resolve();
      return started;
    }
    emitClientDiagnostic(diagnostics, {
      scope: "client_state",
      update: "app_lock_enrolment",
      phase: "start",
    });
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`enrolment did not answer within ${ENROLMENT_TIMEOUT_MS}ms`)),
        ENROLMENT_TIMEOUT_MS,
      );
    });
    started = Promise.race([authenticator.enrolment(), timeout]).then(
      async (enrolment) => {
        emitClientDiagnostic(diagnostics, {
          scope: "client_state",
          update: "app_lock_enrolment",
          phase: "success",
        });
        if (enrolment === "none") {
          publish({ status: "open" });
          return;
        }
        deviceMethod = await methodOf(authenticator, enrolment);
        const { choice } = platform;
        if (choice === undefined) {
          arm();
          return;
        }
        let stored: string | null;
        try {
          stored = await within(choice.read(), CHOICE_TIMEOUT_MS);
        } catch (error) {
          // An answer that cannot be read is not a *no*.
          emitClientDiagnostic(diagnostics, {
            scope: "client_state",
            update: "app_lock_choice",
            phase: "failure",
            error: clientFailure(error),
          });
          arm();
          return;
        }
        if (stored === "off") {
          publish({ status: "open" });
          return;
        }
        if (stored === null) {
          // Nothing stored is a fresh device only if there is nothing to
          // protect: an install older than the question has a ledger and no
          // answer, and it is locked rather than asked.
          const history = await within(choice.hasHistory(), CHOICE_TIMEOUT_MS).catch(() => true);
          if (!history) {
            // Ask, and request nothing from the device until the answer is in.
            publish({ status: "asking", method: deviceMethod });
            return;
          }
        }
        // `on`, a history with no answer, or a value that is neither: locked.
        arm();
      },
      (error) => {
        // A platform that cannot say whether it is enrolled cannot gate
        // either: the ledger opens, and the failure is on the log rather
        // than in front of someone who cannot act on it.
        emitClientDiagnostic(diagnostics, {
          scope: "client_state",
          update: "app_lock_enrolment",
          phase: "failure",
          error: clientFailure(error),
        });
        publish({ status: "open" });
      },
    );
    return started;
  };

  let answering = false;
  const answer = async (enabled: boolean, prompt: AppLockPrompt): Promise<boolean> => {
    const { status } = snapshot;
    if (status !== "asking" && status !== "open" && status !== "unlocked") return false;
    if (deviceMethod === null || answering) return false;
    answering = true;
    try {
      if (!enabled) {
        const { authenticator, choice } = platform;
        // Disarming an armed gate, or a question on a device that holds
        // ledger data, is the owner's to do — so the device is asked.
        const protectsSomething =
          status === "unlocked" ||
          (status === "asking" && (await choice?.hasHistory().catch(() => true)) !== false);
        if (protectsSomething) {
          if (authenticator === null) return false;
          let attempt: AppLockAttempt;
          try {
            attempt = await authenticator.authenticate(prompt);
          } catch {
            attempt = { ok: false, reason: "unavailable" };
          }
          if (!attempt.ok) return false;
        }
      }
      // A retry before giving up: a failed write after Yes must not leave the
      // next launch to be asked again where it could have been locked.
      if (platform.choice !== undefined) {
        try {
          await platform.choice.write(enabled).catch(() => platform.choice?.write(enabled));
        } catch (error) {
          emitClientDiagnostic(diagnostics, {
            scope: "client_state",
            update: "app_lock_choice",
            phase: "failure",
            error: clientFailure(error),
          });
        }
      }
      if (enabled) {
        gated = true;
        opened = true;
        hiddenAt = null;
        listen();
        publish({ status: "unlocked", covered: false });
      } else {
        gated = false;
        unsubscribe?.();
        unsubscribe = null;
        publish({ status: "open" });
      }
      return true;
    } finally {
      answering = false;
    }
  };

  const unlock = async (prompt: AppLockPrompt) => {
    if (snapshot.status !== "locked" || snapshot.prompting) return;
    const { authenticator } = platform;
    if (authenticator === null) return;
    const raisedFor = generation;
    publish({ ...snapshot, prompting: true, failure: null });
    emitClientDiagnostic(diagnostics, { scope: "client_action", action: "unlock", phase: "start" });
    let attempt: AppLockAttempt;
    try {
      attempt = await authenticator.authenticate(prompt);
    } catch (error) {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "unlock",
        phase: "failure",
        error: clientFailure(error),
      });
      attempt = { ok: false, reason: "unavailable" };
    }
    // Locked by hand while the prompt was up: the answer no longer describes
    // anything.
    if (snapshot.status !== "locked" || raisedFor !== generation) return;
    if (attempt.ok) {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "unlock",
        phase: "success",
      });
      opened = true;
      hiddenAt = null;
      publish({ status: "unlocked", covered: false });
      return;
    }
    // `unavailable` after a gate existed is most often the device's secret
    // being removed while the app was away — enrolment is read again, and a
    // device that can no longer gate opens rather than locking its owner out
    // behind a prompt the platform will never raise.
    if (attempt.reason === "unavailable") {
      const enrolment = await authenticator.enrolment().catch(() => "none" as const);
      if (snapshot.status !== "locked" || raisedFor !== generation) return;
      if (enrolment === "none") {
        gated = false;
        unsubscribe?.();
        unsubscribe = null;
        publish({ status: "open" });
        return;
      }
    }
    publish({ status: "locked", prompting: false, failure: attempt.reason, opened });
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start,
    unlock,
    lock: () => {
      if (snapshot.status === "unlocked" || snapshot.status === "locked") lockNow();
    },
    answer,
    enabled: () => gated,
    method: () => deviceMethod,
    dispose: () => {
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}

/** `promise`, or a rejection once `ms` have passed — with the timer cleared either way. */
function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`did not answer within ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** The device's biometric, or `either` where it cannot say — the words, not the gate. */
async function methodOf(
  authenticator: AppLockAuthenticator,
  enrolment: AppLockEnrolment,
): Promise<AppLockMethod> {
  if (enrolment === "secret") return "passcode";
  try {
    return (await authenticator.method?.()) ?? "either";
  } catch {
    return "either";
  }
}
