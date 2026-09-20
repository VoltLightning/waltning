import { describe, expect, it } from "vitest";
import { reanchors } from "./anchor-echo.ts";

describe("reanchors", () => {
  it("is not news when the list is already there", () => {
    expect(reanchors("2026-05-25", "2026-05-25", null)).toBe(false);
  });

  it("is not news when it is the list's own report coming back", () => {
    // The whole defect this exists for: honouring §3's cross-page promise
    // means the list writes the date, and taking that write at face value
    // re-keys the list and jumps the reader to where they just left.
    expect(reanchors("2026-05-25", "2026-08-14", "2026-05-25")).toBe(false);
  });

  it("is news for a jump", () => {
    // A tap on the strip, the Today pill, the picker, the stepper.
    expect(reanchors("2021-03-14", "2026-08-14", "2026-05-25")).toBe(true);
  });

  it("is news again for a day the list reported and then left", () => {
    // Reported the 25th, jumped elsewhere, and now the reader asks for the
    // 25th again — a second jump, not the first one echoing.
    expect(reanchors("2026-05-25", "2021-03-14", null)).toBe(true);
  });
});
