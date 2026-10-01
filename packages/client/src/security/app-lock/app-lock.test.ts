import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AppActivity,
  type AppLockAttempt,
  type AppLockEnrolment,
  type AppLockPrompt,
  createAppLock,
  ENROLMENT_TIMEOUT_MS,
  RELOCK_AFTER_MS,
} from "./app-lock.ts";

afterEach(() => {
  vi.useRealTimers();
});

const PROMPT = { message: "Unlock", cancel: "Cancel" };

/** A device whose answers are scripted, and whose app-state feed is a function the test calls. */
function device(enrolment: AppLockEnrolment, attempts: readonly AppLockAttempt[] = [{ ok: true }]) {
  let clock = 0;
  let listener: ((state: AppActivity) => void) | null = null;
  const queue = [...attempts];
  const authenticate = vi.fn(
    async (_prompt: AppLockPrompt): Promise<AppLockAttempt> => queue.shift() ?? { ok: true },
  );
  const lock = createAppLock({
    authenticator: { enrolment: async () => enrolment, authenticate },
    subscribeAppState: (next) => {
      listener = next;
      return () => {
        listener = null;
      };
    },
    now: () => clock,
  });
  return {
    lock,
    authenticate,
    go: (state: AppActivity) => listener?.(state),
    tick: (ms: number) => {
      clock += ms;
    },
    subscribed: () => listener !== null,
  };
}

describe("the gate", () => {
  it("is checking until enrolment answers, then locked", async () => {
    const { lock } = device("biometric");
    expect(lock.getSnapshot()).toEqual({ status: "checking" });
    await lock.start();
    expect(lock.getSnapshot()).toMatchObject({ status: "locked", prompting: false, opened: false });
  });

  it("opens a device with no secret set — there is nothing to gate with", async () => {
    const { lock, subscribed } = device("none");
    await lock.start();
    expect(lock.getSnapshot()).toEqual({ status: "open" });
    expect(subscribed(), "and never watches the app state").toBe(false);
  });

  it("opens where the platform has no authenticator at all — the browser", async () => {
    const lock = createAppLock({
      authenticator: null,
      subscribeAppState: () => () => {},
      now: () => 0,
    });
    await lock.start();
    expect(lock.getSnapshot()).toEqual({ status: "open" });
  });

  it("opens, and says so on the log, when enrolment itself cannot be read", async () => {
    const events: unknown[] = [];
    const lock = createAppLock(
      {
        authenticator: {
          enrolment: () => Promise.reject(new Error("no keyguard service")),
          authenticate: async () => ({ ok: true }),
        },
        subscribeAppState: () => () => {},
        now: () => 0,
      },
      (event) => events.push(event),
    );
    await lock.start();
    expect(lock.getSnapshot()).toEqual({ status: "open" });
    expect(events.at(-1)).toMatchObject({ update: "app_lock_enrolment", phase: "failure" });
  });
});

describe("unlocking", () => {
  it("unlocks on a good attempt and remembers the ledger has been opened", async () => {
    const { lock, authenticate } = device("secret");
    await lock.start();
    await lock.unlock(PROMPT);
    expect(authenticate).toHaveBeenCalledWith(PROMPT);
    expect(lock.getSnapshot()).toEqual({ status: "unlocked", covered: false });
  });

  it("stays locked on a cancelled prompt, naming the reason, and offers nothing stale", async () => {
    const { lock } = device("biometric", [{ ok: false, reason: "cancelled" }, { ok: true }]);
    await lock.start();
    await lock.unlock(PROMPT);
    expect(lock.getSnapshot()).toMatchObject({
      status: "locked",
      failure: "cancelled",
      opened: false,
    });
    await lock.unlock(PROMPT);
    expect(lock.getSnapshot()).toEqual({ status: "unlocked", covered: false });
  });

  it("raises one prompt at a time — a second tap while the first is up is a no-op", async () => {
    let settle: (attempt: AppLockAttempt) => void = () => {};
    const authenticate = vi.fn(() => new Promise<AppLockAttempt>((resolve) => (settle = resolve)));
    const lock = createAppLock({
      authenticator: { enrolment: async () => "biometric", authenticate },
      subscribeAppState: () => () => {},
      now: () => 0,
    });
    await lock.start();
    const first = lock.unlock(PROMPT);
    await lock.unlock(PROMPT);
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(lock.getSnapshot()).toMatchObject({ status: "locked", prompting: true });
    settle({ ok: true });
    await first;
    expect(lock.getSnapshot()).toEqual({ status: "unlocked", covered: false });
  });

  it("opens when the device's secret was removed while the app was away, rather than locking for good", async () => {
    let enrolment: AppLockEnrolment = "biometric";
    const lock = createAppLock({
      authenticator: {
        enrolment: async () => enrolment,
        authenticate: async () => ({ ok: false, reason: "unavailable" }),
      },
      subscribeAppState: () => () => {},
      now: () => 0,
    });
    await lock.start();
    enrolment = "none";
    await lock.unlock(PROMPT);
    expect(lock.getSnapshot()).toEqual({ status: "open" });
  });

  it("stays locked on unavailable while the device still holds a secret", async () => {
    const lock = createAppLock({
      authenticator: {
        enrolment: async () => "secret",
        authenticate: async () => ({ ok: false, reason: "unavailable" }),
      },
      subscribeAppState: () => () => {},
      now: () => 0,
    });
    await lock.start();
    await lock.unlock(PROMPT);
    expect(lock.getSnapshot()).toMatchObject({ status: "locked", failure: "unavailable" });
  });

  it("treats a throwing platform as unavailable rather than as unlocked", async () => {
    const lock = createAppLock({
      authenticator: {
        enrolment: async () => "biometric",
        authenticate: () => Promise.reject(new Error("LAContext gone")),
      },
      subscribeAppState: () => () => {},
      now: () => 0,
    });
    await lock.start();
    await lock.unlock(PROMPT);
    expect(lock.getSnapshot()).toMatchObject({ status: "locked", failure: "unavailable" });
  });
});

describe("leaving and coming back", () => {
  it("covers the ledger the moment the app is away, and lifts the cover on a quick return", async () => {
    const { lock, go, tick } = device("biometric");
    await lock.start();
    await lock.unlock(PROMPT);
    go("inactive");
    expect(lock.getSnapshot()).toEqual({ status: "unlocked", covered: true });
    go("background");
    tick(RELOCK_AFTER_MS - 1);
    go("active");
    expect(lock.getSnapshot()).toEqual({ status: "unlocked", covered: false });
  });

  it("locks again after the grace, counted from the first departure", async () => {
    const { lock, go, tick } = device("biometric");
    await lock.start();
    await lock.unlock(PROMPT);
    go("inactive");
    tick(RELOCK_AFTER_MS / 2);
    // `background` after `inactive` must not restart the clock.
    go("background");
    tick(RELOCK_AFTER_MS / 2);
    go("active");
    expect(lock.getSnapshot()).toMatchObject({ status: "locked", failure: null, opened: true });
  });

  /**
   * **A monotonic clock stops while the device sleeps.** Eight hours in a
   * drawer read as the two seconds the phone was awake, and the ledger opened
   * with no prompt — the one case the gate exists for. The wall clock counts
   * the drawer; and a wall clock set backwards during the stay counts as a
   * long one, never a short one.
   */
  it("locks after a stay whose clock went backwards, as it would after a long one", async () => {
    const { lock, go, tick } = device("biometric");
    await lock.start();
    await lock.unlock(PROMPT);
    go("background");
    tick(-1);
    go("active");
    expect(lock.getSnapshot()).toMatchObject({ status: "locked" });
  });

  it("counts a stay that began before it was listening — a start while the app is away", async () => {
    let clock = 0;
    // A holder rather than a `let`: the closure assigns it, and control flow
    // would otherwise narrow the read after `await` to `null`.
    const feed: { listener: ((state: AppActivity) => void) | null } = { listener: null };
    const lock = createAppLock({
      authenticator: {
        enrolment: async () => "biometric",
        authenticate: async () => ({ ok: true }),
      },
      subscribeAppState: (next) => {
        feed.listener = next;
        return () => {
          feed.listener = null;
        };
      },
      now: () => clock,
      currentAppState: () => "background",
    });
    await lock.start();
    await lock.unlock(PROMPT);
    lock.dispose();
    // Remounted while away: the listener comes back, and the stay is counted
    // from now — so a return after the grace asks again.
    await lock.start();
    expect(lock.getSnapshot()).toEqual({ status: "unlocked", covered: true });
    clock += RELOCK_AFTER_MS;
    feed.listener?.("active");
    expect(lock.getSnapshot()).toMatchObject({ status: "locked" });
  });

  it("opens, with the failure on the log, when enrolment never answers", async () => {
    vi.useFakeTimers();
    const events: unknown[] = [];
    const lock = createAppLock(
      {
        authenticator: {
          enrolment: () => new Promise(() => {}),
          authenticate: async () => ({ ok: true }),
        },
        subscribeAppState: () => () => {},
        now: () => 0,
      },
      (event) => events.push(event),
    );
    const started = lock.start();
    await vi.advanceTimersByTimeAsync(ENROLMENT_TIMEOUT_MS);
    await started;
    expect(lock.getSnapshot()).toEqual({ status: "open" });
    expect(events.at(-1)).toMatchObject({ update: "app_lock_enrolment", phase: "failure" });
  });

  it("ignores app state while locked — a locked ledger stays locked", async () => {
    const { lock, go } = device("biometric");
    await lock.start();
    go("background");
    go("active");
    expect(lock.getSnapshot()).toMatchObject({ status: "locked" });
  });

  /**
   * StrictMode mounts, disposes and mounts again; a remount does the same.
   * A `start` after a `dispose` must listen again, or the app never re-locks
   * — the whole gate reduced to its first prompt.
   */
  it("listens again after a dispose and a second start", async () => {
    const { lock, go, tick, subscribed } = device("biometric");
    await lock.start();
    lock.dispose();
    expect(subscribed()).toBe(false);
    await lock.start();
    expect(subscribed()).toBe(true);
    await lock.unlock(PROMPT);
    go("background");
    tick(RELOCK_AFTER_MS);
    go("active");
    expect(lock.getSnapshot()).toMatchObject({ status: "locked" });
  });

  it("locks by hand, and a prompt that was up answers into nothing", async () => {
    let settle: (attempt: AppLockAttempt) => void = () => {};
    const lock = createAppLock({
      authenticator: {
        enrolment: async () => "secret",
        authenticate: () => new Promise((resolve) => (settle = resolve)),
      },
      subscribeAppState: () => () => {},
      now: () => 0,
    });
    await lock.start();
    const attempt = lock.unlock(PROMPT);
    lock.lock();
    settle({ ok: true });
    await attempt;
    expect(lock.getSnapshot()).toMatchObject({ status: "locked", prompting: false });
  });
});
