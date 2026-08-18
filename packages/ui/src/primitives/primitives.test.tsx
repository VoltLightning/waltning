/**
 * @vitest-environment jsdom
 *
 * D1's primitives — the rules §3 states, checked on behaviour rather than
 * on how they look.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { Chip } from "./chip";
import { IconButton } from "./icon-button";
import { SegmentControl } from "./segment-control";

describe("accessible names", () => {
  it("an icon button announces itself", () => {
    // Without this it announces "button" and nothing else.
    render(
      <IconButton label="Dismiss" onPress={() => undefined}>
        <span>x</span>
      </IconButton>,
    );
    expect(screen.getByLabelText("Dismiss")).toBeDefined();
  });

  it("a machine-filled chip says so out loud, not only in amber", () => {
    // P2 and P5 together: the trail marker has to reach someone who cannot see
    // the colour, because it is the difference between "you chose this" and
    // "something chose this for you".
    render(
      <Chip placeholder="Category" value="Groceries" machineFilled onPress={() => undefined} />,
    );
    expect(screen.getByLabelText(/filled automatically/i)).toBeDefined();
  });

  it("a segment announces its count", () => {
    render(
      <SegmentControl
        segments={[
          { value: "all", label: "All", count: 42 },
          { value: "mine", label: "Mine", count: 30 },
        ]}
        value="all"
        onChange={() => undefined}
      />,
    );
    expect(screen.getByLabelText("All, 42 items")).toBeDefined();
  });
});

describe("Button", () => {
  it("holds its width while loading", () => {
    // The label stays mounted and hidden. A spinner that replaces it re-measures
    // the button, and the thing beside an affirmative action is usually the
    // destructive one.
    render(<Button label="Approve" loading onPress={() => undefined} />);
    expect(screen.getByText("Approve")).toBeDefined();
  });

  it("does not fire while loading", () => {
    const onPress = vi.fn();
    render(<Button label="Approve" loading onPress={onPress} />);
    screen.getByText("Approve").click();
    expect(onPress).not.toHaveBeenCalled();
  });
});
