import { expect, it } from "vitest";
import { listStartGate } from "./list-start-gate.ts";

/**
 * The defect this exists for: a list reports *start reached* on the frame it
 * mounts, and acting on that call reloaded the whole ledger above an anchor
 * the reader had just jumped to.
 */
it("is shut before the reader has touched the list", () => {
  const gate = listStartGate();
  expect(gate.opened()).toBe(false);
});

it("stays shut while the first item is still on screen", () => {
  const gate = listStartGate();
  gate.note([{ index: 0 }, { index: 1 }, { index: 2 }]);
  expect(gate.opened()).toBe(false);
});

it("opens once the first item has left the viewport", () => {
  const gate = listStartGate();
  gate.note([{ index: 4 }, { index: 5 }]);
  expect(gate.opened()).toBe(true);
});

/**
 * **It stays open after the reader comes back.** Returning to the top is
 * exactly when a newer page is wanted, and that report has item 0 in it again.
 */
it("stays open when the reader scrolls back to the top", () => {
  const gate = listStartGate();
  gate.note([{ index: 4 }]);
  gate.note([{ index: 0 }, { index: 1 }]);
  expect(gate.opened()).toBe(true);
});

/** A list scrolled past everything it holds reports nothing visible. */
it("opens on an empty report", () => {
  const gate = listStartGate();
  gate.note([]);
  expect(gate.opened()).toBe(true);
});

/**
 * A jump is a new list. Carrying the previous one's scrolling into it would
 * let the first frame of the new anchor load the ledger above it — the defect
 * this gate exists to stop, one jump later.
 */
it("shuts again for a new list", () => {
  const gate = listStartGate();
  gate.note([{ index: 9 }]);
  gate.reset();
  expect(gate.opened()).toBe(false);
});
