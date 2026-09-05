/**
 * Every story, photographed in both themes — and checked for the one
 * accessibility rule jsdom cannot answer.
 *
 * Two checks share one browser launch because they need the same expensive
 * thing: a real render. Splitting them would double the slowest part of the
 * suite to separate two assertions about the same pixels.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

/** ESM has no `require`; this is the sanctioned way to resolve a package path. */
const require = createRequire(import.meta.url);

type StoryEntry = { id: string; title: string; name: string; type: string };

/**
 * The story list comes from the build, not from a glob over the source.
 *
 * `index.json` is what Storybook itself resolved — so a story excluded by a
 * tag, or a file the `stories` glob does not actually match, is absent here
 * too. A second enumeration would drift from the first and the drift would look
 * like coverage.
 */
function stories(): StoryEntry[] {
  const path = join(import.meta.dirname, "..", "storybook-static", "index.json");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`No Storybook build at ${path} — run \`pnpm build-storybook\` first.`);
  }
  const parsed = JSON.parse(raw) as { entries: Record<string, StoryEntry> };
  return Object.values(parsed.entries).filter((entry) => entry.type === "story");
}

const THEMES = ["light", "dark"] as const;

const STORIES = stories();

/**
 * Non-vacuity, and it belongs here rather than in a comment: an empty or
 * mis-shaped `index.json` would otherwise generate zero tests and report a
 * green run having photographed nothing.
 */
test("the build lists a plausible number of stories", () => {
  expect(STORIES.length).toBeGreaterThan(20);
});

/**
 * Wait for the things that make a screenshot reproducible.
 *
 * **`document.fonts.ready` is not optional here.** `.storybook/fonts.ts` sets
 * `font-display: block`, so text is *invisible* until its face loads —
 * photograph too early and the baseline is a correct layout with no words in
 * it, which then passes forever.
 *
 * **A single `evaluate` awaiting the promise, not `waitForFunction` polling
 * for it.** `waitForFunction`'s default polling strategy drives its predicate
 * from `requestAnimationFrame` — which `open`'s frozen clock also fakes and
 * pauses, so a poll that depends on it never runs a second time. `fonts.ready`
 * resolves through the browser's own font-loading pipeline, not a page timer,
 * so it settles correctly whether or not the clock is frozen.
 */
async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
}

/** The instant a screenshot's clock is pinned and paused at. Arbitrary; fixed. */
const FROZEN_AT = new Date("2026-09-04T09:00:00Z");

/**
 * Navigate to a story, optionally with time pinned and paused first.
 *
 * **Never for `contrast`, only for the stories `NEEDS_FROZEN_CLOCK` names.**
 * `pauseAt` the same instant `install` sets means the clock never advances
 * from it — every timer on the page is frozen before it can tick. That is
 * exactly what `ThinkingIndicator`'s beat needs and exactly what breaks a
 * mount animation: a component whose entrance is a Reanimated
 * `requestAnimationFrame` loop never gets the frames that carry it to rest,
 * so it screenshots at the start of its own animation instead of the end.
 * `contrast`'s own axe pass depends on real, ticking timers too —
 * `addon-a11y` schedules its pass on one, and the retry loop that waits out a
 * concurrent axe run schedules on another — so it always calls this with
 * `freeze: false`.
 */
async function open(page: Page, id: string, theme: string, { freeze = false } = {}) {
  if (freeze) {
    await page.clock.install({ time: FROZEN_AT });
    await page.clock.pauseAt(FROZEN_AT);
  }
  await page.goto(`/iframe.html?id=${id}&globals=appearance:${theme}&viewMode=story`);
  await page.waitForSelector("#storybook-root > *", { state: "attached" });
  await settle(page);
}

/**
 * `#storybook-root` is a story's own render target — but `<Modal>`
 * (`shell/bottom-sheet.tsx`, first exercised by a story here in D4a's
 * `CategorySheet`) portals its content to a sibling of it on the web, the
 * same way it portals outside an RTL render container in a jsdom test. A
 * story screenshotting the root alone photographs nothing for a modal-based
 * component — `react-native-web`'s `Modal` renders `role="dialog"` on that
 * portaled node, so this looks for one first and falls back to the root.
 */
async function screenshotTarget(page: Page) {
  const dialog = page.locator('[role="dialog"]');
  return (await dialog.count()) > 0 ? dialog.first() : page.locator("#storybook-root");
}

/**
 * `ThinkingIndicator` is the only story whose *content* is a function of
 * elapsed real time — its dot steps on its own `setInterval` — so it is the
 * only one that needs a frozen clock to read the same frame twice. Freezing
 * every story instead sounded like the more thorough fix and measured worse:
 * a real run showed 42 other baselines moving, and not into a different
 * valid rendering of the same story — `Toast` and `UndoToast` came back
 * blank, `ThresholdSlider`'s thumb sat at its pre-animation rest position
 * rather than the value the story names. Those all mount with a Reanimated
 * enter animation driven by `requestAnimationFrame`, which the frozen clock
 * also fakes and pauses, so the story is screenshotted at frame zero of its
 * own entrance rather than settled — a baseline that no longer shows what
 * the component looks like. `ThinkingIndicator` has no such animation to
 * freeze mid-flight, so scoping the fix to it gets the determinism without
 * that cost.
 */
const NEEDS_FROZEN_CLOCK = /ThinkingIndicator/;

for (const story of STORIES) {
  for (const theme of THEMES) {
    test(`${story.title}/${story.name} · ${theme}`, async ({ page }) => {
      await open(page, story.id, theme, { freeze: NEEDS_FROZEN_CLOCK.test(story.title) });
      await expect(await screenshotTarget(page)).toHaveScreenshot(`${story.id}-${theme}.png`);
    });
  }
}

/**
 * `color-contrast`, which is the whole reason a browser is involved.
 *
 * `stories.test.tsx` disables this rule because jsdom answers it from nothing.
 * Here it is the point: `design-system/02` grew a second palette, and a role
 * can lose its contrast in exactly one theme while looking deliberate in both.
 * Only rendered colour can tell.
 *
 * Axe is loaded from the copy `@storybook/addon-a11y` already installs rather
 * than from a CDN — same rule as every other asset in this repository.
 */
test.describe("contrast", () => {
  const axePath = require.resolve("axe-core/axe.min.js");
  const axeSource = readFileSync(axePath, "utf8");

  for (const story of STORIES) {
    for (const theme of THEMES) {
      test(`${story.title}/${story.name} · ${theme}`, async ({ page }) => {
        await open(page, story.id, theme);
        // Contrast is a property of the resting state. A panel that fades in
        // over `motion.fast` reads as lighter ink for its first frames, and
        // axe caught a select's option list at 4.38:1 mid-fade — a number no
        // reader ever sees. Longer than the longest token (`sheet`, 320ms).
        await page.waitForTimeout(500);
        await page.addScriptTag({ content: axeSource });

        const violations = await page.evaluate(async () => {
          // The same target `screenshotTarget` resolves to, re-derived here
          // because `page.evaluate` runs in the browser and cannot close over
          // a `Locator`. A story that opens a `Modal` — `CategorySheet`'s own
          // sheet, first exercised in D4a — dims everything behind the scrim
          // to `#ece5d7`'s composite (4.47:1), a contrast nobody reads, since
          // it sits under an opaque sheet. Scoping to the dialog when one is
          // open is what keeps that dimmed backdrop out of the run rather
          // than raising the tolerance or excluding the rule.
          const dialog = document.querySelector('[role="dialog"]');
          const target = dialog ?? document.querySelector("#storybook-root");
          if (target === null) {
            throw new Error("stories.spec.ts: no #storybook-root to scope axe to");
          }

          // `addon-a11y` ships in this build and runs its own axe on story
          // render; two axe instances share one page and axe refuses to run
          // concurrently. The addon's pass finishes in milliseconds — wait it
          // out rather than lose a real contrast check to a timing race.
          for (let attempt = 0; ; attempt += 1) {
            try {
              const results = await window.axe.run(target, {
                runOnly: { type: "rule", values: ["color-contrast"] },
              });
              return results.violations.flatMap((v) =>
                v.nodes.map((n) => `${v.id}: ${n.failureSummary ?? ""}`),
              );
            } catch (error) {
              if (attempt < 20 && String(error).includes("already running")) {
                await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
                continue;
              }
              throw error;
            }
          }
        });

        expect(violations, "contrast violations").toEqual([]);
      });
    }
  }
});
