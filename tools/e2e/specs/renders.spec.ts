/**
 * S04's List page — what each interaction is allowed to re-render.
 *
 * **Counts, not timings.** A timing is a fact about this laptop today; a
 * render count is a fact about the code and is the same number on a phone. The
 * probe (`src/render-probe/`) is `bippy` on the React DevTools hook, injected
 * before React loads, tallying which components *re-rendered* — mounts are
 * what a virtualised list does for a living and are not counted.
 *
 * Every budget here is a defect that shipped, measured before it was fixed:
 *
 *  - **A scroll coming to rest cost 7 commits and ~2,400 renders.** The settle
 *    wrote the day to the route, and `router.setParams` re-renders the whole
 *    navigation tree, four times over; the list's entries were keyed on that
 *    same day, so every cell's `memo` failed and every mounted cell re-rendered
 *    about five times. It is 1 commit and ~45 renders now: the day is *noted*
 *    and carried by the next deliberate write (`use-pager-route.ts`).
 *  - **A tab press re-rendered every cell of the list**, for a boolean prop
 *    only a worklet reads. It is a shared value now.
 *  - **`useGroundInset` returned a fresh style object per render**, which was
 *    a new `contentContainerStyle` for the list on every parent render — the
 *    one unstable prop that kept the list re-rendering after everything else
 *    had been fixed.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { buildProbe } from "../src/render-probe/build.ts";

type Reading = { commits: number; renders: Record<string, number> };

declare global {
  // The probe's handle, installed by the init script.
  var __renderProbe: { reset(): void; read(): Reading };
}

const reset = (page: Page) => page.evaluate(() => globalThis.__renderProbe.reset());
const read = (page: Page): Promise<Reading> => page.evaluate(() => globalThis.__renderProbe.read());

/** The list's own cells, by the names React Native and this repo give them. */
const CELLS = ["CellRenderer", "ListEntryView", "LedgerScrollerView"] as const;
const cellsIn = (reading: Reading) =>
  CELLS.reduce((sum, name) => sum + (reading.renders[name] ?? 0), 0);

/** The navigation tree — what a route write re-renders. */
const NAVIGATION = ["Tabs", "NativeStackNavigator", "Today", "PagerFrameView"] as const;
const navigationIn = (reading: Reading) =>
  NAVIGATION.reduce((sum, name) => sum + (reading.renders[name] ?? 0), 0);

let probe: string;
test.beforeAll(async () => {
  probe = await buildProbe(join(mkdtempSync(join(tmpdir(), "render-probe-")), "probe.js"));
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript({ path: probe });
  await page.goto("/settings/developer");
  await page.getByRole("button", { name: /load demo data/i }).click();
  await expect(page.getByText(/rows · \d+ accounts/)).toBeVisible({ timeout: 120_000 });
  await page.goto("/?view=list");
  await page.getByRole("tab", { name: "List" }).click();
  await page.waitForTimeout(2500);
});

async function scrollTheList(page: Page): Promise<void> {
  await page.mouse.move(195, 600);
  for (let tick = 0; tick < 10; tick += 1) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(50);
  }
  // The scroll itself is over; the settle has not happened yet.
  await page.waitForTimeout(60);
}

test("renders nothing at all while nothing is happening", async ({ page }) => {
  await reset(page);
  await page.waitForTimeout(1500);
  expect((await read(page)).commits, "an idle screen commits nothing").toBe(0);
});

test("a scroll coming to rest re-renders no cell and no navigator", async ({ page }) => {
  await scrollTheList(page);
  await reset(page);
  await page.waitForTimeout(900);
  const settle = await read(page);

  expect(cellsIn(settle), "no list cell hears about a settle").toBe(0);
  // The strip is a list too, and the day it marks changes on a settle: the day
  // that lost the mark and the day that gained it, and not the list around them.
  expect(settle.renders["RibbonCell"] ?? 0, "two strip cells, not the strip").toBeLessThanOrEqual(
    2,
  );
  expect(settle.renders["StripView"] ?? 0).toBe(0);
  expect(navigationIn(settle), "and the route is not written").toBeLessThanOrEqual(1);
  // One commit, with headroom for the first settle's month label.
  expect(settle.commits).toBeLessThanOrEqual(2);
});

test("a tap on a loaded day re-renders no cell and writes no route", async ({ page }) => {
  await scrollTheList(page);
  await page.waitForTimeout(900);
  const name = await page.evaluate(() => {
    const band = [...document.querySelectorAll('[role="list"]')].find(
      (node) => node.scrollWidth > node.clientWidth,
    );
    if (band === undefined) return null;
    const box = band.getBoundingClientRect();
    const middle = box.left + box.width / 2;
    const cells = [...band.querySelectorAll('[role="button"]')];
    const at = cells.findIndex((cell) => {
      const r = cell.getBoundingClientRect();
      return r.left <= middle && middle <= r.right;
    });
    return cells[at - 2]?.getAttribute("aria-label") ?? null;
  });
  expect(name, "a loaded day beside the ring").not.toBeNull();
  if (name === null) return;

  const before = new URL(page.url()).searchParams.get("date");
  await reset(page);
  await page.getByRole("button", { name }).first().click();
  await page.waitForTimeout(1500);
  const tap = await read(page);

  expect(tap.renders["LedgerScrollerView"] ?? 0, "the list is scrolled, not re-rendered").toBe(0);
  expect(tap.renders["ListEntryView"] ?? 0).toBe(0);
  expect(navigationIn(tap), "a day that is on the list is not a route write").toBe(0);
  expect(new URL(page.url()).searchParams.get("date")).toBe(before);
});

test("a page change does not reach the list", async ({ page }) => {
  await reset(page);
  await page.getByRole("tab", { name: "Calendar" }).click();
  await page.waitForTimeout(1200);
  expect(cellsIn(await read(page)), "swiping away re-renders no list cell").toBe(0);
});

/**
 * **The other three pages had the List's problem, because they had the List.**
 * All four are mounted, and the off-screen List answered every date change on
 * every page by reloading the ledger around it — a tap on a Calendar day was
 * 19 commits and 4,361 renders, some 1,300 of them cells of a list nobody
 * could see. The List is frozen while it is not the page on screen; the pager
 * moves first and writes the route a moment later; and each page is its own
 * memo, so a page that was told nothing new is not re-rendered.
 */
test("a tap on a Calendar day reaches neither the List nor the router", async ({ page }) => {
  await page.getByRole("tab", { name: "Calendar" }).click();
  await page.waitForTimeout(1500);
  const grid = page.locator('[role="grid"]');
  // The ninth day of the month on screen: past, loaded, and not today.
  const name = await grid.getByRole("button").nth(8).getAttribute("aria-label");
  expect(name).not.toBeNull();

  await reset(page);
  await grid
    .getByRole("button", { name: name ?? "" })
    .first()
    .click();
  await page.waitForTimeout(150);
  const press = await read(page);

  expect(cellsIn(press), "the hidden List hears nothing").toBe(0);
  expect(press.renders["HomeListPageView"] ?? 0).toBe(0);
  expect(press.renders["Tabs"] ?? 0, "and the route is not what the press waits on").toBe(0);
  expect(press.renders["YearChartView"] ?? 0, "nor is Months re-rendered for a day").toBe(0);
});
