/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { CoverageTag } from "./coverage-tag";

it("100% renders plainly, with no date", () => {
  render(<CoverageTag pct={100} />);
  expect(screen.getByText("100%")).toBeDefined();
});

it("below 100% states the percentage and the last quote's date", () => {
  render(<CoverageTag pct={23} lastDate="2022-03-11" />);
  expect(screen.getByText("23% · last quote 2022-03-11")).toBeDefined();
});

it("below 100% with no date yet held falls back to the bare percentage", () => {
  render(<CoverageTag pct={0} />);
  expect(screen.getByText("0%")).toBeDefined();
});
