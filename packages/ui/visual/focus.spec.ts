/**
 * **One edge, not three.** `design-system/02` §2.6 puts a focus ring on every
 * interactive element, and taken literally that drew two edges on everything
 * that already had one: the control's own 1px border, a 2px gap of whatever
 * the page is made of, then the 2px ring. Three concentric rectangles to say
 * one thing, and on a form of fields it is most of what you see.
 *
 * So a control that **encloses itself in a border** shows focus in that
 * border — it thickens to `focus.width` and turns accent — and only a control
 * with no enclosure of its own gets the offset ring. `focusBorder()` and
 * `focusRing()` are the two halves; this is the rule that says which.
 *
 * **A divider is not an enclosure.** A row with a bottom hairline between it
 * and the next row has no edge to turn — turning one side green would be a
 * green underline, not a focus state — so it keeps the ring, and this asks
 * about all four sides rather than about any border at all. 22 rows are in
 * that position today.
 *
 * **Measured in the browser, because the defect is a resolved style.** A
 * source census cannot answer it: the border and the ring arrive from
 * different style objects, composed in a JSX array, sometimes through a
 * variant map — a static scan of this found 16 of the 242 pairs that were
 * actually drawn. So this focuses real elements in real Chromium and reads
 * what the engine computed, which is the repo's own rule about where to
 * assert a rendered property.
 *
 * It is also the only thing that can see the *other* half: an element with a
 * border and no author outline at all keeps Chromium's `outline-style: auto`
 * and gets the UA's own ring, in a blue this palette never names. That is a
 * violation of the same rule and this catches it as one, because the check is
 * "is there an outline outside a box border", not "did someone write one".
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

type Entry = { id: string; type: string };

const STORIES = Object.values(
  (
    JSON.parse(
      readFileSync(join(import.meta.dirname, "..", "storybook-static", "index.json"), "utf8"),
    ) as { entries: Record<string, Entry> }
  ).entries,
).filter((entry) => entry.type === "story");

/**
 * Anything that can hold focus. Wider than `button` on purpose: a
 * `react-native-web` control is a `div` with a role, and the two elements this
 * rule was written for — a text field and a select's trigger — are an `input`
 * and a `div[role=combobox]`.
 */
const FOCUSABLE =
  'button, input, [tabindex]:not([tabindex="-1"]), [role="button"], [role="combobox"], [role="switch"], [role="checkbox"], [role="radio"]';

/** Enough per story to cover its controls without walking a whole ledger. */
const PER_STORY = 25;

/**
 * **One test per story, not one walk over all of them.** A single test that
 * visited 572 stories took 90 seconds and died on the project's 30s per-test
 * budget — and a budget is not something to raise for one file. Per story it
 * is a page load and a focus walk, it parallelises across workers like every
 * other visual test, and a failure names the story rather than handing back a
 * list to search.
 */
for (const story of STORIES) {
  test(`${story.id} draws no ring outside a border`, async ({ page }) => {
    await page.goto(`/iframe.html?id=${story.id}&globals=appearance:light&viewMode=story`);
    await page.waitForSelector("#storybook-root > *", { state: "attached" });

    const offenders = await page.evaluate(
      async ([selector, cap]) => {
        const out: string[] = [];
        const nodes = Array.from(document.querySelectorAll(selector as string)).slice(
          0,
          cap as number,
        ) as HTMLElement[];

        for (const node of nodes) {
          node.focus();
          // Two frames: one for React to render the focused state, one for the
          // engine to lay it out. Reading on the first returns the resting
          // style and the rule passes by seeing nothing.
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );

          let cursor: HTMLElement | null = node;
          // The control or the wrapper that carries its border — the same two
          // nodes `press.spec.ts` walks, and for the same reason.
          for (let depth = 0; depth <= 1 && cursor !== null; depth += 1) {
            const style = getComputedStyle(cursor);
            const outline = Number.parseFloat(style.outlineWidth) || 0;
            const encloses = (
              [
                style.borderTopWidth,
                style.borderRightWidth,
                style.borderBottomWidth,
                style.borderLeftWidth,
              ] as const
            ).every((width) => (Number.parseFloat(width) || 0) > 0);

            if (outline > 0 && style.outlineStyle !== "none" && encloses) {
              const name =
                cursor.getAttribute("aria-label") ?? (cursor.textContent ?? "").slice(0, 30);
              out.push(`<${cursor.tagName.toLowerCase()}> ${name.trim()}`);
            }
            cursor = cursor.parentElement;
          }
          node.blur();
        }
        return Array.from(new Set(out));
      },
      [FOCUSABLE, PER_STORY] as const,
    );

    expect(offenders, "a ring outside a border (02-tokens §2.6)").toEqual([]);
  });
}
