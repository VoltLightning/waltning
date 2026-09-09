/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode, pivotPerUnit, toMoney } from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import type {
  PhoneLedgerController,
  PhoneSearchTransaction,
} from "../create-phone-ledger/create-phone-ledger.ts";
import { useLedgerList } from "./use-ledger-list.ts";

const PLN = currencyCode("PLN");
const ANCHOR = accountingDate("2026-09-08");

function row(date: string, n: number): PhoneSearchTransaction {
  return {
    id: id<"transactions">(`00000000-0000-4000-8000-0000000${String(n).padStart(5, "0")}`),
    date: accountingDate(date),
    type: "expense",
    payee: `Row ${n}`,
    note: "",
    categoryName: null,
    brandKey: null,
    accountId: id<"accounts">("00000000-0000-4000-8000-00000000000a"),
    accountName: "Bank A",
    toAccountId: null,
    toAccountName: null,
    amount: toMoney("-10"),
    currency: PLN,
    decimals: 2,
    fxRate: pivotPerUnit("1"),
    fxRateEstimated: false,
    toAmount: null,
    toFxRate: null,
    toCurrency: null,
    toDecimals: null,
    isBusiness: false,
    isCapital: false,
    counterpartyRole: null,
  };
}

/** A controller that answers with scripted pages and records every call. */
function fakeLedger(pages: Record<string, { rows: PhoneSearchTransaction[]; next?: object }[]>) {
  const calls: { direction: string; cursor: unknown }[] = [];
  const taken: Record<string, number> = { older: 0, newer: 0 };
  const readLedgerPage = vi.fn((options: { direction: string; cursor?: unknown }) => {
    calls.push({ direction: options.direction, cursor: options.cursor });
    const queue = pages[options.direction] ?? [];
    const page = queue[taken[options.direction] ?? 0];
    taken[options.direction] = (taken[options.direction] ?? 0) + 1;
    return { rows: page?.rows ?? [], nextCursor: page?.next };
  });
  return { calls, controller: { readLedgerPage } as unknown as PhoneLedgerController };
}

function draw(ledger: PhoneLedgerController, anchor = ANCHOR) {
  return renderHook(({ a }) => useLedgerList(ledger, { anchor: a }), {
    initialProps: { a: anchor },
  });
}

it("loads both halves on mount, so what is coming is already there", () => {
  // A reader who opens on today and pulls down expects the month ahead to be
  // present, not to arrive after a wait.
  const { calls, controller } = fakeLedger({
    older: [{ rows: [row("2026-09-08", 1)] }],
    newer: [{ rows: [row("2026-09-10", 2)] }],
  });
  draw(controller);
  expect(calls.map((c) => c.direction).sort()).toEqual(["newer", "older"]);
});

it("holds rows newest-first across the seam between the halves", () => {
  const { controller } = fakeLedger({
    older: [{ rows: [row("2026-09-08", 1), row("2026-09-05", 2)] }],
    newer: [{ rows: [row("2026-09-12", 3), row("2026-09-10", 4)] }],
  });
  const { result } = draw(controller);
  const dates = [...new Set(result.current.rows.map((r) => r.date))];
  expect(dates).toEqual(["2026-09-12", "2026-09-10", "2026-09-08", "2026-09-05"]);
});

it("appends an older page beneath what is already held", () => {
  const cursor = { date: accountingDate("2026-09-05"), id: id<"transactions">("x") };
  const { controller } = fakeLedger({
    older: [{ rows: [row("2026-09-08", 1)], next: cursor }, { rows: [row("2026-09-01", 2)] }],
    newer: [{ rows: [] }],
  });
  const { result } = draw(controller);
  expect(result.current.hasOlder).toBe(true);
  act(() => result.current.loadOlder());
  const dates = [...new Set(result.current.rows.map((r) => r.date))];
  expect(dates).toEqual(["2026-09-08", "2026-09-01"]);
});

it("stops asking once a direction is exhausted", () => {
  const { calls, controller } = fakeLedger({ older: [{ rows: [] }], newer: [{ rows: [] }] });
  const { result } = draw(controller);
  const before = calls.length;
  act(() => result.current.loadOlder());
  act(() => result.current.loadOlder());
  // No cursor came back, so there is nothing further to ask for — and asking
  // anyway is how an exhausted list turns into an infinite query loop.
  expect(calls.length).toBe(before);
  expect(result.current.hasOlder).toBe(false);
});

it("discards both halves when the anchor moves, which is what makes a jump cheap", () => {
  const { controller } = fakeLedger({
    older: [{ rows: [row("2026-09-08", 1)] }, { rows: [row("2024-03-04", 2)] }],
    newer: [{ rows: [] }, { rows: [] }],
  });
  const { result, rerender } = draw(controller);
  rerender({ a: accountingDate("2024-03-04") });
  const dates = [...new Set(result.current.rows.map((r) => r.date))];
  // Nothing from September survives: the list never holds a span it did not
  // load, so it is never asked to guess a scroll position across one.
  expect(dates).toEqual(["2024-03-04"]);
});

it("reads once when the same page is asked for twice in a tick", () => {
  // Both ends of a fling can ask in the same tick, and both would see the same
  // not-yet-rendered state. A read inside a setState updater compounds it:
  // React calls an updater whenever it likes, and these rows are a synchronous
  // SQLite read, so the duplication is silent and permanent.
  const { calls, controller } = fakeLedger({
    older: [
      {
        rows: [row("2026-09-08", 1)],
        next: { date: accountingDate("2026-09-01"), id: id<"transactions">("y") },
      },
    ],
    newer: [{ rows: [] }],
  });
  const { result } = draw(controller);
  const before = calls.filter((c) => c.direction === "older").length;
  act(() => {
    result.current.loadOlder();
    result.current.loadOlder();
  });
  expect(calls.filter((c) => c.direction === "older").length).toBe(before + 1);
});
