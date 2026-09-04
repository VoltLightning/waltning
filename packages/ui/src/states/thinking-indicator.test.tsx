/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThinkingIndicator } from "./thinking-indicator";

describe("ThinkingIndicator", () => {
  it("shows no elapsed timer before 2 s", () => {
    render(<ThinkingIndicator phase="thinking" elapsedMs={500} onCancel={vi.fn()} />);
    expect(screen.getByText("Thinking…")).toBeDefined();
  });

  it("shows the elapsed timer once 2 s have passed", () => {
    render(<ThinkingIndicator phase="thinking" elapsedMs={3_000} onCancel={vi.fn()} />);
    expect(screen.getByText("Thinking… · 3s")).toBeDefined();
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

  it("renders three dots beside the thinking label", () => {
    render(<ThinkingIndicator phase="thinking" elapsedMs={500} onCancel={vi.fn()} />);
    expect(screen.getAllByTestId("thinking-dot")).toHaveLength(3);
  });

  it("renders three dots beside the tool label too", () => {
    render(
      <ThinkingIndicator
        phase="tool"
        elapsedMs={1_000}
        toolLabel="search_transactions · 1.2 s"
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId("thinking-dot")).toHaveLength(3);
  });

  it("shows no dots while streaming — the arriving text is its own sign of life", () => {
    render(
      <ThinkingIndicator
        phase="streaming"
        elapsedMs={5_000}
        streamingText="Found three transactions"
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryAllByTestId("thinking-dot")).toHaveLength(0);
  });
});
