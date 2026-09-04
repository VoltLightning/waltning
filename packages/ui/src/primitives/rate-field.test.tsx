/**
 * @vitest-environment jsdom
 *
 * `<RateField>` follows every other figure's rule: the decimal mark follows
 * the reader, never a hardcoded `.` (`design-system/04` §4.1, via
 * `decimalMark(locale)` — the same helper `<Amount>` renders through).
 */

import { render, screen } from "@testing-library/react";
import { pivotPerUnit, toMoney } from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n/provider";
import { RateField } from "./rate-field";

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
it("emits null for a value with two separators", () => {
  const onChange = vi.fn();
  render(<RateField label="Manual rate" value="" onChange={onChange} />);
  fireEvent.change(screen.getByLabelText("Manual rate"), { target: { value: "1,234.5" } });
  expect(onChange).toHaveBeenCalledWith(null);
});

it("rejects 0 — a rate is never zero", () => {
  const onChange = vi.fn();
  render(<RateField label="Manual rate" value="" onChange={onChange} />);
  fireEvent.change(screen.getByLabelText("Manual rate"), { target: { value: "0" } });
  expect(onChange).toHaveBeenCalledWith(null);
});

it("rejects an all-zero decimal", () => {
  const onChange = vi.fn();
  render(<RateField label="Manual rate" value="" onChange={onChange} />);
  fireEvent.change(screen.getByLabelText("Manual rate"), { target: { value: "0,00" } });
  expect(onChange).toHaveBeenCalledWith(null);
});

it("shows an inline error, unprompted, when what is typed is not a positive rate", () => {
  const onChange = vi.fn();
  render(<RateField label="Manual rate" value="" onChange={onChange} />);
  fireEvent.change(screen.getByLabelText("Manual rate"), { target: { value: "0" } });
  expect(screen.getByText("A rate must be a positive number.")).toBeDefined();
});

it("clears the inline error once a valid positive rate is typed", () => {
  const onChange = vi.fn();
  render(<RateField label="Manual rate" value="" onChange={onChange} />);
  fireEvent.change(screen.getByLabelText("Manual rate"), { target: { value: "0" } });
  expect(screen.getByText("A rate must be a positive number.")).toBeDefined();
  fireEvent.change(screen.getByLabelText("Manual rate"), { target: { value: "3.75" } });
  expect(screen.queryByText("A rate must be a positive number.")).toBeNull();
});

it("shows the synced source's own rate beside the field", () => {
  render(<RateField label="Manual rate" value="3.8000" syncedValue="3.7556" />);
  expect(screen.getByText("Synced: 3.7556")).toBeDefined();
});

it("shows the error in place of a synced value", () => {
  render(
    <RateField label="Manual rate" value="1,234.5" error="A rate takes one decimal separator." />,
  );
  expect(screen.getByText("A rate takes one decimal separator.")).toBeDefined();
});

it("read-only renders text, not an editable input", () => {
  render(<RateField label="Manual rate" value="3.7556" readOnly />);
  expect(screen.getByText("3.7556")).toBeDefined();
  expect(screen.queryByLabelText("Manual rate")).toBeNull();
});

it("read-only with no value shows a dash", () => {
  render(<RateField label="Manual rate" value="" readOnly />);
  expect(screen.getByText("—")).toBeDefined();
});

it("no synced value renders no synced line", () => {
  render(<RateField label="Manual rate" value="3.7556" onChange={noop} />);
  expect(screen.queryByText(/Synced:/)).toBeNull();
});
