/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PeriodHeader } from "./period-header";

describe("PeriodHeader", () => {
  it("steps with the arrows", () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    render(
      <PeriodHeader
        label="August 2026"
        onPrevious={onPrevious}
        onNext={onNext}
        onToday={vi.fn()}
        isCurrent={true}
      />,
    );

    expect(screen.getByText("August 2026")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Previous period" }));
    expect(onPrevious).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Next period" }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("hides Today when the shown period already is the current one", () => {
    render(
      <PeriodHeader
        label="August 2026"
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        onToday={vi.fn()}
        isCurrent={true}
      />,
    );
    expect(screen.queryByText("Today")).toBeNull();
  });

  it("offers Today once the shown period is not the current one, and it fires", () => {
    const onToday = vi.fn();
    render(
      <PeriodHeader
        label="July 2026"
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        onToday={onToday}
        isCurrent={false}
      />,
    );
    fireEvent.click(screen.getByText("Today"));
    expect(onToday).toHaveBeenCalledOnce();
  });
});
