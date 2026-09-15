/** @vitest-environment jsdom */

import { act, render, screen } from "@testing-library/react";
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
