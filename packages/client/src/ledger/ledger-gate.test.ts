/**
 * The four invariants that used to live in `apps/mobile/src/phone-ledger.web.ts`
 * and were enforced by nothing: a reviewer had to read them. Each test below
 * corresponds to a mutation that previously passed the whole gate.
 */

import { describe, expect, it, type Mock, vi } from "vitest";
import { createLedgerGate, isPoolContention, type LedgerGateOptions } from "./ledger-gate.ts";
import type { WarmupSchedule } from "./warm-worker.ts";

const SCHEDULE: WarmupSchedule = { delays: [0, 10], deadlineMs: 8000 };

function heldPool(): Error {
  const error = new Error("The access handle is already held.");
  error.name = "NoModificationAllowedError";
  return error;
}

type Stubs = {
  probe: Mock<() => Promise<void>>;
  open: Mock<() => string>;
  release: Mock<() => void>;
};

function gateWith(overrides: Partial<Stubs & Pick<LedgerGateOptions<string>, "wait">> = {}) {
  // The overrides *are* the stubs a test asserts on, so they are folded in
  // before the gate is built rather than spread past it.
  const stubs: Stubs = {
    probe: overrides.probe ?? vi.fn(() => Promise.resolve()),
    open: overrides.open ?? vi.fn(() => "controller"),
    release: overrides.release ?? vi.fn(),
  };
  const gate = createLedgerGate<string>({
    probe: stubs.probe,
    open: stubs.open,
    release: stubs.release,
    schedule: SCHEDULE,
    // Backoff waits resolve at once; the deadline never fires unless a test
    // hands in its own `wait`.
    wait:
      overrides.wait ??
      ((ms) => (ms === SCHEDULE.deadlineMs ? new Promise<void>(() => {}) : Promise.resolve())),
  });
  return { gate, ...stubs };
}

/** The gate warms on construction; nothing it decides is observable until then. */
const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("createLedgerGate", () => {
  it("is not ready until the warm-up settles, and then it is", async () => {
    const { gate } = gateWith();

    expect(gate.ready()).toBe(false);
    await settled();
    expect(gate.ready()).toBe(true);
  });

  it("opens once the engine has answered, and caches the session", async () => {
    const { gate, open } = gateWith();
    await settled();

    expect(gate.start()).toEqual({ status: "ready", controller: "controller" });
    expect(gate.start()).toEqual({ status: "ready", controller: "controller" });
    expect(open).toHaveBeenCalledTimes(1);
  });

  /**
   * **Mutation: delete the cold branch.** The synchronous open would then run
   * against an engine that never answered, whose only reply is a driver
   * timeout naming no cause — which is what made the retry unreachable.
   */
  it("never opens against an engine that did not answer", async () => {
    const { gate, open } = gateWith({ probe: vi.fn(() => Promise.reject(heldPool())) });
    await settled();

    const result = gate.start();

    expect(open).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "failed", retryable: true, cause: "ledgerBusy" });
    expect(result.status === "failed" && result.error.name).toBe("NoModificationAllowedError");
  });

  /**
   * **Mutation: classify every warm-up failure the same way.** A held lock and
   * an engine that never came up need different sentences — "another tab has
   * it open" is a lie about a missing wasm asset — and both need a button.
   */
  it("tells a held lock apart from an engine that never came up", async () => {
    const silent = new Error("the storage engine did not answer within 8000ms");
    silent.name = "StorageEngineSilent";
    const { gate } = gateWith({ probe: vi.fn(() => Promise.reject(silent)) });
    await settled();

    expect(gate.start()).toMatchObject({
      status: "failed",
      retryable: true,
      cause: "engineUnavailable",
    });
  });

  /**
   * **Mutation: cache every failure.** A ledger refusal is a fact about a file
   * and is kept; a lock is a statement about a moment and is not, or "Try
   * again" re-renders the same sentence forever.
   */
  it("keeps a ledger refusal, shows its own words, and offers nothing", async () => {
    const refusal = new Error("the outbox is above version 0 with no journal");
    const { gate, open, release } = gateWith({
      open: vi.fn(() => {
        throw refusal;
      }),
    });
    await settled();

    expect(gate.start()).toEqual({ status: "failed", error: refusal, retryable: false });
    expect(release).toHaveBeenCalledTimes(1);

    gate.start();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("does not keep a lock lost between the probe and the open", async () => {
    const { gate, open } = gateWith({
      open: vi.fn(() => {
        throw heldPool();
      }),
    });
    await settled();

    expect(gate.start()).toMatchObject({ status: "failed", retryable: true, cause: "ledgerBusy" });
    gate.start();
    expect(open).toHaveBeenCalledTimes(2);
  });

  /**
   * **Mutation: make `retry()` a cache clear.** "Try again" would then start
   * against exactly the state that just failed — the re-render round 4
   * rejected. It has to close the gate and warm again.
   */
  it("closes the gate and warms again on retry, then opens", async () => {
    const probe = vi
      .fn(() => Promise.resolve())
      .mockRejectedValueOnce(heldPool())
      .mockRejectedValueOnce(heldPool())
      .mockResolvedValue(undefined);
    const { gate, open } = gateWith({ probe });
    await settled();

    expect(gate.start()).toMatchObject({ status: "failed", cause: "ledgerBusy" });

    gate.retry();
    expect(gate.ready()).toBe(false);
    expect(open).not.toHaveBeenCalled();

    await settled();
    expect(gate.ready()).toBe(true);
    expect(gate.start()).toEqual({ status: "ready", controller: "controller" });
  });

  it("tells its subscribers every time the gate moves", async () => {
    const listener = vi.fn();
    const { gate } = gateWith();
    const unsubscribe = gate.subscribe(listener);
    await settled();

    expect(listener).toHaveBeenCalled();
    const settledCount = listener.mock.calls.length;

    gate.retry();
    expect(listener.mock.calls.length).toBeGreaterThan(settledCount);

    unsubscribe();
    const afterUnsubscribe = listener.mock.calls.length;
    await settled();
    expect(listener.mock.calls.length).toBe(afterUnsubscribe);
  });
});

describe("isPoolContention", () => {
  it("reads the name, through the cause chain the session wraps with", () => {
    expect(isPoolContention(heldPool())).toBe(true);
    expect(
      isPoolContention(new Error("the pre-journal rebuild did not take", { cause: heldPool() })),
    ).toBe(true);
  });

  /**
   * The arm this replaced matched the name anywhere in a message, and the
   * migrator interpolates the cause it caught into its own sentence. Since the
   * recoverable branch stopped rendering `error.message`, that misclassification
   * would replace the migrator's account of a kept pre-migration copy with
   * "another tab has it open" and a button that re-runs the same migration.
   */
  it("does not read a name out of prose", () => {
    const wrapped = new Error(
      "the replica migration failed and did not roll back cleanly — the pre-migration copy has been kept. The cause was: NoModificationAllowedError with no message",
    );

    expect(isPoolContention(wrapped)).toBe(false);
  });

  it("stops walking a cause cycle", () => {
    const first = new Error("first");
    const second = new Error("second", { cause: first });
    Object.defineProperty(first, "cause", { value: second });

    expect(isPoolContention(first)).toBe(false);
  });
});
