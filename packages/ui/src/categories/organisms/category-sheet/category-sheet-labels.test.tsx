/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { I18nProvider } from "../../../i18n/provider";
import { CategorySheet } from "./category-sheet";

function noop() {}

it("the picker finds a starter by the name it shows, and by the stored one", () => {
  const tree = [
    {
      id: "g",
      parentId: null,
      name: "Food",
      kind: "expense" as const,
      isLeaf: false,
      externalId: "seed:food",
    },
    {
      id: "a",
      parentId: "g",
      name: "Groceries",
      kind: "expense" as const,
      isLeaf: true,
      externalId: "seed:groceries",
    },
    {
      id: "b",
      parentId: "g",
      name: "Taxi",
      kind: "expense" as const,
      isLeaf: true,
      externalId: "seed:taxi",
    },
  ];
  render(
    <I18nProvider locale="de">
      <CategorySheet visible kind="expense" tree={tree} onPick={noop} onDismiss={noop} />
    </I18nProvider>,
  );
  expect(screen.getAllByText("Lebensmittel").length).toBeGreaterThan(0);
  expect(screen.queryByText("Groceries")).toBeNull();
  const search = screen.getByRole("textbox") as HTMLInputElement;
  fireEvent.change(search, { target: { value: "lebens" } });
  expect(screen.getAllByText("Lebensmittel").length).toBeGreaterThan(0);
  expect(screen.queryByText("Taxi")).toBeNull();
  fireEvent.change(search, { target: { value: "grocer" } });
  expect(screen.getAllByText("Lebensmittel").length).toBeGreaterThan(0);
});
