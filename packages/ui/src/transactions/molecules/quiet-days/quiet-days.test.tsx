/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
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

it("names the span in the action, not just the word Show", () => {
  // A reader hearing four "Show" buttons in one scroll cannot tell which
  // stretch of days each of them opens.
  draw(
    <QuietRun
      label="3 – 27 August"
      summary="25 days · nothing recorded"
      showLabel="Show"
      onShow={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "Show: 3 – 27 August" })).toBeTruthy();
});

it("opens a run only when asked", () => {
  // A run that expanded on approach would move everything under the reader's
  // thumb — and its contents being worth less than the space is why it was
  // collapsed.
  const onShow = vi.fn();
  draw(<QuietRun label="3 – 27 August" summary="25 days" showLabel="Show" onShow={onShow} />);
  expect(onShow).not.toHaveBeenCalled();
  screen.getByRole("button", { name: /Show/ }).click();
  expect(onShow).toHaveBeenCalledOnce();
});

it("holds no copy of its own", () => {
  draw(<QuietDay label="środa 13 sierpnia" emptyLabel="nic" />);
  expect(screen.getByText("nic")).toBeTruthy();
});
