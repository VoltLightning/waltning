/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TodayFrame } from "./today-frame";

it("owns Today layout and the raised add target", () => {
  const onAdd = vi.fn();
  render(
    <TodayFrame
      appearanceAction={<span>Appearance</span>}
      total={<span>$0.00</span>}
      body={<span>Recent</span>}
      onAdd={onAdd}
    />,
  );
  expect(screen.getByText("Today")).toBeDefined();
  expect(screen.getByText("Appearance")).toBeDefined();
  expect(screen.getByText("$0.00")).toBeDefined();
  expect(screen.getByText("Recent")).toBeDefined();
  screen.getByRole("button", { name: "+" }).click();
  expect(onAdd).toHaveBeenCalledOnce();
});

it("can disable add before an account exists", () => {
  render(
    <TodayFrame appearanceAction={null} total={null} body={null} onAdd={vi.fn()} addDisabled />,
  );
  expect(screen.getByRole("button", { name: "+" }).getAttribute("aria-disabled")).toBe("true");
});
