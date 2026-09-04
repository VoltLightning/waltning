/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CoverageTag } from "./coverage-tag";

it("100% renders plainly, with no date", () => {
  render(<CoverageTag pct={100} />);
  expect(screen.getByText("100%")).toBeDefined();
});

it("below 100% states the percentage and the last quote's date", () => {
  render(<CoverageTag pct={23} lastDate="2022-03-11" />);
  expect(screen.getByText("23% · last quote 2022-03-11")).toBeDefined();
});

it("0% — nothing held yet — says so, never a bare percentage", () => {
  render(<CoverageTag pct={0} />);
  expect(screen.getByText("no rates yet · set one by hand")).toBeDefined();
  expect(screen.queryByText("0%")).toBeNull();
});

it("0% with onPress renders as a button, tappable to seed a rate by hand", () => {
  const onPress = vi.fn();
  render(<CoverageTag pct={0} onPress={onPress} />);
  fireEvent.click(screen.getByRole("button"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it("with no onPress, static — a plain tag, not a button", () => {
  render(<CoverageTag pct={23} lastDate="2022-03-11" />);
  expect(screen.queryByRole("button")).toBeNull();
});
