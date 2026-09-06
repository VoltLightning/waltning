/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n/provider";
import { ThemeProvider } from "../theme/provider";
import { light } from "../theme/roles.ts";
import { CoverageStatus } from "./coverage-status";

/**
 * The same technique the tag version of this test used, moved from fill to
 * ink: distinguishable literal colours stand in for the real muted and amber
 * roles, asserted on the *computed* style of the caption itself. There is no
 * pill behind it any more — the meaning is in the sentence, and the colour
 * only reinforces it (P5).
 */
const MUTED_INK = "rgb(10, 20, 30)";
const AMBER_INK = "rgb(200, 90, 0)";
const inkTheme = { ...light, textMuted: MUTED_INK, assertedText: AMBER_INK };

function inkOf(label: string): string {
  return getComputedStyle(screen.getByText(label)).color;
}

function renderStatus(props: React.ComponentProps<typeof CoverageStatus>) {
  return render(
    <ThemeProvider theme={inkTheme}>
      <CoverageStatus {...props} />
    </ThemeProvider>,
  );
}

it("100% renders plainly, with no date", () => {
  renderStatus({ days: 100, realDays: 100, calendarDays: 100, futureRows: 0, pct: 100 });
  expect(screen.getByText("100%")).toBeDefined();
  expect(inkOf("100%")).toBe(MUTED_INK);
});

it("below 100% states the percentage and the last quote's date, amber", () => {
  renderStatus({
    days: 23,
    realDays: 23,
    calendarDays: 100,
    futureRows: 0,
    pct: 23,
    lastDate: "2022-03-11",
  });
  expect(screen.getByText("23% · last quote 2022-03-11")).toBeDefined();
  expect(inkOf("23% · last quote 2022-03-11")).toBe(AMBER_INK);
});

// H — `complete` used to read `realDays === calendarDays` unconditionally, so
// a currency added today (`calendarDays === 0`) satisfied `0 === 0` with
// nothing held at all and rendered muted — the same ink as a genuinely
// complete currency, on a line that says "no rates yet". Gating on
// `nothingHeld` keeps this amber.
it("0% — nothing held yet — says so, never a bare percentage, and stays amber", () => {
  renderStatus({ days: 0, realDays: 0, calendarDays: 0, futureRows: 0, pct: 0 });
  expect(screen.getByText("No rates yet · set one by hand")).toBeDefined();
  expect(screen.queryByText("0%")).toBeNull();
  expect(inkOf("No rates yet · set one by hand")).toBe(AMBER_INK);
});

/**
 * The design rule this component was renamed for: coverage is a measurement,
 * not a state, so it never renders as a `Tag` — no fill behind it, nothing
 * upper-cased, and no press target of its own (the row that hosts it is the
 * tap target now). Broken once by putting `<Tag>` back: the sentence comes
 * back shouting and this fails on the casing alone.
 */
it("renders as a plain caption — never a pill, never a button", () => {
  renderStatus({ days: 0, realDays: 0, calendarDays: 0, futureRows: 0, pct: 0 });
  const line = screen.getByText("No rates yet · set one by hand");
  expect(getComputedStyle(line).textTransform).not.toBe("uppercase");
  expect(screen.queryByRole("button")).toBeNull();
});

// H3 — a rounded percentage must never drive the decision. 9 rows over 2,080
// days floors to 0% but is not "no rates yet"; 2,075/2,080 floors to 99% but
// reads as incomplete, never "complete".
it("H3 — a nonzero days count is never 'no rates yet', even at a 0% floor", () => {
  render(
    <CoverageStatus
      days={9}
      realDays={9}
      calendarDays={2080}
      futureRows={0}
      pct={0}
      lastDate="2020-11-25"
    />,
  );
  expect(screen.queryByText("No rates yet · set one by hand")).toBeNull();
  expect(screen.getByText("0% · last quote 2020-11-25")).toBeDefined();
});

it("H3 — days short of calendarDays is never 'complete', even at a 100% ceiling", () => {
  render(
    <CoverageStatus
      days={2075}
      realDays={2075}
      calendarDays={2080}
      futureRows={0}
      pct={99}
      lastDate="2026-08-20"
    />,
  );
  expect(screen.getByText("99% · last quote 2026-08-20")).toBeDefined();
  expect(screen.queryByText("100%")).toBeNull();
});

// M3 — `days` (real + carried) reaching `calendarDays` used to read as
// "complete" even with just one real quote behind it, and `readCoverage`
// used to hand this component a `pct` derived from `days` rather than
// `realDays` — 1 real quote carried over 9 more days read `100%`. Both are
// fixed at the source now: `pct` is `realDays`-derived (1 of 10 is `10%`),
// and `complete` still decides on `realDays === calendarDays`, so the line
// stays amber with the real last-quote date stated.
it("M3 — filled to today by carry, but only realDays decides complete", () => {
  render(
    <CoverageStatus
      days={10}
      realDays={1}
      calendarDays={10}
      futureRows={0}
      pct={10}
      lastDate="2026-01-01"
    />,
  );
  expect(screen.getByText("10% · last quote 2026-01-01")).toBeDefined();
  expect(screen.queryByText("100%")).toBeNull();
});

// H2 — a currency with rows but no real quote at all (every row `carried_
// forward`) has no date to state, and must not read as a bare percentage.
it("H2 — no real quote at all says so, never a percentage with no date", () => {
  render(<CoverageStatus days={5} realDays={0} calendarDays={5} futureRows={0} pct={100} />);
  expect(screen.getByText("No quote yet")).toBeDefined();
  expect(screen.queryByText("100%")).toBeNull();
});

// L7 — `days === 0` reads identically whether nothing was ever set or every
// row held is future-dated (M4 excludes those from `days`). `futureRows`
// tells the two apart: rates are set, just none due yet.
it("L7 — days at 0 with futureRows held says so, never plain 'no rates yet', and stays amber", () => {
  renderStatus({ days: 0, realDays: 0, calendarDays: 0, futureRows: 2, pct: 0 });
  expect(screen.getByText("No rates yet · 2 set for later")).toBeDefined();
  expect(screen.queryByText("No rates yet · set one by hand")).toBeNull();
  expect(inkOf("No rates yet · 2 set for later")).toBe(AMBER_INK);
});

// L — Polish declines "set for later" by count where English does not:
// 1 → ustawiony, 2–4 → ustawione, 5+ → ustawionych. `i18n.test.tsx` proves
// `Intl.PluralRules("pl")` resolves four categories (`one`/`few`/`many`/
// `other`); this proves the catalogue's `noRatesYetFuture_*` keys say the
// right thing in each one, through the same `fx.noRatesYetFuture` call site
// `CoverageStatus` makes with `{ count: futureRows }`.
describe("L — the Polish plural for 'set for later'", () => {
  it.each([
    [1, "Brak kursów · 1 ustawiony na później"],
    [2, "Brak kursów · 2 ustawione na później"],
    [5, "Brak kursów · 5 ustawionych na później"],
    [1.5, "Brak kursów · 1.5 ustawionych na później"],
  ])("count=%s selects the right form", (count, expected) => {
    render(
      <I18nProvider locale="pl">
        <CoverageStatus days={0} realDays={0} calendarDays={0} futureRows={count} pct={0} />
      </I18nProvider>,
    );
    expect(screen.getByText(expected)).toBeDefined();
  });
});
