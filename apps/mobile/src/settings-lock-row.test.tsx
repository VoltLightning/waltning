/** @vitest-environment jsdom */

/**
 * S30's lock row, on a device that can gate. The browser and a phone with no
 * secret have no such row, which `settings-screen.test.tsx` — running against
 * the web platform — pins by its row list not naming one.
 *
 * `./platform` is replaced here by the one thing the row reads: a real
 * `createAppLock` over an in-memory device, so the row talks to the real
 * state machine and the real preference rather than to a stub of them.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createPhoneLedger } from "@waltning/client/ledger/create-phone-ledger";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { basePort } from "@waltning/client/ledger/test-port";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { afterEach, expect, it, vi } from "vitest";

const router = { push: vi.fn(), back: vi.fn(), canGoBack: () => true, dismissTo: vi.fn() };
vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
}));

const device = vi.hoisted(() => ({ disk: null as string | null }));

vi.mock("./platform", async (importOriginal) => {
  const original = await importOriginal<typeof import("./platform")>();
  const { createAppLock } = await import("@waltning/client/security/app-lock");
  const appLock = createAppLock({
    authenticator: {
      enrolment: async () => "biometric",
      authenticate: async () => ({ ok: true }),
      method: async () => "face",
    },
    subscribeAppState: () => () => {},
    now: () => 0,
    choice: {
      read: async () => device.disk,
      write: async (enabled) => {
        device.disk = enabled ? "on" : "off";
      },
      hasHistory: async () => false,
    },
  });
  return { ...original, appLock };
});

import { appLock } from "./platform";
import Settings from "./settings-screen";

afterEach(() => {
  cleanup();
  device.disk = null;
});

function draw() {
  render(
    <LedgerProvider
      controller={createPhoneLedger(basePort(), {
        capture: () => ({
          date: accountingDate("2026-09-16"),
          timeZone: "Europe/Warsaw",
          offsetMinutes: 120,
          at: new Date("2026-09-16T10:00:00Z"),
        }),
        id: () => id("33333333-3333-4333-8333-333333333333"),
      })}
    >
      <Settings />
    </LedgerProvider>,
  );
}

const rows = () => screen.getAllByRole("button").map((row) => row.textContent);

it("shows the lock row once the gate has read a device that can gate, and flips it from a sheet", async () => {
  device.disk = "off";
  draw();
  expect(rows(), "nothing to show before the gate has read the device").not.toContain(
    "App lockOff",
  );
  await act(async () => {
    await appLock.start();
  });
  expect(rows()).toContain("App lockOff");

  fireEvent.click(screen.getByText("App lock"));
  await act(async () => {
    fireEvent.click(screen.getByRole("radio", { name: /^On/ }));
  });
  expect(device.disk, "the choice is stored on the device").toBe("on");
  expect(rows()).toContain("App lockOn");

  await act(async () => {
    fireEvent.click(screen.getByRole("radio", { name: "Off" }));
  });
  expect(device.disk).toBe("off");
  expect(rows()).toContain("App lockOff");
});
