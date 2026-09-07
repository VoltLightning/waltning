/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

it("keeps hidden dialog content absent", () => {
  render(
    <ConfirmDialog
      visible={false}
      title="This can't be undone in one step"
      body="Every row moves."
      confirmLabel="Merge"
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  expect(screen.queryByText("Every row moves.")).toBeNull();
});

it("labels the visible dialog and confirms or cancels", () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      visible
      title="This can't be undone in one step"
      body="Every row moves."
      confirmLabel="Merge"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );

  expect(screen.getByLabelText("This can't be undone in one step")).toBeDefined();
  expect(screen.getByText("Every row moves.")).toBeDefined();

  screen.getByRole("button", { name: "Merge" }).click();
  expect(onConfirm).toHaveBeenCalledTimes(1);

  screen.getByRole("button", { name: "Cancel" }).click();
  expect(onCancel).toHaveBeenCalledTimes(1);
});

it("cancels from the backdrop too", () => {
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      visible
      title="This can't be undone in one step"
      body="Every row moves."
      confirmLabel="Merge"
      onConfirm={vi.fn()}
      onCancel={onCancel}
    />,
  );

  screen.getByRole("button", { name: "Dismiss This can't be undone in one step" }).click();
  expect(onCancel).toHaveBeenCalledTimes(1);
});
