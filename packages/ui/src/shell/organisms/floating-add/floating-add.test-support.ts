import { act } from "@testing-library/react";

/**
 * jsdom lays nothing out, and `react-native-web` delivers `onLayout` through a
 * `ResizeObserver` jsdom does not have — so `FloatingAdd`, which renders
 * nothing until its layer has a size, would render nothing forever in a test.
 *
 * This installs an observer that reports one phone-sized rectangle for every
 * node it is asked to watch. Call it at module scope, before the first
 * render: `react-native-web` creates its observer once and keeps it.
 */
export function installPhoneLayout(width = 390, height = 844) {
  class PhoneResizeObserver {
    private readonly callback: (entries: { target: Element }[]) => void;
    constructor(callback: (entries: { target: Element }[]) => void) {
      this.callback = callback;
    }
    observe(target: Element) {
      // `UIManager.measure` reads the offset box, not the client rect.
      Object.defineProperties(target, {
        offsetWidth: { value: width, configurable: true },
        offsetHeight: { value: height, configurable: true },
      });
      // After the effect that registered the handler, never inside it.
      setTimeout(() => this.callback([{ target }]), 0);
    }
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, "ResizeObserver", { value: PhoneResizeObserver, writable: true });
}

/**
 * Let the fake observer's measurement land: one timer for the observer's
 * notification, one for `UIManager.measure`, which reads the rectangle on its
 * own tick.
 */
export async function settleLayout() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
