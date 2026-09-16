/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SearchField } from "./search-field";

function noop() {}

it("shows no clear control with an empty value", () => {
  render(<SearchField value="" onChangeText={noop} placeholder="Search" />);
  expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
});

it("shows the clear control once there is a value, and clears through it", () => {
  const onChangeText = vi.fn();
  const onClear = vi.fn();
  render(
    <SearchField
      value="coffee"
      onChangeText={onChangeText}
      placeholder="Search"
      onClear={onClear}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear" }));
  expect(onChangeText).toHaveBeenCalledWith("");
  expect(onClear).toHaveBeenCalled();
});

it("carries the widget role, not the landmark one", () => {
  render(<SearchField value="" onChangeText={noop} placeholder="Search" />);
  expect(screen.getByRole("searchbox", { name: "Search" })).toBeDefined();
});

it("says nothing with no result count", () => {
  render(<SearchField value="" onChangeText={noop} placeholder="Search" />);
  expect(screen.queryByText(/result/)).toBeNull();
});

it("announces a single result in the singular", () => {
  render(<SearchField value="cof" onChangeText={noop} placeholder="Search" resultCount={1} />);
  const region = screen.getByText("1 result");
  expect(region.getAttribute("aria-live")).toBe("polite");
});

it("announces more than one result in the other form, including zero", () => {
  render(<SearchField value="cof" onChangeText={noop} placeholder="Search" resultCount={0} />);
  expect(screen.getByText("0 results")).toBeDefined();
});

/**
 * **The way out of a pinned search.** S04 §7 keeps this field open "for as
 * long as the search is on", and the × was its only exit — hidden, by the
 * clear control's own rule, exactly when nothing was typed. Opening the search
 * and typing nothing left the reader in a narrowed ledger with no way back.
 */
it("offers the way out on an empty field when there is a search to leave", () => {
  const onDismiss = vi.fn();
  const onChangeText = vi.fn();
  render(
    <SearchField value="" onChangeText={onChangeText} placeholder="Search" onDismiss={onDismiss} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Close search" }));
  expect(onDismiss).toHaveBeenCalledOnce();
});

/** Without one, an empty field's × is still a target with nothing to do. */
it("hides the clear control on an empty field that has nowhere to go", () => {
  render(<SearchField value="" onChangeText={vi.fn()} placeholder="Search" onClear={vi.fn()} />);
  expect(screen.queryByRole("button", { name: /Clear|Close search/ })).toBeNull();
});
