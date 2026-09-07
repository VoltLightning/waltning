/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Dock, type DockModeOption } from "./dock";

function noop() {}

const MODES: readonly [DockModeOption, DockModeOption, ...DockModeOption[]] = [
  { value: "keypad", label: "Keypad" },
  { value: "voice", label: "Voice", disabled: true },
  { value: "receipt", label: "Receipt", disabled: true },
  { value: "converse", label: "Converse", disabled: true },
];

it("renders every mode the caller passes", () => {
  render(
    <Dock mode="keypad" modes={MODES} onMode={noop} onSave={noop} saveLabel="Save">
      <div>keypad</div>
    </Dock>,
  );
  expect(screen.getByRole("tab", { name: "Keypad" })).toBeDefined();
  expect(screen.getByRole("tab", { name: "Voice, Later" })).toBeDefined();
  expect(screen.getByRole("tab", { name: "Receipt, Later" })).toBeDefined();
  expect(screen.getByRole("tab", { name: "Converse, Later" })).toBeDefined();
});

it("the disabled modes announce why, and cannot be picked", () => {
  const onMode = vi.fn();
  render(
    <Dock mode="keypad" modes={MODES} onMode={onMode} onSave={noop} saveLabel="Save">
      <div>keypad</div>
    </Dock>,
  );
  const voice = screen.getByRole("tab", { name: "Voice, Later" });
  expect(voice.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(voice);
  expect(onMode).not.toHaveBeenCalled();
});

it("renders the keypad slot", () => {
  render(
    <Dock mode="keypad" modes={MODES} onMode={noop} onSave={noop} saveLabel="Save">
      <div>the keypad goes here</div>
    </Dock>,
  );
  expect(screen.getByText("the keypad goes here")).toBeDefined();
});

it("Save reaches onSave", () => {
  const onSave = vi.fn();
  render(
    <Dock mode="keypad" modes={MODES} onMode={noop} onSave={onSave} saveLabel="Save">
      <div>keypad</div>
    </Dock>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenCalled();
});

it("a disabled Save refuses the press", () => {
  const onSave = vi.fn();
  render(
    <Dock mode="keypad" modes={MODES} onMode={noop} onSave={onSave} saveLabel="Save" saveDisabled>
      <div>keypad</div>
    </Dock>,
  );
  const save = screen.getByRole("button", { name: "Save" });
  expect(save.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(save);
  expect(onSave).not.toHaveBeenCalled();
});
