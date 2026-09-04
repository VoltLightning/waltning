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

  /**
   * M3 — "5," normalizes to "5.", a shape `zMoney` refuses (its regex
   * requires a digit after the mark once one is typed). Still mid-entry, the
   * same "not yet a number" state `"."` alone already returns `null` for —
   * the same rule `AmountField`'s own `parseAmount` states.
   */
  it("refuses a trailing separator rather than a shape zMoney would reject", () => {
    expect(parseRate("5,")).toBeNull();
    expect(parseRate("5.")).toBeNull();
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

  /**
   * H2 — a carried reference states the carry explicitly rather than folding
   * it silently into a bare date.
   */
  it("states the carry explicitly when the reference is carried forward", () => {
    render(
      <RateField
        label="Realized"
        value={toMoney("4.281")}
        reference={{
          rate: pivotPerUnit("4.312"),
          source: "nbp",
          date: "2026-08-05",
          carriedDays: 7,
        }}
      />,
    );
    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent === "reference 4.3120 · nbp · carried 7 d from 2026-08-05",
      ),
    ).toBeDefined();
  });

  /**
   * H1/H2 — the bug itself: `manual` used to overwrite `{{source}}`, gluing
   * "manual" to whichever leg's `date`/`carriedDays` happened to be shown —
   * "manual · carried 7 d from 2026-08-05" read as one claim (this manual
   * figure was carried from 2026-08-05) even when the correction actually
   * belonged to the *other* leg. `{{source}}` now always names the shown
   * leg's own, real source; `manual` renders as its own `Tag` beside the
   * line instead, an independent fact about the pair.
   */
  it("keeps the shown leg's real source and marks manual as its own tag (H1/H2)", () => {
    render(
      <RateField
        label="Realized"
        value={toMoney("4.281")}
        reference={{
          rate: pivotPerUnit("4.312"),
          source: "nbp",
          date: "2026-08-05",
          carriedDays: 7,
          manual: true,
        }}
      />,
    );
    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent === "reference 4.3120 · nbp · carried 7 d from 2026-08-05",
      ),
    ).toBeDefined();
    expect(screen.getByText("Manual")).toBeDefined();
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

  // L10 — the editable seed must not round an 8dp stored rate down to the
  // 4dp display default: opening a synced rate to edit it, untouched, must
  // not silently downgrade its precision before Save is ever pressed.
  it("L10 — seeds an 8dp stored rate at its own scale, not the 4dp display default", () => {
    render(<RateField label="Manual rate" value="4.02345678" editable onChange={vi.fn()} />);
    expect(screen.getByLabelText("Manual rate")).toHaveProperty("value", "4.02345678");
  });

  it("L10 — a value with fewer than 4 decimals still pads to the 4dp display default", () => {
    render(<RateField label="Manual rate" value="4.2" editable onChange={vi.fn()} />);
    expect(screen.getByLabelText("Manual rate")).toHaveProperty("value", "4.2000");
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

  // L — the editable field's own displayed text is the typed buffer
  // (`text`), never re-derived from the parsed/formatted value: reformatting
  // mid-type would erase whatever character the parser just rejected before
  // the next one could be typed (the same rule `AmountField`'s own editable
  // path already keeps).
  it("keeps the raw typed text on screen while it does not parse — never the formatted value", () => {
    render(<RateField label="Manual rate" value="" editable onChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Manual rate"), { target: { value: "4.5.6" } });
    expect(screen.getByLabelText("Manual rate")).toHaveProperty("value", "4.5.6");
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
