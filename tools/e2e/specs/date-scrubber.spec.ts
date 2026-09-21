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

/**
 * The day whose block is at the top of the List's own viewport — read off the
 * page, not out of the app: the last date heading at or above the scroller's
 * top edge is the block the reader is inside.
 */
async function dayAtTheTopOfTheList(page: import("@playwright/test").Page): Promise<string | null> {
  return page.evaluate(() => {
    const DATE = /^[A-Z][a-z]+ \d{1,2}, \d{4}$/;
    // A collapsed run is headed by a *range* — `August 31 – September 1, 2026`
    // or `September 7 – 8, 2026` — and the day it stands for is its newer end,
    // because the list runs backwards and that is the end the reader meets.
    const RANGE = /^([A-Z][a-z]+) \d{1,2}\s*[–-]\s*(?:([A-Z][a-z]+) )?(\d{1,2}), (\d{4})$/;
    const dayOf = (text: string): string | null => {
      if (DATE.test(text)) return text;
      const run = RANGE.exec(text);
      return run === null ? null : `${run[2] ?? run[1]} ${run[3]}, ${run[4]}`;
    };
    // **On screen, not merely in the document.** All four pager pages are
    // mounted at once and Summary draws day headings too — first in DOM order,
    // so an unscoped query read Summary's scroller and called it the List's.
    const width = document.documentElement.clientWidth;
    const headings = [...document.querySelectorAll("div")].filter((node) => {
      if (node.children.length !== 0 || dayOf((node.textContent ?? "").trim()) === null)
        return false;
      const box = node.getBoundingClientRect();
      return box.left >= 0 && box.right <= width && box.width > 0;
    });
    // The List's scroller is the tall vertical one that holds those headings.
    const scroller = headings
      .map((node) => {
        let up: HTMLElement | null = node.parentElement;
        while (up !== null && !(up.scrollHeight > up.clientHeight + 200 && up.clientHeight > 300)) {
          up = up.parentElement;
        }
        return up;
      })
      .find((node) => node !== null);
    if (scroller === undefined || scroller === null) return null;
    const top = scroller.getBoundingClientRect().top;
    const content = scroller.firstElementChild;
    // **The cell's top, not the text's.** A day header pads above its words,
    // so the text sits 14pt below the block it names — and a list resting
    // exactly on a block's top, which is where a tap puts it, read as still
    // being on the day before.
    const cellOf = (node: Element): Element => {
      let up: Element = node;
      while (up.parentElement !== null && up.parentElement !== content) up = up.parentElement;
      return up;
    };
    /*
      **The day the reader is *looking at*, by the app's own rule restated.**
      A day with less than 72pt left under the top edge has been scrolled past
      and the one below it is being read — unless the list is resting exactly
      on a block's top, which is where a tap puts it. (`scrub.ts`'s `blockAt`;
      restated here rather than imported so the two can disagree.)
    */
    const blocks = headings
      .filter((heading) => scroller.contains(heading))
      .map((heading) => ({
        day: dayOf((heading.textContent ?? "").trim()),
        at: cellOf(heading).getBoundingClientRect().top - top,
      }))
      .sort((one, other) => one.at - other.at);
    let index = 0;
    for (let i = 0; i < blocks.length; i += 1) if ((blocks[i]?.at ?? 1) <= 0.5) index = i;
    const here = blocks[index];
    const next = blocks[index + 1];
    const resting = here !== undefined && -here.at <= 2;
    const inside = !resting && next !== undefined && next.at <= 72 ? next.day : (here?.day ?? null);
    return inside;
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
  // Past `SETTLE_MS` and past the strip's landing animation, which begins
  // there: read sooner, the ring is still between two cells.
  await page.waitForTimeout(1200);
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
    //
    // **Today is read from the run, not written down.** A literal date here
    // passes on the day it is typed and fails every day after — which is the
    // one kind of failing test nobody reads, because it is always "just the
    // date again".
    const under = await dayUnderTheRing(page);
    const today = new Date();
    const day = String(today.getDate());
    const year = String(today.getFullYear());
    expect(under, "the ring marks today on a cold open").toContain(day);
    expect(under, "and today's year").toContain(year);
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
    /*
      **The grid's marked cell, not the document's first one.** All four pager
      slots are in the DOM at once and the ribbon's own cells carry
      `aria-selected` too — a document-wide query returned the *strip's*
      selection, so both sides of this assertion came from the strip and the
      test would have passed with Calendar entirely broken.

      The grid is the one `role="grid"` on the screen; its cells are the only
      selected buttons inside it.
    */
    const marked = await page.evaluate(() => {
      const grid = document.querySelector('[role="grid"]');
      const cell = grid?.querySelector('[aria-selected="true"][role="button"]');
      return cell?.getAttribute("aria-label") ?? null;
    });
    expect(marked, "Calendar marks the day the list stopped on").toContain(day);
  });

  test("the ring and the list name the same day, wherever the list stops", async ({ page }) => {
    // **Alignment, asserted rather than eyeballed** — at several stops, some of
    // them mid-block, which is where a rule that rounds and a rule that floors
    // disagree and where this was wrong once already.
    for (const ticks of [1, 2, 3, 5, 4]) {
      await page.mouse.move(195, 600);
      for (let tick = 0; tick < ticks; tick += 1) {
        await page.mouse.wheel(0, 170);
        await page.waitForTimeout(90);
      }
      await page.waitForTimeout(1200);
      const ring = await dayUnderTheRing(page);
      const list = await dayAtTheTopOfTheList(page);
      expect(list, "a day at the top of the list").not.toBeNull();
      expect(ring, `the ring agrees with the list at "${list}"`).toContain(list ?? "");
    }
  });

  test("a tap on a day brings that day to the top of the list", async ({ page }) => {
    await scrollTheList(page, 4);
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
      // Three days earlier than where the list is — loaded, and off-centre.
      return cells[at - 3]?.getAttribute("aria-label") ?? null;
    });
    expect(name, "a loaded day to tap").not.toBeNull();
    if (name === null) return;
    const day = /(\w+ \d+, \d+)/.exec(name)?.[1] ?? "";

    await page.getByRole("button", { name }).first().click();
    await page.waitForTimeout(1800);

    expect(await dayAtTheTopOfTheList(page), "the list went to the tapped day").toBe(day);
    expect(await dayUnderTheRing(page), "and the ring went with it").toContain(day);
  });

  test("the List catches up with a day picked elsewhere, once it is the page again", async ({
    page,
  }) => {
    // The List is frozen while another page is showing — it used to reload the
    // whole ledger around every date picked on Calendar, off screen, at ~1,300
    // cell renders a tap. What that must not cost is the promise: come back to
    // the List and it is on the day that was picked.
    await page.getByRole("tab", { name: "Calendar" }).click();
    await page.waitForTimeout(1000);
    const grid = page.locator('[role="grid"]');
    // The ninth day of the month on screen: past, loaded, and not today.
    const picked = await grid.getByRole("button").nth(8).getAttribute("aria-label");
    expect(picked, "a day with entries on the Calendar").not.toBeNull();
    const day = /(\w+ \d+, \d+)/.exec(picked ?? "")?.[1] ?? "";
    await grid
      .getByRole("button", { name: picked ?? "" })
      .first()
      .click();
    await page.waitForTimeout(800);

    await page.getByRole("tab", { name: "List" }).click();
    await page.waitForTimeout(2500);
    expect(await dayUnderTheRing(page), "the ring is on the picked day").toContain(day);
    expect(await dayAtTheTopOfTheList(page), "and so is the list").toBe(day);
  });

  test("is not re-dated by a gesture on another page", async ({ page }) => {
    /*
      **One `scrollY`, four mounted pages.** The offset the header collapses
      from is shared by all of them, and anything that reads it through the
      *List's* day positions is interpreting someone else's gesture. Scrolling
      Summary dragged the off-screen strip; swiping back then reported a day
      nobody had scrolled to, because the offset had moved while the list had
      not. The List owns its own offset now.
    */
    const before = new URL(page.url()).searchParams.get("date");

    await page.getByRole("tab", { name: "Summary" }).click();
    await page.waitForTimeout(900);
    await page.mouse.move(195, 500);
    for (let tick = 0; tick < 8; tick += 1) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(110);
    }
    await page.waitForTimeout(900);
    expect(new URL(page.url()).searchParams.get("date"), "scrolling Summary moved no date").toBe(
      before,
    );

    // And swiping back must not report the day Summary's offset happens to
    // land on in the list's own geometry.
    await page.getByRole("tab", { name: "List" }).click();
    await page.waitForTimeout(1500);
    expect(new URL(page.url()).searchParams.get("date"), "and coming back moved none either").toBe(
      before,
    );
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
