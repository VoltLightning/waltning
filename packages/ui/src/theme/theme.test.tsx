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
import { light, type Theme } from "./roles.ts";
import { makeStyles } from "./styles.ts";

/** A second theme, distinguishable from `light` at every role that matters. */
const contrast: Theme = { ...light, surface: "#111111", text: "#eeeeee", accent: "#ff00ff" };

const useStyles = makeStyles((t) => ({
  box: { backgroundColor: t.surface },
  label: { color: t.text },
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
  it("renders the default theme with no provider at all", () => {
    // The default is a real theme, not a sentinel: a component in a test, a
    // diff preview or an unwired harness renders correctly rather than throwing
    // or rendering transparent.
    render(<Swatch />);
    expect(screen.getByTestId("swatch").getAttribute("data-bg")).toBe(light.surface);
  });

  it("takes its colours from the provider, not from the palette", () => {
    render(
      <ThemeProvider theme={contrast}>
        <Swatch />
      </ThemeProvider>,
    );

    const el = screen.getByTestId("swatch");
    expect(el.getAttribute("data-bg")).toBe("#111111");
    expect(el.getAttribute("data-ink")).toBe("#eeeeee");
    expect(el.getAttribute("data-accent")).toBe("#ff00ff");
    // Non-vacuous: if these ever coincide the assertions above prove nothing.
    expect(contrast.surface).not.toBe(light.surface);
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
      <ThemeProvider theme={contrast}>
        <Counted />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("counted").getAttribute("data-bg")).toBe("#111111");
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
    const useCounted = makeStyles((t) => {
      built += 1;
      return { box: { backgroundColor: t.surface } };
    });

    let first: unknown;
    let second: unknown;

    function Probe({ into }: { into: (s: unknown) => void }) {
      into(useCounted());
      return null;
    }

    render(
      <ThemeProvider theme={light}>
        <Probe into={(s) => (first = s)} />
        <Probe into={(s) => (second = s)} />
      </ThemeProvider>,
    );

    expect(built, "one build for one theme, across two consumers").toBe(1);
    expect(first).toBe(second);

    render(
      <ThemeProvider theme={contrast}>
        <Probe into={(s) => (second = s)} />
      </ThemeProvider>,
    );

    expect(built, "a second theme builds once more, not zero times").toBe(2);
    expect(first).not.toBe(second);
  });
});
