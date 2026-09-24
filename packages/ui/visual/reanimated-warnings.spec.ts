/**
 * **Reanimated's own warnings, in a real browser.** The component suite runs
 * against a stub (`packages/ui/.vitest/reanimated.ts`) that observes nothing,
 * so a hook handed a ref that never attaches is silent there and loud on a
 * phone: *animatedRef is not initialized in useScrollOffset*, printed on every
 * mount of a `GroundPanel` whose screen owns the list. This opens both panel
 * kinds with the real library and holds the console to none.
 */

import { expect, test } from "@playwright/test";

const STORIES = [
  { id: "shell-groundpanel--own-scroller-story", text: "The screen's own list scrolls here" },
  { id: "shell-groundpanel--tall-content-story", text: "Row 1" },
];

for (const story of STORIES) {
  test(`${story.id} mounts without a Reanimated warning`, async ({ page }) => {
    const warnings: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "warning" || message.type() === "error") {
        warnings.push(message.text());
      }
    });
    await page.goto(`/iframe.html?id=${story.id}&globals=appearance:light&viewMode=story`);
    await page.waitForSelector("#storybook-root > *");
    // The story itself, not Storybook's "couldn't find story" — a wrong id
    // mounts nothing and so warns about nothing.
    await expect(page.getByText(story.text, { exact: true })).toBeVisible();
    // The ref's observer runs after mount, in an effect.
    await page.waitForTimeout(300);
    expect(warnings.filter((text) => text.includes("not initialized"))).toEqual([]);
  });
}
