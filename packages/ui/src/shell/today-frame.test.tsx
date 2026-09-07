/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { TodayFrame } from "./today-frame";

it("owns the Today layout — heading, date, appearance action and body", () => {
  render(
    <TodayFrame
      appearanceAction={<span>Appearance</span>}
      date="Saturday, 5 September"
      body={<span>Recent</span>}
    />,
  );
  expect(screen.getByText("Today")).toBeDefined();
  expect(screen.getByText("Saturday, 5 September")).toBeDefined();
  expect(screen.getByText("Appearance")).toBeDefined();
  expect(screen.getByText("Recent")).toBeDefined();
});

/**
 * **The band holds no figure.** Net worth was the hero here and the band it
 * needed spent about 350pt of an 844pt screen on a total that moves slowly,
 * with the month's own figures below the fold. Asserted rather than left to
 * the screenshot, because a `hero` slot that is merely unused is one prop away
 * from being used again.
 */
it("draws no hero figure in the band", () => {
  const { container } = render(
    <TodayFrame appearanceAction={null} date="Saturday, 5 September" body={<span>Recent</span>} />,
  );
  // Shell then GroundPanel; the shell's own children are the header row alone.
  const shell = container.firstElementChild?.firstElementChild;
  expect(shell?.children).toHaveLength(1);
});
