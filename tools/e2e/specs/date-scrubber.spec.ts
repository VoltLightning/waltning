/**
 * S04 §7 — the day strip is scrubbed by the list, and the list writes the
 * date once, when it settles.
 *
 * **This suite exists because the version before it shipped a crash.** The
 * wiring was called untestable in its own pull request and merged anyway; it
 * rendered a red box on a real device on the first scroll. Tier 1 could not
 * have caught it — jsdom fires neither viewability nor scroll, and
 * `.vitest/reanimated.ts` stubs the frame callback and the native `scrollTo`
 * this component is built on. Everything below is only true in a browser that
 * has layout and frames, which is what tier 2 is.
 *
 * Three of the four assertions here failed against the implementation at the
 * time they were written, each for its own reason:
 *
 *  - the strip was clamped three cells short of today on a cold open and never
 *    asked again, because the component compared against the last value it
 *    computed rather than against where the scroller actually was;
 *  - the strip could not be browsed at all on the web, because
 *    `onScrollBeginDrag` does not fire for a wheel on `react-native-web`, so
 *    it snapped back within a frame of every attempt;
 *  - the demo ledger arrived with 34 of 566 rows, because two separate rate
 *    refusals each surfaced as hundreds of transactions declined for
 *    `needsRate`.
 */

import { expect, test } from "@playwright/test";

/** Two years of invented rows, from the one press that writes them. */
async function loadDemoLedger(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/settings/developer");
  await page.getByRole("button", { name: /load demo data/i }).click();
  // The loader writes through the controller, one operation per row, on the
  // JS thread — so this is genuinely slow and genuinely synchronous.
  await expect(page.getByText(/rows · \d+ accounts/)).toBeVisible({ timeout: 120_000 });
  const written = await page.getByText(/rows · \d+ accounts/).innerText();
  // A partial load would make every assertion below a test of the fixture.
  expect(written, "the demo ledger loaded with nothing refused").not.toMatch(/refused/);
}

/** The day whose cell sits under the ring at the middle of the band. */
async function dayUnderTheRing(page: import("@playwright/test").Page): Promise<string | null> {
  return page.evaluate(() => {
    const band = [...document.querySelectorAll('[role="list"]')].find(
      (node) => node.scrollWidth > node.clientWidth,
    );
    if (band === undefined) return null;
    const box = band.getBoundingClientRect();
    const middle = box.left + box.width / 2;
    for (const cell of band.querySelectorAll('[role="button"]')) {
      const at = cell.getBoundingClientRect();
      if (at.left <= middle && middle <= at.right) return cell.getAttribute("aria-label");
    }
    return null;
  });
}

async function stripOffset(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const band = [...document.querySelectorAll('[role="list"]')].find(
      (node) => node.scrollWidth > node.clientWidth,
    );
    return band === undefined ? -1 : Math.round(band.scrollLeft);
  });
}

async function scrollTheList(page: import("@playwright/test").Page, ticks: number): Promise<void> {
  await page.mouse.move(195, 600);
  for (let tick = 0; tick < ticks; tick += 1) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(110);
  }
  // Past `SETTLE_MS`, so the date has been written.
  await page.waitForTimeout(600);
}

test.describe("the day strip is scrubbed by the list", () => {
  test.beforeEach(async ({ page }) => {
    await loadDemoLedger(page);
    await page.goto("/?view=list");
    await page.getByRole("tab", { name: "List" }).click();
    await expect(page.getByRole("tab", { name: "List" })).toHaveAttribute("aria-selected", "true");
    await page.waitForTimeout(1500);
  });

  test("opens with today under the ring", async ({ page }) => {
    // Not merely *drawn* — placed. The strip runs earliest-first, so without a
    // placement today is off the right-hand end of it; and a `scrollTo` that
    // was clamped while the days past today were still being generated left
    // the ring three cells short of it for the rest of the session.
    const under = await dayUnderTheRing(page);
    expect(under, "the ring marks today on a cold open").toMatch(/September 20, 2026/);
  });

  test("moves with the list, and the list is not rebuilt to make it move", async ({ page }) => {
    // Stamp a row that is on screen now. A jump re-keys the list and remounts
    // every row, so the stamp surviving is what says the scroll cost no reload
    // — which is the whole reason the date is no longer written per frame.
    const stamped = await page.evaluate(() => {
      const row = [...document.querySelectorAll('[role="button"]')].find((node) =>
        /Bank A|Card A|Cash/.test(node.textContent ?? ""),
      );
      row?.setAttribute("data-scrub-probe", "1");
      return Boolean(row);
    });
    expect(stamped, "a row to watch").toBe(true);

    const before = await dayUnderTheRing(page);
    await scrollTheList(page, 8);
    const after = await dayUnderTheRing(page);

    expect(after, "the strip followed the list").not.toBe(before);
    expect(
      await page.evaluate(() => Boolean(document.querySelector('[data-scrub-probe="1"]'))),
      "the rows were never remounted, so nothing reloaded",
    ).toBe(true);
  });

  test("hands the day it settled on to the other pages", async ({ page }) => {
    // S04 §3's promise — *scroll to 25 May on List and Calendar has 25 May
    // marked* — answered at the end of the gesture rather than during it.
    await scrollTheList(page, 8);
    const under = await dayUnderTheRing(page);
    const day = /(\w+ \d+, \d+)/.exec(under ?? "")?.[1];
    expect(day, "a day under the ring").toBeDefined();

    await page.getByRole("tab", { name: "Calendar" }).click();
    await page.waitForTimeout(1200);
    const marked = await page.evaluate(() => {
      const cell = document.querySelector('[aria-selected="true"][role="button"]');
      return cell?.getAttribute("aria-label") ?? null;
    });
    expect(marked, "Calendar marks the day the list stopped on").toContain(day);
  });

  test("stays where a hand puts it, and comes back when the list moves", async ({ page }) => {
    const resting = await stripOffset(page);

    // A wheel over the strip. `onScrollBeginDrag` does not fire for one on
    // `react-native-web`, so a component that waited for it snapped the strip
    // back within a frame — §7's *the list of dates is scrollable too* was
    // true on a phone and false on the web and nowhere said so.
    await page.mouse.move(195, 190);
    for (let tick = 0; tick < 6; tick += 1) {
      await page.mouse.wheel(-200, 0);
      await page.waitForTimeout(90);
    }
    await page.waitForTimeout(1200);
    const dragged = await stripOffset(page);
    expect(dragged, "the strip went where it was pushed").toBeLessThan(resting - 100);

    // And stayed. Nothing springs while the reader is still looking at it.
    await page.waitForTimeout(1200);
    expect(await stripOffset(page), "and stayed there").toBe(dragged);

    // The next touch on the list takes it back.
    await scrollTheList(page, 2);
    expect(
      await stripOffset(page),
      "the list moved, so the strip takes orders again",
    ).toBeGreaterThan(dragged + 100);
  });
});
