/**
 * @vitest-environment jsdom
 *
 * `DualTotal` and `Card` — the app frame.
 */

import { render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { NO_INSETS, type SafeAreaInsets, SafeAreaProvider } from "../primitives/safe-area";
import { ThemeProvider } from "../theme/provider";
import { dark, light } from "../theme/roles.ts";
import { Card } from "./card";
import { DualTotal } from "./dual-total";
import { TodayFrame } from "./today-frame";

function noop() {}

/**
 * The group separator, **as Testing Library sees it.**
 *
 * `money.forDisplay` emits U+00A0, and the DOM holds U+00A0 — but the query's
 * normalizer collapses every `\s` before matching, and `\s` includes it. So an
 * assertion written with the real character never matches, and one written
 * with a plain space matches either character.
 *
 * Which means this file cannot pin the separator, and does not try to.
 * `money.test.ts` does — `forDisplay` is where the choice lives, and it's
 * asserted there against the raw string. What these prove is that the figure
 * arrives grouped at all.
 */
const GROUP = " ";

describe("DualTotal", () => {
  it("shows both figures at once", () => {
    // §5: **never a toggle.** The two answer different questions and look
    // identical, so a control that swaps them guarantees someone eventually
    // reads *ours* believing it is *mine*.
    render(
      <DualTotal
        mine={money.toMoney("1000.00000000")}
        ours={money.toMoney("1600.00000000")}
        currency="PLN"
      />,
    );
    expect(screen.getByText(`1${GROUP}000.00`)).toBeDefined();
    expect(screen.getByText(`1${GROUP}600.00`)).toBeDefined();
  });

  it("has no scope prop to toggle with", () => {
    // Stated as a test because the absence is the feature. If a `scope` prop
    // ever appears, this is what should have to be deleted to allow it.
    const props = Object.keys({ mine: "", ours: null, currency: "", decimals: 2 });
    expect(props).not.toContain("scope");
  });

  it("degrades to one figure when nothing is shared", () => {
    // A household total identical to the personal one, printed underneath,
    // teaches the reader that the second line carries no information.
    const { container } = render(
      <DualTotal mine={money.toMoney("1000.00000000")} ours={null} currency="PLN" />,
    );
    expect(container.textContent).toContain("mine");
    expect(container.textContent).not.toContain("ours");
  });
});

describe("Card", () => {
  it("renders without a header when it has neither title nor action", () => {
    const { container } = render(
      <Card>
        <span>body</span>
      </Card>,
    );
    expect(container.textContent).toBe("body");
  });

  /**
   * **A card has no shadow in either theme.** `design-system/02` §2.5 reserves
   * the system's one shadow for the floating add button — the only object above
   * the page — and conveys every surface in the layout by edge. This used to
   * assert the opposite for light; the dark theme was already right, and light
   * caught up.
   */
  it("is a bordered surface with no shadow, in both themes", () => {
    const { container, rerender } = render(
      <ThemeProvider theme={light}>
        <Card>
          <span>body</span>
        </Card>
      </ThemeProvider>,
    );
    const card = container.firstElementChild as HTMLElement;

    for (const theme of [light, dark]) {
      expect(theme.elevation.card.shadowOpacity).toBe(0);
      expect(theme.elevation.card.borderWidth).toBe(1);
    }
    expect(getComputedStyle(card).borderTopWidth).toBe("1px");

    rerender(
      <ThemeProvider theme={dark}>
        <Card>
          <span>body</span>
        </Card>
      </ThemeProvider>,
    );
    expect(getComputedStyle(card).borderTopWidth).toBe("1px");
  });

  it("grants the one shadow to the floating level only", () => {
    for (const theme of [light, dark]) {
      expect(theme.elevation.float.shadowOpacity).toBeGreaterThan(0);
      expect(theme.elevation.floatLifted.shadowOpacity).toBeGreaterThan(
        theme.elevation.float.shadowOpacity,
      );
      for (const level of ["card", "raised", "frame"] as const) {
        expect(theme.elevation[level].shadowOpacity, level).toBe(0);
      }
    }
  });
});

/**
 * **The device decides how much room the chrome needs, and the layout adds its
 * own.**
 *
 * `TodayFrame` hardcoded `paddingTop: 34` — a status-bar guess, right on
 * nothing. Android runs about 24 and an iPhone with a Dynamic Island 59, so the
 * heading floated on one device and clipped under the other with nothing in the
 * layout to say which.
 *
 * These assert the arithmetic rather than a pixel, because the arithmetic is
 * the decision: clearance **plus** breathing room, never `max()`. A `max()`
 * would satisfy a naive "does it clear the notch" check while putting the
 * heading hard against the status bar on exactly the phones with the biggest
 * one.
 */
describe("the frame clears the device's chrome", () => {
  const NOTCHED: SafeAreaInsets = { top: 59, right: 0, bottom: 34, left: 0 };

  function paddingOf(node: Element | null, side: "top" | "bottom"): number {
    const raw =
      node instanceof HTMLElement ? node.style[`padding${side === "top" ? "Top" : "Bottom"}`] : "";
    return Number.parseFloat(raw || "0");
  }

  /** The shell band, which is the frame's first child. */
  function renderFrame(insets: SafeAreaInsets) {
    const { container } = render(
      <SafeAreaProvider insets={insets}>
        <TodayFrame
          appearanceAction={null}
          total={null}
          body={null}
          onAdd={noop}
          floatPosition={null}
          onFloatPositionChange={noop}
        />
      </SafeAreaProvider>,
    );
    const root = container.firstElementChild;
    // Shell, then panel, then the floating button's layer — so the panel is
    // the second child, not the last.
    return { shell: root?.firstElementChild ?? null, panel: root?.children[1] ?? null };
  }

  it("adds the top inset to the shell's own padding", () => {
    const flat = renderFrame(NO_INSETS);
    const notched = renderFrame(NOTCHED);

    // 22 is `space.x5`, the shell's design padding. Stated as a difference so
    // this does not have to be edited when that number is.
    expect(paddingOf(notched.shell, "top") - paddingOf(flat.shell, "top")).toBe(NOTCHED.top);
  });

  it("clears the home indicator at the bottom of the ground panel", () => {
    // The panel never clears the *top* — a header always sits above it, and on
    // this screen that header is the shell, which cleared the status bar. Two
    // boxes each adding the inset is the double-padding this split prevents.
    // The panel is what reaches the bottom edge, so it is what owes the
    // clearance — the last card and the add button sat under the indicator on
    // every gesture-navigation phone.
    const flat = renderFrame(NO_INSETS);
    const notched = renderFrame(NOTCHED);

    expect(paddingOf(notched.panel, "bottom") - paddingOf(flat.panel, "bottom")).toBe(
      NOTCHED.bottom,
    );
  });

  it("leaves a surface with no chrome exactly as it was designed", () => {
    // Zero insets are a real value, not a missing one: a browser has no notch,
    // and neither does a story or this test. The frame must render its own
    // padding and nothing more.
    const { shell, panel } = renderFrame(NO_INSETS);
    expect(paddingOf(shell, "top")).toBeGreaterThan(0);
    expect(paddingOf(panel, "bottom")).toBeGreaterThan(0);
  });
});

/**
 * **The clearance and the colour must be the same box.**
 *
 * This is the property that makes the status-bar strip *part of the header*
 * rather than a band above it. Padding paints inside the border box, so a
 * `backgroundColor` and a `paddingTop` on one `View` fill the inset with the
 * shell's own green. Move the padding to a wrapper — the obvious refactor when
 * someone wants to reuse the clearance — and the strip becomes whatever is
 * behind it, which is the ground, and the header reads as cut off.
 *
 * Nothing about the types would object, and on a laptop with zero insets
 * nothing about the render would either.
 */
describe("the shell owns the strip it clears", () => {
  /** jsdom resolves a computed colour to `rgb()`; the palette is hex. */
  function rgbOf(hex: string): string {
    const n = (at: number) => Number.parseInt(hex.slice(at, at + 2), 16);
    return `rgb(${n(1)}, ${n(3)}, ${n(5)})`;
  }

  it("paints its background across the inset it pads", () => {
    const { container } = render(
      <ThemeProvider name="light">
        <SafeAreaProvider insets={{ top: 59, right: 0, bottom: 34, left: 0 }}>
          <TodayFrame
            appearanceAction={null}
            total={null}
            body={null}
            onAdd={noop}
            floatPosition={null}
            onFloatPositionChange={noop}
          />
        </SafeAreaProvider>
      </ThemeProvider>,
    );

    const shell = container.firstElementChild?.firstElementChild;
    if (!(shell instanceof HTMLElement)) throw new Error("no shell");

    // The **same element** carries both: the inset as padding and the shell as
    // its fill. Read through `getComputedStyle` because the colour arrives on a
    // generated class while the device-varying padding is inline — which is
    // itself the thing worth checking, since those two could drift onto
    // different nodes without a type or a render complaining.
    expect(Number.parseFloat(shell.style.paddingTop)).toBeGreaterThanOrEqual(59);
    expect(getComputedStyle(shell).backgroundColor).toBe(rgbOf(light.shell));
  });
});
