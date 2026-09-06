import { describe, expect, it, vi } from "vitest";
import { ENGINE_SILENT, type WarmupSchedule, warmWorker } from "./warm-worker.ts";

const SCHEDULE: WarmupSchedule = { delays: [0, 150, 300, 600, 1200], deadlineMs: 8000 };

/**
 * No real clock. Backoff waits resolve at once; the deadline resolves only
 * when a test says so, which is what makes the race deterministic rather than
 * a question about microtask ordering.
 */
function recordingWait(slept: number[], { deadlineFires = false } = {}) {
  return (ms: number) => {
    slept.push(ms);
    if (ms !== SCHEDULE.deadlineMs) return Promise.resolve();
    return deadlineFires ? Promise.resolve() : new Promise<void>(() => {});
  };
}

function heldPool(): Error {
  const error = new Error("The access handle is already held.");
  error.name = "NoModificationAllowedError";
  return error;
}

/** A worker that never installed its message handler: the promise never settles. */
const neverAnswers = () => new Promise<void>(() => {});

describe("warmWorker", () => {
  it("answers warm on the first probe, having waited for no backoff", async () => {
    const slept: number[] = [];
    const probe = vi.fn(() => Promise.resolve());

    expect(await warmWorker(probe, SCHEDULE, recordingWait(slept))).toEqual({ status: "warm" });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(slept.filter((ms) => ms !== SCHEDULE.deadlineMs)).toEqual([]);
  });

  /**
   * The case the whole gate exists for: the document being replaced still
   * holds the pool, and gives it back within the schedule.
   */
  it("keeps probing while the pool is held, and warms the moment it is free", async () => {
    const slept: number[] = [];
    const probe = vi
      .fn(() => Promise.resolve())
      .mockRejectedValueOnce(heldPool())
      .mockRejectedValueOnce(heldPool())
      .mockResolvedValue(undefined);

    expect(await warmWorker(probe, SCHEDULE, recordingWait(slept))).toEqual({ status: "warm" });
    expect(probe).toHaveBeenCalledTimes(3);
    expect(slept.filter((ms) => ms !== SCHEDULE.deadlineMs)).toEqual([150, 300]);
  });

  /**
   * **The refusal is carried out, not swallowed.** It is the only readable
   * account of why startup failed — a synchronous open attempted against the
   * same cold worker reports `Sync operation timeout`, which names nothing.
   */
  it("answers cold with the last refusal when the schedule runs out", async () => {
    const slept: number[] = [];
    const probe = vi.fn(() => Promise.reject(heldPool()));

    const result = await warmWorker(probe, SCHEDULE, recordingWait(slept));

    expect(result.status).toBe("cold");
    expect(result.status === "cold" && result.error.name).toBe("NoModificationAllowedError");
    expect(probe).toHaveBeenCalledTimes(SCHEDULE.delays.length);
  });

  /**
   * **A worker that cannot evaluate never rejects — it never answers.** Its
   * module 404s, or the cross-origin isolation headers are missing, so
   * `self.onmessage` is never installed and the driver's deferred is parked
   * forever. Without a deadline this loop awaits that promise for the life of
   * the page, and the app is a blank rectangle with no sentence, no button and
   * no diagnostic. With one, it is a screen.
   */
  it("answers cold when a probe never settles at all", async () => {
    const slept: number[] = [];
    const probe = vi.fn(neverAnswers);

    const result = await warmWorker(probe, SCHEDULE, recordingWait(slept, { deadlineFires: true }));

    expect(result.status).toBe("cold");
    expect(result.status === "cold" && result.error.name).toBe(ENGINE_SILENT);
    expect(result.status === "cold" && result.error.message).toContain("did not answer");
    // Every attempt gets its own deadline, so a slow device is given the whole
    // schedule rather than one window.
    expect(probe).toHaveBeenCalledTimes(SCHEDULE.delays.length);
    expect(slept.filter((ms) => ms === SCHEDULE.deadlineMs)).toHaveLength(SCHEDULE.delays.length);
  });

  it("still warms when a probe answers before its deadline", async () => {
    const probe = vi
      .fn(() => Promise.resolve())
      .mockImplementationOnce(neverAnswers)
      .mockResolvedValue(undefined);

    const result = await warmWorker(probe, SCHEDULE, recordingWait([], { deadlineFires: true }));

    expect(result).toEqual({ status: "warm" });
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("describes a thrown non-Error rather than losing it", async () => {
    const probe = vi.fn(() => Promise.reject({ code: "SQLITE_BUSY", stack: "at probe" }));

    const result = await warmWorker(probe, { delays: [0], deadlineMs: 8000 }, recordingWait([]));

    expect(result.status === "cold" && result.error.message).toContain("SQLITE_BUSY");
  });

  it("is cold with no probe at all when the schedule is empty", async () => {
    const probe = vi.fn(() => Promise.resolve());

    expect(
      (await warmWorker(probe, { delays: [], deadlineMs: 8000 }, recordingWait([]))).status,
    ).toBe("cold");
    expect(probe).not.toHaveBeenCalled();
  });
});
