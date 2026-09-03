/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { THRESHOLD_MAX, THRESHOLD_MIN, ThresholdSlider } from "./threshold-slider";

describe("ThresholdSlider", () => {
  it("shows the value as a two-decimal figure", () => {
    render(<ThresholdSlider value={0.8} onChange={vi.fn()} />);
    expect(screen.getByText("0.80")).toBeDefined();
  });

  it("clamps to the ceiling and never reaches 1.00", () => {
    render(<ThresholdSlider value={2} onChange={vi.fn()} />);
    expect(screen.getByText(THRESHOLD_MAX.toFixed(2))).toBeDefined();
    expect(screen.queryByText("1.00")).toBeNull();
  });

  it("clamps a value below the floor up to 0.50", () => {
    render(<ThresholdSlider value={0} onChange={vi.fn()} />);
    expect(screen.getByText(THRESHOLD_MIN.toFixed(2))).toBeDefined();
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
