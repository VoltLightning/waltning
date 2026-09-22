/**
 * **A filtered sheet stays where it is while it is typed into**
 * (`05-composites` §5.1, *steady*).
 *
 * The one guarantee of `BottomSheet` that only a laid-out page can see: jsdom
 * measures nothing, so the floor that holds the sheet at its tallest is never
 * exercised there. Here the sheet is real — the library sizes it to its
 * content — and the search is typed into until nothing matches, which is as
 * short as the content gets. The sheet's top edge must not move: sized to its
 * content, a picker dropped away from the thumb typing into it, and the
 * category sheet's chips going away as the search began made it drop further.
 */

import { expect, test } from "@playwright/test";

const STORY = "categories-categorysheet--browsing";

test("a picker keeps its height while its list is filtered away", async ({ page }) => {
  await page.goto(`/iframe.html?id=${STORY}&globals=appearance:light&viewMode=story`);
  const handle = page.getByTestId("bottom-sheet");
  await handle.waitFor();
  // The library springs the sheet in: wait for it to stop before measuring.
  let before = -1;
  await expect
    .poll(
      async () => {
        const top = (await handle.boundingBox())?.y ?? -1;
        const still = top === before;
        before = top;
        return still;
      },
      { timeout: 4000, intervals: [150] },
    )
    .toBe(true);

  await page.getByPlaceholder(/Search/).fill("zzzz");
  await page.waitForTimeout(600);
  const after = (await handle.boundingBox())?.y ?? -1;
  expect(Math.abs(after - before), `the sheet's top moved from ${before} to ${after}`).toBeLessThan(
    1,
  );
});
