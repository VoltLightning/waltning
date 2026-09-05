/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import type { CaptureParse } from "@waltning/core/capture/grammar";
import { accountingDate } from "@waltning/core/date";
import { currencyCode, toMoney } from "@waltning/core/money";
import { createRef } from "react";
import type { TextInput } from "react-native";
import { expect, it, vi } from "vitest";
import { CommandBar, type CommandBarHandle, type CommandBarProps } from "./command-bar";

const TODAY = "2026-09-03";

const ACCOUNTS: CommandBarProps["accounts"] = [
  { id: "acc-cash", name: "Cash", currency: currencyCode("PLN"), decimals: 2 },
];
const CATEGORIES: CommandBarProps["categories"] = [{ id: "cat-food", name: "Food" }];

const RESOLVED: CaptureParse = {
  ok: true,
  amount: toMoney("48.90"),
  accountId: "acc-cash",
  categoryId: null,
  date: accountingDate("2026-09-02"),
  payee: "coffee",
  unmatched: [],
};

const PARTIAL: CaptureParse = {
  ok: false,
  reason: "no_account",
  partial: { amount: toMoney("48.90") },
  unmatched: ["taxi"],
};

const REFUSED: CaptureParse = {
  ok: false,
  reason: "no_amount",
  partial: {},
  unmatched: ["coffee"],
};

const BASE_PROPS: CommandBarProps = {
  value: "",
  onChangeText: vi.fn(),
  accounts: ACCOUNTS,
  categories: CATEGORIES,
  today: TODAY,
  parse: null,
  onSubmit: vi.fn(),
  onDiscard: vi.fn(),
};

function props(overrides: Partial<CommandBarProps> = {}): CommandBarProps {
  return { ...BASE_PROPS, ...overrides };
}

it("an empty bar shows no preview at all", () => {
  render(<CommandBar {...props()} />);
  expect(screen.queryByText("coffee")).toBeNull();
});

it("Resolved: renders the amount, the account, the date and the payee", () => {
  render(<CommandBar {...props({ value: "48.90 cash coffee yesterday", parse: RESOLVED })} />);
  expect(screen.getByText("48.90")).toBeDefined();
  expect(screen.getByText("PLN")).toBeDefined();
  expect(screen.getByText("Cash")).toBeDefined();
  expect(screen.getByText("2026-09-02")).toBeDefined();
  expect(screen.getByText("Payee: coffee")).toBeDefined();
  // No category matched or proposed — the chip asks, it does not guess.
  expect(screen.getByText("Category?")).toBeDefined();
});

it('Resolved: today\'s own date renders as "Today"', () => {
  const resolvedToday: CaptureParse = { ...RESOLVED, date: accountingDate(TODAY) };
  render(<CommandBar {...props({ value: "48.90 cash coffee", parse: resolvedToday })} />);
  expect(screen.getByText("Today")).toBeDefined();
});

it("Partial: shows whatever D1 resolved, plus why it stopped there", () => {
  render(<CommandBar {...props({ value: "48.90 taxi", parse: PARTIAL })} />);
  expect(screen.getByText("48.90")).toBeDefined();
  expect(screen.getByText("No account matched — name one to continue.")).toBeDefined();
  // Nothing to name for the payee or the category — this is D1's own refusal, not a draft.
  expect(screen.queryByText(/Payee:/)).toBeNull();
});

it("Refused: a line with no amount resolves nothing, and says so", () => {
  render(<CommandBar {...props({ value: "coffee", parse: REFUSED })} />);
  expect(screen.getByText("No amount found — start the line with a number.")).toBeDefined();
  expect(screen.queryByText("Cash")).toBeNull();
});

it("shows B1's field errors under the bar, already resolved to plain text", () => {
  render(
    <CommandBar
      {...props({
        value: "48.90 cash coffee",
        parse: RESOLVED,
        fieldErrors: { byField: { accountId: ["needs a rate"] }, formLevel: ["stale"] },
      })}
    />,
  );
  expect(screen.getByText("needs a rate")).toBeDefined();
  expect(screen.getByText("stale")).toBeDefined();
});

it("D2's proposal renders machine-filled at the display threshold", () => {
  render(
    <CommandBar
      {...props({
        value: "48.90 cash coffee",
        parse: RESOLVED,
        categoryProposal: { categoryId: "cat-food", confidence: 1, basis: "exact", neighbours: [] },
        categoryAutoFilled: true,
      })}
    />,
  );
  expect(screen.getByText("Food")).toBeDefined();
  expect(screen.queryByText("Category?")).toBeNull();
});

it("Enter saves — the keyboard contract's own S05 example", () => {
  const onSubmit = vi.fn();
  render(
    <CommandBar {...props({ value: "48.90 cash coffee yesterday", parse: RESOLVED, onSubmit })} />,
  );
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  expect(onSubmit).toHaveBeenCalledOnce();
});

it("Esc discards", () => {
  const onDiscard = vi.fn();
  render(<CommandBar {...props({ value: "coffee", parse: REFUSED, onDiscard })} />);
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
  expect(onDiscard).toHaveBeenCalledOnce();
});

it("Tab walks the resolved chips without leaving the input", () => {
  render(<CommandBar {...props({ value: "48.90 cash coffee yesterday", parse: RESOLVED })} />);
  const input = screen.getByRole("textbox");
  const event = fireEvent.keyDown(input, { key: "Tab" });
  // `preventDefault` is what keeps focus on the input — jsdom reports the
  // event as not cancelled only when nothing called it.
  expect(event).toBe(false);
});

it("exposes focus() through its ref — the platform hotkey's own reach", () => {
  const ref = createRef<CommandBarHandle>();
  render(<CommandBar {...props()} ref={ref} />);
  const input = screen.getByRole("textbox") as unknown as TextInput;
  const spy = vi.spyOn(input, "focus");
  ref.current?.focus();
  expect(spy).toHaveBeenCalledOnce();
});
