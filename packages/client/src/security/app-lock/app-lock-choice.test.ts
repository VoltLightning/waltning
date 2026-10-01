import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AppActivity,
  type AppLockAttempt,
  type AppLockEnrolment,
  type AppLockPrompt,
  CHOICE_TIMEOUT_MS,
  createAppLock,
  RELOCK_AFTER_MS,
} from "./app-lock.ts";

afterEach(() => {
  vi.useRealTimers();
});

const PROMPT: AppLockPrompt = { message: "Unlock", cancel: "Cancel" };

type Options = {
  /** What the store holds: `undefined` is a store that fails to read. */
  stored?: string | null | undefined;
  history?: boolean;
  enrolment?: AppLockEnrolment;
  writeFails?: boolean;
  readHangs?: boolean;
  attempts?: readonly AppLockAttempt[];
};

/**
 * A device with the owner's answer on disk. `stored` is the raw string, so a
 * corrupt value, a failed read and a store that never answers are all
 * expressible — they are the cases that must not look like "never asked".
 */
function device(options: Options = {}) {
  const { history = false, enrolment = "biometric", writeFails = false } = options;
  let disk: string | null = options.stored === undefined ? null : options.stored;
  const unreadable = "stored" in options && options.stored === undefined;
  let listener: ((state: AppActivity) => void) | null = null;
  let clock = 0;
  const queue = [...(options.attempts ?? [])];
  const authenticate = vi.fn(
    async (_prompt: AppLockPrompt): Promise<AppLockAttempt> => queue.shift() ?? { ok: true },
  );
  const write = vi.fn(async (enabled: boolean) => {
    if (writeFails) throw new Error("disk full");
    disk = enabled ? "on" : "off";
  });
  const lock = createAppLock({
    authenticator: {
      enrolment: async () => enrolment,
      authenticate,
      method: async () => "fingerprint",
    },
    subscribeAppState: (next) => {
      listener = next;
      return () => {
        listener = null;
      };
    },
    now: () => clock,
    choice: {
      read: () =>
        options.readHangs
          ? new Promise<string | null>(() => {})
          : unreadable
            ? Promise.reject(new Error("storage unavailable"))
            : Promise.resolve(disk),
      write,
      hasHistory: async () => history,
    },
  });
  return {
    lock,
    authenticate,
    write,
    disk: () => disk,
    go: (state: AppActivity) => listener?.(state),
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

describe("the first-run question", () => {
  it("asks a fresh device, names what it offers, and raises no biometric prompt", async () => {
    const { lock, authenticate } = device();
    await lock.start();
    expect(lock.getSnapshot()).toEqual({ status: "asking", method: "fingerprint" });
    expect(authenticate, "nothing is asked of the device until the answer").not.toHaveBeenCalled();
  });

  it("names the passcode on a device with a secret but no biometric", async () => {
    const { lock } = device({ enrolment: "secret" });
    await lock.start();
    expect(lock.getSnapshot()).toEqual({ status: "asking", method: "passcode" });
  });

  it("does not ask a device with nothing to gate with", async () => {
    const { lock } = device({ enrolment: "none" });
    await lock.start();
    expect(lock.getSnapshot()).toEqual({ status: "open" });
    expect(lock.method()).toBeNull();
  });

  it("Yes stores the choice, opens this launch, and locks from the next one", async () => {
    const first = device();
    await first.lock.start();
    expect(await first.lock.answer(true, PROMPT)).toBe(true);
    expect(first.disk()).toBe("on");
    expect(first.lock.getSnapshot()).toEqual({ status: "unlocked", covered: false });
    expect(first.authenticate, "the prompt comes with the next lock").not.toHaveBeenCalled();

    const next = device({ stored: first.disk() });
    await next.lock.start();
    expect(next.lock.getSnapshot()).toMatchObject({ status: "locked", opened: false });
  });

  it("Yes arms the gate for this launch too: leaving and staying away locks", async () => {
    const { lock, go, tick } = device();
    await lock.start();
    await lock.answer(true, PROMPT);
    go("background");
    tick(RELOCK_AFTER_MS);
    go("active");
    expect(lock.getSnapshot()).toMatchObject({ status: "locked" });
  });

  it("Not now on a fresh device stores the choice and leaves the ledger open, now and next launch", async () => {
    const first = device();
    await first.lock.start();
    expect(await first.lock.answer(false, PROMPT)).toBe(true);
    expect(first.disk()).toBe("off");
    expect(first.lock.getSnapshot()).toEqual({ status: "open" });
    expect(first.authenticate, "nothing to protect, nothing to ask").not.toHaveBeenCalled();

    const next = device({ stored: first.disk() });
    await next.lock.start();
    expect(next.lock.getSnapshot()).toEqual({ status: "open" });
    expect(next.authenticate).not.toHaveBeenCalled();
  });

  it("is not accepted from a locked gate, nor while the device is still being read", async () => {
    const { lock } = device({ stored: "on" });
    expect(await lock.answer(false, PROMPT), "checking").toBe(false);
    await lock.start();
    expect(lock.getSnapshot()).toMatchObject({ status: "locked" });
    expect(await lock.answer(false, PROMPT), "locked").toBe(false);
    expect(lock.getSnapshot()).toMatchObject({ status: "locked" });
  });
});

/**
 * **An install older than the question has a ledger and no answer.** Asking
 * there hands the owner's phone to whoever holds it: Not now would open the
 * ledger with no prompt and store "off".
 */
describe("an install older than the question", () => {
  it("is locked, not asked, when there is ledger data and no stored answer", async () => {
    const { lock, authenticate } = device({ history: true });
    await lock.start();
    expect(lock.getSnapshot()).toMatchObject({ status: "locked", opened: false });
    await lock.unlock(PROMPT);
    expect(authenticate).toHaveBeenCalledOnce();
  });
});

/**
 * **An answer that cannot be read is not a *no*.** Only a clean "nothing
 * stored" on a fresh device may ask.
 */
describe("a stored answer that cannot be trusted", () => {
  it("locks when the read fails", async () => {
    const { lock } = device({ stored: undefined });
    await lock.start();
    expect(lock.getSnapshot()).toMatchObject({ status: "locked" });
  });

  it("locks on a corrupt value such as ON", async () => {
    for (const stored of ["ON", "true", "1", "", "offf"]) {
      const { lock } = device({ stored });
      await lock.start();
      expect(lock.getSnapshot(), JSON.stringify(stored)).toMatchObject({ status: "locked" });
    }
  });

  it("locks when the read never answers, without waiting on the enrolment timeout's clock", async () => {
    vi.useFakeTimers();
    const { lock } = device({ readHangs: true });
    const started = lock.start();
    await vi.advanceTimersByTimeAsync(CHOICE_TIMEOUT_MS);
    await started;
    expect(lock.getSnapshot()).toMatchObject({ status: "locked" });
  });

  it("keeps the gate on this launch, and says so on the log's terms, when the write after Yes fails", async () => {
    const { lock, write } = device({ writeFails: true });
    await lock.start();
    expect(await lock.answer(true, PROMPT)).toBe(true);
    expect(write, "tried again before giving up").toHaveBeenCalledTimes(2);
    expect(lock.getSnapshot()).toEqual({ status: "unlocked", covered: false });
    expect(lock.enabled()).toBe(true);
  });
});

describe("turning the lock off", () => {
  it("asks the device first, and a refusal leaves the lock on", async () => {
    const { lock, authenticate, disk } = device({
      stored: "on",
      attempts: [{ ok: true }, { ok: false, reason: "cancelled" }],
    });
    await lock.start();
    await lock.unlock(PROMPT);
    authenticate.mockClear();
    expect(await lock.answer(false, PROMPT)).toBe(false);
    expect(authenticate).toHaveBeenCalledOnce();
    expect(disk(), "nothing was stored").toBe("on");
    expect(lock.enabled()).toBe(true);
    expect(lock.getSnapshot()).toEqual({ status: "unlocked", covered: false });
  });

  it("turns off after the device says yes, and the next launch stays open", async () => {
    const { lock, disk, go, tick } = device({
      stored: "on",
      attempts: [{ ok: true }, { ok: true }],
    });
    await lock.start();
    await lock.unlock(PROMPT);
    expect(await lock.answer(false, PROMPT)).toBe(true);
    expect(disk()).toBe("off");
    expect(lock.enabled()).toBe(false);
    go("background");
    tick(RELOCK_AFTER_MS);
    go("active");
    expect(lock.getSnapshot(), "no longer re-locks").toEqual({ status: "open" });
  });

  it("turns on from Settings without asking, and the answer sticks", async () => {
    const { lock, authenticate, disk, go, tick } = device({ stored: "off" });
    await lock.start();
    expect(lock.method(), "the device can gate, so Settings shows the row").toBe("fingerprint");
    expect(await lock.answer(true, PROMPT)).toBe(true);
    expect(authenticate).not.toHaveBeenCalled();
    expect(disk()).toBe("on");
    go("background");
    tick(RELOCK_AFTER_MS);
    go("active");
    expect(lock.getSnapshot()).toMatchObject({ status: "locked" });
  });
});
