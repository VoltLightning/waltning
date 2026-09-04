/** @vitest-environment jsdom */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Gesture } from "react-native-gesture-handler";
import { describe, expect, it, vi } from "vitest";
import {
  BADGE_WIDTH,
  badgeLeft,
  offsetToValue,
  THRESHOLD_MAX,
  THRESHOLD_MIN,
  ThresholdSlider,
} from "./threshold-slider";

type PanEvent = { x: number };
type StubbedPanBuilder = {
  onStartCallback: ((event: PanEvent) => void) | null;
  onUpdateCallback: ((event: PanEvent) => void) | null;
};

/**
 * A controllable stand-in for `react-native-web`'s `onLayout` machinery.
 * `react-native-web` caches a single `ResizeObserver` at module scope the
 * first time any component asks for one (`useElementLayout`), so this has to
 * be installed before the first render in this file — and it has to report a
 * *different* size on a second call, which `floating-add.test-support.ts`'s
 * fixed-size version does not need to.
 */
function installResizableLayout() {
  const observed = new Set<Element>();
  let notify: ((entries: { target: Element }[]) => void) | null = null;

  class ControllableResizeObserver {
    constructor(callback: (entries: { target: Element }[]) => void) {
      notify = callback;
    }
    observe(target: Element) {
      observed.add(target);
    }
    unobserve(target: Element) {
      observed.delete(target);
    }
    disconnect() {
      observed.clear();
    }
  }
  Object.defineProperty(window, "ResizeObserver", {
    value: ControllableResizeObserver,
    writable: true,
  });

  return {
    async resize(width: number, height = 44) {
      for (const target of observed) {
        Object.defineProperties(target, {
          offsetWidth: { value: width, configurable: true },
          offsetHeight: { value: height, configurable: true },
        });
      }
      notify?.(Array.from(observed, (target) => ({ target })));
      // `UIManager.measure` reads the rectangle on its own `setTimeout(0)` tick.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    },
  };
}

const layout = installResizableLayout();

describe("ThresholdSlider", () => {
  it("shows the value as a two-decimal figure in the badge", () => {
    render(<ThresholdSlider value={0.8} onChange={vi.fn()} />);
    expect(screen.getByText("0.80")).toBeDefined();
  });

  it("clamps to the ceiling and never reaches 1.00", () => {
    render(<ThresholdSlider value={2} onChange={vi.fn()} />);
    // The badge and the "0.99" end label both read the ceiling once clamped
    // there — `getAllByText` rather than `getByText`, which would refuse the
    // legitimate second match.
    expect(screen.getAllByText(THRESHOLD_MAX.toFixed(2)).length).toBeGreaterThan(0);
    expect(screen.queryByText("1.00")).toBeNull();
  });

  it("clamps a value below the floor up to 0.50", () => {
    render(<ThresholdSlider value={0} onChange={vi.fn()} />);
    expect(screen.getAllByText(THRESHOLD_MIN.toFixed(2)).length).toBeGreaterThan(0);
  });

  it("steps by 0.01 on the arrow keys — the browser's keyboard path", () => {
    const onChange = vi.fn();
    render(<ThresholdSlider value={0.8} onChange={onChange} />);
    const slider = screen.getByRole("slider");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(0.81);
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith(0.79);
  });

  it("steps by 0.05 on shift+arrow", () => {
    const onChange = vi.fn();
    render(<ThresholdSlider value={0.8} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight", shiftKey: true });
    expect(onChange).toHaveBeenCalledWith(0.85);
  });

  it("jumps to the floor and ceiling on Home/End", () => {
    const onChange = vi.fn();
    render(<ThresholdSlider value={0.8} onChange={onChange} />);
    const slider = screen.getByRole("slider");
    fireEvent.keyDown(slider, { key: "Home" });
    expect(onChange).toHaveBeenCalledWith(THRESHOLD_MIN);
    fireEvent.keyDown(slider, { key: "End" });
    expect(onChange).toHaveBeenCalledWith(THRESHOLD_MAX);
  });

  it("never steps an increment past the ceiling", () => {
    const onChange = vi.fn();
    render(<ThresholdSlider value={THRESHOLD_MAX} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("never steps a decrement past the floor", () => {
    const onChange = vi.fn();
    render(<ThresholdSlider value={THRESHOLD_MIN} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowLeft" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps the pan gesture's identity stable across a value change", () => {
    // A controlled `value` prop changes on every drag frame — `pan`'s own
    // `onUpdate` calls `onChange`. If the gesture object were rebuilt on
    // that change, `GestureDetector` would tear down and reattach the
    // native handler mid-drag, which drops the pointer capture on web: the
    // owner's *"can't move it"*. Rebuilding only for an actual layout or
    // a11y-setting change is the fix; a `value`/`onChange` change alone must
    // never touch the gesture's identity.
    const panSpy = vi.spyOn(Gesture, "Pan");
    const onChange = vi.fn();
    const { rerender } = render(<ThresholdSlider value={0.8} onChange={onChange} />);
    expect(panSpy).toHaveBeenCalledTimes(1);
    rerender(<ThresholdSlider value={0.81} onChange={onChange} />);
    expect(panSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps using the up-to-date width when layout changes mid-drag", async () => {
    // A resize or a keyboard-driven reflow mid-drag used to rebuild `pan`
    // (`usable` was a `useMemo` dep) and drop pointer capture — the same
    // failure a `value` change would cause. `usable` now lives in a shared
    // value the worklets read live, so `pan` never rebuilds and `onUpdate`
    // still sees the width current at the moment it fires.
    const onChange = vi.fn();
    // `vi.spyOn` returns the same spy across tests once `Gesture.Pan` has
    // been spied once in this file — `mockClear()` gives this test its own
    // clean call count rather than inheriting an earlier test's.
    const panSpy = vi.spyOn(Gesture, "Pan");
    panSpy.mockClear();
    render(<ThresholdSlider value={0.75} onChange={onChange} />);
    await layout.resize(204); // trackWidth=204 → usable=176

    expect(panSpy).toHaveBeenCalledTimes(1);
    const builder = panSpy.mock.results[0]?.value as StubbedPanBuilder;

    builder.onStartCallback?.({ x: 0 });
    expect(onChange).toHaveBeenLastCalledWith(THRESHOLD_MIN);

    await layout.resize(432); // trackWidth=432 → usable=404 — layout changes mid-drag

    // `onUpdate` fires again, still mid-gesture: it must use the *new*
    // width, and `pan` itself must still be the one gesture built at mount.
    builder.onUpdateCallback?.({ x: 404 + 28 / 2 });
    expect(onChange).toHaveBeenLastCalledWith(THRESHOLD_MAX);
    expect(panSpy).toHaveBeenCalledTimes(1);
  });
});

describe("offsetToValue", () => {
  it("maps a tap at the row's start to the floor", () => {
    expect(offsetToValue(0, 176)).toBe(THRESHOLD_MIN);
  });

  it("maps a tap at the row's end to the ceiling", () => {
    expect(offsetToValue(176 + 28 / 2, 176)).toBe(THRESHOLD_MAX);
  });

  it("maps a tap mid-track to the fraction between — tap and drag share this mapping", () => {
    // usable=200, offset=114 (=THUMB/2 + 100) lands exactly at the midpoint.
    expect(offsetToValue(114, 200)).toBeCloseTo(0.75, 2);
  });

  it("has no usable range to fall back to the floor rather than divide by zero", () => {
    expect(offsetToValue(20, 0)).toBe(THRESHOLD_MIN);
  });
});

describe("badgeLeft", () => {
  // usable=176, THUMB=28 → trackWidth=204 (matches the fixtures above).
  const usable = 176;

  it("clamps at the floor rather than running the badge off the left edge", () => {
    // Centred on the thumb, the badge would sit at THUMB / 2 - BADGE_WIDTH / 2 — negative.
    expect(badgeLeft(THRESHOLD_MIN, usable)).toBe(0);
  });

  it("clamps at the ceiling rather than running the badge off the right edge", () => {
    const trackWidth = usable + 28;
    expect(badgeLeft(THRESHOLD_MAX, usable)).toBe(trackWidth - BADGE_WIDTH);
  });

  it("centres on the thumb mid-track, where clamping does not apply", () => {
    const left = badgeLeft(0.75, usable);
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(usable + 28 - BADGE_WIDTH);
  });
});
