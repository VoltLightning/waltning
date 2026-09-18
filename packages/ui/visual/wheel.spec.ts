/**
 * **Does a roll settle on the web at all?**
 *
 * §3.7a's drum reports its value when the roll comes to rest, and the obvious
 * way to know that — React Native's `onMomentumScrollEnd` — is wrong twice
 * over on the web. It does not fire for a wheel or trackpad scroll, and when
 * `react-native-web` does fire an end-of-scroll event it carries a synthetic
 * `nativeEvent` with **no `contentOffset`**: reading it gives `NaN`, lands on
 * no option, and returns — after cancelling the timer that would have settled
 * correctly. Both were measured here, in this file's own story: the drum moved
 * four rows, the fade followed perfectly, and the value never changed.
 *
 * That is the shape of defect this exists for. Every unit test passed while it
 * was broken, because jsdom cannot drive `react-native-web`'s scrolling at all
 * — `fireEvent.scroll` never reaches it — so the arithmetic was right and the
 * control was dead.
 *
 * The fade and the per-row state change are pinned as arithmetic in
 * `wheel.test.tsx`; this is only the part that needs a browser.
 */

import { expect, test } from "@playwright/test";

const STORY = "primitives-wheel--live";

/** §3.7a. Every offset here is a multiple of it. */
const ROW = 44;

/** `theme.accentText` in light — the banded row, and only it. */
const BANDED = "rgb(76, 98, 71)";

async function banded(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(
    (colour) =>
      Array.from(document.querySelectorAll('[dir="auto"]'))
        .filter((node) => getComputedStyle(node).color === colour)
        .map((node) => node.textContent ?? ""),
    BANDED,
  );
}

test("a real roll lands the value under the band", async ({ page }) => {
  await page.goto(`/iframe.html?id=${STORY}&globals=appearance:light&viewMode=story`);
  await page.waitForSelector("#storybook-root > *");

  const drum = page.locator('[aria-label="Day"]');
  await drum.waitFor();
  // Polled, not asserted at once: the drum places itself in a layout effect,
  // and a picker that opened on the wrong row would still settle here — which
  // is why the offset is checked too.
  await expect.poll(async () => (await banded(page))[0], { timeout: 2000 }).toBe("18");
  expect(await drum.evaluate((node) => node.scrollTop), "opens in place").toBe(17 * ROW);

  const box = await drum.boundingBox();
  if (box === null) throw new Error("the drum has no box to roll");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  // Four rows down, in four ticks, the way a trackpad delivers them.
  for (let n = 0; n < 4; n += 1) {
    await page.mouse.wheel(0, ROW);
    await page.waitForTimeout(40);
  }

  // The band follows the roll immediately — that much never broke.
  await expect.poll(async () => (await banded(page))[0], { timeout: 2000 }).toBe("22");

  // And the value settles *behind* it. This is the assertion that was false:
  // the story owns the value, so the drum can only show 22 here if `onChange`
  // actually fired and came back as a prop.
  await page.waitForTimeout(400);
  const offset = await drum.evaluate((node) => node.scrollTop);
  expect(offset, "rested on a row rather than between two").toBe(21 * ROW);
  expect(await banded(page), "the settled value, read back from the prop").toEqual(["22"]);
});
