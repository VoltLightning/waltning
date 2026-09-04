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
});
