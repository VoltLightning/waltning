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
  test(`${story.id} mounts without "animatedRef is not initialized"`, async ({ page }) => {
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

/**
 * **And the page kind still observes its scroller.** Passing `null` is also
 * what would silence the warning if the condition were inverted — and every
 * page-scrolling screen would lose its top edge with nothing to say so, since
 * the edge is invisible at rest. Scrolled past the edge's travel, it shows.
 */
test("a page-scrolling panel's top edge follows its scroll", async ({ page }) => {
  await page.goto(
    "/iframe.html?id=shell-groundpanel--tall-content-story&globals=appearance:light&viewMode=story",
  );
  await expect(page.getByText("Row 1", { exact: true })).toBeVisible();
  const edge = page.getByTestId("ground-panel-top-edge");
  await expect(edge).toHaveCSS("opacity", "0");
  await page.getByTestId("ground-panel-scroll").evaluate((node) => {
    node.scrollTop = 200;
  });
  await expect
    .poll(async () => Number(await edge.evaluate((node) => getComputedStyle(node).opacity)))
    .toBeGreaterThan(0);
});
