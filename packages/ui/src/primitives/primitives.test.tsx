/**
 * @vitest-environment jsdom
 *
 * D1's primitives — the rules §3 states, checked on behaviour rather than
 * on how they look.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme/provider";
import { light } from "../theme/roles.ts";
import { Button } from "./button";
import { Chip } from "./chip";
import { IconButton } from "./icon-button";
import { SegmentControl } from "./segment-control";
import { Tag } from "./tag";

function noop() {}

describe("accessible names", () => {
  it("an icon button announces itself", () => {
    // Without this it announces "button" and nothing else.
    render(
      <IconButton label="Dismiss" onPress={noop}>
        <span>x</span>
      </IconButton>,
    );
    expect(screen.getByLabelText("Dismiss")).toBeDefined();
  });

  it("a machine-filled chip says so out loud, not only in amber", () => {
    // P2 and P5 together: the trail marker has to reach someone who cannot see
    // the colour, because it is the difference between "you chose this" and
    // "something chose this for you".
    render(<Chip placeholder="Category" value="Groceries" machineFilled onPress={noop} />);
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
        onChange={noop}
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
    render(<Button label="Approve" loading onPress={noop} />);
    expect(screen.getByText("Approve")).toBeDefined();
  });

  it("does not fire while loading", () => {
    const onPress = vi.fn();
    render(<Button label="Approve" loading onPress={onPress} />);
    screen.getByText("Approve").click();
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("a role reaches the pixel, not just the style object", () => {
  /**
   * **The property that makes re-theming a one-line change**, and the reason it
   * is asserted on the *computed* colour rather than on the stylesheet.
   *
   * `Tag` applies its fill inline; `Chip` applies its through the stylesheet,
   * which react-native-web compiles to an injected CSS class. A check against
   * rendered markup therefore sees a colour for one and a class name for the
   * other — which is how a first attempt at this test passed for `Tag` and
   * reported `Chip` as broken when nothing was.
   *
   * Amber is the case worth pinning: `design-system/02` gives it one meaning —
   * *asserted or aged rather than observed* (P4) — across a manual override, an
   * estimated rate, an unsettled item and a stale figure. One meaning has to be
   * one line, or the four drift apart.
   */
  it("repointing `assertedFill` moves every asserted surface", () => {
    const amberish = { ...light, assertedFill: "rgb(255, 153, 0)" };

    render(
      <ThemeProvider theme={amberish}>
        <Tag variant="warn">Estimated</Tag>
        <Chip placeholder="Category" value="Groceries" machineFilled onPress={noop} />
      </ThemeProvider>,
    );

    const tag = screen.getByText("Estimated").parentElement as HTMLElement;
    const chip = screen.getByLabelText(/filled automatically/i);

    expect(getComputedStyle(tag).backgroundColor).toBe("rgb(255, 153, 0)");
    expect(getComputedStyle(chip).backgroundColor).toBe("rgb(255, 153, 0)");
    // Non-vacuous: the shipped value must not already be this.
    expect(light.assertedFill).not.toBe(amberish.assertedFill);
  });
});
