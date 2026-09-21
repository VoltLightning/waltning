/**
 * The day strip asks for a tick when a day passes the ring — in a real
 * browser, where the frame loop it lives in actually runs.
 *
 * **This is the half of the haptics no other suite can see.** The decision is
 * made inside a Reanimated frame callback; jsdom has no frames, and
 * `.vitest/reanimated.ts` stubs the callback outright, so for as long as it
 * has existed it could have been silently never firing — which on a device is
 * exactly what *the snap points work, but there is no tick* looks like. (The
 * other half — which native primitive the tick becomes — is
 * `apps/mobile/src/platform.native.test.ts`.)
 */

import { expect, test } from "@playwright/test";

const STORY = "transactions-dayribbon--ticking";

const ticks = async (page: import("@playwright/test").Page): Promise<number> =>
  Number(await page.getByLabel("Ticks").innerText());

test("a day passing the ring asks for a tick, and a still strip asks for none", async ({
  page,
}) => {
  await page.goto(`/iframe.html?id=${STORY}&globals=appearance:light&viewMode=story`);
  await page.waitForSelector("#storybook-root > *");
  const scroll = page.getByRole("button", { name: "Scroll a day" });
  await scroll.waitFor();

  // At rest, nothing: placing the strip on open is not a day going past.
  await page.waitForTimeout(600);
  expect(await ticks(page), "a strip that has not moved has not ticked").toBe(0);

  // Five days, slower than the floor between taps, so each one is its own.
  for (let day = 0; day < 5; day += 1) {
    await scroll.click();
    await page.waitForTimeout(220);
  }
  await expect.poll(() => ticks(page), { timeout: 2000 }).toBeGreaterThanOrEqual(4);
  expect(await ticks(page), "one a day, not a burst").toBeLessThanOrEqual(6);

  // **And the strip really went there.** This suite once counted days the
  // strip was *asked* to show while it sat clamped 1,100pt short of them — the
  // tick is now read off where the strip is, so a strip that does not move
  // does not tick, and this says which of the two a failure is.
  const moved = await page.evaluate(() => {
    const strip = Array.from(document.querySelectorAll("*")).find(
      (node) =>
        node.scrollWidth > node.clientWidth + 5 && getComputedStyle(node).overflowX !== "visible",
    );
    return strip === undefined ? -1 : strip.scrollWidth - strip.clientWidth - strip.scrollLeft;
  });
  // Five days of 52pt back from the far end, where the top of the list is.
  expect(moved, "five cells from the end of the track").toBeGreaterThan(5 * 52 - 8);
  expect(moved).toBeLessThan(5 * 52 + 8);

  // And once it is still again it is quiet again.
  const settled = await ticks(page);
  await page.waitForTimeout(800);
  expect(await ticks(page), "a settled strip stops ticking").toBe(settled);
});
