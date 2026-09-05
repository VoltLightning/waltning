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

const context: CaptureContext = {
  accounts: [CASH],
  categories: [FOOD],
  defaultAccountId: null,
  today: TODAY,
  locale: "en",
};

function parse(text: string) {
  return parseCapture(text, context);
}

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
    const { result } = renderHook(() => useCommandBar(controller, parse));

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

  it("a line with no amount never reaches createTransaction — D1's own refusal is the whole answer", () => {
    const controller = fakeController();
    const { result } = renderHook(() => useCommandBar(controller, parse));

    act(() => result.current.setText("coffee"));
    expect(result.current.parse).toMatchObject({ ok: false, reason: "no_amount" });

    act(() => result.current.submit());

    expect(controller.createTransaction).not.toHaveBeenCalled();
    // Nothing to discard, but nothing crashes either — Enter on an
    // unresolved line is inert, matching S05 §3's "no model path".
    expect(result.current.text).toBe("coffee");
  });

  it("an empty bar has nothing to say — parse is null before the first keystroke", () => {
    const controller = fakeController();
    const { result } = renderHook(() => useCommandBar(controller, parse));
    expect(result.current.parse).toBeNull();
  });

  it("D2 auto-fills the category at or above the display threshold", () => {
    const controller = fakeController();
    controller.listPayeeHistory.mockReturnValue([
      { payee: "coffee", categoryId: "cat-food", date: accountingDate("2026-08-01") },
    ]);
    const { result } = renderHook(() => useCommandBar(controller, parse));

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

  it("surfaces a refusal from createTransaction, raw — a caller resolves it through useT()", () => {
    const controller = fakeController({
      createTransaction: () => ({
        fieldErrors: [{ path: "accountId", message: "needs a rate" }],
      }),
    });
    const { result } = renderHook(() => useCommandBar(controller, parse));

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
    const { result } = renderHook(() => useCommandBar(controller, parse));

    act(() => result.current.setText("48.90 cash coffee"));
    act(() => result.current.submit());
    expect(result.current.fieldErrors).toBeDefined();

    act(() => result.current.discard());
    expect(result.current.text).toBe("");
    expect(result.current.fieldErrors).toBeUndefined();
    expect(result.current.parse).toBeNull();
  });
});
