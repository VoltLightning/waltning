/**
 * @vitest-environment jsdom
 *
 * `subscribeCommandBarHotkey` — M5: the `N` hotkey named on the board's own
 * headline had no test at all. `./platform` resolves to `platform.ts` under
 * vitest (the native build is a separate resolution `platform.native.ts`'s
 * own file covers), so every branch here is reachable today.
 */

import { describe, expect, it, vi } from "vitest";
import { subscribeCommandBarHotkey } from "./platform";

function keydown(init: KeyboardEventInit & { target?: EventTarget }): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  const target = init.target ?? window;
  target.dispatchEvent(event);
  return event;
}

describe("subscribeCommandBarHotkey", () => {
  it("focuses the bar on a bare 'n'", () => {
    const onTrigger = vi.fn();
    const unsubscribe = subscribeCommandBarHotkey(onTrigger);
    keydown({ key: "n" });
    expect(onTrigger).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("focuses the bar on 'N' (shift held) too", () => {
    const onTrigger = vi.fn();
    const unsubscribe = subscribeCommandBarHotkey(onTrigger);
    keydown({ key: "N", shiftKey: true });
    expect(onTrigger).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("ignores every other key", () => {
    const onTrigger = vi.fn();
    const unsubscribe = subscribeCommandBarHotkey(onTrigger);
    keydown({ key: "m" });
    keydown({ key: "Enter" });
    expect(onTrigger).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("skips while an INPUT already has focus — 'n' typed into a field never steals it", () => {
    const onTrigger = vi.fn();
    const unsubscribe = subscribeCommandBarHotkey(onTrigger);
    const input = document.createElement("input");
    document.body.appendChild(input);
    keydown({ key: "n", target: input });
    expect(onTrigger).not.toHaveBeenCalled();
    input.remove();
    unsubscribe();
  });

  it("skips while a TEXTAREA already has focus", () => {
    const onTrigger = vi.fn();
    const unsubscribe = subscribeCommandBarHotkey(onTrigger);
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    keydown({ key: "n", target: textarea });
    expect(onTrigger).not.toHaveBeenCalled();
    textarea.remove();
    unsubscribe();
  });

  it("skips while a contentEditable element already has focus", () => {
    const onTrigger = vi.fn();
    const unsubscribe = subscribeCommandBarHotkey(onTrigger);
    const div = document.createElement("div");
    // jsdom does not implement `isContentEditable` itself (a documented gap —
    // it always reads `false` regardless of the `contenteditable` attribute),
    // so the property is stubbed directly to exercise the real branch a
    // browser's own DOM would take.
    Object.defineProperty(div, "isContentEditable", { value: true });
    document.body.appendChild(div);
    keydown({ key: "n", target: div });
    expect(onTrigger).not.toHaveBeenCalled();
    div.remove();
    unsubscribe();
  });

  it("ignores every modifier combination — Cmd/Ctrl/Alt+N is not this shortcut", () => {
    const onTrigger = vi.fn();
    const unsubscribe = subscribeCommandBarHotkey(onTrigger);
    keydown({ key: "n", metaKey: true });
    keydown({ key: "n", ctrlKey: true });
    keydown({ key: "n", altKey: true });
    expect(onTrigger).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("calls preventDefault when it fires", () => {
    const unsubscribe = subscribeCommandBarHotkey(() => {});
    const event = keydown({ key: "n" });
    expect(event.defaultPrevented).toBe(true);
    unsubscribe();
  });

  it("does not preventDefault when it does not fire (typing into a field stays untouched)", () => {
    const unsubscribe = subscribeCommandBarHotkey(() => {});
    const event = keydown({ key: "m" });
    expect(event.defaultPrevented).toBe(false);
    unsubscribe();
  });

  it("stops listening once unsubscribed", () => {
    const onTrigger = vi.fn();
    const unsubscribe = subscribeCommandBarHotkey(onTrigger);
    unsubscribe();
    keydown({ key: "n" });
    expect(onTrigger).not.toHaveBeenCalled();
  });

  /**
   * L6 — the three cases a bare letter shortcut has to decide and this one
   * had not. Each is a rule now because it is a test.
   */
  it("ignores an autorepeat — holding 'n' down is one intention, not forty", () => {
    const onTrigger = vi.fn();
    const unsubscribe = subscribeCommandBarHotkey(onTrigger);
    keydown({ key: "n" });
    keydown({ key: "n", repeat: true });
    keydown({ key: "n", repeat: true });
    expect(onTrigger).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("ignores a keystroke while an IME is composing — 'isComposing'", () => {
    const onTrigger = vi.fn();
    const unsubscribe = subscribeCommandBarHotkey(onTrigger);
    keydown({ key: "n", isComposing: true });
    expect(onTrigger).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("ignores the 229 keyCode browsers send mid-composition, where `isComposing` is still false", () => {
    const onTrigger = vi.fn();
    const unsubscribe = subscribeCommandBarHotkey(onTrigger);
    keydown({ key: "n", keyCode: 229 });
    expect(onTrigger).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("ignores it while a sheet is open — a dialog's focus trap is not something a shortcut may leave", () => {
    const onTrigger = vi.fn();
    const unsubscribe = subscribeCommandBarHotkey(onTrigger);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);

    const event = keydown({ key: "n" });
    expect(onTrigger).not.toHaveBeenCalled();
    // And the key is left to the sheet, not swallowed.
    expect(event.defaultPrevented).toBe(false);

    // Deliberately wider than "focus is inside the dialog": RNW's own focus
    // trap parks focus on a bracket *outside* the `[role="dialog"]` node, so
    // an `activeElement` test would let this through with a sheet open.
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    keydown({ key: "n", target: outside });
    expect(onTrigger).not.toHaveBeenCalled();

    dialog.remove();
    outside.remove();
    unsubscribe();
  });

  it("fires again once the sheet closes — the dialog role only exists while a Modal is visible", () => {
    const onTrigger = vi.fn();
    const unsubscribe = subscribeCommandBarHotkey(onTrigger);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    keydown({ key: "n" });
    expect(onTrigger).not.toHaveBeenCalled();

    dialog.remove();
    keydown({ key: "n" });
    expect(onTrigger).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
