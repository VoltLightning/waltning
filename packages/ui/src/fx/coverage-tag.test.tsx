/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CoverageTag } from "./coverage-tag";

it("100% renders plainly, with no date", () => {
  render(<CoverageTag days={100} calendarDays={100} pct={100} />);
  expect(screen.getByText("100%")).toBeDefined();
});

it("below 100% states the percentage and the last quote's date", () => {
  render(<CoverageTag days={23} calendarDays={100} pct={23} lastDate="2022-03-11" />);
  expect(screen.getByText("23% · last quote 2022-03-11")).toBeDefined();
});

it("0% — nothing held yet — says so, never a bare percentage", () => {
  render(<CoverageTag days={0} calendarDays={0} pct={0} />);
  expect(screen.getByText("no rates yet · set one by hand")).toBeDefined();
  expect(screen.queryByText("0%")).toBeNull();
});

it("0% with onPress renders as a button, tappable to seed a rate by hand", () => {
  const onPress = vi.fn();
  render(<CoverageTag days={0} calendarDays={0} pct={0} onPress={onPress} />);
  fireEvent.click(screen.getByRole("button"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it("with no onPress, static — a plain tag, not a button", () => {
  render(<CoverageTag days={23} calendarDays={100} pct={23} lastDate="2022-03-11" />);
  expect(screen.queryByRole("button")).toBeNull();
});

// H3 — a rounded percentage must never drive the decision. 9 rows over 2,080
// days floors to 0% but is not "no rates yet"; 2,075/2,080 floors to 99% but
// reads as incomplete, never "complete".
it("H3 — a nonzero days count is never 'no rates yet', even at a 0% floor", () => {
  render(<CoverageTag days={9} calendarDays={2080} pct={0} lastDate="2020-11-25" />);
  expect(screen.queryByText("no rates yet · set one by hand")).toBeNull();
  expect(screen.getByText("0% · last quote 2020-11-25")).toBeDefined();
});

it("H3 — days short of calendarDays is never 'complete', even at a 100% ceiling", () => {
  render(<CoverageTag days={2075} calendarDays={2080} pct={99} lastDate="2026-08-20" />);
  expect(screen.getByText("99% · last quote 2026-08-20")).toBeDefined();
  expect(screen.queryByText("100%")).toBeNull();
});
