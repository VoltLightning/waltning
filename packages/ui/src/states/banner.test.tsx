/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Banner } from "./banner";

describe("Banner", () => {
  it("states offline as freshness, not failure", () => {
    render(<Banner tone="neutral" message="Showing data as of 14:06" />);
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText("Showing data as of 14:06")).toBeDefined();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("carries at most one action", () => {
    const onPress = vi.fn();
    render(
      <Banner tone="warn" message="Rates are 3 days old" action={{ label: "Refresh", onPress }} />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    buttons[0]?.click();
    expect(onPress).toHaveBeenCalledOnce();
  });
});
