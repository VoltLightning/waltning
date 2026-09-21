/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
import { QuietDay, QuietRun } from "./quiet-days";

function draw(node: React.ReactNode) {
  return render(<ThemeProvider theme={light}>{node}</ThemeProvider>);
}

it("draws one quiet day as a line with nothing to press", () => {
  draw(<QuietDay label="Wednesday 13 August" emptyLabel="nothing" />);
  expect(screen.getByText("Wednesday 13 August")).toBeTruthy();
  expect(screen.queryAllByRole("button")).toHaveLength(0);
});

it("draws a run of quiet days as the same line, with the range on it", () => {
  // It was a card with a *Show* button — the loudest thing in a list of rows
  // that actually hold something, offering to show a run of days with nothing
  // on them.
  draw(<QuietRun label="3 – 27 August" summary="25 days · nothing recorded" />);
  expect(screen.getByText("3 – 27 August")).toBeTruthy();
  expect(screen.getByText("25 days · nothing recorded")).toBeTruthy();
  expect(screen.queryAllByRole("button"), "nothing to press").toHaveLength(0);
});

it("holds no copy of its own", () => {
  draw(<QuietDay label="środa 13 sierpnia" emptyLabel="nic" />);
  expect(screen.getByText("nic")).toBeTruthy();
});
