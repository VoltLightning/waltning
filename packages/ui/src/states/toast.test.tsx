/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme/provider";
import { dark, light } from "../theme/roles.ts";
import { Toast, UndoToast } from "./toast";

const TOKEN = 1;

// L3 — `useTimer`'s own `onExpire` argument (`handleDismiss`/`handleUndo`,
// wherever a caller wires it in), spied on rather than replaced, so every
// existing test below still runs the real timer end to end. The `exiting`
// guard (C1) masks a missing `cancelRef.current()` from `onDismiss`/`onUndo`
// call counts alone — a stale expiry after `exit()` has already started just
// no-ops through that guard — so this is the one seam a removed `cancel()`
// call still shows up in: the wrapped `onExpire` gets invoked at all.
const onExpireSpies: Array<ReturnType<typeof vi.fn>> = [];

vi.mock("./use-timer.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./use-timer.ts")>();
  return {
    useTimer: (durationMs: number, onExpire: () => void, resetKey: unknown) => {
      const spy = vi.fn(onExpire);
      onExpireSpies.push(spy);
      return actual.useTimer(durationMs, spy, resetKey);
    },
  };
});

beforeEach(() => {
  vi.useFakeTimers();
  onExpireSpies.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Toast", () => {
  it("dismisses itself after 4 s", () => {
    const onDismiss = vi.fn();
    render(<Toast message="Saved" onDismiss={onDismiss} token={TOKEN} />);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4_000);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("renders the leading status mark beside the message", () => {
    render(<Toast message="Saved" onDismiss={vi.fn()} token={TOKEN} />);
    expect(screen.getByTestId("toast-mark")).toBeDefined();
    expect(screen.getByText("Saved")).toBeDefined();
  });

  it("still fires dismiss when the action is pressed", () => {
    const onDismiss = vi.fn();
    render(<Toast message="Saved" onDismiss={onDismiss} token={TOKEN} />);
    screen.getByRole("button", { name: "Dismiss" }).click();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  // L3 — if `handleDismiss` stops calling `cancelRef.current()` before
  // `toastMotion.exit()`, the auto-expiry `setTimeout` is never cleared: it
  // still fires at 4 s and still reaches `onExpire` (the C1 `exiting` guard
  // only stops that stale call from reaching `onDismiss` a second time, so
  // `onDismiss`'s own call count can't tell the two apart). Spying on the
  // wrapped `onExpire` directly is the one place a missing `cancel()` shows.
  it("cancels the pending auto-expiry timer once a manual dismiss starts", () => {
    const onDismiss = vi.fn();
    render(<Toast message="Saved" onDismiss={onDismiss} token={TOKEN} />);
    const onExpireSpy = onExpireSpies.at(-1);
    if (onExpireSpy === undefined) throw new Error("useTimer was never called");

    screen.getByRole("button", { name: "Dismiss" }).click();
    onExpireSpy.mockClear();
    vi.advanceTimersByTime(4_000);

    expect(onExpireSpy).not.toHaveBeenCalled();
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

/**
 * **The seventh control on the band, and the one the round that named six
 * forgot to test.**
 *
 * A toast paints `theme.shell` and its action is the only thing on it a
 * keyboard can reach; the page's green ring measures 2.04:1 there. Asserted
 * two ways, because neither alone is enough: the **contrast** is what a reader
 * experiences and survives either token moving, but in dark the green ring is
 * 3.60:1 — over the floor — so a contrast test alone is blind to the dark
 * instance of the very mistake it guards. The **identity** check closes that,
 * and cannot stand alone either: `shellFocusRing` and `shellText` hold the
 * same string, so a name comparison cannot tell a correct ring from one that
 * merely looks right.
 */
it.each([
  ["light", light],
  ["dark", dark],
])("draws its action's ring readably against the %s band it paints", (_name, theme) => {
  const view = render(
    <ThemeProvider theme={theme}>
      <UndoToast message="Row deleted" onUndo={vi.fn()} onDismiss={vi.fn()} token={TOKEN} />
    </ThemeProvider>,
  );
  const action = view.getByRole("button", { name: "Undo" });
  fireEvent.focusIn(action);
  const ring = getComputedStyle(action).outlineColor;
  expect(ring, "the action draws a ring at all").not.toBe("rgba(0, 0, 0, 0)");
  expect(ring, "the page's ring, on the band").not.toBe(hexToRgb(theme.focusRing));
  expect(contrastAgainst(ring, theme.shell), ring).toBeGreaterThanOrEqual(3);
  view.unmount();
});

function hexToRgb(hex: string): string {
  const channel = (at: number) => Number.parseInt(hex.slice(at, at + 2), 16);
  return `rgb(${channel(1)}, ${channel(3)}, ${channel(5)})`;
}

/** WCAG's own formula, on an `rgb(r, g, b)` string against a hex ground. */
function contrastAgainst(rgb: string, ground: string): number {
  const parts = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(rgb);
  if (parts === null) throw new Error(`not an rgb colour: ${rgb}`);
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (r: number, g: number, b: number) =>
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const ring = luminance(Number(parts[1]), Number(parts[2]), Number(parts[3]));
  const hex = (at: number) => Number.parseInt(ground.slice(at, at + 2), 16);
  const behind = luminance(hex(1), hex(3), hex(5));
  return (Math.max(ring, behind) + 0.05) / (Math.min(ring, behind) + 0.05);
}
