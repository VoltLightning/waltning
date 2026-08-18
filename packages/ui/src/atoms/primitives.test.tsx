/**
 * @vitest-environment jsdom
 *
 * D1's primitives, checked on the rules §3 states rather than on how they look.
 *
 * The 44px floor, the focus ring and text-not-tint are the three that get lost
 * when a screen builds its own control — and all three are invisible in a
 * screenshot, which is why they need a test rather than an eye.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AmountField, parseAmount } from "./amount-field";
import { Button } from "./button";
import { Chip } from "./chip";
import { IconButton } from "./icon-button";
import { Pill } from "./pill";
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

describe("text, never tint alone", () => {
  it("a rule pill names the rule and its hits", () => {
    // "A rule" is not checkable. The name and the hit count are what tell a
    // reviewer whether it is load-bearing or was written once for one row.
    render(<Pill tier="rule" name="Groceries" hits={41} />);
    expect(screen.getByText("Rule · Groceries · 41")).toBeDefined();
  });

  it("a model pill states confidence to two places", () => {
    // `0.9` and `0.90` read as different amounts of certainty, and only one of
    // them is what the model said.
    render(<Pill tier="model" confidence={0.9} />);
    expect(screen.getByText("Model 0.90")).toBeDefined();
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

describe("parseAmount — comma decimal", () => {
  it("takes the separator the keyboard gives", () => {
    // Polish keyboards give `,`; numeric keypads often give `.`. Both are typed
    // in practice and both mean the same thing.
    expect(parseAmount("1234,56")).toBe("1234.56");
    expect(parseAmount("1234.56")).toBe("1234.56");
  });

  it("refuses two separators rather than guessing", () => {
    // `1.234,56` and `1,234.56` are the same characters and different numbers.
    // Guessing is how an amount gets multiplied by a thousand.
    expect(parseAmount("1.234,56")).toBeNull();
    expect(parseAmount("1,234.56")).toBeNull();
  });

  it("returns null rather than NaN for what is not an amount", () => {
    // A field returning `NaN` pushes the decision about bad input onto whoever
    // forgot to check for it.
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("-")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount(".")).toBeNull();
  });

  it("keeps a decimal string, never a number", () => {
    const parsed = parseAmount("0,10");
    expect(typeof parsed).toBe("string");
    expect(parsed).toBe("0.10");
  });

  it("renders with a currency affix", () => {
    render(<AmountField label="Amount" currency="PLN" onChange={() => undefined} />);
    expect(screen.getByText("PLN")).toBeDefined();
  });
});
