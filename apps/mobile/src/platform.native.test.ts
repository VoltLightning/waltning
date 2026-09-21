/** @vitest-environment jsdom */

/**
 * The native half of the platform seam, for the one thing in it that failed
 * silently: **which haptic the day strip asks the device for.**
 *
 * It was `impactAsync(Light)` — a collision on iOS, and on Android the
 * vibrator, where a light one is short enough that many phones do not render
 * it. From the outside that is indistinguishable from never having asked, and
 * it was reported from a device as *the snap points work, but there is no
 * tick*. No suite could have said so: every one of them resolves `./platform`
 * to the web half, where the tick is nothing at all by design.
 *
 * What cannot be asserted here is that a hand feels it — only a device can.
 * What can is that the right platform primitive is what gets called.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const haptics = {
  selectionAsync: vi.fn(() => Promise.resolve()),
  impactAsync: vi.fn(() => Promise.resolve()),
  notificationAsync: vi.fn(() => Promise.resolve()),
  performAndroidHapticsAsync: vi.fn(() => Promise.resolve()),
  AndroidHaptics: { Clock_Tick: "clock-tick" },
  NotificationFeedbackType: { Success: "success" },
  ImpactFeedbackStyle: { Light: "light" },
};
const platform = { OS: "ios" };

vi.mock("expo-haptics", () => haptics);
vi.mock("react-native", () => ({
  Platform: platform,
  AppState: { addEventListener: () => ({ remove: () => {} }), currentState: "active" },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
vi.mock("expo-clipboard", () => ({ setStringAsync: vi.fn() }));
vi.mock("expo-crypto", () => ({ getRandomBytes: vi.fn() }));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: vi.fn() }));
vi.mock("expo-file-system", () => ({ Directory: class {}, File: class {}, Paths: {} }));
vi.mock("expo-local-authentication", () => ({}));
vi.mock("expo-localization", () => ({ getLocales: () => [] }));
vi.mock("expo-sharing", () => ({ isAvailableAsync: vi.fn(), shareAsync: vi.fn() }));
vi.mock("./diagnostics.ts", () => ({ mobileDiagnostics: {} }));

beforeEach(() => {
  for (const spy of Object.values(haptics)) if (typeof spy === "function") spy.mockClear();
});

describe("the day strip's tick, on a device", () => {
  it("is UIKit's own selection feedback on iOS — what its pickers give", async () => {
    platform.OS = "ios";
    const { dayTickHaptic } = await import("./platform.native.ts");
    dayTickHaptic();
    expect(haptics.selectionAsync).toHaveBeenCalledOnce();
    expect(haptics.impactAsync, "never an impact: that is a collision").not.toHaveBeenCalled();
  });

  it("is the view's CLOCK_TICK on Android, not the vibrator", async () => {
    platform.OS = "android";
    const { dayTickHaptic } = await import("./platform.native.ts");
    dayTickHaptic();
    expect(haptics.performAndroidHapticsAsync).toHaveBeenCalledExactlyOnceWith("clock-tick");
    expect(haptics.impactAsync).not.toHaveBeenCalled();
    expect(haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it("does not throw into the scroll when the engine refuses", async () => {
    platform.OS = "ios";
    haptics.selectionAsync.mockImplementationOnce(() => Promise.reject(new Error("no engine")));
    const { dayTickHaptic } = await import("./platform.native.ts");
    expect(() => dayTickHaptic()).not.toThrow();
    // Let the rejection be handled rather than surface as unhandled.
    await Promise.resolve();
  });
});
