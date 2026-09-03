/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { installPhoneLayout, settleLayout } from "./floating-add.test-support.ts";
import { TodayFrame } from "./today-frame";

installPhoneLayout();

it("owns Today layout and the floating add target", async () => {
  const onAdd = vi.fn();
  render(
    <TodayFrame
      appearanceAction={<span>Appearance</span>}
      total={<span>$0.00</span>}
      body={<span>Recent</span>}
      onAdd={onAdd}
      floatPosition={null}
      onFloatPositionChange={vi.fn()}
    />,
  );
  await settleLayout();
  expect(screen.getByText("Today")).toBeDefined();
  expect(screen.getByText("Appearance")).toBeDefined();
  expect(screen.getByText("$0.00")).toBeDefined();
  expect(screen.getByText("Recent")).toBeDefined();
  screen.getByRole("button", { name: "Add" }).click();
  expect(onAdd).toHaveBeenCalledOnce();
});

it("can disable add before an account exists", async () => {
  render(
    <TodayFrame
      appearanceAction={null}
      total={null}
      body={null}
      onAdd={vi.fn()}
      addDisabled
      floatPosition={null}
      onFloatPositionChange={vi.fn()}
    />,
  );
  await settleLayout();
  expect(screen.getByRole("button", { name: "Add" }).getAttribute("aria-disabled")).toBe("true");
});
