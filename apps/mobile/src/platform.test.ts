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
});
