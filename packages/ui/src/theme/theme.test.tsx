/**
 * @vitest-environment jsdom
 *
 * The theme layer, checked on the two properties the design rests on: a
 * component follows the active theme, and swapping it does not remount.
 *
 * **The swap is tested against a second theme built here rather than `dark`.**
 * `dark` is a design decision recorded against `design-system/02` and does not
 * exist yet — and waiting for it would mean the mechanism ships untested and
 * the first evidence it works arrives at the same moment as the first evidence
 * the palette is right. Those are different failures and want separating.
 */

import { render, screen } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { describe, expect, it } from "vitest";
import { ThemeProvider, useTheme } from "./provider";
import { dark, light, themes } from "./roles.ts";
import { makeStyles } from "./styles.ts";

function relativeLuminance(hex: string): number {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** CIE L\*, so a "how dark is it" claim can be stated as a number. */
function lightness(hex: string): number {
  const y = relativeLuminance(hex);
  return y > 216 / 24389 ? 116 * y ** (1 / 3) - 16 : y * (24389 / 27);
}

const useStyles = makeStyles((theme) => ({
  box: { backgroundColor: theme.surface },
  label: { color: theme.text },
}));

function Swatch() {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <div
      data-testid="swatch"
      data-bg={String(styles.box.backgroundColor)}
      data-ink={String(styles.label.color)}
      data-accent={theme.accent}
    />
  );
}

describe("a component follows the active theme", () => {
  it("ships exactly light and dark", () => {
    expect(Object.keys(themes)).toEqual(["light", "dark"]);
  });

  it.each([
    ["light text on ground", light.text, light.ground],
    ["light text on surface", light.text, light.surface],
    ["light muted text on ground", light.textMuted, light.ground],
    ["light text on accent", light.textOnAccent, light.accent],
    ["light accent text on ground", light.accentText, light.ground],
    ["light asserted text on fill", light.assertedText, light.assertedFill],
    ["light danger text on fill", light.dangerText, light.dangerFill],
    ["light tag text on fill", light.tagNeutralText, light.tagNeutralFill],
    ["light shell text on shell", light.shellText, light.shell],
    ["light shell muted text on shell", light.shellTextMuted, light.shell],
    ["light income on ground", light.income, light.ground],
    ["light income on surface", light.income, light.surface],
    ["light spend on ground", light.spend, light.ground],
    ["light spend on surface", light.spend, light.surface],
    ["light accent text on accent fill", light.accentText, light.accentFill],
    ["dark text on ground", dark.text, dark.ground],
    ["dark text on surface", dark.text, dark.surface],
    ["dark muted text on ground", dark.textMuted, dark.ground],
    ["dark text on accent", dark.textOnAccent, dark.accent],
    ["dark accent text on ground", dark.accentText, dark.ground],
    ["dark asserted text on fill", dark.assertedText, dark.assertedFill],
    ["dark danger text on fill", dark.dangerText, dark.dangerFill],
    ["dark tag text on fill", dark.tagNeutralText, dark.tagNeutralFill],
    ["dark shell text on shell", dark.shellText, dark.shell],
    ["dark shell muted text on shell", dark.shellTextMuted, dark.shell],
    ["dark income on ground", dark.income, dark.ground],
    ["dark income on surface", dark.income, dark.surface],
    ["dark spend on ground", dark.spend, dark.ground],
    ["dark spend on surface", dark.spend, dark.surface],
    ["dark accent text on accent fill", dark.accentText, dark.accentFill],
  ])("keeps %s at 4.5:1", (_label, foreground, background) => {
    expect(foreground).not.toBe(background);
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * **The shell has to read as a band, and nothing drew a line under it.**
   *
   * Every check above is a text-on-fill ratio, and the dark shell passed all of
   * them: `#0a1f16` holds `shellText` at 15.6:1. What it did not hold was any
   * relationship to the page — 1.10:1 against `ground` and 1.01:1 against
   * `surface`, so the header was legible text floating on an area boundary
   * nobody could see. The screen read as one flat black rectangle, and the
   * suite was green throughout.
   *
   * **A surface pair needs a floor only where no border draws the edge.** A
   * card is `#ffffff` on `#f5f7f6` at 1.05:1 and that is fine, because
   * `elevation.card` puts a one-pixel `border` between them; §2.5 made that the
   * system's whole elevation story. The shell/ground seam is the one adjacency
   * with no border by design — the ground panel's rounded corners are the join
   * — so the fills are all there is, and this is the only place they must
   * carry the separation alone.
   *
   * 1.5:1 rather than a WCAG number, because WCAG has none for this: 3:1 is for
   * a *boundary* you must locate precisely, like a control's edge, and a
   * full-width band is the easiest thing on a screen to see. 1.5 is where a
   * large area stops reading as continuous with its neighbour.
   */
  it.each([
    ["light", light],
    ["dark", dark],
  ])("keeps the %s shell separate from the page it bands", (_name, theme) => {
    expect(contrastRatio(theme.shell, theme.ground)).toBeGreaterThanOrEqual(1.5);
    expect(contrastRatio(theme.shell, theme.surface)).toBeGreaterThanOrEqual(1.5);
  });

  /**
   * §2.1 grants the shell the one structural use of the brand colour. A value
   * dark enough to read as black spends that grant on nothing — and `#0f2b1f`
   * at L\* 15 was exactly that. Stated as lightness rather than as a hue test
   * because *green enough* is a question about how dark it is: the hue was
   * always right and never visible.
   */
  it.each([
    ["light", light],
    ["dark", dark],
  ])("keeps the %s shell a green rather than a black", (_name, theme) => {
    expect(lightness(theme.shell)).toBeGreaterThanOrEqual(22);
  });

  it("renders the default theme with no provider at all", () => {
    // The default is a real theme, not a sentinel: a component in a test, a
    // diff preview or an unwired harness renders correctly rather than throwing
    // or rendering transparent.
    render(<Swatch />);
    expect(screen.getByTestId("swatch").getAttribute("data-bg")).toBe(light.surface);
  });

  it("takes its colours from the provider, not from the palette", () => {
    render(
      <ThemeProvider theme={dark}>
        <Swatch />
      </ThemeProvider>,
    );

    const el = screen.getByTestId("swatch");
    expect(el.getAttribute("data-bg")).toBe(dark.surface);
    expect(el.getAttribute("data-ink")).toBe(dark.text);
    expect(el.getAttribute("data-accent")).toBe(dark.accent);
    // Non-vacuous: if these ever coincide the assertions above prove nothing.
    expect(dark.surface).not.toBe(light.surface);
  });
});

describe("swapping the theme", () => {
  /**
   * **The property the card asks for: no remount.**
   *
   * A theme swap that remounts loses every piece of component state below it —
   * a half-typed amount, a scroll position, an open sheet. It would also look
   * like it works, because the colours do change; the loss only shows up when
   * someone switches theme with a form open.
   */
  it("repaints without remounting anything below it", () => {
    let mounts = 0;
    let renders = 0;

    function Counted() {
      const styles = useStyles();
      const seen = useRef(0);
      seen.current += 1;
      renders = seen.current;
      useEffect(() => {
        mounts += 1;
      }, []);
      return <div data-testid="counted" data-bg={String(styles.box.backgroundColor)} />;
    }

    const { rerender } = render(
      <ThemeProvider theme={light}>
        <Counted />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("counted").getAttribute("data-bg")).toBe(light.surface);
    expect(mounts).toBe(1);

    rerender(
      <ThemeProvider theme={dark}>
        <Counted />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("counted").getAttribute("data-bg")).toBe(dark.surface);
    expect(mounts, "a theme swap must not remount the tree").toBe(1);
    expect(renders, "it must re-render, or nothing repainted").toBeGreaterThan(1);
  });
});

describe("`makeStyles` builds once per theme", () => {
  /**
   * On native, `StyleSheet.create` registers styles and returns handles.
   * Rebuilding them on every render of every row is precisely the workload a
   * ledger app spends its time on — and it is invisible, because the output is
   * identical either way.
   */
  it("returns the same stylesheet for the same theme, and a different one for another", () => {
    let built = 0;
    const useCounted = makeStyles((theme) => {
      built += 1;
      return { box: { backgroundColor: theme.surface } };
    });

    let first: unknown;
    let second: unknown;

    function Probe({ into }: { into: (s: unknown) => void }) {
      into(useCounted());
      return null;
    }

    function captureFirst(styles: unknown) {
      first = styles;
    }

    function captureSecond(styles: unknown) {
      second = styles;
    }

    render(
      <ThemeProvider theme={light}>
        <Probe into={captureFirst} />
        <Probe into={captureSecond} />
      </ThemeProvider>,
    );

    expect(built, "one build for one theme, across two consumers").toBe(1);
    expect(first).toBe(second);

    render(
      <ThemeProvider theme={dark}>
        <Probe into={captureSecond} />
      </ThemeProvider>,
    );

    expect(built, "a second theme builds once more, not zero times").toBe(2);
    expect(first).not.toBe(second);
  });
});
