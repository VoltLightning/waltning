/**
 * @vitest-environment jsdom
 *
 * `<RateField>` follows every other figure's rule: the decimal mark follows
 * the reader, never a hardcoded `.` (`design-system/04` §4.1, via
 * `decimalMark(locale)` — the same helper `<Amount>` renders through).
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { pivotPerUnit, toMoney } from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n/provider";
import { parseRate, RateField } from "./rate-field";

describe("parseRate", () => {
  it("accepts a dot-separated positive rate", () => {
    expect(parseRate("4.281")).toBe("4.281");
  });

  it("accepts a comma-separated positive rate — a Polish keyboard's own key", () => {
    expect(parseRate("4,281")).toBe("4.281");
  });

  it("refuses a value with two separators", () => {
    expect(parseRate("1,234.5")).toBeNull();
  });

  it("refuses 0 — a rate is never zero", () => {
    expect(parseRate("0")).toBeNull();
  });

  it("refuses an all-zero decimal", () => {
    expect(parseRate("0,00")).toBeNull();
  });

  it("refuses a negative rate", () => {
    expect(parseRate("-4.281")).toBeNull();
  });

  it("refuses malformed input", () => {
    expect(parseRate("abc")).toBeNull();
    expect(parseRate("")).toBeNull();
  });
});

describe("RateField", () => {
  it("renders the dot under English", () => {
    render(<RateField label="Realized" value={toMoney("4.281")} />);
    expect(screen.getByText("4.2810")).toBeDefined();
  });

  it("renders the comma under Polish — the same mark every other figure uses", () => {
    render(
      <I18nProvider locale="pl">
        <RateField label="Realized" value={toMoney("4.281")} />
      </I18nProvider>,
    );
    expect(screen.getByText("4,2810")).toBeDefined();
    expect(screen.queryByText("4.2810")).toBeNull();
  });

  it("renders the reference rate through the same locale mark", () => {
    render(
      <I18nProvider locale="pl">
        <RateField
          label="Realized"
          value={toMoney("4.281")}
          reference={{ rate: pivotPerUnit("4.312"), source: "nbp", date: "2026-08-10" }}
        />
      </I18nProvider>,
    );
    expect(
      screen.getByText(
        (_, element) => element?.textContent === "referencyjny 4,3120 · nbp · 2026-08-10",
      ),
    ).toBeDefined();
  });

  it("shows the unit beside the label — the direction a rate has no reading without", () => {
    render(<RateField label="Rate" value={toMoney("4.281")} unit="PLN per USD" />);
    expect(screen.getByText("PLN per USD")).toBeDefined();
  });

  // L10 — an editable field's own seeded text follows the reader's decimal
  // mark, never the always-dot storage form echoed back unformatted.
  it("seeds the editable buffer through the locale's own decimal mark", () => {
    render(
      <I18nProvider locale="pl">
        <RateField label="Manual rate" value="4.2810" editable onChange={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByLabelText("Manual rate")).toHaveProperty("value", "4,2810");
  });

  it("emits the parsed rate as it is typed", () => {
    const onChange = vi.fn();
    render(<RateField label="Manual rate" value="" editable onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Manual rate"), { target: { value: "3.75" } });
    expect(onChange).toHaveBeenCalledWith("3.75");
  });

  it("emits null for a value with two separators", () => {
    const onChange = vi.fn();
    render(<RateField label="Manual rate" value="" editable onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Manual rate"), { target: { value: "1,234.5" } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("rejects 0 — a rate is never zero", () => {
    const onChange = vi.fn();
    render(<RateField label="Manual rate" value="" editable onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Manual rate"), { target: { value: "0" } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("shows an inline error, unprompted, when what is typed is not a positive rate", () => {
    const onChange = vi.fn();
    render(<RateField label="Manual rate" value="" editable onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Manual rate"), { target: { value: "0" } });
    expect(screen.getByText("A rate must be a positive number.")).toBeDefined();
  });

  it("clears the inline error once a valid positive rate is typed", () => {
    const onChange = vi.fn();
    render(<RateField label="Manual rate" value="" editable onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Manual rate"), { target: { value: "0" } });
    expect(screen.getByText("A rate must be a positive number.")).toBeDefined();
    fireEvent.change(screen.getByLabelText("Manual rate"), { target: { value: "3.75" } });
    expect(screen.queryByText("A rate must be a positive number.")).toBeNull();
  });

  it("shows the caller's own error in place of the field's unprompted one", () => {
    render(
      <RateField
        label="Manual rate"
        value="1,234.5"
        editable
        onChange={vi.fn()}
        error="A rate takes one decimal separator."
      />,
    );
    expect(screen.getByText("A rate takes one decimal separator.")).toBeDefined();
  });

  it("read-only renders text, not an editable input", () => {
    render(<RateField label="Manual rate" value={toMoney("3.7556")} />);
    expect(screen.getByText("3.7556")).toBeDefined();
    expect(screen.queryByLabelText("Manual rate")).toBeNull();
  });
});
