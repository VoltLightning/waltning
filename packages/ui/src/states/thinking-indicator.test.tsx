/** @vitest-environment jsdom */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThinkingIndicator } from "./thinking-indicator";

describe("ThinkingIndicator", () => {
  it("shows no elapsed timer before 2 s", () => {
    render(<ThinkingIndicator phase="thinking" elapsedMs={500} onCancel={vi.fn()} />);
    expect(screen.getByText("Thinking")).toBeDefined();
  });

  it("shows the elapsed timer once 2 s have passed", () => {
    render(<ThinkingIndicator phase="thinking" elapsedMs={3_000} onCancel={vi.fn()} />);
    expect(screen.getByText("Thinking · 3s")).toBeDefined();
  });

  it("names the tool while one runs", () => {
    render(
      <ThinkingIndicator
        phase="tool"
        elapsedMs={4_000}
        toolLabel="search_transactions · 1.2 s"
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("search_transactions · 1.2 s")).toBeDefined();
  });

  it("streams the text as it arrives", () => {
    render(
      <ThinkingIndicator
        phase="streaming"
        elapsedMs={5_000}
        streamingText="Found three transactions"
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Found three transactions")).toBeDefined();
  });

  it("offers no cancel before 20 s", () => {
    render(<ThinkingIndicator phase="thinking" elapsedMs={19_999} onCancel={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers an explicit still-working cancel at 20 s", () => {
    const onCancel = vi.fn();
    render(<ThinkingIndicator phase="thinking" elapsedMs={20_000} onCancel={onCancel} />);
    expect(screen.getByText("Still working")).toBeDefined();
    screen.getByRole("button", { name: "Cancel" }).click();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("shows the dot beside the thinking label", () => {
    render(<ThinkingIndicator phase="thinking" elapsedMs={500} onCancel={vi.fn()} />);
    expect(screen.getByTestId("thinking-dots")).toBeDefined();
  });

  it("shows the dot beside the tool label too", () => {
    render(
      <ThinkingIndicator
        phase="tool"
        elapsedMs={1_000}
        toolLabel="search_transactions · 1.2 s"
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId("thinking-dots")).toBeDefined();
  });

  it("shows no dot while streaming — the arriving text is its own sign of life", () => {
    render(
      <ThinkingIndicator
        phase="streaming"
        elapsedMs={5_000}
        streamingText="Found three transactions"
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("thinking-dots")).toBeNull();
  });

  describe("the dot beat", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("steps one, two, three, drop on a 250 ms beat and repeats", () => {
      render(<ThinkingIndicator phase="thinking" elapsedMs={500} onCancel={vi.fn()} />);
      const dots = () => screen.getByTestId("thinking-dots").textContent;

      expect(dots()).toBe(".");
      act(() => vi.advanceTimersByTime(250));
      expect(dots()).toBe("..");
      act(() => vi.advanceTimersByTime(250));
      expect(dots()).toBe("...");
      act(() => vi.advanceTimersByTime(250));
      expect(dots()).toBe("");
      act(() => vi.advanceTimersByTime(250));
      expect(dots()).toBe(".");
    });

    it("clears the interval on unmount", () => {
      const setSpy = vi.spyOn(globalThis, "setInterval");
      const clearSpy = vi.spyOn(globalThis, "clearInterval");
      const { unmount } = render(
        <ThinkingIndicator phase="thinking" elapsedMs={500} onCancel={vi.fn()} />,
      );
      const id = setSpy.mock.results[0]?.value;
      unmount();
      expect(clearSpy).toHaveBeenCalledWith(id);
    });

    it("clears the interval when the phase becomes streaming", () => {
      const setSpy = vi.spyOn(globalThis, "setInterval");
      const clearSpy = vi.spyOn(globalThis, "clearInterval");
      const { rerender } = render(
        <ThinkingIndicator phase="thinking" elapsedMs={500} onCancel={vi.fn()} />,
      );
      const id = setSpy.mock.results[0]?.value;
      rerender(
        <ThinkingIndicator
          phase="streaming"
          elapsedMs={500}
          streamingText="Found it"
          onCancel={vi.fn()}
        />,
      );
      expect(clearSpy).toHaveBeenCalledWith(id);
    });
  });
});
