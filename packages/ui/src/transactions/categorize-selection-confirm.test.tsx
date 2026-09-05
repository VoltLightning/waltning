/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CategorizeSelectionConfirm } from "./categorize-selection-confirm";

describe("CategorizeSelectionConfirm", () => {
  it("states the count and the target category, singular", () => {
    render(
      <CategorizeSelectionConfirm
        count={1}
        categoryName="Eating out"
        state="pending"
        onApprove={vi.fn()}
        onDecline={vi.fn()}
      />,
    );
    expect(screen.getByText("Categorise 1 transaction as Eating out?")).toBeDefined();
  });

  it("states the count and the target category, plural", () => {
    render(
      <CategorizeSelectionConfirm
        count={24}
        categoryName="Eating out"
        state="pending"
        onApprove={vi.fn()}
        onDecline={vi.fn()}
      />,
    );
    expect(screen.getByText("Categorise 24 transactions as Eating out?")).toBeDefined();
  });

  it("Approve and Decline call back", () => {
    const onApprove = vi.fn();
    const onDecline = vi.fn();
    render(
      <CategorizeSelectionConfirm
        count={2}
        categoryName="Groceries"
        state="pending"
        onApprove={onApprove}
        onDecline={onDecline}
      />,
    );
    fireEvent.click(screen.getByText("Approve"));
    expect(onApprove).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Decline"));
    expect(onDecline).toHaveBeenCalled();
  });

  it("shows a stated reason on error, never the raw thrown message", () => {
    render(
      <CategorizeSelectionConfirm
        count={2}
        categoryName="Groceries"
        state="error"
        onApprove={vi.fn()}
        onDecline={vi.fn()}
      />,
    );
    expect(screen.getByText(/no longer eligible/)).toBeDefined();
  });

  it("renders an applied line once approved, and drops the actions", () => {
    render(
      <CategorizeSelectionConfirm
        count={2}
        categoryName="Groceries"
        state="approved"
        onApprove={vi.fn()}
        onDecline={vi.fn()}
      />,
    );
    expect(screen.getByText("2 transactions recategorised")).toBeDefined();
    expect(screen.queryByText("Approve")).toBeNull();
  });

  it("an approved card with onDismiss offers a way off screen", () => {
    const onDismiss = vi.fn();
    render(
      <CategorizeSelectionConfirm
        count={2}
        categoryName="Groceries"
        state="approved"
        onApprove={vi.fn()}
        onDecline={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByText("Close"));
    expect(onDismiss).toHaveBeenCalled();
  });
});
