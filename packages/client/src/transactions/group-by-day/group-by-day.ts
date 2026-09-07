/**
 * S10 §3: "Rows group by date" — `Today` / `Yesterday` / a bare date.
 *
 * **The screen builds sections, not `TransactionList`.** Two reasons, not
 * one: the header text needs the device's own `today` (`deviceRuntime()`,
 * a platform read) and `useT()` (a hook), neither of which a `packages/ui`
 * component may reach for on its own; and `TransactionList` is a plain,
 * un-virtualised column (`View`, not `FlatList`) — S10's list needs real
 * virtualisation over pages that grow by `loadMore`, which is exactly the
 * `FlatList` the plan names and exactly the platform composition
 * `architecture/11` reserves for a screen. So this is the one pure,
 * testable piece: given rows already sorted newest-first and the two labels
 * a screen resolved through `useT()`, group them into contiguous day
 * sections. The screen flattens that into `FlatList`'s one array and draws
 * the header row itself.
 *
 * **Generic over the row, not `PhoneSearchTransaction`.** This lives in
 * `transactions/`, a module `tests/module-boundaries.test.ts` keeps apart
 * from `ledger/` (`create-phone-ledger.ts`'s own home) — grouping only ever
 * touches a row's `date`, so the type parameter is the whole fix rather than
 * an import across that seam.
 */

import type { AccountingDate } from "@waltning/core/date";

export type DatedRow = { date: AccountingDate };

export type TransactionSection<Row extends DatedRow> = {
  label: string;
  rows: readonly Row[];
};

export type DayLabels = {
  today: AccountingDate;
  yesterday: AccountingDate;
  todayLabel: string;
  yesterdayLabel: string;
};

/**
 * Rows must already be sorted newest-first (the search page's own order) —
 * this groups *contiguous* same-date runs rather than re-sorting, so a
 * caller handing it out-of-order rows gets out-of-order sections instead of
 * a silent re-sort masking the bug.
 */
export function groupByDay<Row extends DatedRow>(
  rows: readonly Row[],
  labels: DayLabels,
): readonly TransactionSection<Row>[] {
  const sections: { label: string; rows: Row[] }[] = [];

  for (const row of rows) {
    const label =
      row.date === labels.today
        ? labels.todayLabel
        : row.date === labels.yesterday
          ? labels.yesterdayLabel
          : row.date;
    const current = sections.at(-1);
    if (current !== undefined && current.label === label) {
      current.rows.push(row);
    } else {
      sections.push({ label, rows: [row] });
    }
  }

  return sections;
}
