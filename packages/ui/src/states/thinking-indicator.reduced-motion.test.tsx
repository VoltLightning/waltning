/**
 * @vitest-environment jsdom
 *
 * Reduced motion renders the three dots static and all visible, rather than
 * running the loop at zero duration — a separate file because `vi.mock` is
 * hoisted and applies to every test in the module it is declared in (see
 * `toast.reduced-motion.test.tsx`).
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../primitives/reduced-motion.ts", () => ({ useReducedMotion: () => true }));

const { ThinkingIndicator } = await import("./thinking-indicator");

describe("ThinkingIndicator under reduced motion", () => {
  it("renders all three dots visible, with no opacity animation running", () => {
    render(<ThinkingIndicator phase="thinking" elapsedMs={500} onCancel={vi.fn()} />);
    const dots = screen.getAllByTestId("thinking-dot");
    expect(dots).toHaveLength(3);
    for (const dot of dots) {
      expect(getComputedStyle(dot).opacity).toBe("1");
    }
  });
});
