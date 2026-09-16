/**
 * **Press feedback, measured in the browser rather than asserted in prose.**
 *
 * `design-system/02` §2.7 promises `scale(.97)` on every `Pressable`. Two
 * things made that promise unverifiable everywhere it was written down:
 *
 * - jsdom cannot show it. `react-native-web`'s responder delivers `onPressIn`
 *   at *release* on the mouse path, so no frame a unit test can observe holds
 *   the control mid-press. `pressable-scaled.test.tsx` pins the style
 *   *composition* for that reason and says so.
 * - the census in `tests/architecture.test.ts` proves a component *asks* for
 *   the feedback. It cannot prove the element moves, and twice during this
 *   work the whole mechanism could be deleted with the suite green.
 *
 * This is the missing half, and it is exactly the repo's own rule: measure the
 * render in Chrome, then pin the number. A real `mouse.down()` engages the
 * responder the way a finger does, and the transform is sampled while the
 * button is held.
 *
 * **Both wirings are covered on purpose.** `usePressScale` puts the transform
 * on a wrapping `Animated.View` in the seventeen files that wired it by hand;
 * `PressableScaled` puts it on the control itself. Those are different DOM
 * nodes, which is why this walks upward rather than reading one — a first
 * version of the probe read only the element and reported `none` for a control
 * that was scaling perfectly.
 *
 * **But it must not walk far, and a first version walked too far.** Taking the
 * smallest scale over four nodes measures the *subtree*, not the control: a
 * review moved the scale onto the calendar's **week row** and deleted it from
 * `DayCell` entirely — so pressing one day shrank all seven, and the day
 * itself never moved — and this file passed. The depth is asserted now.
 * `PressableScaled` lands at 0 and `usePressScale` at 1, measured; anything
 * further away is a scale that belongs to something else.
 */

import { expect, type Locator, test } from "@playwright/test";

/** The token, and the only figure this file asserts. */
const PRESSED = 0.97;

/**
 * One story per wiring. `TodayPill` goes through `PressableScaled`; `Button`
 * and the calendar day are hand-wired — `DayCell` being the control whose
 * missing feedback started all of this.
 */
const CONTROLS = [
  { story: "primitives-button--all-variants", label: "primary", how: "hand-wired" },
  { story: "transactions-monthgrid--part-way-through", label: null, how: "hand-wired" },
  { story: "shell-todaypill--away", label: null, how: "PressableScaled" },
] as const;

/**
 * The smallest scale found on the control or its immediate wrapper, and which
 * of the two carried it. `depth` is what stops this measuring the subtree.
 */
const CARRIER_DEPTH = 1;

type Scaled = { readonly scale: number; readonly depth: number };

async function scaledBy(locator: Locator): Promise<Scaled> {
  return locator.evaluate((node: HTMLElement, maxDepth: number) => {
    let found: { scale: number; depth: number } = { scale: 1, depth: 0 };
    let cursor: HTMLElement | null = node;
    for (let depth = 0; depth <= maxDepth && cursor; depth += 1) {
      const matrix = getComputedStyle(cursor).transform.match(/matrix\(([0-9.]+)/);
      const scale = matrix?.[1] === undefined ? 1 : Number.parseFloat(matrix[1]);
      if (scale < found.scale) found = { scale, depth };
      cursor = cursor.parentElement;
    }
    return found;
  }, CARRIER_DEPTH);
}

for (const { story, label, how } of CONTROLS) {
  test(`${story} scales under a finger (${how})`, async ({ page }) => {
    await page.goto(`/iframe.html?id=${story}&viewMode=story`);
    await page.waitForSelector("#storybook-root > *");
    const control =
      label === null
        ? page.getByRole("button").first()
        : page.getByRole("button", { name: label }).first();
    await expect(control).toBeVisible();

    expect((await scaledBy(control)).scale, "at rest").toBe(1);

    const box = await control.boundingBox();
    if (box === null) throw new Error(`${story}: the control has no box to press`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();

    // `motion.base` in, so the scale is still travelling for ~200ms. Sample
    // until it settles rather than guessing one instant.
    let held: Scaled = { scale: 1, depth: 0 };
    for (let sample = 0; sample < 10; sample += 1) {
      await page.waitForTimeout(40);
      const now = await scaledBy(control);
      if (now.scale < held.scale) held = now;
    }
    expect(held.scale, "held — §2.7's scale(.97)").toBeCloseTo(PRESSED, 2);
    // The control moved, not something around it. Without this, a scale on a
    // shared ancestor — a calendar week row — satisfies the assertion above
    // while the pressed control sits perfectly still.
    expect(held.depth, "the scale is on the control or its own wrapper").toBeLessThanOrEqual(
      CARRIER_DEPTH,
    );

    await page.mouse.up();
    // `motion.fast` out: "the release is the system saying got it, and a slow
    // got it reads as lag." Generous here so the assertion is about arriving,
    // not about the exact duration.
    await expect.poll(async () => (await scaledBy(control)).scale, { timeout: 2000 }).toBe(1);
  });
}
