/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { timeOfDay } from "@waltning/core/date";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n/provider";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
import { TimePicker } from "./time-picker";

const NOW = timeOfDay("14:37");

function open(value = timeOfDay("08:12"), onChange = vi.fn(), onDismiss = vi.fn()) {
  render(
    <I18nProvider locale="en">
      <ThemeProvider theme={light}>
        <TimePicker
          prompt="At what time?"
          value={value}
          onChange={onChange}
          now={NOW}
          onDismiss={onDismiss}
        />
      </ThemeProvider>
    </I18nProvider>,
  );
  return { onChange, onDismiss };
}

describe("a time is committed once, when the reader says so", () => {
  it("reports nothing until confirm, and then the chip's own minute", () => {
    // **`Now` is 14:37, not 14:35.** A minute column in steps of five could
    // not band the row the chip lands on; this one offers all sixty.
    const { onChange } = open();
    fireEvent.click(screen.getByText("Now"));
    expect(onChange, "picking a chip is not committing").not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Use this time"));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("14:37");
  });

  it("reports nothing at all on cancel", () => {
    const { onChange, onDismiss } = open();
    fireEvent.click(screen.getByText("12:00"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(onChange, "a cancelled pick is not a pick").not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });

  it("confirms what it opened on when nothing was touched", () => {
    const { onChange } = open(timeOfDay("23:59"));
    fireEvent.click(screen.getByText("Use this time"));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("23:59");
  });
});

describe("the two columns", () => {
  it("are named for a screen reader, which cannot see which is which", () => {
    open();
    expect(screen.getByLabelText("Hours")).toBeTruthy();
    expect(screen.getByLabelText("Minutes")).toBeTruthy();
  });
});
