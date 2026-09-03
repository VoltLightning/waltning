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
 */
async function settle(page: Page) {
  await page.waitForFunction(() => document.fonts.status === "loaded");
  await page.evaluate(() => document.fonts.ready);
}

async function open(page: Page, id: string, theme: string) {
  await page.goto(`/iframe.html?id=${id}&globals=appearance:${theme}&viewMode=story`);
  await page.waitForSelector("#storybook-root > *", { state: "attached" });
  await settle(page);
}

for (const story of STORIES) {
  for (const theme of THEMES) {
    test(`${story.title}/${story.name} · ${theme}`, async ({ page }) => {
      await open(page, story.id, theme);
      await expect(page.locator("#storybook-root")).toHaveScreenshot(`${story.id}-${theme}.png`);
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
        await page.addScriptTag({ content: axeSource });

        const violations = await page.evaluate(async () => {
          // `addon-a11y` ships in this build and runs its own axe on story
          // render; two axe instances share one page and axe refuses to run
          // concurrently. The addon's pass finishes in milliseconds — wait it
          // out rather than lose a real contrast check to a timing race.
          for (let attempt = 0; ; attempt += 1) {
            try {
              const results = await window.axe.run("#storybook-root", {
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
