/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CreateAccountForm } from "./create-account-form";

it("shows fixed USD and rejects a whitespace-only name", () => {
  render(<CreateAccountForm currency="USD" onCancel={vi.fn()} onSave={vi.fn()} />);
  expect(screen.getByText("USD")).toBeDefined();
  const save = screen.getByRole("button", { name: "Save" });
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "   " } });
  expect(save.getAttribute("aria-disabled")).toBe("true");
});

it("trims the name before saving", () => {
  const onSave = vi.fn();
  render(<CreateAccountForm currency="USD" onCancel={vi.fn()} onSave={onSave} />);
  const input = screen.getByLabelText("Name");
  fireEvent.change(input, { target: { value: "  Cash · USD  " } });
  screen.getByRole("button", { name: "Save" }).click();
  expect(onSave).toHaveBeenCalledWith("Cash · USD");
});

it("prevents a name longer than the shared 120-character contract", () => {
  render(<CreateAccountForm currency="USD" onCancel={vi.fn()} onSave={vi.fn()} />);
  expect(screen.getByLabelText("Name").getAttribute("maxlength")).toBe("120");
});
