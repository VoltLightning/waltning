/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import {
  type AppActivity,
  type AppLockAttempt,
  type AppLockPrompt,
  createAppLock,
  RELOCK_AFTER_MS,
} from "@waltning/client/security/app-lock";
import { I18nProvider } from "@waltning/ui/i18n/provider";
import { ThemeProvider } from "@waltning/ui/theme/provider";
import { light } from "@waltning/ui/theme/roles";
import { Modal, Text } from "react-native";
import { expect, it, vi } from "vitest";
import { LockGate } from "./lock-gate";

/** A device that answers each prompt from a queue, with an app-state feed the test drives. */
function device(attempts: readonly AppLockAttempt[]) {
  let clock = 0;
  let listener: ((state: AppActivity) => void) | null = null;
  const queue = [...attempts];
  const authenticate = vi.fn(
    async (_prompt: AppLockPrompt): Promise<AppLockAttempt> => queue.shift() ?? { ok: true },
  );
  const lock = createAppLock({
    authenticator: { enrolment: async () => "biometric", authenticate },
    subscribeAppState: (next) => {
      listener = next;
      return () => {};
    },
    now: () => clock,
  });
  return {
    lock,
    authenticate,
    go: (state: AppActivity) => act(() => listener?.(state)),
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

function draw(lock: ReturnType<typeof createAppLock>) {
  render(
    <ThemeProvider theme={light}>
      <I18nProvider>
        <LockGate lock={lock}>
          <Text>the ledger</Text>
        </LockGate>
      </I18nProvider>
    </ThemeProvider>,
  );
}

const settle = () => act(async () => {});

it("raises the device's prompt on its own, and shows the ledger only once it answers", async () => {
  const { lock, authenticate } = device([{ ok: true }]);
  draw(lock);
  expect(screen.queryByText("the ledger"), "not on the page before the first unlock").toBeNull();
  await settle();
  expect(authenticate).toHaveBeenCalledOnce();
  expect(authenticate.mock.calls[0]?.[0]).toMatchObject({ message: "Unlock Waltning" });
  expect(screen.getByText("the ledger")).toBeDefined();
  expect(screen.queryByText("Locked")).toBeNull();
});

/**
 * §5.7's card: *cancelling Face ID leaves the ledger unreadable rather than
 * showing a stale screen.* Before the first unlock there is no ledger tree to
 * be stale — only the lock, its reason, and the button for another go.
 */
it("stays on the lock after a cancelled prompt, with the reason and one button, and raises no second prompt by itself", async () => {
  const { lock, authenticate } = device([{ ok: false, reason: "cancelled" }, { ok: true }]);
  draw(lock);
  await settle();
  expect(screen.queryByText("the ledger")).toBeNull();
  expect(screen.getByRole("alert").textContent).toBe("Unlock was cancelled.");
  expect(authenticate).toHaveBeenCalledOnce();
  await act(async () => {
    screen.getByRole("button", { name: "Unlock" }).click();
  });
  expect(screen.getByText("the ledger")).toBeDefined();
});

it("covers the ledger while the app is away and lifts the cover on a quick return, keeping the tree mounted", async () => {
  const { lock, go, tick } = device([{ ok: true }]);
  draw(lock);
  await settle();
  go("background");
  expect(screen.getByText("Locked")).toBeDefined();
  expect(screen.getByText("the ledger"), "still mounted under the cover").toBeDefined();
  expect(screen.queryByRole("button")).toBeNull();
  // Out of reach as well as out of sight: nothing under the cover is in the
  // accessibility tree, so a screen reader cannot read a balance through it.
  expect(screen.getByText("the ledger").closest('[aria-hidden="true"]')).not.toBeNull();
  tick(RELOCK_AFTER_MS - 1);
  go("active");
  expect(screen.queryByText("Locked")).toBeNull();
});

it("locks again after the grace and prompts once more, over the mounted ledger", async () => {
  const { lock, go, tick, authenticate } = device([{ ok: true }, { ok: true }]);
  draw(lock);
  await settle();
  go("background");
  tick(RELOCK_AFTER_MS);
  go("active");
  await settle();
  expect(authenticate).toHaveBeenCalledTimes(2);
  expect(screen.getByText("the ledger")).toBeDefined();
  expect(screen.queryByText("Locked")).toBeNull();
});

it("draws the app straight away where there is nothing to gate with", async () => {
  const lock = createAppLock({
    authenticator: null,
    subscribeAppState: () => () => {},
    now: () => 0,
  });
  draw(lock);
  await settle();
  expect(screen.getByText("the ledger")).toBeDefined();
});

/**
 * **A sheet is its own window.** `BottomSheet`, `ConfirmDialog` and `Select`
 * all render through `Modal`, which no sibling `View` can be drawn over and
 * which hiding the tree does not reach into — a filter sheet left open when
 * the phone went into a pocket stood over the cover, account names and all.
 * The lock is a `Modal` presented later, so it is the one on top.
 */
it("draws the lock over a sheet the app had open, not under it", async () => {
  // The re-lock's own prompt is cancelled, so the lock is what stands.
  const { lock, go, tick } = device([{ ok: true }, { ok: false, reason: "cancelled" }]);
  render(
    <ThemeProvider theme={light}>
      <I18nProvider>
        <LockGate lock={lock}>
          <Text>the ledger</Text>
          <Modal visible>
            <Text>Bank A · PLN</Text>
          </Modal>
        </LockGate>
      </I18nProvider>
    </ThemeProvider>,
  );
  await settle();
  go("background");
  tick(RELOCK_AFTER_MS);
  go("active");
  await settle();
  const sheet = screen.getByText("Bank A · PLN");
  const cover = screen.getByText("Locked");
  // Later in document order is later in the stack, on the web as on a phone.
  expect(sheet.compareDocumentPosition(cover) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  expect(cover.closest('[aria-modal="true"], [role="dialog"]')).not.toBeNull();
});

/**
 * **The first launch asks, and asks before the device does.** Until it is
 * answered there is no biometric prompt at all — the tester's first surprise
 * was a fingerprint request with no word of why.
 */
const PROMPT = { message: "Unlock", cancel: "Cancel" };

function askingDevice(stored: string | null) {
  let disk: string | null = stored;
  const authenticate = vi.fn(async (): Promise<AppLockAttempt> => ({ ok: true }));
  const lock = createAppLock({
    authenticator: {
      enrolment: async () => "biometric",
      authenticate,
      method: async () => "fingerprint",
    },
    subscribeAppState: () => () => {},
    now: () => 0,
    choice: {
      read: async () => disk,
      write: async (enabled) => {
        disk = enabled ? "on" : "off";
      },
      hasHistory: async () => false,
    },
  });
  return { lock, authenticate, disk: () => disk };
}

it("asks on first launch, with the reason, and makes no biometric call", async () => {
  const { lock, authenticate } = askingDevice(null);
  draw(lock);
  await settle();
  expect(screen.getByText("Lock the app with your fingerprint?")).toBeDefined();
  expect(screen.getByText(/Anyone holding this unlocked phone/)).toBeDefined();
  expect(screen.queryByText("the ledger"), "the ledger waits for the answer").toBeNull();
  expect(authenticate).not.toHaveBeenCalled();
});

it("Yes turns the lock on: the ledger opens, and the next launch prompts", async () => {
  const first = askingDevice(null);
  draw(first.lock);
  await settle();
  await act(async () => {
    screen.getByRole("button", { name: "Yes" }).click();
  });
  expect(screen.getByText("the ledger")).toBeDefined();
  expect(first.disk()).toBe("on");
  expect(first.authenticate).not.toHaveBeenCalled();
  cleanup();

  const next = askingDevice(first.disk());
  draw(next.lock);
  await settle();
  expect(next.authenticate, "the next launch raises the prompt").toHaveBeenCalledOnce();
});

it("Not now leaves no lock: the ledger opens, and no launch prompts", async () => {
  const first = askingDevice(null);
  draw(first.lock);
  await settle();
  await act(async () => {
    screen.getByRole("button", { name: "Not now" }).click();
  });
  expect(screen.getByText("the ledger")).toBeDefined();
  expect(first.disk()).toBe("off");
  cleanup();

  const next = askingDevice(first.disk());
  draw(next.lock);
  await settle();
  expect(screen.getByText("the ledger")).toBeDefined();
  expect(next.authenticate).not.toHaveBeenCalled();
});

it("does not remount the screen when Settings switches the lock on or off", async () => {
  const { lock } = askingDevice("off");
  draw(lock);
  await settle();
  const before = screen.getByText("the ledger");
  await act(async () => {
    await lock.answer(true, PROMPT);
  });
  expect(screen.getByText("the ledger"), "same node: the screen kept its place").toBe(before);
  await act(async () => {
    await lock.answer(false, PROMPT);
  });
  expect(screen.getByText("the ledger")).toBe(before);
});
