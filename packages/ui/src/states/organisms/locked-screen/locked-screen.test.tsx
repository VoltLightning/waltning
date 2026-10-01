/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n/provider";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles";
import { LockedScreen, type LockedScreenProps } from "./locked-screen";

function draw(props: LockedScreenProps) {
  render(
    <ThemeProvider theme={light}>
      <I18nProvider>
        <LockedScreen {...props} />
      </I18nProvider>
    </ThemeProvider>,
  );
}

it("offers the one thing to do, and runs it", () => {
  const onUnlock = vi.fn();
  draw({ mode: "locked", onUnlock, prompting: false });
  expect(screen.getByText("Locked")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
  expect(onUnlock).toHaveBeenCalledOnce();
});

it("names why the last attempt did not unlock, as an alert", () => {
  draw({ mode: "locked", onUnlock: vi.fn(), prompting: false, failure: "cancelled" });
  expect(screen.getByRole("alert").textContent).toBe("Unlock was cancelled.");
});

it("waits while the platform's prompt is up rather than raising a second one", () => {
  draw({ mode: "locked", onUnlock: vi.fn(), prompting: true });
  expect(screen.getByRole("button", { name: "Unlock" })).toHaveProperty("disabled", true);
});

it("asks once, names the device's own biometric, and gives the reason", () => {
  const onYes = vi.fn();
  const onNotNow = vi.fn();
  draw({ mode: "ask", method: "fingerprint", onYes, onNotNow });
  expect(screen.getByText("Lock the app with your fingerprint?")).toBeDefined();
  expect(screen.getByText(/Anyone holding this unlocked phone/)).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Yes" }));
  expect(onYes).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Not now" }));
  expect(onNotNow).toHaveBeenCalledOnce();
});

it("names the face, or the passcode, as the device offers them", () => {
  draw({ mode: "ask", method: "face", onYes: vi.fn(), onNotNow: vi.fn() });
  expect(screen.getByText("Lock the app with your face?")).toBeDefined();
});

it("is a cover with nothing to press while the app is away", () => {
  draw({ mode: "cover" });
  expect(screen.getByText("Locked")).toBeDefined();
  expect(screen.queryByRole("button")).toBeNull();
});
