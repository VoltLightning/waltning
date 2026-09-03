/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  it("names what is loading, for the shape it stands in for", () => {
    render(<Skeleton shape="row" label="Recent transactions" />);
    expect(screen.getByRole("progressbar", { name: "Recent transactions" })).toBeDefined();
  });

  it("renders every shape with the same accessible contract", () => {
    for (const shape of ["row", "hero", "block"] as const) {
      const { unmount } = render(<Skeleton shape={shape} label={`Loading ${shape}`} />);
      expect(screen.getByRole("progressbar", { name: `Loading ${shape}` })).toBeDefined();
      unmount();
    }
  });
});
