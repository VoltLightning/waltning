/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { TodayFrame } from "./today-frame";

it("owns the Today layout — heading, appearance action, hero and body", () => {
  render(
    <TodayFrame
      appearanceAction={<span>Appearance</span>}
      total={<span>$0.00</span>}
      body={<span>Recent</span>}
    />,
  );
  expect(screen.getByText("Today")).toBeDefined();
  expect(screen.getByText("Appearance")).toBeDefined();
  expect(screen.getByText("$0.00")).toBeDefined();
  expect(screen.getByText("Recent")).toBeDefined();
});
