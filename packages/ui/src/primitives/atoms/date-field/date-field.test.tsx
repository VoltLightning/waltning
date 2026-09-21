/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DateField } from "./date-field";
import { pickDate } from "./date-field.test-support.ts";

/** `use-breakpoint.test.tsx`'s own real-resize technique: the desk's typed field, or the phone's drum. */
function resizeTo(width: number) {
  Object.defineProperty(document.documentElement, "clientWidth", {
    value: width,
    configurable: true,
  });
  window.dispatchEvent(new Event("resize"));
}

function noop() {}

const TODAY = "2026-09-03";

/**
 * **On a phone the field is the way in** — a tap opens the drum, with no typed
 * input and no row of chips in between (§3.7). It was *tap the field, find
 * the fourth chip, tap that*; on Add the whole arrangement sat inside a sheet
 * of its own as well.
 */
describe("on a phone", () => {
  beforeAll(() => resizeTo(390));

  it("is one button, named for what it holds", () => {
    render(<DateField label="Date" value={TODAY} onChange={noop} today={TODAY} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Date: Today" })).toBeDefined();
    expect(screen.queryByRole("textbox"), "nothing to type into").toBeNull();
  });

  it("says yesterday in a word, and any other day in full", () => {
    const { rerender } = render(
      <DateField label="Date" value="2026-09-02" onChange={noop} today={TODAY} />,
    );
    expect(screen.getByRole("button", { name: "Date: Yesterday" })).toBeDefined();
    rerender(<DateField label="Date" value="2026-03-04" onChange={noop} today={TODAY} />);
    expect(screen.getByRole("button", { name: "Date: March 4, 2026" })).toBeDefined();
  });

  it("opens the drum on a tap, and sets nothing until confirmed", () => {
    const onChange = vi.fn();
    render(<DateField label="Date" value={TODAY} onChange={onChange} today={TODAY} />);

    fireEvent.click(screen.getByRole("button", { name: "Date: Today" }));
    expect(screen.getByText("Use this date")).toBeDefined();
    expect(onChange, "opening a picker is not picking").not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Use this date"));
    expect(onChange).toHaveBeenCalledWith(TODAY);
  });

  it("takes the relative days from the drum's own chips", () => {
    const onChange = vi.fn();
    render(<DateField label="Date" value={TODAY} onChange={onChange} today={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: "Date: Today" }));
    fireEvent.click(screen.getByText("Yesterday"));
    fireEvent.click(screen.getByText("Use this date"));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("2026-09-02");
  });

  it("reaches any day by pressing the drum, year first so the day is not clamped away", () => {
    const onChange = vi.fn();
    render(<DateField label="Date" value="2026-01-31" onChange={onChange} today={TODAY} />);
    pickDate("Date", "2024-02-29");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("2024-02-29");
  });

  it("opens empty without complaint, and says how to fill it", () => {
    render(<DateField label="Opening date" value="" onChange={noop} today={TODAY} />);
    expect(screen.getByRole("button", { name: "Opening date: Pick a date" })).toBeDefined();
    expect(screen.queryByText("Not a valid date (YYYY-MM-DD).")).toBeNull();
  });

  it("still shows a refusal that came from somewhere else", () => {
    render(
      <DateField
        label="Date"
        value={TODAY}
        onChange={noop}
        today={TODAY}
        error="From the server"
      />,
    );
    expect(screen.getByText("From the server")).toBeDefined();
  });
});

/** The desk keeps the typed field: a keyboard is the right tool for a date there. */
describe("on a desk", () => {
  beforeAll(() => resizeTo(1440));
  afterAll(() => resizeTo(390));

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
    // Today, Yesterday, the weekday chip — and the way into the month grid.
    // The fourth is an *action*, not a fourth relative day.
    expect(buttons).toHaveLength(4);
    expect(buttons[3]?.textContent, "the grid's own affordance, last").toBe("Pick a date");
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
});
