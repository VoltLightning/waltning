/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CollisionFinder } from "./collision-finder";

it("renders nothing when there are no candidates", () => {
  const { container } = render(<CollisionFinder candidates={[]} onReview={vi.fn()} />);
  expect(container.firstChild).toBeNull();
});

it("names both categories with their usage counts, ranked highest first", () => {
  render(
    <CollisionFinder
      candidates={[
        {
          a: { id: "groceries", name: "Groceries", usageCount: 214 },
          b: { id: "grocery", name: "Grocery", usageCount: 3 },
          score: 0.83,
        },
      ]}
      onReview={vi.fn()}
    />,
  );

  expect(screen.getByText("Groceries · 214 transactions")).toBeDefined();
  expect(screen.getByText("Grocery · 3 transactions")).toBeDefined();
});

it("opens the merge sheet for the reviewed pair", () => {
  const onReview = vi.fn();
  render(
    <CollisionFinder
      candidates={[
        {
          a: { id: "groceries", name: "Groceries", usageCount: 214 },
          b: { id: "grocery", name: "Grocery", usageCount: 3 },
          score: 0.83,
        },
      ]}
      onReview={onReview}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Review" }));
  expect(onReview).toHaveBeenCalledWith("groceries", "grocery");
});
