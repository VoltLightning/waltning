/**
 * @vitest-environment jsdom
 *
 * Reduced motion renders the slide-in with no `transform` key at all, rather
 * than the same transform frozen at its resting value — a separate file
 * because `vi.mock` is hoisted and applies to every test in the module it is
 * declared in.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../primitives/reduced-motion.ts", () => ({ useReducedMotion: () => true }));

const { Toast } = await import("./toast");

describe("Toast under reduced motion", () => {
  it("renders with no transform style", () => {
    render(<Toast message="Saved" onDismiss={vi.fn()} />);
    const alert = screen.getByRole("alert");
    expect(getComputedStyle(alert).transform).toBe("none");
  });
});
