import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import { LEDGER_PAGE_SIZE, readLedgerPage } from "./read-ledger-page.ts";
import type { TransactionSearchCursor } from "./search-transactions.ts";

const { accounts, currencies, transactions } = ledgerSchema;

const PLN = currencyCode("PLN");
const OWN = id<"accounts">("00000000-0000-4000-8000-00000000000a");
const OTHER = id<"accounts">("00000000-0000-4000-8000-00000000000b");

let stores: ScratchStores;

/** `nn` is both the id suffix and the ordering tiebreak, so a day's rows have a total order. */
function insert(date: string, nn: number, accountId = OWN, payee?: string) {
  stores.ledger.replica.db
    .insert(transactions)
    .values({
      id: id<"transactions">(`00000000-0000-4000-8000-0000000${String(nn).padStart(5, "0")}`),
      date: accountingDate(date),
      type: "expense" as const,
      accountId,
      categoryId: null,
      amountOriginal: money.toMoney("10"),
      currency: PLN,
      fxRate: money.pivotPerUnit("1"),
      payee: payee ?? `Row ${nn}`,
      note: "",
      isBusiness: false,
      isCapital: false,
      toAccountId: null,
      toAmount: null,
      toCurrency: null,
      counterpartyId: null,
      counterpartyRole: null,
      brandKey: null,
      deletedAt: null,
    })
    .run();
}

const dates = (page: { rows: readonly { date: string }[] }) => page.rows.map((r) => r.date);
const payees = (page: { rows: readonly { payee: string }[] }) => page.rows.map((r) => r.payee);

beforeEach(() => {
  stores = scratchStores();
  stores.ledger.replica.db
    .insert(currencies)
    .values({ code: PLN, decimals: 2, name: "Zloty", isPivot: true })
    .run();
  stores.ledger.replica.db
    .insert(accounts)
    .values([
      { id: OWN, name: "Bank A · PLN", currency: PLN, ownership: "own" },
      { id: OTHER, name: "Bank B · PLN", currency: PLN, ownership: "own" },
    ])
    .run();
});

describe("readLedgerPage", () => {
  it("walks older from the anchor, newest first, and includes the anchor day", () => {
    insert("2026-08-10", 1);
    insert("2026-08-12", 2);
    insert("2026-08-14", 3);
    insert("2026-08-16", 4);

    const page = readLedgerPage(stores.ledger.replica.db, {
      anchor: accountingDate("2026-08-14"),
      direction: "older",
    });

    // The anchor day is drawn by the older half — the newer half must not repeat it.
    expect(dates(page)).toEqual(["2026-08-14", "2026-08-12", "2026-08-10"]);
    expect(page.nextCursor).toBeUndefined();
  });

  it("walks newer from the anchor, still newest first, and excludes the anchor day", () => {
    insert("2026-08-10", 1);
    insert("2026-08-12", 2);
    insert("2026-08-14", 3);
    insert("2026-08-16", 4);
    insert("2026-08-18", 5);

    const page = readLedgerPage(stores.ledger.replica.db, {
      anchor: accountingDate("2026-08-14"),
      direction: "newer",
    });

    // Read ascending so the cursor can walk forward; handed back descending
    // so a caller prepending rows never has to reverse at the seam.
    expect(dates(page)).toEqual(["2026-08-18", "2026-08-16"]);
  });

  it("draws every row exactly once across the two directions", () => {
    for (let n = 1; n <= 9; n++) insert(`2026-08-${String(n + 9)}`, n);

    const anchor = accountingDate("2026-08-14");
    const older = readLedgerPage(stores.ledger.replica.db, { anchor, direction: "older" });
    const newer = readLedgerPage(stores.ledger.replica.db, { anchor, direction: "newer" });

    const all = [...payees(newer), ...payees(older)];
    expect(new Set(all).size).toBe(9);
    expect(all).toEqual([...all].sort((a, b) => b.localeCompare(a, "en", { numeric: true })));
  });

  it("does not lose a row at the page boundary when a day holds more than one page", () => {
    // One day, deliberately wider than a page: the `(date, id)` keyset is the
    // only thing that can page through it, because the date half never changes.
    const rows = LEDGER_PAGE_SIZE + 7;
    for (let n = 1; n <= rows; n++) insert("2026-08-14", n);

    const anchor = accountingDate("2026-08-14");
    const seen: string[] = [];
    let cursor: TransactionSearchCursor | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const page = readLedgerPage(stores.ledger.replica.db, {
        anchor,
        direction: "older",
        ...(cursor === undefined ? {} : { cursor }),
      });
      seen.push(...payees(page));
      cursor = page.nextCursor;
      if (cursor === undefined) break;
    }

    expect(seen.length).toBe(rows);
    expect(new Set(seen).size).toBe(rows);
  });

  it("reports no cursor once a direction is exhausted", () => {
    insert("2026-08-14", 1);
    const page = readLedgerPage(stores.ledger.replica.db, {
      anchor: accountingDate("2026-08-14"),
      direction: "newer",
    });
    expect(page.rows).toEqual([]);
    expect(page.nextCursor).toBeUndefined();
  });

  it("applies a structural filter, so a filtered scroll is the same rows a filtered search finds", () => {
    insert("2026-08-12", 1, OWN);
    insert("2026-08-13", 2, OTHER);
    insert("2026-08-14", 3, OWN);

    const page = readLedgerPage(stores.ledger.replica.db, {
      anchor: accountingDate("2026-08-14"),
      direction: "older",
      filter: { accountIds: [OWN] },
    });

    expect(dates(page)).toEqual(["2026-08-14", "2026-08-12"]);
  });

  it("never returns a deleted row", () => {
    insert("2026-08-12", 1);
    insert("2026-08-14", 2);
    stores.ledger.replica.db
      .update(transactions)
      .set({ deletedAt: new Date("2026-08-15T00:00:00.000Z") })
      .where(eq(transactions.id, id<"transactions">("00000000-0000-4000-8000-000000000002")))
      .run();

    const page = readLedgerPage(stores.ledger.replica.db, {
      anchor: accountingDate("2026-08-14"),
      direction: "older",
    });
    expect(dates(page)).toEqual(["2026-08-12"]);
  });

  /**
   * **S04 §7's search, and the seam it fell through.** The option type allowed
   * `text` at the hook and at the controller and stopped here, where it was
   * `Omit<…, "text">` — a filter built in a variable is not excess-property
   * checked, so it compiled, forwarded nothing, and the list drew the whole
   * ledger under a field reporting three matches.
   */
  it("narrows the page to the rows a text filter matches", () => {
    insert("2026-08-10", 1, OWN, "Market B");
    insert("2026-08-12", 2, OWN, "Shop A");
    insert("2026-08-14", 3, OWN, "Market B");

    const page = readLedgerPage(stores.ledger.replica.db, {
      anchor: accountingDate("2026-08-14"),
      direction: "older",
      filter: { text: "market" },
    });
    expect(dates(page)).toEqual(["2026-08-14", "2026-08-10"]);
  });

  /**
   * **The limit applies to matches, not to candidates.** A `LIMIT` pushed into
   * SQL ahead of a filter SQL cannot decide returns a page of rows the reader
   * never asked to see — and, worse, an absent cursor, which says the ledger
   * ended there.
   */
  it("pages matches rather than candidates, and knows there are more", () => {
    insert("2026-08-10", 1, OWN, "Market B");
    for (let n = 2; n <= 9; n++) insert(`2026-08-1${n}`, n, OWN, "Shop A");
    insert("2026-08-20", 10, OWN, "Market B");

    const page = readLedgerPage(stores.ledger.replica.db, {
      anchor: accountingDate("2026-08-20"),
      direction: "older",
      filter: { text: "market" },
      limit: 1,
    });
    expect(dates(page)).toEqual(["2026-08-20"]);
    expect(page.nextCursor, "a second match is still to come").toBeDefined();
  });

  it("says the filtered ledger ended when it has", () => {
    insert("2026-08-10", 1, OWN, "Market B");
    insert("2026-08-12", 2, OWN, "Shop A");

    const page = readLedgerPage(stores.ledger.replica.db, {
      anchor: accountingDate("2026-08-14"),
      direction: "older",
      filter: { text: "market" },
      limit: 5,
    });
    expect(dates(page)).toEqual(["2026-08-10"]);
    expect(page.nextCursor).toBeUndefined();
  });
});
