/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { timeOfDay } from "@waltning/core/date";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n/provider";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
import { TimeField } from "./time-field";

/** `use-breakpoint.test.tsx`'s own real-resize technique: the desk's typed field, or the phone's drum. */
function resizeTo(width: number) {
  Object.defineProperty(document.documentElement, "clientWidth", {
    value: width,
    configurable: true,
  });
  window.dispatchEvent(new Event("resize"));
}

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

/**
 * **On a phone the field is the way in**, as `DateField` is: one button, and a
 * tap opens the drum — where *Now* is a chip and *No time* is an action.
 */
describe("on a phone", () => {
  beforeAll(() => resizeTo(390));

  it("is one button that says it holds nothing, and complains about nothing", () => {
    draw("");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Time: No time" })).toBeTruthy();
    expect(screen.queryByRole("textbox"), "nothing to type into").toBeNull();
    expect(screen.queryByText(/Not a valid time/)).toBeNull();
  });

  it("sets the clock's own minute from the drum's Now", () => {
    const { onChange } = draw("");
    fireEvent.click(screen.getByRole("button", { name: "Time: No time" }));
    fireEvent.click(screen.getByText("Now"));
    expect(onChange, "a chip is not a commit").not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Use this time"));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("14:37");
  });

  it("takes a time back off as empty, never as midnight — from inside the drum", () => {
    const { onChange } = draw("08:12");
    fireEvent.click(screen.getByRole("button", { name: "Time: 08:12" }));
    fireEvent.click(screen.getByText("No time"));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("");
  });

  it("offers nothing to take off where there is no time", () => {
    draw("");
    fireEvent.click(screen.getByRole("button", { name: "Time: No time" }));
    // The field's own placeholder is behind the sheet; the drum offers Cancel
    // and Use only.
    expect(screen.queryByRole("button", { name: "No time" })).toBeNull();
  });
});

/** The desk keeps the typed field, read loosely and refused out loud. */
describe("on a desk", () => {
  beforeAll(() => resizeTo(1440));
  afterAll(() => resizeTo(390));

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

  it("is not an error while it reads as a time, however loosely written", () => {
    draw("0930");
    expect(screen.queryByText(/Not a valid time/)).toBeNull();
  });

  it("is refused out loud when it is not one", () => {
    draw("25:00");
    expect(screen.getByText(/Not a valid time/)).toBeTruthy();
  });
});
