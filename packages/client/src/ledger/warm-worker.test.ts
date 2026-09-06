import { describe, expect, it, vi } from "vitest";
import { warmWorker } from "./warm-worker.ts";

const SCHEDULE = [0, 150, 300, 600, 1200] as const;

/** No real clock: the schedule is recorded, never slept through. */
function recordingWait(slept: number[]) {
  return (ms: number) => {
    slept.push(ms);
    return Promise.resolve();
  };
}

function heldPool(): Error {
  const error = new Error("The access handle is already held.");
  error.name = "NoModificationAllowedError";
  return error;
}

describe("warmWorker", () => {
  it("answers warm on the first probe, having waited for nothing", async () => {
    const slept: number[] = [];
    const probe = vi.fn(() => Promise.resolve());

    expect(await warmWorker(probe, SCHEDULE, recordingWait(slept))).toEqual({ status: "warm" });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(slept).toEqual([]);
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
    expect(slept).toEqual([150, 300]);
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
    expect(probe).toHaveBeenCalledTimes(SCHEDULE.length);
    expect(slept).toEqual([150, 300, 600, 1200]);
  });

  it("describes a thrown non-Error rather than losing it", async () => {
    const probe = vi.fn(() => Promise.reject({ code: "SQLITE_BUSY", stack: "at probe" }));

    const result = await warmWorker(probe, [0], recordingWait([]));

    expect(result.status === "cold" && result.error.message).toContain("SQLITE_BUSY");
  });

  it("is cold with no probe at all when the schedule is empty", async () => {
    const probe = vi.fn(() => Promise.resolve());

    expect((await warmWorker(probe, [], recordingWait([]))).status).toBe("cold");
    expect(probe).not.toHaveBeenCalled();
  });
});
