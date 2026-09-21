import { describe, expect, it } from "vitest";
import {
  FOCUS_MARGIN,
  insetsAreNative,
  keyboardDismissal,
  keyboardOverlap,
  lookFor,
  windowTopOnScreen,
} from "./keyboard-room.ts";

describe("how much of a scroller the keyboard covers", () => {
  // The keyboard's top edge at 600, in the window's own coordinates.
  it("is everything under the keyboard's top edge", () => {
    expect(keyboardOverlap(900, 600)).toBe(300);
    // A tab bar or a fixed footer sits under it: its bottom edge is at 820.
    expect(keyboardOverlap(820, 600)).toBe(220);
  });

  /**
   * **The one a fixed height would get wrong.** Add's footer rides above the
   * keyboard, so the scroller above it already ends at the keyboard's top
   * edge; padding it by the keyboard's height is 300pt of nothing at the end
   * of the form.
   */
  it("is nothing for a scroller that already ends above the keyboard", () => {
    expect(keyboardOverlap(600, 600)).toBe(0);
    expect(keyboardOverlap(540, 600)).toBe(0);
  });

  it("is nothing with the keyboard away", () => {
    expect(keyboardOverlap(900, null)).toBe(0);
  });
});

describe("where the window starts on the screen", () => {
  /**
   * **52pt, on the first phone this ran on.** The keyboard event speaks in
   * screen coordinates and `measureInWindow` in the window's; without this the
   * field was brought "above the keyboard" and stopped 52pt under its edge.
   */
  it("is under the status bar when the window has given the bars up", () => {
    // A 952pt screen, a 876pt window (status 52 + navigation 24 given up).
    expect(windowTopOnScreen(952, 876, 52)).toBe(52);
  });

  it("is the top of the screen under edge-to-edge, where the two are one space", () => {
    expect(windowTopOnScreen(952, 952, 52)).toBe(0);
  });
});

describe("what a drag does to the keyboard", () => {
  /**
   * **Seen on an emulator:** with `on-drag`, the first point of any scroll put
   * the keyboard away, so a field behind it could never be scrolled to *while
   * typing* — which is the only time it needs to be.
   */
  it("never dismisses it on drag, on any platform", () => {
    for (const os of ["ios", "android", "web", "windows", "macos"] as const) {
      expect(keyboardDismissal(os), os).not.toBe("on-drag");
    }
  });

  it("lets iOS drag the keyboard down, which is that platform's own gesture", () => {
    expect(keyboardDismissal("ios")).toBe("interactive");
    expect(keyboardDismissal("android")).toBe("none");
  });
});

describe("who pads the scroller", () => {
  it("is the platform on iOS, so the room is never paid for twice", () => {
    expect(insetsAreNative("ios")).toBe(true);
    expect(insetsAreNative("android")).toBe(false);
  });
});

describe("where to scroll so the focused field clears the keyboard", () => {
  // A scroller from 100 to 900 in the window; the keyboard's top edge at 600.
  const frame = { frameTop: 100, frameBottom: 900, keyboardTop: 600 };

  it("is nowhere, for a field that already clears it", () => {
    expect(lookFor({ ...frame, contentTop: 100, fieldTop: 300, fieldHeight: 48 })).toBeNull();
  });

  /**
   * **The one the emulator showed**: *Opening date* at 860, the keyboard's top
   * at 600, and the page did nothing.
   */
  it("brings a field behind the keyboard above it, with air to spare", () => {
    const target = lookFor({ ...frame, contentTop: 100, fieldTop: 860, fieldHeight: 48 });
    expect(target).toBe(860 + 48 + FOCUS_MARGIN - 600);
  });

  it("adds to where the page already is, read off how far the content has moved", () => {
    // Already scrolled 200: the content's top is 200 above the frame's.
    const target = lookFor({ ...frame, contentTop: -100, fieldTop: 700, fieldHeight: 48 });
    expect(target).toBe(200 + (700 + 48 + FOCUS_MARGIN - 600));
  });

  it("measures against the scroller's own bottom edge when that is the higher floor", () => {
    // A footer lifted the scroller above the keyboard: the footer is the floor.
    const lifted = { frameTop: 100, frameBottom: 540, keyboardTop: 600 };
    expect(lookFor({ ...lifted, contentTop: 100, fieldTop: 520, fieldHeight: 48 })).toBe(
      520 + 48 + FOCUS_MARGIN - 540,
    );
  });
});
