/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { EmptyState } from "./empty-state";

it("offers only Create account in the checkpoint first-run state", () => {
  render(
    <EmptyState
      title="No accounts yet"
      body="Create one account to start your phone ledger."
      primaryAction={{ label: "Create account", onPress: vi.fn() }}
    />,
  );
  expect(screen.getByText("No accounts yet")).toBeDefined();
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Create account" })).toBeDefined();
  expect(screen.queryByText(/Import/)).toBeNull();
});
