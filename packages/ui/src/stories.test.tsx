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
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import * as amount from "./fx/amount.stories";
import * as currencyGrid from "./fx/currency-grid.stories";
import * as button from "./primitives/button.stories";
import * as chip from "./primitives/chip.stories";
import * as shell from "./shell/shell.stories";
import * as tabBar from "./shell/tab-bar.stories";
import * as tabIcons from "./shell/tab-icons.stories";
import * as todayFrame from "./shell/today-frame.stories";
import * as banner from "./states/banner.stories";
import * as emptyState from "./states/empty-state.stories";
import * as errorState from "./states/error-state.stories";
import * as matchWarning from "./states/match-warning.stories";
import * as ruleHealthTag from "./states/rule-health-tag.stories";
import * as skeleton from "./states/skeleton.stories";
import * as thinkingIndicator from "./states/thinking-indicator.stories";
import * as thresholdSlider from "./states/threshold-slider.stories";
import * as toast from "./states/toast.stories";
import * as undoToast from "./states/undo-toast.stories";
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
  Banner: banner,
  Chip: chip,
  CurrencyGrid: currencyGrid,
  EmptyState: emptyState,
  ErrorState: errorState,
  MatchWarning: matchWarning,
  RuleHealthTag: ruleHealthTag,
  Shell: shell,
  Skeleton: skeleton,
  TabBar: tabBar,
  TabIcons: tabIcons,
  ThinkingIndicator: thinkingIndicator,
  ThresholdSlider: thresholdSlider,
  Toast: toast,
  TodayFrame: todayFrame,
  UndoToast: undoToast,
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
type Spy = { mockClear: () => void };

type ComposedStory = {
  (): React.ReactNode;
  /** Present only on stories that declare one. */
  play?: (context: { canvasElement: HTMLElement }) => Promise<void>;
  /** The story's resolved args, which is where its `fn()` spies live. */
  args?: Record<string, unknown>;
};

function isSpy(value: unknown): value is Spy {
  return typeof (value as Spy | null)?.mockClear === "function";
}

/**
 * Reset the spies a story declares, before it is rendered again.
 *
 * **`vi.clearAllMocks()` does not reach them**, which cost a failing test to
 * discover: `fn()` comes from `storybook/test` and is not registered with
 * Vitest, so the global reset skips it entirely. The instance is created once
 * at module scope and shared by every render of that story — so the dark run
 * inherited the light run's click and `toHaveBeenCalledTimes(1)` saw two.
 *
 * Done over `args` rather than per story so it holds for the next story with a
 * spy, which will not remember this.
 */
function clearStorySpies(story: ComposedStory) {
  for (const value of Object.values(story.args ?? {})) {
    if (isSpy(value)) value.mockClear();
  }
}

function composed(mod: (typeof MODULES)[keyof typeof MODULES]): Record<string, ComposedStory> {
  return composeStories(mod) as Record<string, ComposedStory>;
}

const THEMES = Object.keys(themes) as ThemeName[];

/**
 * The axe rules jsdom can actually answer.
 *
 * **`color-contrast` is excluded because jsdom cannot compute it, not because
 * it does not matter** — it is arguably the rule this design system most needs,
 * since `design-system/02` grew a second palette and a role can lose its
 * contrast in exactly one theme. jsdom has no layout and no rendered colour, so
 * axe either skips the rule or answers from nothing; a check that cannot fail
 * is worse than an absent one, because it reads as coverage.
 *
 * Contrast belongs to the screenshot card, which renders in a real browser.
 * What is left here is the structural half — roles, names, labels, nesting —
 * which jsdom answers correctly and which no amount of looking reliably
 * catches.
 */
const JSDOM_BLIND = ["color-contrast"];

describe("every story renders in every theme", () => {
  let rendered = 0;

  for (const [group, mod] of Object.entries(MODULES)) {
    const stories = composed(mod);

    for (const [name, Story] of Object.entries(stories)) {
      for (const theme of THEMES) {
        it(`${group}/${name} · ${theme}`, async () => {
          clearStorySpies(Story);
          const { container } = render(
            <ThemeProvider name={theme}>
              <Story />
            </ThemeProvider>,
          );
          expect(container.firstChild).not.toBeNull();

          /**
           * The story's own assertions, when it has any. This is what
           * `@storybook/addon-vitest` would run in a browser; `composeStories`
           * exposes the same function, so an interaction test costs a `play`
           * block rather than a second runner.
           */
          if (Story.play) await Story.play({ canvasElement: container });

          const results = await axe.run(container, {
            rules: Object.fromEntries(JSDOM_BLIND.map((id) => [id, { enabled: false }])),
          });
          expect(
            results.violations.map((v) => `${v.id}: ${v.help}`),
            "accessibility violations",
          ).toEqual([]);

          rendered += 1;
        });
      }
    }
  }

  /**
   * Non-vacuity, in both directions. Without the first the suite passes just as
   * happily having composed an empty module map — the way a test that "covers
   * every story" ends up covering none. The second guards the same failure one
   * level down: if `play` stopped being exposed, every interaction assertion
   * would vanish silently and the render checks would still be green.
   */
  it("rendered a plausible number of stories", () => {
    expect(rendered).toBeGreaterThan(30);
  });

  it("ran the interaction assertions the stories declare", () => {
    const withPlay = Object.values(MODULES)
      .flatMap((mod) => Object.values(composed(mod)))
      .filter((story) => typeof story.play === "function");
    expect(withPlay.length, "stories declaring a play function").toBeGreaterThan(1);
  });
});
