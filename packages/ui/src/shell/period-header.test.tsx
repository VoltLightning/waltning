/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme/provider";
import { light } from "../theme/roles.ts";
import { PeriodHeader } from "./period-header";

describe("PeriodHeader", () => {
  it("steps with the arrows", () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    render(
      <PeriodHeader
        label="August 2026"
        onPrevious={onPrevious}
        onNext={onNext}
        onToday={vi.fn()}
        isCurrent={true}
      />,
    );

    expect(screen.getByText("August 2026")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Previous period" }));
    expect(onPrevious).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Next period" }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("hides Today when the shown period already is the current one", () => {
    render(
      <PeriodHeader
        label="August 2026"
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        onToday={vi.fn()}
        isCurrent={true}
      />,
    );
    expect(screen.queryByText("Today")).toBeNull();
  });

  it("offers Today once the shown period is not the current one, and it fires", () => {
    const onToday = vi.fn();
    render(
      <PeriodHeader
        label="July 2026"
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        onToday={onToday}
        isCurrent={false}
      />,
    );
    fireEvent.click(screen.getByText("Today"));
    expect(onToday).toHaveBeenCalledOnce();
  });

  /**
   * **The tone reaches the arrows, which no token census can say.**
   *
   * `theme.test.tsx` proves `shellNavActiveFill` is readable under
   * `shellText`; `icon-button.test.tsx` proves `tone="shell"` selects it.
   * Neither notices `tone={onSurface ? "ground" : "shell"}` being deleted from
   * this file — the fix would be gone and every row still green, which is how
   * the 1.10:1 hover got here in the first place. This renders the header on
   * its own ground and asks the arrow what it paints.
   */
  it("hands its arrows the band's tone, not the ground's", () => {
    const view = render(
      <ThemeProvider theme={light}>
        <PeriodHeader
          label="August 2026"
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          onToday={vi.fn()}
          isCurrent={true}
        />
      </ThemeProvider>,
    );
    const [previous] = view.getAllByRole("button");
    if (previous === undefined) throw new Error("PeriodHeader draws no arrow");
    fireEvent.pointerEnter(previous);
    expect(getComputedStyle(previous).backgroundColor).toBe("rgba(255, 255, 255, 0.1)");
    view.unmount();
  });

  /** And `tone="surface"` is the other half of the same prop — the desk rail's card. */
  it("hands them the ground's fill when it is drawn on a card", () => {
    const view = render(
      <ThemeProvider theme={light}>
        <PeriodHeader
          label="August 2026"
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          onToday={vi.fn()}
          isCurrent={true}
          tone="surface"
        />
      </ThemeProvider>,
    );
    const [previous] = view.getAllByRole("button");
    if (previous === undefined) throw new Error("PeriodHeader draws no arrow");
    fireEvent.pointerEnter(previous);
    expect(getComputedStyle(previous).backgroundColor).toBe("rgb(236, 229, 215)");
    view.unmount();
  });
});

/**
 * **The ring on the band, asserted where it renders.**
 *
 * `theme.test.tsx` proves `shellFocusRing` clears 3:1 on `shell` — a property
 * of two hex strings. It cannot notice this component going back to the green
 * one: the whole ring fix was deletable with 1,127 tests green, which is the
 * same shape as the `tone` prop that shipped unasserted one round earlier. A
 * ring is only real in a rendered outline.
 */
it("focuses Today with the band's ring, and with the page's on a card", () => {
  for (const [tone, expected] of [
    ["shell", "rgb(242, 240, 231)"],
    ["surface", "rgb(100, 129, 92)"],
  ] as const) {
    const view = render(
      <ThemeProvider theme={light}>
        <PeriodHeader
          label="August 2026"
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          onToday={vi.fn()}
          isCurrent={false}
          tone={tone}
        />
      </ThemeProvider>,
    );
    const today = view.getAllByRole("button").at(-1);
    if (today === undefined) throw new Error("Today has no pressable");
    fireEvent.focusIn(today);
    expect(getComputedStyle(today).outlineColor, tone).toBe(expected);
    view.unmount();
  }
});
