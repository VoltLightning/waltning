/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { offsetToValue, THRESHOLD_MAX, THRESHOLD_MIN, ThresholdSlider } from "./threshold-slider";

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
