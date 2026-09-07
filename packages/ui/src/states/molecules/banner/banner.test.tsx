/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Banner, bannerStacks } from "./banner";

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

/**
 * At 390pt the action holds its own width whatever the row does, so it took
 * about a third of the line and left the message wrapping to four lines and
 * 110pt of height over a screen it was only meant to annotate. The decision
 * is the banner's own measured width — a banner in a narrow column at desk
 * width has the same problem, and a device breakpoint would not see it.
 */
describe("bannerStacks", () => {
  it("stacks a narrow banner that has an action", () => {
    expect(bannerStacks(390, true)).toBe(true);
  });

  it("leaves a wide banner as a row", () => {
    expect(bannerStacks(868, true)).toBe(false);
  });

  it("never stacks without an action — there is nothing to put underneath", () => {
    expect(bannerStacks(390, false)).toBe(false);
  });

  /**
   * Unmeasured is not "infinitely narrow": the first frame is a row, which is
   * the shape that degrades gracefully if a measurement never arrives.
   */
  it("treats an unmeasured width as a row", () => {
    expect(bannerStacks(0, true)).toBe(false);
  });
});
