/**
 * @vitest-environment jsdom
 *
 * Reduced motion renders a static `…` rather than the stepping dot, and
 * starts no interval — the `motion-none` branch is an absence of a loop, not
 * one frozen on its first frame. A separate file because `vi.mock` is
 * hoisted and applies to every test in the module it is declared in (see
 * `toast.reduced-motion.test.tsx`).
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../primitives/reduced-motion.ts", () => ({ useReducedMotion: () => true }));

const { ThinkingIndicator } = await import("./thinking-indicator");

describe("ThinkingIndicator under reduced motion", () => {
  it("renders a static ellipsis, with no beat running", () => {
    render(<ThinkingIndicator phase="thinking" elapsedMs={500} onCancel={vi.fn()} />);
    expect(screen.getByTestId("thinking-dots").textContent).toBe("…");
  });
});
