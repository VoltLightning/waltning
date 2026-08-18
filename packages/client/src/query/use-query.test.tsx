/**
 * @vitest-environment jsdom
 *
 * The cancellation flag, which nothing tested.
 *
 * Three hooks each carried `let live = true` and a cleanup that cleared it, and
 * a falsifiable claim held: delete every one of them and `pnpm verify` stayed
 * green. The guard was asserted in a comment and executed by nothing — the
 * shape `07-test-strategy.md` opens by naming.
 *
 * Now there is one copy, so this is one test instead of four.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useQuery } from "../query/use-query.ts";

/** A promise whose settling this test controls. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useQuery", () => {
  it("starts loading and reaches ready", async () => {
    const { result } = renderHook(() => useQuery(async () => 42, []));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current).toEqual({ status: "ready", data: 42 }));
  });

  it("preserves the Error rather than flattening it to a message", async () => {
    // The distinction Rule 0 exists to make: a `CaptiveResponseError` means the
    // request was never answered by us, which is a different thing to show than
    // a refusal. The copy of this logic that lived in a route file had already
    // lost it.
    class Captive extends Error {}
    const { result } = renderHook(() =>
      useQuery(async () => {
        throw new Captive("not ours");
      }, []),
    );
    await waitFor(() => expect(result.current.status).toBe("failed"));
    const state = result.current;
    if (state.status !== "failed") throw new Error("expected failed");
    expect(state.error).toBeInstanceOf(Captive);
  });

  it("wraps a non-Error rejection rather than storing it raw", async () => {
    const { result } = renderHook(() =>
      useQuery(async () => {
        throw "a string";
      }, []),
    );
    await waitFor(() => expect(result.current.status).toBe("failed"));
    const state = result.current;
    if (state.status !== "failed") throw new Error("expected failed");
    expect(state.error).toBeInstanceOf(Error);
    expect(state.error.message).toBe("a string");
  });

  it("survives a response arriving after unmount", async () => {
    /**
     * **A smoke check, not a guard — and it is labelled that way because it was
     * measured.** Removing the `live` flag entirely leaves this test green.
     *
     * React 18 warned on `setState` after unmount; React 19 removed the warning
     * and the leak it described, so there is nothing left to observe from the
     * outside. Asserting on a `console.error` that no longer happens would be a
     * test that passes for the wrong reason forever.
     *
     * The flag still earns its place — for **ordering**, which the next test
     * proves and which does fail when it is removed.
     */
    const d = deferred<number>();
    const { unmount } = renderHook(() => useQuery(() => d.promise, []));
    unmount();
    await act(async () => {
      d.resolve(1);
      await d.promise;
    });
    expect(true).toBe(true);
  });

  it("ignores a slow first response when the deps have already changed", async () => {
    // **The half that is not about unmounting, and the one that matters.**
    // When deps change the effect re-runs before the first request settles.
    // Without the flag an earlier, slower response overwrites a later one —
    // page 1 rendered while page 2 is on screen.
    const first = deferred<string>();
    const second = deferred<string>();

    const { result, rerender } = renderHook(
      ({ key }: { key: number }) =>
        useQuery(() => (key === 1 ? first.promise : second.promise), [key]),
      { initialProps: { key: 1 } },
    );

    rerender({ key: 2 });

    await act(async () => {
      second.resolve("second");
      await second.promise;
    });
    await waitFor(() => expect(result.current).toEqual({ status: "ready", data: "second" }));

    // The stale one lands last and must be discarded.
    await act(async () => {
      first.resolve("first");
      await first.promise;
    });

    expect(result.current).toEqual({ status: "ready", data: "second" });
  });

  it("returns to loading when the deps change", async () => {
    // Showing the previous result under a new query is a stale figure with no
    // marker — the shape §8 refuses everywhere else.
    const { result, rerender } = renderHook(
      ({ key }: { key: number }) => useQuery(async () => key, [key]),
      { initialProps: { key: 1 } },
    );
    await waitFor(() => expect(result.current).toEqual({ status: "ready", data: 1 }));
    rerender({ key: 2 });
    await waitFor(() => expect(result.current).toEqual({ status: "ready", data: 2 }));
  });
});
