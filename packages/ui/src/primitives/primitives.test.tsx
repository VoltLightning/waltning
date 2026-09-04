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

  it("a selected chip says so in state, never in its label", () => {
    // The regression this pins: the announcement was appended to the visible
    // value, so every chosen chip read as "Test · selected" on screen. A
    // selectable chip is a radio in a pill costume — role and `aria-checked`
    // are the pair ARIA allows, and what the phone announces as "selected".
    render(<Chip placeholder="Account" value="Test" selected onPress={noop} />);
    const chip = screen.getByRole("radio", { name: "Account: Test" });
    expect(chip.getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByText(/selected/)).toBeNull();
    expect(screen.getByText("Test")).toBeDefined();
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

  /**
   * `Dock`'s mode row: a segment named but not yet built. `accessibilityHint`
   * has no DOM equivalent under `react-native-web`, so the reason has to
   * reach the label itself — `getByLabelText` is what proves it does.
   */
  it("a disabled segment says why in its own label, and refuses the press", () => {
    const onChange = vi.fn();
    render(
      <SegmentControl
        segments={[
          { value: "keypad", label: "Keypad" },
          { value: "voice", label: "Voice", disabled: true },
        ]}
        value="keypad"
        onChange={onChange}
      />,
    );
    const voice = screen.getByLabelText("Voice, Later");
    expect(voice.getAttribute("aria-disabled")).toBe("true");
    voice.click();
    expect(onChange).not.toHaveBeenCalled();
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
   * `Tag` applies its fill inline, which react-native-web renders as a colour
   * a check against rendered markup can read directly.
   *
   * Amber is the case worth pinning: `design-system/02` gives it one meaning —
   * *asserted or aged rather than observed* (P4) — across a manual override,
   * an estimated rate, an unsettled item and a stale figure. One meaning has
   * to be one line, or those drift apart.
   */
  it("repointing `assertedFill` moves every asserted surface", () => {
    const amberish = { ...light, assertedFill: "rgb(255, 153, 0)" };

    render(
      <ThemeProvider theme={amberish}>
        <Tag variant="warn">Estimated</Tag>
      </ThemeProvider>,
    );

    const tag = screen.getByText("Estimated").parentElement as HTMLElement;

    expect(getComputedStyle(tag).backgroundColor).toBe("rgb(255, 153, 0)");
    // Non-vacuous: the shipped value must not already be this.
    expect(light.assertedFill).not.toBe(amberish.assertedFill);
  });

  /**
   * S05 §8's two-ambers rule (H1/L): a machine-filled `Chip` used to share
   * `assertedFill` with the test above, which made the estimated-rate
   * marker one amber among several rather than the only one (P4). It now
   * carries its own accent tint — this pins that repointing *that* token
   * moves the chip, and repointing `assertedFill` alone does not.
   */
  it("a machine-filled `Chip` moves with `accentFillBorder`, not `assertedFill`", () => {
    const amberish = { ...light, assertedFill: "rgb(255, 153, 0)" };
    const { unmount } = render(
      <ThemeProvider theme={amberish}>
        <Chip placeholder="Category" value="Groceries" machineFilled onPress={noop} />
      </ThemeProvider>,
    );
    const chipUnderAmberish = screen.getByLabelText(/filled automatically/i);
    expect(getComputedStyle(chipUnderAmberish).backgroundColor).not.toBe("rgb(255, 153, 0)");
    unmount();

    const accented = { ...light, accentFillBorder: "rgb(255, 153, 0)" };
    render(
      <ThemeProvider theme={accented}>
        <Chip placeholder="Category" value="Groceries" machineFilled onPress={noop} />
      </ThemeProvider>,
    );
    const chipUnderAccented = screen.getByLabelText(/filled automatically/i);
    expect(getComputedStyle(chipUnderAccented).borderColor).toBe("rgb(255, 153, 0)");
  });
});
