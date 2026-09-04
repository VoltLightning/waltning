/**
 * @vitest-environment jsdom
 *
 * `useBreakpoint` against a real resize — jsdom's `window`, not a mock of
 * `useWindowDimensions`. `react-native-web`'s implementation reads
 * `document.documentElement.clientWidth` and re-measures on the DOM's own
 * `resize` event, so faking the width is faking the browser, not the hook.
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useBreakpoint } from "./use-breakpoint.ts";

/**
 * `configurable: true` because a test that resizes twice redefines this
 * property twice — the second `defineProperty` throws on a non-configurable
 * one.
 */
function resizeTo(width: number) {
  Object.defineProperty(document.documentElement, "clientWidth", {
    value: width,
    configurable: true,
  });
  window.dispatchEvent(new Event("resize"));
}

describe("useBreakpoint", () => {
  it("reads phone below 1024 and desk at or above it", () => {
    // Set before the first render: `useWindowDimensions`' initial state reads
    // `Dimensions.get`, which only re-measures on the process's first call —
    // every later call answers from the cache until a `resize` event fires.
    resizeTo(390);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe("phone");

    act(() => resizeTo(1024));
    expect(result.current).toBe("desk");

    act(() => resizeTo(1440));
    expect(result.current).toBe("desk");

    act(() => resizeTo(1023));
    expect(result.current).toBe("phone");
  });
});
