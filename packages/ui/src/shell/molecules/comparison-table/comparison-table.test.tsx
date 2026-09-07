/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ComparisonTable } from "./comparison-table";

it("renders every row's label and value", () => {
  render(
    <ComparisonTable
      rows={[
        { label: "Transactions", value: "12" },
        { label: "Lines", value: "3" },
        { label: "Rules", value: "1" },
      ]}
    />,
  );

  expect(screen.getByText("Transactions")).toBeDefined();
  expect(screen.getByText("12")).toBeDefined();
  expect(screen.getByText("Lines")).toBeDefined();
  expect(screen.getByText("3")).toBeDefined();
  expect(screen.getByText("Rules")).toBeDefined();
  expect(screen.getByText("1")).toBeDefined();
});

/** §6.8 — a capital exclusion states itself inline, never silently. */
it("shows a row's note beside its label", () => {
  render(
    <ComparisonTable
      rows={[{ label: "Spend", value: "3 420 zł", note: "excludes 1 one-off", tone: "negative" }]}
    />,
  );

  expect(screen.getByText("excludes 1 one-off")).toBeDefined();
});
