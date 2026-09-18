/**
 * @vitest-environment jsdom
 *
 * The grid's shape is `weeks.test.ts`'s arithmetic. What is left here is what
 * the component promises on top of it: that picking is answering, that today
 * keeps its mark wherever the reader pages to, and that paging changes the
 * month without changing the value.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { accountingDate } from "@waltning/core/date";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n/provider";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
import { Calendar } from "./calendar";

const TODAY = accountingDate("2026-09-18");
const ANCHOR = { x: 24, y: 240, width: 320, height: 44 };

function open(value = TODAY, onChange = vi.fn()) {
  render(
    <I18nProvider locale="en">
      <ThemeProvider theme={light}>
        <Calendar
          label="Date"
          value={value}
          onChange={onChange}
          today={TODAY}
          anchor={ANCHOR}
          onDismiss={vi.fn()}
        />
      </ThemeProvider>
    </I18nProvider>,
  );
  return { onChange };
}

describe("picking is answering", () => {
  it("reports the day as soon as it is clicked", () => {
    const { onChange } = open();
    fireEvent.click(screen.getByRole("button", { name: /September 14, 2026/ }));
    expect(onChange).toHaveBeenCalledWith("2026-09-14");
  });

  /**
   * The asymmetry with `DatePicker` is deliberate and worth pinning: a drum
   * passes over ten values on the way to one and needs a moment to mean it,
   * where a click on the 14th means the 14th. There is no confirm here.
   */
  it("offers nothing to confirm", () => {
    open();
    expect(screen.queryByText("Use this date"), "no confirm on the desk").toBeNull();
  });
});

describe("paging months", () => {
  it("changes the grid without changing the value", () => {
    const { onChange } = open();
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByText("August 2026")).toBeDefined();
    expect(onChange, "paging is not picking").not.toHaveBeenCalled();
  });

  it("crosses a year boundary", () => {
    open(accountingDate("2026-01-10"));
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByText("December 2025")).toBeDefined();
  });
});

describe("a day out of its month", () => {
  it("is still offered, because the grid is always six rows", () => {
    const { onChange } = open(accountingDate("2026-09-03"));
    // 31 August sits in September's lead row.
    fireEvent.click(screen.getByRole("button", { name: /August 31, 2026/ }));
    expect(onChange).toHaveBeenCalledWith("2026-08-31");
  });
});
