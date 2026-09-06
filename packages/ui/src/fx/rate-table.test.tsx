/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { Text } from "react-native";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n/provider";
import { RateTable, type RateTablePair } from "./rate-table";

const BASE = "USD";
const QUOTE = "PLN";

/** One day, one pair — the shape most of these need, with the day's rows filled in. */
function pair(overrides: Partial<RateTablePair> = {}): RateTablePair {
  return {
    base: BASE,
    quote: QUOTE,
    from: "2026-08-01",
    to: "2026-08-01",
    rows: [],
    ...overrides,
  };
}

it("renders a gap for a date with no held rate", () => {
  render(
    <RateTable
      pair={pair({
        to: "2026-08-03",
        rows: [
          { date: "2026-08-01", rate: "3.7556", source: "nbp" },
          { date: "2026-08-03", rate: "3.7601", source: "nbp" },
        ],
      })}
    />,
  );
  expect(screen.getByText("2026-08-02")).toBeDefined();
  expect(screen.getAllByText("No rate held")).toHaveLength(1);
});

it("marks a manual row amber, distinct from a synced one, with a translated label", () => {
  render(
    <RateTable pair={pair({ rows: [{ date: "2026-08-01", rate: "3.9000", source: "manual" }] })} />,
  );
  expect(screen.getByText("Manual")).toBeDefined();
  expect(screen.queryByText("manual")).toBeNull();
});

it("holds up to 4dp on the rate", () => {
  render(
    <RateTable
      pair={pair({ rows: [{ date: "2026-08-01", rate: "3.75560000", source: "nbp" }] })}
    />,
  );
  expect(screen.getByText("3.7556")).toBeDefined();
});

it("renders the rate through the locale-aware helper — a comma in Polish", () => {
  render(
    <I18nProvider locale="pl">
      <RateTable pair={pair({ rows: [{ date: "2026-08-01", rate: "4.0231", source: "nbp" }] })} />
    </I18nProvider>,
  );
  expect(screen.getByText("4,0231")).toBeDefined();
});

it("states which way the rate reads, in a column header — quote per base", () => {
  render(<RateTable pair={pair()} />);
  expect(screen.getByText("PLN per USD")).toBeDefined();
});

it("a carried-forward row states its age, never the raw enum", () => {
  render(
    <RateTable
      pair={pair({
        rows: [{ date: "2026-08-01", rate: "3.7601", source: "carried_forward", carriedDays: 3 }],
      })}
    />,
  );
  expect(screen.getByText("Carried · 3 d")).toBeDefined();
  expect(screen.queryByText("carried_forward")).toBeNull();
});

// L8 — an unrecognised source states so plainly; it is not "Manual" just
// because that used to be the fallback.
it("an unrecognised source renders 'Unknown', never 'Manual'", () => {
  render(
    <RateTable
      pair={pair({ rows: [{ date: "2026-08-01", rate: "3.7601", source: "some_future_source" }] })}
    />,
  );
  expect(screen.getByText("Unknown")).toBeDefined();
  expect(screen.queryByText("Manual")).toBeNull();
});

// C2 — an unlocatable origin (`carriedDays: null`) states its age as
// unknown, never `0 d`, which would read as an exact quote.
it("a carried-forward row with an unlocatable origin states its age as unknown", () => {
  render(
    <RateTable
      pair={pair({
        rows: [
          { date: "2026-08-01", rate: "3.7601", source: "carried_forward", carriedDays: null },
        ],
      })}
    />,
  );
  expect(screen.getByText("Carried · age not known")).toBeDefined();
  expect(screen.queryByText("Carried · 0 d")).toBeNull();
});

it("a tap seeds a single-day edit", () => {
  const onSelectRow = vi.fn();
  render(
    <RateTable
      pair={pair({ rows: [{ date: "2026-08-01", rate: "3.7556", source: "nbp" }], onSelectRow })}
    />,
  );
  fireEvent.click(screen.getByLabelText("2026-08-01"));
  expect(onSelectRow).toHaveBeenCalledWith("2026-08-01");
});

it("an inverted range renders no rows", () => {
  render(<RateTable pair={pair({ from: "2026-08-05", to: "2026-08-01" })} />);
  expect(screen.getByText("The range must not end before it starts.")).toBeDefined();
});

/**
 * This list is the hosting screen's one scroller, so the screen's own content
 * rides **inside** it. Broken once by rendering `header`/`footer` as siblings
 * of the `FlatList` — the page stops scrolling with the table and the last
 * card ends flush with the device's bottom edge, which is the defect this
 * shape exists to fix.
 *
 * Asserted by *containment*, not presence: a sibling arrangement satisfies
 * `getByText` at document scope unchanged, so a presence assertion could not
 * fail for the reason it names.
 */
it("carries the screen's own header and footer inside the one list", () => {
  render(
    <RateTable
      pair={pair({ rows: [{ date: "2026-08-01", rate: "3.7556", source: "nbp" }] })}
      header={<Text>the screen's controls</Text>}
      footer={<Text>the coverage card</Text>}
    />,
  );
  const list = screen.getByTestId("rate-table");
  expect(list.contains(screen.getByText("the screen's controls"))).toBe(true);
  expect(list.contains(screen.getByText("the coverage card"))).toBe(true);
  expect(list.contains(screen.getByText("3.7556"))).toBe(true);
});

/**
 * `pair === null` is *nothing to table* — no quote currency, no pivot, a
 * range that does not parse. The list still renders, because it is the page:
 * a screen whose scroller disappeared in those states is a screen that stops
 * scrolling exactly when the hint explaining why is on it.
 */
it("with no pair, keeps the scroller and its header and footer, and states nothing about a range", () => {
  render(
    <RateTable
      pair={null}
      header={<Text>the screen's controls</Text>}
      footer={<Text>the coverage card</Text>}
    />,
  );
  const list = screen.getByTestId("rate-table");
  expect(list.contains(screen.getByText("the screen's controls"))).toBe(true);
  expect(list.contains(screen.getByText("the coverage card"))).toBe(true);
  expect(screen.queryByText("PLN per USD")).toBeNull();
  expect(screen.queryByText("The range must not end before it starts.")).toBeNull();
});
