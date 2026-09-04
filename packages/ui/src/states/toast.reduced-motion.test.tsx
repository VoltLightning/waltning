/**
 * @vitest-environment jsdom
 *
 * Reduced motion renders the slide-in with no `transform` key at all, rather
 * than the same transform frozen at its resting value — a separate file
 * because `vi.mock` is hoisted and applies to every test in the module it is
 * declared in.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../primitives/reduced-motion.ts", () => ({ useReducedMotion: () => true }));

const { Toast, UndoToast } = await import("./toast");

describe("Toast under reduced motion", () => {
  it("renders with no transform style", () => {
    render(<Toast message="Saved" onDismiss={vi.fn()} token={1} />);
    const alert = screen.getByRole("alert");
    expect(getComputedStyle(alert).transform).toBe("none");
  });
});

describe("UndoToast under reduced motion", () => {
  // C1 — reduced motion's `exit()` calls `onComplete` synchronously, with no
  // animation to interrupt a second call. A double-tap on Undo (two presses
  // before the parent removes the toast) reached `onUndo` twice.
  it("fires onUndo once even when Undo is double-tapped", () => {
    const onUndo = vi.fn();
    const onDismiss = vi.fn();
    render(<UndoToast message="Row deleted" onUndo={onUndo} onDismiss={onDismiss} token={1} />);
    const undoButton = screen.getByRole("button", { name: "Undo" });
    undoButton.click();
    undoButton.click();
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
