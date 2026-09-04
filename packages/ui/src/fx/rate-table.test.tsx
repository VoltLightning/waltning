/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n/provider";
import { RateTable } from "./rate-table";

const BASE = "USD";
const QUOTE = "PLN";

it("renders a gap for a date with no held rate", () => {
  render(
    <RateTable
      base={BASE}
      quote={QUOTE}
      from="2026-08-01"
      to="2026-08-03"
      rows={[
        { date: "2026-08-01", rate: "3.7556", source: "nbp" },
        { date: "2026-08-03", rate: "3.7601", source: "nbp" },
      ]}
    />,
  );
  expect(screen.getByText("2026-08-02")).toBeDefined();
  expect(screen.getAllByText("No rate held")).toHaveLength(1);
});

it("marks a manual row amber, distinct from a synced one, with a translated label", () => {
  render(
    <RateTable
      base={BASE}
      quote={QUOTE}
      from="2026-08-01"
      to="2026-08-01"
      rows={[{ date: "2026-08-01", rate: "3.9000", source: "manual" }]}
    />,
  );
  expect(screen.getByText("Manual")).toBeDefined();
  expect(screen.queryByText("manual")).toBeNull();
});

it("holds up to 4dp on the rate", () => {
  render(
    <RateTable
      base={BASE}
      quote={QUOTE}
      from="2026-08-01"
      to="2026-08-01"
      rows={[{ date: "2026-08-01", rate: "3.75560000", source: "nbp" }]}
    />,
  );
  expect(screen.getByText("3.7556")).toBeDefined();
});

it("renders the rate through the locale-aware helper — a comma in Polish", () => {
  render(
    <I18nProvider locale="pl">
      <RateTable
        base={BASE}
        quote={QUOTE}
        from="2026-08-01"
        to="2026-08-01"
        rows={[{ date: "2026-08-01", rate: "4.0231", source: "nbp" }]}
      />
    </I18nProvider>,
  );
  expect(screen.getByText("4,0231")).toBeDefined();
});

it("states which way the rate reads, in a column header — quote per base", () => {
  render(<RateTable base={BASE} quote={QUOTE} from="2026-08-01" to="2026-08-01" rows={[]} />);
  expect(screen.getByText("PLN per USD")).toBeDefined();
});

it("a carried-forward row states its age, never the raw enum", () => {
  render(
    <RateTable
      base={BASE}
      quote={QUOTE}
      from="2026-08-01"
      to="2026-08-01"
      rows={[{ date: "2026-08-01", rate: "3.7601", source: "carried_forward", carriedDays: 3 }]}
    />,
  );
  expect(screen.getByText("Carried · 3 d")).toBeDefined();
  expect(screen.queryByText("carried_forward")).toBeNull();
});

it("a tap seeds a single-day edit", () => {
  const onSelectRow = vi.fn();
  render(
    <RateTable
      base={BASE}
      quote={QUOTE}
      from="2026-08-01"
      to="2026-08-01"
      rows={[{ date: "2026-08-01", rate: "3.7556", source: "nbp" }]}
      onSelectRow={onSelectRow}
    />,
  );
  fireEvent.click(screen.getByLabelText("2026-08-01"));
  expect(onSelectRow).toHaveBeenCalledWith("2026-08-01");
});

it("an inverted range renders no rows", () => {
  render(<RateTable base={BASE} quote={QUOTE} from="2026-08-05" to="2026-08-01" rows={[]} />);
  expect(screen.getByText("The range must not end before it starts.")).toBeDefined();
});
