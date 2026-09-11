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

/** `today` defaults to the anchor, which is the cold open S04 §6 describes. */
function draw(ledger: PhoneLedgerController, anchor = ANCHOR, revision = 0) {
  return renderHook(({ a, r }) => useLedgerList(ledger, { anchor: a, revision: r }), {
    initialProps: { a: anchor, r: revision },
  });
}

it("loads both halves on a cold open, so what is coming is already there", () => {
  // A reader who opens on today and pulls down expects the month ahead to be
  // present, not to arrive after a wait. Newer-than-today is the forward
  // horizon — a handful of expected rows — which is why it is cheap here.
  const { calls, controller } = fakeLedger({
    older: [{ rows: [row("2026-09-08", 1)] }],
    newer: [{ rows: [row("2026-09-10", 2)] }],
  });
  draw(controller);
  expect(calls.map((c) => c.direction).sort()).toEqual(["newer", "older"]);
});

/**
 * S04 §6: a jump *"loads that date's neighbourhood"* — in both directions.
 *
 * Fetching the older half alone was tried, to keep a jump's page from opening
 * on rows from months later; what it produced was a jump to a quiet day
 * reading *nothing on or before* over a ledger with rows three days newer. The
 * first newer page is the rows nearest the anchor, ascending from it, and the
 * page opens on the anchor rather than at the top.
 */
it("loads the neighbourhood both ways on a jump", () => {
  const { calls, controller } = fakeLedger({
    older: [{ rows: [] }],
    newer: [{ rows: [row("2026-05-28", 2)] }],
  });
  const { result } = draw(controller, accountingDate("2026-05-25"));
  expect(calls.map((c) => c.direction).sort()).toEqual(["newer", "older"]);
  expect(result.current.rows.map((r) => r.date)).toEqual(["2026-05-28"]);
});

it("walks newer out of a jump when the reader asks", () => {
  const { controller } = fakeLedger({
    older: [{ rows: [row("2026-05-25", 1)] }],
    newer: [{ rows: [row("2026-05-27", 2)] }],
  });
  const { result } = draw(controller, accountingDate("2026-05-25"));
  act(() => result.current.loadNewer());
  expect(result.current.rows.map((r) => r.date)).toEqual(["2026-05-27", "2026-05-25"]);
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
  rerender({ a: accountingDate("2024-03-04"), r: 0 });
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

/**
 * **The List did not know a transaction had been added.** Every other page on
 * Today reads through the snapshot and recomputes on a write; this hook pages
 * through its own cursors and was handed nothing that changed. A capture on
 * S05 returned the reader to a List still showing the ledger from before it.
 */
it("re-reads what it holds around the same anchor when the ledger's revision advances", () => {
  const ledger = fakeLedger({
    older: [
      { rows: [row("2026-09-10", 1)] },
      { rows: [row("2026-09-11", 9), row("2026-09-10", 1)] },
    ],
    newer: [{ rows: [] }, { rows: [] }],
  });
  const hook = draw(ledger.controller, ANCHOR, 3);
  expect(hook.result.current.rows.map((r) => r.id)).toEqual([row("2026-09-10", 1).id]);

  act(() => hook.rerender({ a: ANCHOR, r: 4 }));
  expect(ledger.calls.filter((c) => c.direction === "older")).toHaveLength(2);
  expect(hook.result.current.rows.map((r) => r.id)).toEqual([
    row("2026-09-11", 9).id,
    row("2026-09-10", 1).id,
  ]);
});

/**
 * **In place, not from scratch.** `revision` advances on reads that write
 * nothing too, and a reader three pages back must not be thrown to the
 * anchor for it: every page held is walked again, cursor by cursor, and the
 * list is as long afterwards as it was before.
 */
it("walks every page it held again, rather than dropping back to the first", () => {
  const first = { rows: [row("2026-09-10", 1)], next: { date: "2026-09-10", id: "1" } };
  const second = { rows: [row("2026-09-01", 2)] };
  const ledger = fakeLedger({
    older: [
      first,
      second,
      { ...first, rows: [row("2026-09-11", 9), row("2026-09-10", 1)] },
      second,
    ],
    newer: [{ rows: [] }, { rows: [] }],
  });
  const hook = draw(ledger.controller, ANCHOR, 3);
  act(() => hook.result.current.loadOlder());
  expect(hook.result.current.rows).toHaveLength(2);

  act(() => hook.rerender({ a: ANCHOR, r: 4 }));
  expect(ledger.calls.filter((c) => c.direction === "older")).toHaveLength(4);
  expect(hook.result.current.rows.map((r) => r.id)).toEqual([
    row("2026-09-11", 9).id,
    row("2026-09-10", 1).id,
    row("2026-09-01", 2).id,
  ]);
  expect(hook.result.current.hasOlder, "the end it had found is still the end").toBe(false);
});
