/**
 * @vitest-environment jsdom
 *
 * `Pill` — import review's provenance marker. Text, never tint alone (P5).
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pill } from "./pill";

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
