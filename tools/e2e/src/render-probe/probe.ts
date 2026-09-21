/**
 * The in-page half of the render probe: counts which components rendered, by
 * name, between two marks.
 *
 * **Runs before React does.** `bippy` installs the React DevTools hook, and a
 * renderer only reports to a hook that existed when it was injected — so this
 * file is bundled (`build.ts`) and handed to Playwright as an init script,
 * which the browser runs ahead of every page script.
 *
 * **Counts, not timings.** A timing is a fact about this laptop today; a
 * render count is a fact about the code, and it is the same number on a phone.
 * `measure-renders-in-chrome` is the standing rule: profile UI slices in the
 * browser and pin render counts in a test, never in prose.
 */

import { getDisplayName, instrument, isCompositeFiber, traverseRenderedFibers } from "bippy";

type Tally = Record<string, number>;

const tally: Tally = {};
let commits = 0;

instrument({
  name: "waltning-render-probe",
  onCommitFiberRoot: (_renderer, root) => {
    commits += 1;
    traverseRenderedFibers(root, (fiber, phase) => {
      // Mounts and unmounts are what a list does when it virtualises; the
      // question here is who *re-rendered*, so only updates are tallied.
      if (phase !== "update") return;
      if (!isCompositeFiber(fiber)) return;
      const name = getDisplayName(fiber.type) ?? "Anonymous";
      tally[name] = (tally[name] ?? 0) + 1;
    });
  },
});

const probe = {
  /** Forget everything counted so far. */
  reset(): void {
    for (const key of Object.keys(tally)) delete tally[key];
    commits = 0;
  },
  /** What re-rendered since the last reset, busiest first. */
  read(): { commits: number; renders: Tally } {
    const sorted = Object.fromEntries(Object.entries(tally).sort((a, b) => b[1] - a[1]));
    return { commits, renders: sorted };
  },
};

Object.assign(globalThis, { __renderProbe: probe });
