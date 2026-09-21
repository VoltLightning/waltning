/**
 * **Everything stays reachable with the keyboard up** — the one rule every
 * scroller with a field in it keeps, and the three things it takes.
 *
 * On a phone the keyboard covers the window rather than shrinking it
 * (`keyboard.ts` has the argument, for both platforms). A scroller that does
 * nothing about that has three separate defects, and an Android emulator
 * showed all three on the first form it was pointed at:
 *
 * 1. **No room.** The content ends where the window ends, so the last fields
 *    can never be scrolled above the keyboard. The scroller is given the
 *    *overlap* as extra bottom padding — not the keyboard's height: a scroller
 *    whose own bottom edge is already above the keyboard (a footer lifted it,
 *    a sheet capped it) is covered by less, or by nothing, and paying the full
 *    height there is a band of nothing at the end of every form.
 * 2. **No look.** Focusing a field behind the keyboard left it there. Once the
 *    room exists, the focused field is brought above the keyboard.
 * 3. **No scrolling at all.** `keyboardDismissMode="on-drag"` put the keyboard
 *    away on the first point of any drag, so with the keyboard up the page
 *    could not be moved — a field under it was unreachable *while typing*,
 *    which is the only time it matters. The keyboard is dismissed by its own
 *    control, by a tap outside a field, or — on iOS — by dragging it down.
 *
 * **iOS keeps the platform's own inset** (`automaticallyAdjustKeyboardInsets`),
 * which does 1 and 2 natively and animates with the keyboard; this hook answers
 * zero there rather than pay for the same room twice. Android has no
 * equivalent under edge-to-edge, so it gets this. The web's window really does
 * shrink, so it needs neither.
 */

import { type RefObject, useCallback, useEffect, useState } from "react";
import {
  Dimensions,
  type HostInstance,
  type NativeMethods,
  Platform,
  type PlatformOSType,
  type ScrollView,
  type ScrollViewProps,
  StatusBar,
  TextInput,
  useWindowDimensions,
} from "react-native";
import { useKeyboard } from "./keyboard.ts";

/**
 * How long after the room is asked for the look is taken. **Not a frame**: the
 * padding is a React state change, and a `scrollTo` issued before the native
 * side has laid it out is clamped to the *old* content height — on an emulator
 * the field came to rest with its top edge just showing over the keyboard,
 * which is the platform's own caret-into-view and not this at all.
 */
export const LOOK_AFTER_MS = 120;

/** Clear air between a focused field and the keyboard's top edge. */
export const FOCUS_MARGIN = 24;

/**
 * Where the app's window starts on the screen.
 *
 * **Two coordinate spaces meet in this file, and on the first device it ran on
 * they were 52pt apart.** A keyboard event's `screenY` is in *screen*
 * coordinates; `measureInWindow` is relative to the app's *window*. Under
 * edge-to-edge those are the same. Where the window sits between the system
 * bars — Expo Go, and any build without edge-to-edge — it starts below the
 * status bar, which on a phone with a camera cut-out is 52pt: the field was
 * brought "above the keyboard" and came to rest 52pt under its top edge.
 *
 * Told apart by what `Dimensions` says: a window as tall as the screen starts
 * at its top; a shorter one has given the bars up, and starts under the status
 * bar.
 */
export function windowTopOnScreen(
  screenHeight: number,
  windowHeight: number,
  statusBarHeight: number,
): number {
  return windowHeight < screenHeight ? statusBarHeight : 0;
}

/**
 * How much of a scroller the keyboard covers: from the scroller's own bottom
 * edge and the keyboard's top, **both in window coordinates**, never assumed to
 * be the window's own height.
 */
export function keyboardOverlap(scrollerBottom: number, keyboardTop: number | null): number {
  if (keyboardTop === null) return 0;
  const covered = scrollerBottom - keyboardTop;
  return covered > 0 ? covered : 0;
}

/** The focused field belongs to some other scroller: nothing to do, and not an error. */
function NOT_MINE(): void {}

/** Three boxes in the window, which is all the look needs to know. */
export type LookGeometry = {
  /** The focused field. */
  fieldTop: number;
  fieldHeight: number;
  /** The scroll *content*'s top edge — it moves up as the page scrolls. */
  contentTop: number;
  /** The scroller's own frame. */
  frameTop: number;
  frameBottom: number;
  /** Where the keyboard's top edge is. */
  keyboardTop: number;
};

/**
 * Where to scroll so the focused field clears the keyboard, or `null` when it
 * already does.
 *
 * **Worked out from the window rather than asked of React Native.**
 * `scrollResponderScrollNativeHandleToKeyboard` is the platform's own answer
 * and on the new architecture it fails — *"Error measuring text field"*, shown
 * to the person typing as a toast. The scroll offset is not something a
 * `ScrollView` will say, but it is the distance its content has moved above
 * its frame, and both of those can be measured.
 */
export function lookFor(at: LookGeometry): number | null {
  const floor = at.keyboardTop < at.frameBottom ? at.keyboardTop : at.frameBottom;
  const hidden = at.fieldTop + at.fieldHeight + FOCUS_MARGIN - floor;
  if (hidden <= 0) return null;
  const offset = at.frameTop - at.contentTop;
  return (offset > 0 ? offset : 0) + hidden;
}

/** Whether the platform pads and scrolls a `ScrollView` for the keyboard itself. */
export function insetsAreNative(os: PlatformOSType): boolean {
  return os === "ios";
}

/**
 * How a drag treats the keyboard. **Never `on-drag`**: see the header's third
 * defect. `interactive` is iOS's own drag-the-keyboard-down; Android has no
 * such gesture and its keyboard carries its own dismiss control.
 */
export function keyboardDismissal(os: PlatformOSType): ScrollViewProps["keyboardDismissMode"] {
  return os === "ios" ? "interactive" : "none";
}

export const KEYBOARD_DISMISSAL = keyboardDismissal(Platform.OS);

/**
 * The props every scroller holding a field spreads, so the three are decided
 * once. `handled`: a tap on a control is the control's; a tap on bare page
 * puts the keyboard away.
 */
export const KEYBOARD_SCROLL_PROPS = {
  keyboardShouldPersistTaps: "handled",
  keyboardDismissMode: KEYBOARD_DISMISSAL,
  automaticallyAdjustKeyboardInsets: true,
} as const satisfies Pick<
  ScrollViewProps,
  "keyboardShouldPersistTaps" | "keyboardDismissMode" | "automaticallyAdjustKeyboardInsets"
>;

/**
 * The keyboard's top edge **in window coordinates**, or `null` with it away —
 * the same space `measureInWindow` answers in, so anything measured can be
 * compared with it directly. The event says it in the screen's space
 * (`windowTopOnScreen`).
 */
export function useKeyboardTopInWindow(): number | null {
  const keyboard = useKeyboard();
  const frame = useWindowDimensions();
  if (keyboard.top === null) return null;
  return (
    keyboard.top -
    windowTopOnScreen(Dimensions.get("screen").height, frame.height, StatusBar.currentHeight ?? 0)
  );
}

/**
 * The extra bottom padding a scroller's content needs while the keyboard is
 * up, and the look that follows it.
 *
 * **Two refs, because they are asked two different things.** `frame` is
 * measured — any `View` that occupies the scroller's box, since an animated
 * scroller's ref does not promise `measureInWindow` — and `scroller` is
 * scrolled. Generic over the scroller, so an `Animated.ScrollView`, a plain
 * one and a list are all welcome: all this needs is `getScrollResponder`.
 */
export type KeyboardScroller = Pick<ScrollView, "scrollTo">;
export type KeyboardFrame = Pick<NativeMethods, "measureInWindow"> & HostInstance;

/**
 * The mark's props: out of the flow, so it takes no room and no gap — and
 * **`collapsable={false}`, which is the whole of why it works on Android.** A
 * view with no size and nothing to draw is flattened out of the native tree,
 * and a flattened view measures as its parent: the mark reported the *frame's*
 * position, the offset read as zero on a page that had already moved 52pt, and
 * the field came to rest 52pt short — under the keyboard.
 */
export const CONTENT_TOP_MARK_PROPS = {
  collapsable: false,
  pointerEvents: "none",
  style: { position: "absolute", top: 0, left: 0, width: 1, height: 1, opacity: 0 },
} as const;

export function useKeyboardRoom<
  Frame extends KeyboardFrame,
  Scroller extends KeyboardScroller,
  Mark extends KeyboardFrame,
>(
  frameRef: RefObject<Frame | null>,
  scroller: RefObject<Scroller | null>,
  contentTopRef: RefObject<Mark | null>,
): number {
  const [room, setRoom] = useState(0);
  // iOS pads and scrolls natively; asking here as well would pay for it twice.
  const edge = useKeyboardTopInWindow();
  const keyboardTop = insetsAreNative(Platform.OS) ? null : edge;

  const measure = useCallback(() => {
    const node = frameRef.current;
    if (node === null || keyboardTop === null) {
      setRoom(0);
      return;
    }
    node.measureInWindow((_x, y, _width, height) => {
      setRoom(keyboardOverlap(y + height, keyboardTop));
    });
  }, [frameRef, keyboardTop]);

  useEffect(measure, [measure]);

  // The look, once the room has been laid out: the padding has to exist before
  // there is anywhere to scroll to.
  useEffect(() => {
    if (room <= 0 || keyboardTop === null) return;
    const timer = setTimeout(() => {
      const focused = TextInput.State.currentlyFocusedInput();
      const list = scroller.current;
      const box = frameRef.current;
      const content = contentTopRef.current;
      if (focused === null || focused === undefined) return;
      if (list === null || box === null || content === null) return;
      /*
        **Only for a field that is inside this scroller.** A stack keeps the
        screens under the top one mounted, so Home's scroller hears the same
        keyboard Create account's does — and scrolled itself for a field it
        does not hold. `measureLayout` answers only when the node it is given
        is an ancestor, which is exactly the question.
      */
      focused.measureLayout(
        box,
        () => {
          box.measureInWindow((_x, frameTop, _w, frameHeight) => {
            content.measureInWindow((_cx, contentTop) => {
              focused.measureInWindow((_fx, fieldTop, _fw, fieldHeight) => {
                const target = lookFor({
                  fieldTop,
                  fieldHeight,
                  contentTop,
                  frameTop,
                  frameBottom: frameTop + frameHeight,
                  keyboardTop,
                });
                if (target !== null) list.scrollTo({ y: target, animated: true });
              });
            });
          });
        },
        NOT_MINE,
      );
    }, LOOK_AFTER_MS);
    return () => clearTimeout(timer);
  }, [room, keyboardTop, scroller, frameRef, contentTopRef]);

  return room;
}
