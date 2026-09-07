/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type RuleHealthState, RuleHealthTag } from "./rule-health-tag";

const STATES: readonly RuleHealthState[] = [
  "healthy",
  "endingSoon",
  "amountDrifted",
  "overdue",
  "neverPosted",
];

describe("RuleHealthTag", () => {
  it("renders a distinct word for each of the five states", () => {
    const words = new Set<string>();
    for (const state of STATES) {
      const { unmount, container } = render(<RuleHealthTag state={state} />);
      words.add(container.textContent ?? "");
      unmount();
    }
    expect(words.size).toBe(STATES.length);
  });

  it("never posted and overdue both read as failures", () => {
    render(<RuleHealthTag state="neverPosted" />);
    expect(screen.getByText("Never posted")).toBeDefined();
  });
});
