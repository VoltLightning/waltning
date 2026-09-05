/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LedgerSelectionBar } from "./ledger-selection-bar";

describe("LedgerSelectionBar", () => {
  it("renders nothing when nothing is selected", () => {
    const { container } = render(
      <LedgerSelectionBar count={0} onCategorize={vi.fn()} onClear={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("states the count once at least one row is selected", () => {
    render(<LedgerSelectionBar count={24} onCategorize={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText("24 selected")).toBeDefined();
  });

  it("Categorise calls onCategorize", () => {
    const onCategorize = vi.fn();
    render(<LedgerSelectionBar count={3} onCategorize={onCategorize} onClear={vi.fn()} />);
    fireEvent.click(screen.getByText("Categorise"));
    expect(onCategorize).toHaveBeenCalled();
  });

  it("Clear calls onClear", () => {
    const onClear = vi.fn();
    render(<LedgerSelectionBar count={3} onCategorize={vi.fn()} onClear={onClear} />);
    fireEvent.click(screen.getByText("Clear"));
    expect(onClear).toHaveBeenCalled();
  });
});
