/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { useSharedValue } from "react-native-reanimated";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
import { cellsFor, DayRibbon, type RibbonDay } from "./day-ribbon";
import type { StripPlacement } from "./scrub.ts";

// Count what actually rendered rather than trusting `memo`, which is a hint
// the reconciler may ignore and which stops working silently the moment a
// parent hands down a fresh object or arrow.
const renders = new Map<string, number>();
vi.mock("../../atoms/day-cell/day-cell", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../atoms/day-cell/day-cell")>();
  const Real = actual.DayCell;
  const Counted = (props: Parameters<typeof Real>[0]) => {
    const key = props.accessibilityLabel;
    renders.set(key, (renders.get(key) ?? 0) + 1);
    return <Real {...props} />;
  };
  return { ...actual, DayCell: Counted };
});

const QUIET: RibbonDay = {
  date: "2026-08-13",
  day: 13,
  weekday: "W",
  activity: "none",
  label: "Wednesday 13 August, nothing",
};
const HEAVY: RibbonDay = {
  date: "2026-08-14",
  day: 14,
  weekday: "T",
  activity: "heavy",
  direction: "out",
  label: "Thursday 14 August, 296 out, 3 entries",
};
const SOME: RibbonDay = {
  date: "2026-08-15",
  day: 15,
  weekday: "F",
  activity: "some",
  direction: "in",
  label: "Friday 15 August, 7 850 in, 1 entry",
};
const DAYS: readonly RibbonDay[] = [QUIET, HEAVY, SOME];

/**
 * The component, wired to a list that is not going anywhere.
 *
 * **What this suite can and cannot see.** The scrubbing is a frame callback
 * writing to a native scroller, and jsdom has neither — `.vitest/reanimated.ts`
 * says so at the stubs. So these tests cover what a *render* decides: the
 * labels, the press, which cells are drawn, and the render counts that keep a
 * fling cheap. Where the strip physically sits is `scrub.ts`'s arithmetic
 * (tested directly), a story the visual suite shoots in a real browser, and
 * `tools/e2e` against the built app.
 */
function Wired({
  days = DAYS,
  current = "2026-08-14",
  onPickDay,
}: {
  days?: readonly RibbonDay[];
  current?: string | null;
  onPickDay: (date: string) => void;
}) {
  const scrollY = useSharedValue(0);
  const placement = useSharedValue<StripPlacement>({ tops: [0], marks: [0] });
  return (
    <DayRibbon
      days={days}
      current={current}
      scrollY={scrollY}
      placement={placement}
      onPickDay={onPickDay}
    />
  );
}

function draw(props: { days?: readonly RibbonDay[]; current?: string | null } = {}) {
  const onPickDay = vi.fn();
  const view = render(
    <ThemeProvider theme={light}>
      <Wired onPickDay={onPickDay} {...props} />
    </ThemeProvider>,
  );
  return { ...view, onPickDay };
}

beforeEach(() => renders.clear());

it("names a day by its date and what happened, never by the bare number", () => {
  draw();
  // The number is what the eye reads; it is not what a screen reader should hear.
  expect(screen.getByRole("button", { name: /Thursday 14 August, 296 out/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "14" })).toBeNull();
});

it("asks the list to move rather than placing itself", () => {
  const { onPickDay } = draw();
  screen.getByRole("button", { name: /Friday 15 August/ }).click();
  // Tapping asks the list to go there and nothing else. The strip follows
  // because the list moved, never because the strip decided — which is the
  // rule the rewrite strengthened rather than dropped.
  expect(onPickDay).toHaveBeenCalledExactlyOnceWith("2026-08-15");
});

it("re-renders only the two cells whose mark changed when the list moves a day", () => {
  const onPickDay = vi.fn();
  const view = render(
    <ThemeProvider theme={light}>
      <Wired current="2026-08-14" onPickDay={onPickDay} />
    </ThemeProvider>,
  );
  const before = new Map(renders);

  view.rerender(
    <ThemeProvider theme={light}>
      <Wired current="2026-08-15" onPickDay={onPickDay} />
    </ThemeProvider>,
  );

  const delta = (label: string) => (renders.get(label) ?? 0) - (before.get(label) ?? 0);
  // The day that lost the mark and the day that gained it, and nothing else.
  expect(delta(HEAVY.label)).toBe(1);
  expect(delta(SOME.label)).toBe(1);
  expect(delta(QUIET.label)).toBe(0);
});

it("re-renders no cell at all when only the parent re-rendered", () => {
  const onPickDay = vi.fn();
  const tree = (
    <ThemeProvider theme={light}>
      <Wired current="2026-08-14" onPickDay={onPickDay} />
    </ThemeProvider>
  );
  const view = render(tree);
  const before = renders.get(HEAVY.label) ?? 0;

  // A strip whose label changed — "August 2026" to "Aug – Sep 2026" — must not
  // cost sixty cell renders. This is the fling case, and it is why `onPickDay`
  // is one stable function rather than an arrow per cell.
  view.rerender(tree);

  expect(renders.get(HEAVY.label) ?? 0).toBe(before);
});

it("keeps a flat day neutral — money moved and none of it left", () => {
  // A day of transfers between your own accounts nets to zero. Colouring it
  // either way would be a claim about direction the day does not make, and
  // marking it "nothing" would hide that anything happened at all.
  const flat: RibbonDay = {
    date: "2026-08-16",
    day: 16,
    weekday: "S",
    activity: "some",
    direction: "flat",
    label: "Saturday 16 August, moved between your accounts, 2 entries",
  };
  draw({ days: [flat], current: "2026-08-16" });
  expect(screen.getByRole("button", { name: /moved between your accounts/ })).toBeTruthy();
});

describe("how many days past today are drawn", () => {
  const ahead = (date: string, day: number): RibbonDay => ({
    date,
    day,
    weekday: "M",
    activity: "none",
    ahead: true,
    label: `${date}, not yet`,
  });
  // The supply, which is the screen's ceiling rather than the count.
  const SUPPLIED: readonly RibbonDay[] = [
    ...DAYS,
    ...Array.from({ length: 16 }, (_, i) => ahead(`2026-08-${16 + i}`, 16 + i)),
  ];

  it("draws as many as the band has room for, and no more", () => {
    // 390 is the phone: three loaded days, and four quiet ones to carry the
    // run to the right-hand edge.
    const drawn = cellsFor(SUPPLIED, 390);
    expect(drawn.filter((d) => d.ahead === true)).toHaveLength(4);
    // Every loaded day survives, whatever the band.
    expect(drawn.filter((d) => d.ahead !== true)).toHaveLength(DAYS.length);
  });

  it("draws more of them on a wider band", () => {
    const narrow = cellsFor(SUPPLIED, 320).length;
    const wide = cellsFor(SUPPLIED, 768).length;
    expect(wide).toBeGreaterThan(narrow);
  });

  it("draws none of them before the band is measured", () => {
    // Sixteen cells placed against a width of nothing are sixteen cells in one
    // place. No answer beats a wrong one for the one frame before `onLayout`.
    expect(cellsFor(SUPPLIED, 0)).toEqual(DAYS);
  });

  it("never runs out of supply before it runs out of band", () => {
    // The screen supplies a ceiling; if the band ever wants more than that,
    // the strip stops short of its own edge and the ring sits at the end of a
    // run that appears truncated — the defect the ahead days exist to fix.
    const drawn = cellsFor(SUPPLIED, 1024);
    expect(drawn.filter((d) => d.ahead === true).length).toBeLessThan(16);
  });
});
