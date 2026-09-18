/**
 * @vitest-environment jsdom
 *
 * The drum itself cannot be rolled here — jsdom does not drive
 * `react-native-web`'s scrolling, which is why `visual/wheel.spec.ts` exists.
 * What *is* testable here is everything around it, and it is the part with the
 * decisions in it: when a value is committed, and whether a lit chip is
 * telling the truth.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { accountingDate } from "@waltning/core/date";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n/provider";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
import { DatePicker } from "./date-picker";

const TODAY = accountingDate("2026-09-18");

function open(value = TODAY, onChange = vi.fn(), onDismiss = vi.fn()) {
  render(
    <I18nProvider locale="en">
      <ThemeProvider theme={light}>
        <DatePicker
          prompt="When did this happen?"
          value={value}
          onChange={onChange}
          today={TODAY}
          onDismiss={onDismiss}
        />
      </ThemeProvider>
    </I18nProvider>,
  );
  return { onChange, onDismiss };
}

describe("a date is committed once, when the reader says so", () => {
  /**
   * **Not on every roll.** A wheel passes over ten values on the way to one,
   * and a field that changed under each of them would run a form's validation
   * ten times and announce ten values to a screen reader.
   */
  it("reports nothing until confirm", () => {
    const { onChange } = open();
    fireEvent.click(screen.getByText("Yesterday"));
    expect(onChange, "picking a chip is not committing").not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Use this date"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("2026-09-17");
  });

  it("reports nothing at all on cancel", () => {
    const { onChange, onDismiss } = open();
    fireEvent.click(screen.getByText("Yesterday"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(onChange, "a cancelled pick is not a pick").not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });
});

/** The chip's own element carries the state; the label is a child of it. */
function checkedOf(label: string): string | null {
  const chip = screen.getByText(label).closest("[aria-checked]");
  if (chip === null) throw new Error(`no chip carries a checked state for ${label}`);
  return chip.getAttribute("aria-checked");
}

describe("a lit chip tells the truth", () => {
  it("lights the one that matches the value it opened on", () => {
    open();
    expect(checkedOf("Today"), "today, on today").toBe("true");
  });

  it("moves the light when another chip is picked", () => {
    open();
    fireEvent.click(screen.getByText("Yesterday"));
    expect(checkedOf("Today")).toBe("false");
    expect(checkedOf("Yesterday")).toBe("true");
  });

  it("lights none of them for a date no chip names", () => {
    open(accountingDate("2026-03-04"));
    for (const label of ["Today", "Yesterday"]) {
      expect(checkedOf(label), label).toBe("false");
    }
  });
});

describe("the day column", () => {
  it("offers only days the month has", () => {
    open(accountingDate("2026-02-10"));
    const day = screen.getByLabelText("Day");
    expect(day.textContent, "February stops at 28").toContain("28");
    expect(day.textContent, "and offers no 29th in 2026").not.toContain("29");
  });

  it("offers the 29th in a leap February", () => {
    open(accountingDate("2024-02-10"));
    expect(screen.getByLabelText("Day").textContent).toContain("29");
  });
});
