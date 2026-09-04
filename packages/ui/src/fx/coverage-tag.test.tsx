/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme/provider";
import { light } from "../theme/roles.ts";
import { CoverageTag } from "./coverage-tag";

/**
 * The same technique `primitives.test.tsx` uses for `Tag`: distinguishable
 * literal colours stood in for the real `neutral`/`warn` fills, asserted on
 * the *computed* style rather than the stylesheet, because `Tag` applies its
 * fill inline (`FILL[variant]` resolved through the theme) rather than
 * through a stylesheet class.
 */
const NEUTRAL_FILL = "rgb(10, 20, 30)";
const WARN_FILL = "rgb(200, 90, 0)";
const variantTheme = { ...light, tagNeutralFill: NEUTRAL_FILL, assertedFill: WARN_FILL };

function fillOf(label: string): string {
  const el = screen.getByText(label).parentElement as HTMLElement;
  return getComputedStyle(el).backgroundColor;
}

function renderTag(props: React.ComponentProps<typeof CoverageTag>) {
  return render(
    <ThemeProvider theme={variantTheme}>
      <CoverageTag {...props} />
    </ThemeProvider>,
  );
}

it("100% renders plainly, with no date", () => {
  renderTag({ days: 100, realDays: 100, calendarDays: 100, pct: 100 });
  expect(screen.getByText("100%")).toBeDefined();
  expect(fillOf("100%")).toBe(NEUTRAL_FILL);
});

it("below 100% states the percentage and the last quote's date, amber", () => {
  renderTag({
    days: 23,
    realDays: 23,
    calendarDays: 100,
    pct: 23,
    lastDate: "2022-03-11",
  });
  expect(screen.getByText("23% · last quote 2022-03-11")).toBeDefined();
  expect(fillOf("23% · last quote 2022-03-11")).toBe(WARN_FILL);
});

// H — `complete` used to read `realDays === calendarDays` unconditionally, so
// a currency added today (`calendarDays === 0`) satisfied `0 === 0` with
// nothing held at all and rendered `neutral` — the same colour as a genuinely
// complete currency, on a tag that says "no rates yet". Gating on
// `nothingHeld` keeps this amber.
it("0% — nothing held yet — says so, never a bare percentage, and stays amber", () => {
  renderTag({ days: 0, realDays: 0, calendarDays: 0, pct: 0 });
  expect(screen.getByText("no rates yet · set one by hand")).toBeDefined();
  expect(screen.queryByText("0%")).toBeNull();
  expect(fillOf("no rates yet · set one by hand")).toBe(WARN_FILL);
});

it("0% with onPress renders as a button, tappable to seed a rate by hand", () => {
  const onPress = vi.fn();
  render(<CoverageTag days={0} realDays={0} calendarDays={0} pct={0} onPress={onPress} />);
  fireEvent.click(screen.getByRole("button"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it("with no onPress, static — a plain tag, not a button", () => {
  render(<CoverageTag days={23} realDays={23} calendarDays={100} pct={23} lastDate="2022-03-11" />);
  expect(screen.queryByRole("button")).toBeNull();
});

// H3 — a rounded percentage must never drive the decision. 9 rows over 2,080
// days floors to 0% but is not "no rates yet"; 2,075/2,080 floors to 99% but
// reads as incomplete, never "complete".
it("H3 — a nonzero days count is never 'no rates yet', even at a 0% floor", () => {
  render(<CoverageTag days={9} realDays={9} calendarDays={2080} pct={0} lastDate="2020-11-25" />);
  expect(screen.queryByText("no rates yet · set one by hand")).toBeNull();
  expect(screen.getByText("0% · last quote 2020-11-25")).toBeDefined();
});

it("H3 — days short of calendarDays is never 'complete', even at a 100% ceiling", () => {
  render(
    <CoverageTag days={2075} realDays={2075} calendarDays={2080} pct={99} lastDate="2026-08-20" />,
  );
  expect(screen.getByText("99% · last quote 2026-08-20")).toBeDefined();
  expect(screen.queryByText("100%")).toBeNull();
});

// M3 — `days` (real + carried) reaching `calendarDays` used to read as
// "complete" even with just one real quote behind it, and `readCoverage`
// used to hand this component a `pct` derived from `days` rather than
// `realDays` — 1 real quote carried over 9 more days read `100%`. Both are
// fixed at the source now: `pct` is `realDays`-derived (1 of 10 is `10%`),
// and `complete` still decides on `realDays === calendarDays`, so the tag
// stays amber with the real last-quote date stated.
it("M3 — filled to today by carry, but only realDays decides complete", () => {
  render(<CoverageTag days={10} realDays={1} calendarDays={10} pct={10} lastDate="2026-01-01" />);
  expect(screen.getByText("10% · last quote 2026-01-01")).toBeDefined();
  expect(screen.queryByText("100%")).toBeNull();
});

// H2 — a currency with rows but no real quote at all (every row `carried_
// forward`) has no date to state, and must not read as a bare percentage.
it("H2 — no real quote at all says so, never a percentage with no date", () => {
  render(<CoverageTag days={5} realDays={0} calendarDays={5} pct={100} />);
  expect(screen.getByText("no quote yet")).toBeDefined();
  expect(screen.queryByText("100%")).toBeNull();
});
