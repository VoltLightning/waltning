/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ErrorState } from "./error-state";

it("carries what failed, why, and an action for a recoverable error", () => {
  render(
    <ErrorState
      variant="recoverable"
      what="Couldn't reach the server"
      why="The connection timed out."
      action={{ label: "Retry", onPress: vi.fn() }}
    />,
  );
  expect(screen.getByText("Couldn't reach the server")).toBeDefined();
  expect(screen.getByText("The connection timed out.")).toBeDefined();
  expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
});

it("states the cost for a partial failure, and never a bare code", () => {
  render(
    <ErrorState
      variant="partial"
      what="Some rows didn't import"
      why="18 rows could not be read."
      cost="340 of 358 rows imported"
    />,
  );
  expect(screen.getByText("340 of 358 rows imported")).toBeDefined();
  expect(screen.queryByText(/^\d{3,}$/)).toBeNull();
});

it("retains the input for a terminal failure with no retry", () => {
  render(
    <ErrorState
      variant="terminal"
      what="Couldn't read this file"
      why="The file is not a supported format."
    />,
  );
  expect(screen.queryByRole("button")).toBeNull();
});
