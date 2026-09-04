/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toast, UndoToast } from "./toast";

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
    render(<UndoToast message="Row deleted" onUndo={onUndo} onDismiss={onDismiss} />);
    vi.advanceTimersByTime(3_000);
    screen.getByRole("button", { name: "Undo" }).click();
    expect(onUndo).toHaveBeenCalledOnce();
    // Advancing past 8 s no longer matters to the assertion, but it should
    // not throw if the timer is still armed.
    vi.advanceTimersByTime(6_000);
  });

  it("auto-dismisses after 8 s with no undo", () => {
    const onDismiss = vi.fn();
    render(<UndoToast message="Row deleted" onUndo={vi.fn()} onDismiss={onDismiss} />);
    vi.advanceTimersByTime(7_999);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("renders a rapid repeat's count beside the message", () => {
    render(<UndoToast message="Rows accepted" onUndo={vi.fn()} onDismiss={vi.fn()} count={3} />);
    expect(screen.getByText("×3")).toBeDefined();
  });

  it("does not show a count for a single occurrence", () => {
    render(<UndoToast message="Row accepted" onUndo={vi.fn()} onDismiss={vi.fn()} count={1} />);
    expect(screen.queryByText(/×/)).toBeNull();
  });

  it("renders the same leading status mark as Toast", () => {
    render(<UndoToast message="Row deleted" onUndo={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByTestId("toast-mark")).toBeDefined();
  });
});
