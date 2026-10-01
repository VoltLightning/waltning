import { expect, it } from "vitest";
import { SCREEN_FADE_MS, stackMotion } from "./stack-motion.ts";

it("fades a pushed screen in over about 150 ms", () => {
  expect(stackMotion(false)).toEqual({ animation: "fade", animationDuration: SCREEN_FADE_MS });
  expect(SCREEN_FADE_MS).toBe(150);
});

it("arrives instantly under the OS Reduce motion setting", () => {
  expect(stackMotion(true)).toEqual({ animation: "none", animationDuration: 0 });
});
