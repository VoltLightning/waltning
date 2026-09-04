/**
 * @vitest-environment jsdom
 *
 * A separate file because `vi.mock` is hoisted and applies to every test in
 * the module it is declared in (see `thinking-indicator.reduced-motion.test.tsx`
 * and `toast.reduced-motion.test.tsx`).
 *
 * The three dots share one clock — a single `withRepeat`'d `withTiming` read
 * by all three `useAnimatedStyle`s — rather than each dot owning its own
 * `useSharedValue`. Counting `useSharedValue` calls is how that is visible
 * from outside: three would mean the old per-dot chains are back.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const useSharedValueSpy = vi.fn();

vi.mock("react-native-reanimated", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native-reanimated")>();
  return {
    ...actual,
    useSharedValue: (...args: Parameters<typeof actual.useSharedValue>) => {
      useSharedValueSpy();
      return actual.useSharedValue(...args);
    },
  };
});

const { ThinkingIndicator } = await import("./thinking-indicator");

describe("ThinkingIndicator's dots row", () => {
  it("creates exactly one shared clock for all three dots", () => {
    render(<ThinkingIndicator phase="thinking" elapsedMs={500} onCancel={vi.fn()} />);
    expect(screen.getAllByTestId("thinking-dot")).toHaveLength(3);
    expect(useSharedValueSpy).toHaveBeenCalledTimes(1);
  });
});
