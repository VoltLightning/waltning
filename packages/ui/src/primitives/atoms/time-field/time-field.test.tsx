/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { timeOfDay } from "@waltning/core/date";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n/provider";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
import { TimeField } from "./time-field";

function draw(value: string, onChange = vi.fn()) {
  render(
    <I18nProvider locale="en">
      <ThemeProvider theme={light}>
        <TimeField label="Time" value={value} onChange={onChange} now={timeOfDay("14:37")} />
      </ThemeProvider>
    </I18nProvider>,
  );
  return { onChange };
}

describe("a time is optional, and the field says so", () => {
  it("opens empty without complaining, and offers nothing to clear", () => {
    draw("");
    expect(screen.queryByText(/Not a valid time/)).toBeNull();
    // Only the placeholder says *No time*; there is no chip to take off a time
    // that is not there.
    expect(screen.queryByRole("button", { name: "No time" })).toBeNull();
  });

  it("takes a time back off as empty, never as midnight", () => {
    const { onChange } = draw("08:12");
    fireEvent.click(screen.getByRole("button", { name: "No time" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("");
  });

  it("sets the clock's own minute in one tap", () => {
    const { onChange } = draw("");
    fireEvent.click(screen.getByRole("button", { name: "Now" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("14:37");
  });
});

describe("what is typed", () => {
  it("is not an error while it reads as a time, however loosely written", () => {
    draw("0930");
    expect(screen.queryByText(/Not a valid time/)).toBeNull();
  });

  it("is refused out loud when it is not one", () => {
    draw("25:00");
    expect(screen.getByText(/Not a valid time/)).toBeTruthy();
  });
});
