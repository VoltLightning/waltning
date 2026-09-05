/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import type { CaptureParse } from "@waltning/core/capture/grammar";
import { type AccountingDate, accountingDate } from "@waltning/core/date";
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
  // L4 — a short date said the way the reader's own language says it, never
  // the bare ISO string the grammar resolved to.
  expect(screen.getByText("Sep 2")).toBeDefined();
  expect(screen.queryByText("2026-09-02")).toBeNull();
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

it("L1 — a figure past the account's own scale states the refusal before Enter, not just a rounded preview", () => {
  const overScale: CaptureParse = { ...RESOLVED, amount: toMoney("48.905") };
  render(<CommandBar {...props({ value: "48.905 cash coffee yesterday", parse: overScale })} />);
  // The rounded display figure still renders (P1 — every figure through
  // `<Amount>`) — the caption is what keeps it from reading as final.
  expect(screen.getByText("48.91")).toBeDefined();
  expect(screen.getByText("PLN holds 2 decimal places — this amount has more.")).toBeDefined();
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
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
  expect(onSubmit).toHaveBeenCalledOnce();
});

it("Esc discards", () => {
  const onDiscard = vi.fn();
  render(<CommandBar {...props({ value: "coffee", parse: REFUSED, onDiscard })} />);
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
  expect(onDiscard).toHaveBeenCalledOnce();
});

/**
 * L-f — the walk's own state, read the way a screen reader reads it: which
 * option carries `aria-selected`, and nothing more. `null` while no walk has
 * begun; the assertion that *exactly one* option ever carries it is the half
 * that would catch a highlight left behind on a stale chip.
 */
function walkedTo(): number | null {
  const marked = screen
    .getAllByRole("option")
    .map((option, index) => (option.getAttribute("aria-selected") === "true" ? index : null))
    .filter((index): index is number => index !== null);
  expect(marked.length, "at most one option is ever marked").toBeLessThan(2);
  return marked[0] ?? null;
}

it("M1 — Tab walks the resolved chips, then leaves the bar like any other field", () => {
  render(<CommandBar {...props({ value: "48.90 cash coffee yesterday", parse: RESOLVED })} />);
  const input = screen.getByRole("combobox");
  expect(screen.getAllByRole("option")).toHaveLength(3);
  // L-f — before the walk begins nothing is selected, and no option says so
  // in the negative either: these options cannot be chosen (`LISTBOX_ROLE`'s
  // own note), so `aria-selected="false"` would announce a state that has no
  // meaning here.
  expect(
    screen.getAllByRole("option").map((option) => option.getAttribute("aria-selected")),
  ).toEqual([null, null, null]);
  expect(walkedTo()).toBeNull();

  // First three Tabs walk chip 0, 1, 2 — each one cancelled (focus stays).
  for (let i = 0; i < 3; i++) {
    const event = fireEvent.keyDown(input, { key: "Tab" });
    expect(event).toBe(false);
    expect(walkedTo()).toBe(i);
  }

  // The fourth Tab, already on the last chip, is the browser's own — never
  // cancelled. **Tab does not wrap; the arrows do** (`handleKeyPress`).
  expect(fireEvent.keyDown(input, { key: "Tab" })).toBe(true);
});

it("M1 — Shift+Tab walks backward, and leaves the bar from the first chip", () => {
  render(<CommandBar {...props({ value: "48.90 cash coffee yesterday", parse: RESOLVED })} />);
  const input = screen.getByRole("combobox");
  fireEvent.keyDown(input, { key: "Tab" }); // → chip 0
  fireEvent.keyDown(input, { key: "Tab" }); // → chip 1

  const back = fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
  expect(back).toBe(false); // → chip 0, cancelled
  expect(walkedTo()).toBe(0);

  // Shift+Tab from chip 0 is the browser's own backward tab — never cancelled.
  expect(fireEvent.keyDown(input, { key: "Tab", shiftKey: true })).toBe(true);
});

it("L-f — Down walks the options forward and wraps, the combobox pattern's own key", () => {
  render(<CommandBar {...props({ value: "48.90 cash coffee yesterday", parse: RESOLVED })} />);
  const input = screen.getByRole("combobox");

  for (const expected of [0, 1, 2, 0]) {
    // Cancelled every time: Down must not also move the caret in the text.
    expect(fireEvent.keyDown(input, { key: "ArrowDown" })).toBe(false);
    expect(walkedTo()).toBe(expected);
  }
});

it("L-f — Up walks backward, starting from the last option, and wraps", () => {
  render(<CommandBar {...props({ value: "48.90 cash coffee yesterday", parse: RESOLVED })} />);
  const input = screen.getByRole("combobox");

  for (const expected of [2, 1, 0, 2]) {
    expect(fireEvent.keyDown(input, { key: "ArrowUp" })).toBe(false);
    expect(walkedTo()).toBe(expected);
  }
});

it("L-f — the arrows follow into aria-activedescendant, and Tab and the arrows share one walk", () => {
  render(<CommandBar {...props({ value: "48.90 cash coffee yesterday", parse: RESOLVED })} />);
  const input = screen.getByRole("combobox");

  fireEvent.keyDown(input, { key: "ArrowDown" }); // → chip 0
  fireEvent.keyDown(input, { key: "Tab" }); // → chip 1, the same walk
  expect(walkedTo()).toBe(1);
  const active = input.getAttribute("aria-activedescendant");
  expect(active).toBe(screen.getAllByRole("option")[1]?.getAttribute("id"));

  fireEvent.keyDown(input, { key: "ArrowUp" }); // → chip 0
  expect(input.getAttribute("aria-activedescendant")).toBe(
    screen.getAllByRole("option")[0]?.getAttribute("id"),
  );
});

it("L-f — with no line resolved the arrows stay the caret keys", () => {
  render(<CommandBar {...props({ value: "coffee", parse: REFUSED })} />);
  const input = screen.getByRole("combobox");
  // Not cancelled: there is no list to walk, so Down belongs to the text.
  expect(fireEvent.keyDown(input, { key: "ArrowDown" })).toBe(true);
  expect(fireEvent.keyDown(input, { key: "ArrowUp" })).toBe(true);
  expect(screen.queryAllByRole("option")).toHaveLength(0);
});

it("M1 — Shift+Tab with nothing highlighted is the browser's own backward tab", () => {
  render(<CommandBar {...props({ value: "48.90 cash coffee yesterday", parse: RESOLVED })} />);
  const input = screen.getByRole("combobox");
  expect(fireEvent.keyDown(input, { key: "Tab", shiftKey: true })).toBe(true);
});

it("M3/P2 — Esc on the highlighted category chip undoes the applied proposal, not the line", () => {
  const onUndoCategory = vi.fn();
  const onDiscard = vi.fn();
  render(
    <CommandBar
      {...props({
        value: "48.90 cash coffee yesterday",
        parse: RESOLVED,
        categoryProposal: { categoryId: "cat-food", confidence: 1, basis: "exact", neighbours: [] },
        categoryAutoFilled: true,
        onUndoCategory,
        onDiscard,
      })}
    />,
  );
  const input = screen.getByRole("combobox");
  fireEvent.keyDown(input, { key: "Tab" }); // account
  fireEvent.keyDown(input, { key: "Tab" }); // date
  fireEvent.keyDown(input, { key: "Tab" }); // category — index 2

  fireEvent.keyDown(input, { key: "Escape" });
  expect(onUndoCategory).toHaveBeenCalledOnce();
  expect(onDiscard).not.toHaveBeenCalled();
});

it("M3/P2 — the auto-filled category states its own provenance, in one line", () => {
  render(
    <CommandBar
      {...props({
        value: "48.90 cash coffee yesterday",
        parse: RESOLVED,
        categoryProposal: { categoryId: "cat-food", confidence: 1, basis: "exact", neighbours: [] },
        categoryAutoFilled: true,
      })}
    />,
  );
  expect(screen.getByText("From your history: coffee")).toBeDefined();
});

/**
 * M3 — the whole announcement, read off RNW's own DOM output rather than off
 * the props that produced it. DOM focus never leaves the input during a Tab
 * walk, so `aria-activedescendant` is the only thing telling a screen reader
 * which chip the highlight is on; a border alone said nothing.
 */
it("M3 — the input is a combobox naming its list, and the walked chip by id", () => {
  render(<CommandBar {...props({ value: "48.90 cash coffee yesterday", parse: RESOLVED })} />);
  const input = screen.getByRole("combobox");
  const listbox = screen.getByRole("listbox");

  expect(input.getAttribute("aria-expanded")).toBe("true");
  expect(input.getAttribute("aria-controls")).toBe(listbox.getAttribute("id"));
  expect(listbox.getAttribute("id")).toBeTruthy();
  // Nothing walked yet — there is no active descendant to name.
  expect(input.getAttribute("aria-activedescendant")).toBeNull();

  const options = screen.getAllByRole("option");
  expect(options).toHaveLength(3);
  for (const option of options) expect(option.getAttribute("id")).toBeTruthy();

  fireEvent.keyDown(input, { key: "Tab" });
  expect(input.getAttribute("aria-activedescendant")).toBe(options[0]?.getAttribute("id"));
  fireEvent.keyDown(input, { key: "Tab" });
  expect(input.getAttribute("aria-activedescendant")).toBe(options[1]?.getAttribute("id"));
});

it("M3 — an unresolved line is a combobox with nothing to expand into", () => {
  render(<CommandBar {...props({ value: "coffee", parse: REFUSED })} />);
  const input = screen.getByRole("combobox");
  expect(input.getAttribute("aria-expanded")).toBe("false");
  expect(input.getAttribute("aria-controls")).toBeNull();
  expect(screen.queryByRole("listbox")).toBeNull();
});

it("M3 — the listbox contains options and nothing else", () => {
  render(
    <CommandBar
      {...props({
        value: "48.90 cash coffee yesterday",
        parse: RESOLVED,
        categoryProposal: { categoryId: "cat-food", confidence: 1, basis: "exact", neighbours: [] },
        categoryAutoFilled: true,
      })}
    />,
  );
  const listbox = screen.getByRole("listbox");
  // Every direct child is an option; the amount, the payee line and the
  // provenance caption all live outside it.
  const children = Array.from(listbox.children);
  expect(children).toHaveLength(3);
  for (const child of children) expect(child.getAttribute("role")).toBe("option");
  expect(listbox.textContent).not.toContain("48.90");
  expect(listbox.textContent).not.toContain("Payee");
  expect(listbox.textContent).not.toContain("From your history");
});

it("M3 — the partial branch's chip is not an option, because there is no list around it", () => {
  render(<CommandBar {...props({ value: "48.90 taxi", parse: PARTIAL })} />);
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(screen.queryAllByRole("option")).toHaveLength(0);
});

it("L3 — the bar states the one rule about numbers a typed line cannot state for itself", () => {
  render(<CommandBar {...props()} />);
  expect(
    screen.getByText("Spaces group thousands; comma or point is the decimal mark."),
  ).toBeDefined();
});

it("L4 — the machine-filled chip's accessible name says which field was filled, not the value twice", () => {
  render(
    <CommandBar
      {...props({
        value: "48.90 cash coffee yesterday",
        parse: RESOLVED,
        categoryProposal: { categoryId: "cat-food", confidence: 1, basis: "exact", neighbours: [] },
        categoryAutoFilled: true,
      })}
    />,
  );
  const chip = screen.getAllByRole("option")[2];
  expect(chip?.getAttribute("aria-label")).toBe("Category: Food, filled automatically");
});

it("L5 — the provenance line carries an Undo, and pressing it undoes the proposal", () => {
  const onUndoCategory = vi.fn();
  const onDiscard = vi.fn();
  render(
    <CommandBar
      {...props({
        value: "48.90 cash coffee yesterday",
        parse: RESOLVED,
        categoryProposal: { categoryId: "cat-food", confidence: 1, basis: "exact", neighbours: [] },
        categoryAutoFilled: true,
        onUndoCategory,
        onDiscard,
      })}
    />,
  );
  fireEvent.click(screen.getByText("Undo"));
  expect(onUndoCategory).toHaveBeenCalledOnce();
  expect(onDiscard).not.toHaveBeenCalled();
});

it("L5 — no proposal, no Undo: there is nothing to undo", () => {
  render(<CommandBar {...props({ value: "48.90 cash coffee yesterday", parse: RESOLVED })} />);
  expect(screen.queryByText("Undo")).toBeNull();
});

it("exposes focus() through its ref — the platform hotkey's own reach", () => {
  const ref = createRef<CommandBarHandle>();
  render(<CommandBar {...props()} ref={ref} />);
  const input = screen.getByRole("combobox") as unknown as TextInput;
  const spy = vi.spyOn(input, "focus");
  ref.current?.focus();
  expect(spy).toHaveBeenCalledOnce();
});

it("L-d — the hint is the input's own description, not loose text beside it", () => {
  render(<CommandBar {...props()} />);
  const input = screen.getByRole("combobox");
  const describedBy = input.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();

  const hint = screen.getByText("Spaces group thousands; comma or point is the decimal mark.");
  expect(hint.getAttribute("id")).toBe(describedBy);
});

it("L-d — the description holds on an empty bar and on a resolved one alike", () => {
  const { rerender } = render(<CommandBar {...props()} />);
  const empty = screen.getByRole("combobox").getAttribute("aria-describedby");
  rerender(<CommandBar {...props({ value: "48.90 cash coffee", parse: RESOLVED })} />);
  // The rule is about typing, so it is described before there is anything to
  // resolve — unlike `aria-controls`, which only exists once a list does.
  expect(screen.getByRole("combobox").getAttribute("aria-describedby")).toBe(empty);
});

it("L-b — a date that names no real day is refused by name, not dated today", () => {
  const noDate: CaptureParse = {
    ok: false,
    reason: "no_date",
    partial: { amount: toMoney("48.90"), accountId: "acc-cash" },
    unmatched: [],
  };
  render(<CommandBar {...props({ value: "48.90 cash coffee 2026-02-31", parse: noDate })} />);
  expect(
    screen.getByText("That date isn't a real day — check the month and the day."),
  ).toBeDefined();
  // Nothing resolved, so nothing is announced as a choice.
  expect(screen.queryAllByRole("option")).toHaveLength(0);
});

it("L-b — a date the chip cannot format renders as the bare string rather than throwing", () => {
  // Unreachable through the grammar (`no_date` above catches it first) and
  // written down anyway: `Intl.DateTimeFormat` raises on an invalid `Date`,
  // and this runs in a render body — a throw here takes the whole bar with it.
  const unformattable: CaptureParse = {
    ...RESOLVED,
    // The brand is asserted rather than earned: `accountingDate` throws on
    // this by design, and the value this test exists for is precisely one
    // that got past a boundary. Asserting the brand on a `string` is the
    // narrowest way to stand one here — no `unknown`, no `any`.
    date: "not-a-date" as AccountingDate,
  };
  render(<CommandBar {...props({ value: "48.90 cash coffee", parse: unformattable })} />);
  expect(screen.getByText("not-a-date")).toBeDefined();
});
