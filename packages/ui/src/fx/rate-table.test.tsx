/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RateTable } from "./rate-table";

it("renders a gap for a date with no held rate", () => {
  render(
    <RateTable
      from="2026-08-01"
      to="2026-08-03"
      rows={[
        { date: "2026-08-01", rate: "3.7556", source: "nbp" },
        { date: "2026-08-03", rate: "3.7601", source: "nbp" },
      ]}
    />,
  );
  expect(screen.getByText("2026-08-02")).toBeDefined();
  expect(screen.getAllByText("No rate held")).toHaveLength(1);
});

it("marks a manual row amber, distinct from a synced one", () => {
  render(
    <RateTable
      from="2026-08-01"
      to="2026-08-01"
      rows={[{ date: "2026-08-01", rate: "3.9000", source: "manual" }]}
    />,
  );
  expect(screen.getByText("manual")).toBeDefined();
});

it("holds up to 4dp on the rate", () => {
  render(
    <RateTable
      from="2026-08-01"
      to="2026-08-01"
      rows={[{ date: "2026-08-01", rate: "3.75560000", source: "nbp" }]}
    />,
  );
  expect(screen.getByText("3.7556")).toBeDefined();
});

it("a tap seeds a single-day edit", () => {
  const onSelectRow = vi.fn();
  render(
    <RateTable
      from="2026-08-01"
      to="2026-08-01"
      rows={[{ date: "2026-08-01", rate: "3.7556", source: "nbp" }]}
      onSelectRow={onSelectRow}
    />,
  );
  fireEvent.click(screen.getByLabelText("2026-08-01"));
  expect(onSelectRow).toHaveBeenCalledWith("2026-08-01");
});

it("an inverted range renders no rows", () => {
  render(<RateTable from="2026-08-05" to="2026-08-01" rows={[]} />);
  expect(screen.getByText("The range must not end before it starts.")).toBeDefined();
});
