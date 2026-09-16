/** @vitest-environment jsdom */

/**
 * The hook's one job beyond plumbing is **what happens to the key**, so that is
 * what most of this is about. A fresh one per backup, present only while the
 * screen shows it, and never in the manifest that a log or a later screen
 * might hold on to.
 */

import { act, renderHook } from "@testing-library/react";
import { decodeIdentity } from "@waltning/core/age/keys";
import type { BackupManifest } from "@waltning/core/backup/contract";
import { accountingDate } from "@waltning/core/date";
import { expect, it, vi } from "vitest";
import type { BackupPort } from "./backup-port.ts";
import { backupFilename, useLedgerBackup } from "./use-ledger-backup.ts";

/** 00:10 on the 16th in Warsaw — 22:10 UTC on the 15th. The day the owner had is the 16th. */
const AT = new Date("2026-09-15T22:10:00.000Z");
const WARSAW = { at: AT, offsetMinutes: 120 };

const MANIFEST: BackupManifest = {
  createdAt: AT.toISOString(),
  recipient: "age1qqq",
  bytes: 2048,
  counts: { transactions: 1180 },
  transactions: 1180,
  outboxEntries: 3,
};

/** Counts up, so two calls in one run cannot accidentally return the same bytes. */
function countingRandom() {
  let next = 1;
  return (length: number) => Uint8Array.from({ length }, () => next++ & 0xff);
}

/**
 * Run a backup and let it finish.
 *
 * Two turns rather than one: the hook yields to the event loop before the
 * export so React can paint the spinner, which is the fix for an app that
 * looked hung for the whole synchronous pass over the ledger.
 */
async function settle(times = 6) {
  for (let turn = 0; turn < times; turn++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function harness(over: Partial<BackupPort> = {}) {
  const exportLedger = vi.fn((options: { recipient: string }) => ({
    file: new Uint8Array([1, 2, 3]),
    manifest: { ...MANIFEST, recipient: options.recipient },
  }));
  const hand = vi.fn(async () => ({ confirmed: true, where: "Files" }));
  const port: BackupPort = {
    random: countingRandom(),
    hand,
    pick: async () => null,
    clipboard: null,
    ...over,
  };
  const hook = renderHook(() => useLedgerBackup({ exportLedger }, port, () => WARSAW));
  // `port.hand`, not the default above: returning the one this closure happens
  // to hold meant a test that overrode it asserted on a mock nothing called.
  return { ...hook, exportLedger, hand: port.hand as typeof hand };
}

it("encrypts to a key it generated, and verifies with that same key", async () => {
  const { result, exportLedger } = harness();
  await act(async () => {
    result.current.run();
    await settle();
  });

  const call = exportLedger.mock.calls[0]?.[0] as {
    recipient: string;
    verifyWith: string;
    now: Date;
  };
  expect(call.recipient.startsWith("age1")).toBe(true);
  expect(call.verifyWith.startsWith("AGE-SECRET-KEY-1")).toBe(true);
  expect(call.now).toBe(AT);
  // The pair is real, not two strings that merely look right.
  expect(() => decodeIdentity(call.verifyWith)).not.toThrow();
});

it("shows the key once, and only while the screen is showing it", async () => {
  const { result } = harness();
  expect(result.current.state).toEqual({ kind: "idle" });

  await act(async () => {
    result.current.run();
    await settle();
  });
  const done = result.current.state;
  if (done.kind !== "done") throw new Error(`expected done, got ${done.kind}`);
  expect(done.identity.startsWith("AGE-SECRET-KEY-1")).toBe(true);

  // Dismissing is what forgetting looks like. Nothing else holds it.
  act(() => result.current.dismiss());
  expect(result.current.state).toEqual({ kind: "idle" });
});

it("never puts the key in the manifest", async () => {
  const { result } = harness();
  await act(async () => {
    result.current.run();
    await settle();
  });
  const done = result.current.state;
  if (done.kind !== "done") throw new Error("expected done");
  expect(JSON.stringify(done.manifest)).not.toContain(done.identity);
  expect(JSON.stringify(done.handoff)).not.toContain(done.identity);
});

/**
 * Two backups, two keys — the consequence of keeping nothing. It is the reason
 * the fingerprint exists, so it is worth a test rather than a sentence.
 */
it("uses a new key each time, and names the file after it", async () => {
  const { result } = harness();
  await act(async () => {
    result.current.run();
    await settle();
  });
  const first = result.current.state;
  act(() => result.current.dismiss());
  await act(async () => {
    result.current.run();
    await settle();
  });
  const second = result.current.state;

  if (first.kind !== "done" || second.kind !== "done") throw new Error("expected two backups");
  expect(second.identity).not.toBe(first.identity);
  expect(second.fingerprint).not.toBe(first.fingerprint);
  expect(first.filename).toContain(first.fingerprint);
  // The 16th in Warsaw, though `AT` is the 15th in UTC — `core/date`'s C28.
  expect(first.filename).toBe(`waltning-2026-09-16-${first.fingerprint}.age`);
});

it("hands the platform the bytes under that name", async () => {
  const { result, hand } = harness();
  await act(async () => {
    result.current.run();
    await settle();
  });
  const done = result.current.state;
  if (done.kind !== "done") throw new Error("expected done");
  expect(hand).toHaveBeenCalledWith(done.filename, new Uint8Array([1, 2, 3]));
  expect(done.handoff).toEqual({ confirmed: true, where: "Files" });
});

it("reports a failure as one rather than a backup that happened", async () => {
  const { result } = harness({
    hand: vi.fn(async () => {
      throw new Error("backup: no room on the device");
    }),
  });
  await act(async () => {
    result.current.run();
    await settle();
  });
  expect(result.current.state).toEqual({
    kind: "failed",
    reason: "backup: no room on the device",
  });
});

/** The verification inside `exportLedger` failing must not read as success either. */
it("reports a file that could not be read back", async () => {
  const exportLedger = vi.fn(() => {
    throw new Error("backup: the export was written but could not be read back");
  });
  const port: BackupPort = {
    random: countingRandom(),
    hand: vi.fn(async () => ({ confirmed: true, where: "Files" })),
    pick: async () => null,
    clipboard: null,
  };
  const { result } = renderHook(() => useLedgerBackup({ exportLedger }, port, () => WARSAW));
  await act(async () => {
    result.current.run();
    await settle();
  });
  expect(result.current.state).toMatchObject({ kind: "failed" });
  expect(port.hand).not.toHaveBeenCalled();
});

it("names the file after the day the owner had, not the UTC one", () => {
  expect(backupFilename("ql3z7h", accountingDate("2026-09-16"))).toBe(
    "waltning-2026-09-16-ql3z7h.age",
  );
});

/**
 * The ordering defect, stated as the thing it cost.
 *
 * `hand` presents the share sheet on a phone. Awaiting it before rendering
 * meant the ciphertext could reach iCloud Drive while its only key was still a
 * local `const` — so a dismissed sheet, a rejection, or the OS reclaiming the
 * screen left a file nobody could ever open. The property is therefore: **with
 * the handoff still in flight, the key is already on screen.**
 */
it("shows the key while the file is still being handed over", async () => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const slowHand = vi.fn(async () => {
    await held;
    return { confirmed: true, where: "Files" };
  });
  const { result } = harness({ hand: slowHand });

  await act(async () => {
    result.current.run();
    await settle();
  });

  expect(slowHand, "the handoff has started").toHaveBeenCalledTimes(1);
  const shown = result.current.state;
  if (shown.kind !== "done") throw new Error(`expected done, got ${shown.kind}`);
  expect(shown.identity.startsWith("AGE-SECRET-KEY-1")).toBe(true);
  // And the destination is not claimed until the platform has answered.
  expect(shown.handoff).toBeNull();

  await act(async () => {
    release();
    await held;
  });
  expect(result.current.state).toMatchObject({ handoff: { confirmed: true, where: "Files" } });
});

/** Two taps in one tick made two files, two keys, and one orphaned ciphertext. */
it("takes one backup however many times the button is pressed", async () => {
  const { result, hand } = harness();
  await act(async () => {
    result.current.run();
    result.current.run();
    result.current.run();
    await settle();
  });
  expect(hand).toHaveBeenCalledTimes(1);
});

/** A dismiss during the share sheet means the key is gone; a destination must not arrive after it. */
it("does not put a destination back on a screen that has forgotten its key", async () => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { result } = harness({
    hand: vi.fn(async () => {
      await held;
      return { confirmed: true, where: "Files" };
    }),
  });

  await act(async () => {
    result.current.run();
    await settle();
  });
  act(() => result.current.dismiss());

  await act(async () => {
    release();
    await held;
  });
  expect(result.current.state).toEqual({ kind: "idle" });
});
