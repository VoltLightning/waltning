/**
 * @vitest-environment jsdom
 *
 * Reduced motion renders the three dots static and at rest — fully visible,
 * un-lifted — rather than running the loop at zero duration. A separate file
 * because `vi.mock` is hoisted and applies to every test in the module it is
 * declared in (see `toast.reduced-motion.test.tsx`).
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../primitives/reduced-motion.ts", () => ({ useReducedMotion: () => true }));

const { ThinkingIndicator } = await import("./thinking-indicator");

describe("ThinkingIndicator under reduced motion", () => {
  it("renders all three dots visible and at rest, with no animation running", () => {
    render(<ThinkingIndicator phase="thinking" elapsedMs={500} onCancel={vi.fn()} />);
    const dots = screen.getAllByTestId("thinking-dot");
    expect(dots).toHaveLength(3);
    for (const dot of dots) {
      const style = getComputedStyle(dot);
      expect(style.opacity).toBe("1");
      // No lift — `translateY` stays at rest rather than mid-bounce.
      expect(style.transform).toBe("translateY(0px)");
    }
  });
});
