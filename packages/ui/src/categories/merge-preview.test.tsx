/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { MergePreview } from "./merge-preview";

it("names the direction and every count the write will move", () => {
  render(
    <MergePreview
      loserName="Eating out"
      winnerName="Groceries"
      counts={{ transactions: 12, lines: 3, rules: 1 }}
    />,
  );

  expect(screen.getByText("Eating out → Groceries")).toBeDefined();
  expect(screen.getByText("Transactions")).toBeDefined();
  expect(screen.getByText("12")).toBeDefined();
  expect(screen.getByText("Lines")).toBeDefined();
  expect(screen.getByText("3")).toBeDefined();
  expect(screen.getByText("Rules")).toBeDefined();
  expect(screen.getByText("1")).toBeDefined();
});
