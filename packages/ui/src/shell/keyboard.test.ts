import type { KeyboardMetrics } from "react-native";
import { describe, expect, it } from "vitest";
import {
  keyboardAvoidance,
  keyboardEvents,
  keyboardHeightFrom,
  keyboardOverlapsWindow,
} from "./keyboard.ts";

/**
 * The three platform answers, pinned per platform rather than per *this*
 * platform. The suite runs against `react-native-web`, so a constant read off
 * `Platform.OS` here would only ever assert the web's answer — and the answer
 * that was wrong was Android's.
 *
 * It was wrong in a way nothing could see: `KEYBOARD_OVERLAPS_WINDOW` said
 * `Platform.OS === "ios"`, which zeroed the keyboard height and turned
 * `KeyboardAvoidingView` into a plain `View` on Android, while the same PR's
 * `navigationBarTranslucent` removed the window resize that had been hiding
 * it. The sheet simply stayed behind the keyboard.
 */
describe("keyboardOverlapsWindow", () => {
  it("is true on both phones — the keyboard covers the window there", () => {
    expect(keyboardOverlapsWindow("ios")).toBe(true);
    expect(keyboardOverlapsWindow("android")).toBe(true);
  });

  /** The browser resizes its own visual viewport, and RNW's `Keyboard` is a stub. */
  it("is false on the web, where the window really does shrink", () => {
    expect(keyboardOverlapsWindow("web")).toBe(false);
  });
});

describe("keyboardAvoidance", () => {
  it("lifts on both phones", () => {
    expect(keyboardAvoidance("ios")).toBe("padding");
    expect(keyboardAvoidance("android")).toBe("padding");
  });

  /** The no-op branch: lifting a window that already shrank moves it twice. */
  it("does nothing on the web", () => {
    expect(keyboardAvoidance("web")).toBeUndefined();
  });

  /**
   * The two constants are one fact, and the pair that broke Android was a
   * height without a lift. Neither can drift from the other without this
   * failing.
   */
  it("lifts exactly where the keyboard overlaps", () => {
    for (const os of ["ios", "android", "web"] as const) {
      expect(keyboardAvoidance(os) === "padding").toBe(keyboardOverlapsWindow(os));
    }
  });
});

/**
 * `KeyboardAvoidingView` subscribes to the `Will` pair on iOS and the `Did`
 * pair everywhere else. A cap that shrank on a different event than the lift
 * would leave a tall sheet's head off the top of the window for the ~250ms
 * the keyboard animation lasts.
 */
describe("keyboardEvents", () => {
  it("mirrors KeyboardAvoidingView: Will on iOS, Did elsewhere", () => {
    expect(keyboardEvents("ios")).toEqual({
      show: "keyboardWillShow",
      hide: "keyboardWillHide",
    });
    expect(keyboardEvents("android")).toEqual({
      show: "keyboardDidShow",
      hide: "keyboardDidHide",
    });
  });

  it("pairs a show with the matching hide", () => {
    for (const os of ["ios", "android", "web"] as const) {
      const { show, hide } = keyboardEvents(os);
      expect(show.replace("Show", "")).toBe(hide.replace("Hide", ""));
    }
  });
});

/**
 * The cap has to shrink by the quantity `KeyboardAvoidingView` lifts by, and
 * that is `frame.height − screenY`. On Android `endCoordinates.height` is a
 * different number — `ReactRootView.java` builds it as `ime().bottom −
 * systemBars().bottom`, net of the navigation bar — so reading it left the
 * cap short by the nav-bar inset and §5.1's 170px offset became 170 − N.
 */
describe("keyboardHeightFrom", () => {
  /** Pixel 8, 892dp tall, 300dp IME over a 48dp three-button nav bar. */
  it("reads screenY, not the height field, where the two disagree", () => {
    const android: KeyboardMetrics = { screenX: 0, screenY: 592, width: 412, height: 252 };
    expect(keyboardHeightFrom(892, android)).toBe(300);
    expect(keyboardHeightFrom(892, android)).not.toBe(android.height);
  });

  /** iPhone 14: a docked keyboard's `screenY + height` is the window, so both agree. */
  it("is the same number on iOS, where the two fields agree", () => {
    const ios: KeyboardMetrics = { screenX: 0, screenY: 508, width: 390, height: 336 };
    expect(keyboardHeightFrom(844, ios)).toBe(336);
    expect(keyboardHeightFrom(844, ios)).toBe(ios.height);
  });

  /** A keyboard already off the bottom of the window covers none of it. */
  it("never reports a negative cover", () => {
    const gone: KeyboardMetrics = { screenX: 0, screenY: 900, width: 390, height: 0 };
    expect(keyboardHeightFrom(844, gone)).toBe(0);
  });
});
