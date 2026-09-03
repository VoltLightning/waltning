/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { floating } from "../tokens.ts";
import { defaultFloat } from "./float-geometry.ts";
import { FloatingAdd } from "./floating-add";
import { installPhoneLayout, settleLayout } from "./floating-add.test-support.ts";

installPhoneLayout();

it("is a labelled button that adds on tap", async () => {
  const onAdd = vi.fn();
  render(<FloatingAdd onAdd={onAdd} position={null} onPositionChange={vi.fn()} />);
  await settleLayout();
  const button = screen.getByRole("button", { name: "Add" });
  button.click();
  expect(onAdd).toHaveBeenCalledOnce();
});

it("renders nothing until it knows how much room it has", () => {
  render(<FloatingAdd onAdd={vi.fn()} position={null} onPositionChange={vi.fn()} />);
  expect(screen.queryByRole("button")).toBeNull();
});

it("can be disabled and says so", async () => {
  render(<FloatingAdd onAdd={vi.fn()} disabled position={null} onPositionChange={vi.fn()} />);
  await settleLayout();
  expect(screen.getByRole("button", { name: "Add" }).getAttribute("aria-disabled")).toBe("true");
});

it("parked, it is a tab that brings the button back where it was", async () => {
  const onPositionChange = vi.fn();
  render(
    <FloatingAdd
      onAdd={vi.fn()}
      position={{ x: 40, y: 300, dock: 120 }}
      onPositionChange={onPositionChange}
    />,
  );
  await settleLayout();
  expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
  const tab = screen.getByRole("button", { name: "Show the add button" });
  // On the bottom edge, centred on the column it was dropped at.
  expect(tab.style.top).toBe(`${844 - floating.tab.height}px`);
  expect(tab.style.left).toBe(`${120 - floating.tab.width / 2}px`);
  tab.click();
  expect(onPositionChange).toHaveBeenCalledWith({ x: 40, y: 300, dock: null });
});

it("defaults to the bottom-right corner, inside the inset", () => {
  const home = defaultFloat({ width: 390, height: 844 }, { top: 0, right: 0, bottom: 0, left: 0 });
  expect(home.x + floating.size + floating.inset).toBe(390);
  expect(home.y + floating.size + floating.inset).toBe(844);
});
