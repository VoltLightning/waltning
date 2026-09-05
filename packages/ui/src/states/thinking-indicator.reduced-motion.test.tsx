/**
 * @vitest-environment jsdom
 *
 * Reduced motion freezes on the full three dots — the same string the
 * animated path also reaches, not a different glyph — and starts no
 * interval: the `motion-none` branch is an absence of a loop, not one frozen
 * on its first frame. A separate file because `vi.mock` is hoisted and
 * applies to every test in the module it is declared in (see
 * `toast.reduced-motion.test.tsx`).
 */

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../primitives/reduced-motion.ts", () => ({ useReducedMotion: () => true }));

const { ThinkingIndicator } = await import("./thinking-indicator");

describe("ThinkingIndicator under reduced motion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the full three dots and never advances, even across a full cycle", () => {
    render(<ThinkingIndicator phase="thinking" elapsedMs={500} onCancel={vi.fn()} />);
    const dots = () => screen.getByTestId("thinking-dots").textContent;

    expect(dots()).toBe("...");
    vi.advanceTimersByTime(1_000);
    expect(dots()).toBe("...");
  });
});
