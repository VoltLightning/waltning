/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BottomSheet } from "./bottom-sheet";

it("keeps hidden sheet content absent", () => {
  render(
    <BottomSheet visible={false} title="Appearance" onDismiss={vi.fn()}>
      choices
    </BottomSheet>,
  );
  expect(screen.queryByText("choices")).toBeNull();
});

it("labels visible content and dismisses from backdrop and Close", () => {
  const onDismiss = vi.fn();
  render(
    <BottomSheet visible title="Appearance" onDismiss={onDismiss}>
      <span>choices</span>
    </BottomSheet>,
  );
  expect(screen.getByLabelText("Appearance")).toBeDefined();
  screen.getByRole("button", { name: "Dismiss Appearance" }).click();
  screen.getByRole("button", { name: "Close" }).click();
  expect(onDismiss).toHaveBeenCalledTimes(2);
});
