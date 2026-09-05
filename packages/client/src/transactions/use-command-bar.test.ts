/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { type CaptureContext, parseCapture } from "@waltning/core/capture/grammar";
import type { PayeeHistoryRow } from "@waltning/core/capture/payee-memory";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { describe, expect, it, vi } from "vitest";
import type { FieldError } from "../transport/field-errors.ts";
import {
  type CommandBarController,
  type CommandBarDraft,
  useCommandBar,
} from "./use-command-bar.ts";

const TODAY = accountingDate("2026-09-03"); // Thursday, matching `grammar.test.ts`'s own fixture.

const CASH = { id: "acc-cash", name: "Cash", currency: "PLN" };
const FOOD = { id: "cat-food", name: "Food" };
const SALARY = { id: "cat-salary", name: "Salary" };

const context: CaptureContext = {
  accounts: [CASH],
  categories: [FOOD, SALARY],
  defaultAccountId: null,
  today: TODAY,
  locale: "en",
};

function parse(text: string) {
  return parseCapture(text, context);
}

/** The categories this bar actually offers — expense only, `cat-food` among them. `cat-salary` is deliberately absent, standing in for H1's "archived, or a stale id" case. */
const CATEGORIES = [{ id: "cat-food", kind: "expense" as const }];

type CreateTransactionResult =
  | { id: ReturnType<typeof id<"transactions">>; deferred?: boolean }
  | { fieldErrors: readonly FieldError[] };

function fakeController(
  overrides: { createTransaction?: (draft: CommandBarDraft) => CreateTransactionResult } = {},
): CommandBarController & {
  createTransaction: ReturnType<typeof vi.fn<(draft: CommandBarDraft) => CreateTransactionResult>>;
  listPayeeHistory: ReturnType<typeof vi.fn<() => readonly PayeeHistoryRow[]>>;
} {
  return {
    createTransaction: vi.fn(
      overrides.createTransaction ?? (() => ({ id: id("11111111-1111-4111-8111-111111111111") })),
    ),
    listPayeeHistory: vi.fn(() => []),
  };
}

describe("useCommandBar", () => {
  it("resolves S05's own example line and saves the right row on submit", () => {
    const controller = fakeController();
    const { result } = renderHook(() => useCommandBar(controller, parse, CATEGORIES));

    act(() => result.current.setText("48.90 cash coffee yesterday"));
    expect(result.current.parse).toMatchObject({
      ok: true,
      amount: "48.90000000",
      accountId: "acc-cash",
      date: "2026-09-02",
      payee: "coffee",
    });

    act(() => result.current.submit());

    expect(controller.createTransaction).toHaveBeenCalledWith({
      type: "expense",
      amount: "48.90000000",
      accountId: "acc-cash",
      categoryId: null,
      payee: "coffee",
      date: "2026-09-02",
      note: "",
      isBusiness: false,
      counterpartyId: null,
      counterpartyRole: null,
    });
    // A save clears the bar — the next line starts from nothing.
    expect(result.current.text).toBe("");
  });

  /**
   * C1, through the whole path a typed line actually takes: `setText` →
   * `parseCapture` → `submit` → `createTransaction`. The defect was invisible
   * at the parse boundary alone — the discarded digits sat inside the amount
   * token's own span, so `unmatched` was empty and the line still read
   * `ok: true`; only the figure the controller received said what had
   * happened.
   *
   * `1.234,56` is the locale case and its saved figure carries three decimal
   * places on purpose: the grammar reads `.` as the decimal mark, and refusing
   * a figure past its account's own scale is `create_transaction`'s job (and,
   * before Enter, L1's caption under the bar) — never something this hook
   * rounds away on the way through.
   */
  it.each([
    ["1000 cash coffee", "1000.00000000"],
    ["1234.56 cash coffee", "1234.56000000"],
    ["12345 cash coffee", "12345.00000000"],
    ["1 234.56 cash coffee", "1234.56000000"],
    ["1.234,56 cash coffee", "1.23400000"],
    // L1 — a four-digit head never starts a thousands chain: this is 1234
    // with `567` in the payee, not 1 234 567.
    ["1234 567 cash", "1234.00000000"],
    // L1 — the first number is the amount, the second is payee text (S05 §3).
    ["1000 2000 cash", "1000.00000000"],
    // L1 — a real chain is still one figure.
    ["1 234 567 cash coffee", "1234567.00000000"],
    // L2 — a leading ISO date is a date, and the money after it is the amount.
    ["2026-08-10 48.90 cash coffee", "48.90000000"],
  ])("C1/L1/L2 — %s saves %s, whole and untruncated", (line, amount) => {
    const controller = fakeController();
    const { result } = renderHook(() => useCommandBar(controller, parse, CATEGORIES));

    act(() => result.current.setText(line));
    expect(result.current.parse).toMatchObject({ ok: true, amount });

    act(() => result.current.submit());
    expect(controller.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ amount }));
  });

  it("a line with no amount never reaches createTransaction — D1's own refusal is the whole answer", () => {
    const controller = fakeController();
    const { result } = renderHook(() => useCommandBar(controller, parse, CATEGORIES));

    act(() => result.current.setText("coffee"));
    expect(result.current.parse).toMatchObject({ ok: false, reason: "no_amount" });

    act(() => result.current.submit());

    expect(controller.createTransaction).not.toHaveBeenCalled();
    // Nothing to discard, but nothing crashes either — Enter on an
    // unresolved line is inert, matching S05 §3's "no model path".
    expect(result.current.text).toBe("coffee");
  });

  it("L5 — a line with no account (and no default) never reaches createTransaction either", () => {
    const controller = fakeController();
    const { result } = renderHook(() => useCommandBar(controller, parse, CATEGORIES));

    act(() => result.current.setText("48.90 revolut coffee"));
    expect(result.current.parse).toMatchObject({ ok: false, reason: "no_account" });

    act(() => result.current.submit());
    expect(controller.createTransaction).not.toHaveBeenCalled();
  });

  it("L5 — too much left unmatched never reaches createTransaction", () => {
    const controller = fakeController();
    const { result } = renderHook(() => useCommandBar(controller, parse, CATEGORIES));

    act(() => result.current.setText("48.90 cash one two three four five six seven"));
    expect(result.current.parse).toMatchObject({ ok: false, reason: "too_much_unmatched" });

    act(() => result.current.submit());
    expect(controller.createTransaction).not.toHaveBeenCalled();
  });

  it("an empty bar has nothing to say — parse is null before the first keystroke", () => {
    const controller = fakeController();
    const { result } = renderHook(() => useCommandBar(controller, parse, CATEGORIES));
    expect(result.current.parse).toBeNull();
  });

  it("D2 auto-fills the category at or above the display threshold", () => {
    const controller = fakeController();
    controller.listPayeeHistory.mockReturnValue([
      { payee: "coffee", categoryId: "cat-food", date: accountingDate("2026-08-01") },
    ]);
    const { result } = renderHook(() => useCommandBar(controller, parse, CATEGORIES));

    act(() => result.current.setText("48.90 cash coffee"));

    // An exact fold match is confidence 1 (`payee-memory.ts`) — at the
    // display threshold, so the draft's own category is the proposal's.
    expect(result.current.categoryAutoFilled).toBe(true);
    expect(result.current.categoryId).toBe("cat-food");

    act(() => result.current.submit());
    expect(controller.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: "cat-food" }),
    );
  });

  it("H1a — never auto-fills a proposal absent from the offered categories (archived, or since deleted)", () => {
    const controller = fakeController();
    // History votes for `cat-gym`, which `CATEGORIES` does not carry — the
    // same shape an archived category's history row would produce, since
    // `readPayeeHistory` does not itself exclude archived categories.
    controller.listPayeeHistory.mockReturnValue([
      { payee: "gym", categoryId: "cat-gym-archived", date: accountingDate("2026-08-01") },
    ]);
    const { result } = renderHook(() => useCommandBar(controller, parse, CATEGORIES));

    act(() => result.current.setText("48.90 cash gym"));

    expect(result.current.categoryAutoFilled).toBe(false);
    expect(result.current.categoryId).toBeNull();

    act(() => result.current.submit());
    expect(controller.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: null }),
    );
  });

  it("H1b — never auto-fills a proposal of the wrong kind (income, offered categories are expense-only)", () => {
    const controller = fakeController();
    controller.listPayeeHistory.mockReturnValue([
      { payee: "payday", categoryId: "cat-salary", date: accountingDate("2026-08-01") },
    ]);
    const { result } = renderHook(() => useCommandBar(controller, parse, CATEGORIES));

    act(() => result.current.setText("48.90 cash payday"));

    expect(result.current.categoryAutoFilled).toBe(false);
  });

  it("M3 — undoCategory dismisses an applied proposal without discarding the line", () => {
    const controller = fakeController();
    controller.listPayeeHistory.mockReturnValue([
      { payee: "coffee", categoryId: "cat-food", date: accountingDate("2026-08-01") },
    ]);
    const { result } = renderHook(() => useCommandBar(controller, parse, CATEGORIES));

    act(() => result.current.setText("48.90 cash coffee"));
    expect(result.current.categoryAutoFilled).toBe(true);

    act(() => result.current.undoCategory());
    expect(result.current.categoryAutoFilled).toBe(false);
    expect(result.current.categoryId).toBeNull();
    // The line itself is untouched — Undo is not Discard.
    expect(result.current.text).toBe("48.90 cash coffee");

    // A different payee earns its own proposal a fresh chance.
    act(() => result.current.setText("48.90 cash coffee two"));
    expect(result.current.categoryAutoFilled).toBe(true);
  });

  it("surfaces a refusal from createTransaction, raw — a caller resolves it through useT()", () => {
    const controller = fakeController({
      createTransaction: () => ({
        fieldErrors: [{ path: "accountId", message: "needs a rate" }],
      }),
    });
    const { result } = renderHook(() => useCommandBar(controller, parse, CATEGORIES));

    act(() => result.current.setText("48.90 cash coffee"));
    act(() => result.current.submit());

    expect(result.current.fieldErrors).toEqual([{ path: "accountId", message: "needs a rate" }]);
    // The line stays — a refused save is not a cleared bar.
    expect(result.current.text).toBe("48.90 cash coffee");

    // A fresh keystroke retires the stale refusal.
    act(() => result.current.setText("48.90 cash coffee "));
    expect(result.current.fieldErrors).toBeUndefined();
  });

  it("discard (Esc) clears the line and any refusal", () => {
    const controller = fakeController({
      createTransaction: () => ({ fieldErrors: [{ path: "", message: "refused" }] }),
    });
    const { result } = renderHook(() => useCommandBar(controller, parse, CATEGORIES));

    act(() => result.current.setText("48.90 cash coffee"));
    act(() => result.current.submit());
    expect(result.current.fieldErrors).toBeDefined();

    act(() => result.current.discard());
    expect(result.current.text).toBe("");
    expect(result.current.fieldErrors).toBeUndefined();
    expect(result.current.parse).toBeNull();
  });
});
