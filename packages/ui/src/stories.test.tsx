/**
 * @vitest-environment jsdom
 *
 * Every story renders, in both themes — in the runner that already exists.
 *
 * **Why not `@storybook/addon-vitest`.** It is the official route and it wants
 * `@vitest/browser` plus `@vitest/browser-playwright`, which is a second test
 * runner, a browser download and a second place for the alias config to be
 * right. `composeStories` gives the same guarantee — a story that throws is a
 * red build — through the jsdom setup and the `react-native` →
 * `react-native-web` alias that `vitest.config.ts` already defines and
 * explains. One runner, no new infrastructure.
 *
 * **Both themes, because one is not a test of a theme system.** The whole
 * argument for semantic roles is that a component survives a palette swap; a
 * suite that only ever renders `light` asserts nothing about that. A role
 * missing from `dark` resolves to `undefined` and renders transparent — which
 * the theme conformance test catches at the token level, and this catches at
 * the render level, where a component that reads a role the theme does not have
 * would throw instead.
 *
 * This is a smoke test and says so: it proves every story mounts and produces
 * output. What a story *looks* like is what Storybook itself is for.
 */

import { composeStories } from "@storybook/react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as amount from "./fx/amount.stories";
import * as button from "./primitives/button.stories";
import * as chip from "./primitives/chip.stories";
import * as todayFrame from "./shell/today-frame.stories";
import * as emptyState from "./states/empty-state.stories";
import { ThemeProvider } from "./theme/provider";
import { type ThemeName, themes } from "./theme/roles.ts";

/**
 * Written out rather than globbed. A glob would silently cover zero files the
 * day the extension or the folder changes, and go green having rendered
 * nothing — the same vacuity the architecture tests guard against everywhere
 * else. The count assertion below is the second half of that guard.
 */
const MODULES = {
  Amount: amount,
  Button: button,
  Chip: chip,
  EmptyState: emptyState,
  TodayFrame: todayFrame,
};

/**
 * A composed story is a component that takes no required props.
 *
 * `composeStories` types its result precisely for **one** module. Mapping over
 * five at once collapses the return to a union of records, and `Object.entries`
 * over a union widens the value to `unknown` — so the assertion is made here,
 * at the one seam where the union forms, rather than pushed to every call site
 * as a cast. This is the narrow, commented use `CLAUDE.md` sanctions; the
 * alternative is five near-identical blocks to preserve inference that nothing
 * downstream reads.
 */
type ComposedStory = () => React.ReactNode;

function composed(mod: (typeof MODULES)[keyof typeof MODULES]): Record<string, ComposedStory> {
  return composeStories(mod) as Record<string, ComposedStory>;
}

const THEMES = Object.keys(themes) as ThemeName[];

describe("every story renders in every theme", () => {
  let rendered = 0;

  for (const [group, mod] of Object.entries(MODULES)) {
    const stories = composed(mod);

    for (const [name, Story] of Object.entries(stories)) {
      for (const theme of THEMES) {
        it(`${group}/${name} · ${theme}`, () => {
          const { container } = render(
            <ThemeProvider name={theme}>
              <Story />
            </ThemeProvider>,
          );
          expect(container.firstChild).not.toBeNull();
          rendered += 1;
        });
      }
    }
  }

  /**
   * Non-vacuity. Without this the suite passes just as happily having composed
   * an empty module map, which is precisely how a test that "covers every
   * story" ends up covering none.
   */
  it("rendered a plausible number of stories", () => {
    expect(rendered).toBeGreaterThan(30);
  });
});
