/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DateField } from "./date-field";

function noop() {}

const TODAY = "2026-09-03";

it("the Today chip sets the exact device date", () => {
  const onChange = vi.fn();
  render(<DateField label="Date" value={TODAY} onChange={onChange} today={TODAY} />);
  fireEvent.click(screen.getByRole("button", { name: "Today" }));
  expect(onChange).toHaveBeenCalledWith("2026-09-03");
});

it("the Yesterday chip sets today minus one day", () => {
  const onChange = vi.fn();
  render(<DateField label="Date" value={TODAY} onChange={onChange} today={TODAY} />);
  fireEvent.click(screen.getByRole("button", { name: "Yesterday" }));
  expect(onChange).toHaveBeenCalledWith("2026-09-02");
});

it("the third chip is the weekday two days ago, and sets that exact date", () => {
  const onChange = vi.fn();
  render(<DateField label="Date" value={TODAY} onChange={onChange} today={TODAY} />);
  const buttons = screen.getAllByRole("button");
  // Today, Yesterday, then the weekday chip — the field carries no other buttons.
  expect(buttons).toHaveLength(3);
  expect(buttons[2]?.textContent).toBe("Tuesday");
  fireEvent.click(buttons[2] as HTMLElement);
  expect(onChange).toHaveBeenCalledWith("2026-09-01");
});

it("refuses a date that matches the shape but not the calendar", () => {
  render(<DateField label="Date" value="2026-02-30" onChange={noop} today={TODAY} />);
  expect(screen.getByText("Not a valid date (YYYY-MM-DD).")).toBeDefined();
});

it("accepts a real calendar date with no error", () => {
  render(<DateField label="Date" value="2026-02-28" onChange={noop} today={TODAY} />);
  expect(screen.queryByText("Not a valid date (YYYY-MM-DD).")).toBeNull();
});

it("stays valid while empty — a blank date is unset, not malformed", () => {
  render(<DateField label="Date" value="" onChange={noop} today={TODAY} />);
  expect(screen.queryByText("Not a valid date (YYYY-MM-DD).")).toBeNull();
});

it("an external error wins over the field's own calendar check", () => {
  render(
    <DateField
      label="Date"
      value="2026-02-30"
      onChange={noop}
      today={TODAY}
      error="From the server"
    />,
  );
  expect(screen.getByText("From the server")).toBeDefined();
  expect(screen.queryByText("Not a valid date (YYYY-MM-DD).")).toBeNull();
});

it("keeps TextField's label and value contract", () => {
  const onChange = vi.fn();
  render(<DateField label="Opening date" value="" onChange={onChange} today={TODAY} />);
  fireEvent.change(screen.getByLabelText("Opening date"), { target: { value: "2026-01-15" } });
  expect(onChange).toHaveBeenCalledWith("2026-01-15");
});
