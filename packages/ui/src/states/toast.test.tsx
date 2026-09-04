/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toast, UndoToast } from "./toast";

const TOKEN = 1;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Toast", () => {
  it("dismisses itself after 4 s", () => {
    const onDismiss = vi.fn();
    render(<Toast message="Saved" onDismiss={onDismiss} />);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4_000);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("renders the leading status mark beside the message", () => {
    render(<Toast message="Saved" onDismiss={vi.fn()} />);
    expect(screen.getByTestId("toast-mark")).toBeDefined();
    expect(screen.getByText("Saved")).toBeDefined();
  });

  it("still fires dismiss when the action is pressed", () => {
    const onDismiss = vi.fn();
    render(<Toast message="Saved" onDismiss={onDismiss} />);
    screen.getByRole("button", { name: "Dismiss" }).click();
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe("UndoToast", () => {
  it("calls onUndo when Undo is pressed within 8 s", () => {
    const onUndo = vi.fn();
    const onDismiss = vi.fn();
    render(<UndoToast message="Row deleted" onUndo={onUndo} onDismiss={onDismiss} token={TOKEN} />);
    vi.advanceTimersByTime(3_000);
    screen.getByRole("button", { name: "Undo" }).click();
    expect(onUndo).toHaveBeenCalledOnce();
    // Advancing past 8 s no longer matters to the assertion, but it should
    // not throw if the timer is still armed.
    vi.advanceTimersByTime(6_000);
  });

  it("auto-dismisses after 8 s with no undo", () => {
    const onDismiss = vi.fn();
    render(
      <UndoToast message="Row deleted" onUndo={vi.fn()} onDismiss={onDismiss} token={TOKEN} />,
    );
    vi.advanceTimersByTime(7_999);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  // C1 — Undo pressed right at the 8 s edge raced the auto-dismiss timer:
  // the timer was never cancelled, so it could still fire and overwrite the
  // undo animation already in flight, and `onUndo` never reached the caller.
  it("fires onUndo, never onDismiss, when Undo is pressed at 7.9 s", () => {
    const onUndo = vi.fn();
    const onDismiss = vi.fn();
    render(<UndoToast message="Row deleted" onUndo={onUndo} onDismiss={onDismiss} token={TOKEN} />);
    vi.advanceTimersByTime(7_900);
    screen.getByRole("button", { name: "Undo" }).click();
    vi.advanceTimersByTime(200); // crosses the original 8 s deadline
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  // C1 — same race, checked far from the edge: once Undo has fired, the
  // stale auto-dismiss timer must never land a second callback.
  it("never fires a second callback once Undo has already fired", () => {
    const onUndo = vi.fn();
    const onDismiss = vi.fn();
    render(<UndoToast message="Row deleted" onUndo={onUndo} onDismiss={onDismiss} token={TOKEN} />);
    screen.getByRole("button", { name: "Undo" }).click();
    vi.advanceTimersByTime(8_000);
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  // H1 — `useTimer`'s `resetKey` used to be `count ?? message`; two shows
  // sharing both meant the second show's 8 s window never re-armed, and it
  // could dismiss almost immediately. `token` is required precisely so a
  // caller cannot repeat it by accident the way it can `message`.
  it("re-arms the 8 s window when the same message shows again with a new token", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <UndoToast message="Row deleted" onUndo={vi.fn()} onDismiss={onDismiss} token={1} />,
    );
    vi.advanceTimersByTime(7_000);
    rerender(<UndoToast message="Row deleted" onUndo={vi.fn()} onDismiss={onDismiss} token={2} />);

    // Past the *first* show's own 8 s deadline (7_000 + 1_999 = 8_999), but
    // well short of the second show's own — proves the window actually
    // re-armed rather than the first timer having simply been slow to fire.
    vi.advanceTimersByTime(1_999);
    expect(onDismiss).not.toHaveBeenCalled();

    // Now past the second show's own 8 s from when it re-rendered.
    vi.advanceTimersByTime(6_001);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("renders a rapid repeat's count beside the message", () => {
    render(
      <UndoToast
        message="Rows accepted"
        onUndo={vi.fn()}
        onDismiss={vi.fn()}
        count={3}
        token={TOKEN}
      />,
    );
    expect(screen.getByText("×3")).toBeDefined();
  });

  it("does not show a count for a single occurrence", () => {
    render(
      <UndoToast
        message="Row accepted"
        onUndo={vi.fn()}
        onDismiss={vi.fn()}
        count={1}
        token={TOKEN}
      />,
    );
    expect(screen.queryByText(/×/)).toBeNull();
  });

  it("renders the same leading status mark as Toast", () => {
    render(<UndoToast message="Row deleted" onUndo={vi.fn()} onDismiss={vi.fn()} token={TOKEN} />);
    expect(screen.getByTestId("toast-mark")).toBeDefined();
  });
});
