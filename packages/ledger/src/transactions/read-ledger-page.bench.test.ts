/**
 * The text path's cost, at the ledger size this app is built for.
 *
 * **Not a threshold, a record.** A timing assertion on a laptop is a flake
 * generator; what this pins is the *shape* — that the scan's projection, not
 * the number of matches, is what a filtered page costs, and that a query
 * matching nothing costs about what a query matching plenty does. The numbers
 * are printed so a regression is visible in the run.
 */

import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { beforeAll, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import { readLedgerPage } from "./read-ledger-page.ts";

const { accounts, currencies, transactions } = ledgerSchema;
const PLN = currencyCode("PLN");
const ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");
const ROWS = 25_000;
const ANCHOR = accountingDate("2026-12-31");

let stores: ScratchStores;

beforeAll(() => {
  stores = scratchStores();
  const db = stores.ledger.replica.db;
  db.insert(currencies)
    .values({ code: PLN, name: "Polish Złoty", symbol: "zł", decimals: 2, isPivot: true })
    .run();
  db.insert(accounts)
    .values([{ id: ACCOUNT, name: "Bank A · PLN", currency: PLN, ownership: "own" }])
    .run();

  const values = [];
  for (let n = 0; n < ROWS; n++) {
    const day = String((n % 28) + 1).padStart(2, "0");
    const month = String((n % 12) + 1).padStart(2, "0");
    values.push({
      id: id<"transactions">(`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`),
      date: accountingDate(`2026-${month}-${day}`),
      type: "expense" as const,
      accountId: ACCOUNT,
      amountOriginal: money.toMoney("10"),
      currency: PLN,
      fxRate: money.pivotPerUnit("1"),
      // One row in 500 matches; the rest are noise the scan must still walk.
      payee: n % 500 === 0 ? "Market B" : `Shop ${n % 97}`,
      note: "",
    });
  }
  for (let at = 0; at < values.length; at += 500) {
    db.insert(transactions)
      .values(values.slice(at, at + 500))
      .run();
  }
});

function timed(text?: string): { ms: number; rows: number } {
  const at = performance.now();
  const page = readLedgerPage(stores.ledger.replica.db, {
    anchor: ANCHOR,
    direction: "older",
    ...(text === undefined ? {} : { filter: { text } }),
  });
  return { ms: performance.now() - at, rows: page.rows.length };
}

it("pages a filtered ledger at 25k rows without folding the whole window", () => {
  const plain = timed();
  const dense = timed("market");
  const empty = timed("zzzzz");

  // Printed rather than asserted: the machine decides the milliseconds, the
  // projection decides the shape.
  console.info(
    `25k rows — unfiltered ${plain.ms.toFixed(1)}ms · "market" ${dense.ms.toFixed(1)}ms (${dense.rows} rows) · no-match ${empty.ms.toFixed(1)}ms`,
  );

  expect(dense.rows, "the page is full").toBe(30);
  expect(empty.rows, "a query matching nothing pages nothing").toBe(0);
  // The one property worth a threshold: a filtered page must not cost the
  // whole ledger's display rows. Generous by 10× so this is a regression
  // detector rather than a stopwatch.
  expect(dense.ms, "a filtered page folds the page, not the window").toBeLessThan(1_000);
});
