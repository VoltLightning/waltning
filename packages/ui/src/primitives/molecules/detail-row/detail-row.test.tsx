/** @vitest-environment jsdom */

import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
import { DetailRow } from "./detail-row";

function draw(props: Parameters<typeof DetailRow>[0]) {
  return render(
    <ThemeProvider theme={light}>
      <DetailRow {...props} />
    </ThemeProvider>,
  );
}

/**
 * **A row that opens something is a button; one that only states a figure is
 * not.** The account row and the amount row look alike and behave differently,
 * and a screen reader has no way to tell them apart from the picture.
 */
it("is a button only when it opens something", () => {
  const opens = draw({ label: "Account", hint: "Bank A · PLN", onPress: vi.fn() });
  expect(opens.getByRole("button")).toBeDefined();
  opens.unmount();

  const states = draw({ label: "Adds up to", value: <span>48,90</span> });
  expect(states.queryByRole("button")).toBeNull();
  states.unmount();
});

/**
 * **The separator belongs to the row.** Every list that drew its own left a
 * rule under the last one, against the card's own edge — a doubled line at the
 * only place the card is already drawing a border.
 */
it("rules every row but the one told it is last", () => {
  const middle = draw({ label: "Category" });
  const row = middle.getByText("Category").parentElement?.parentElement;
  if (row == null) throw new Error("DetailRow drew no row");
  expect(getComputedStyle(row).borderBottomWidth).toBe("1px");
  middle.unmount();

  const end = draw({ label: "Date", last: true });
  const lastRow = end.getByText("Date").parentElement?.parentElement;
  if (lastRow == null) throw new Error("DetailRow drew no row");
  expect(getComputedStyle(lastRow).borderBottomWidth).toBe("0px");
  end.unmount();
});

/** §2.6's floor, on a row a finger is meant to hit. */
it("keeps a 44pt target", () => {
  const view = draw({ label: "Account", onPress: vi.fn() });
  expect(getComputedStyle(view.getByRole("button")).minHeight).toBe("44px");
  view.unmount();
});
