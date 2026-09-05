/**
 * Journey fixture, not journey intent.
 *
 * A journey exercises the executors — `harness.ts`'s whole point — so the
 * rows a journey needs *before* the behaviour under test can write straight
 * into the replica through drizzle, the way `executors.test.ts`'s own `seed()`
 * does. None of this goes through `LocalLedgerSession`: a seeded currency or
 * account is scenery, and routing scenery through the write path it exists to
 * test would make the fixture as slow, and as failure-prone, as the thing it
 * sets up.
 *
 * **`FxSource`, unrestricted.** `@waltning/schema/enums` lists
 * `nbp | ecb | nbrb | nbg | manual | carried_forward | derived` for
 * `fx_rates.source` (R1 added `derived`), so `seedRate`'s own `source`
 * parameter takes the type as-is rather than a narrower literal — SQLite has
 * no CHECK to catch a wider one anyway, so the type is what keeps a caller
 * from writing a source no reader could ever have produced.
 */

import { fold } from "@waltning/core/capture/names";
import { accountingDate } from "@waltning/core/date";
import { id as brandId } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import type { AccountKind, FxSource } from "@waltning/schema/enums";
import { ledgerSchema } from "../schema-map.ts";
import type { Journey } from "./harness.ts";

export const PIVOT = currencyCode("PLN");

export function seedCurrency(
  j: Journey,
  code: string,
  opts?: { isPivot?: boolean; decimals?: number },
): void {
  j.raw()
    .replica.db.insert(ledgerSchema.currencies)
    .values({
      code: currencyCode(code),
      name: "Placeholder",
      isPivot: opts?.isPivot ?? false,
      decimals: opts?.decimals ?? 2,
    })
    .run();
}

export function seedAccount(
  j: Journey,
  id: string,
  name: string,
  currency: string,
  opts?: { openingBalance?: string; kind?: string },
): void {
  j.raw()
    .replica.db.insert(ledgerSchema.accounts)
    .values({
      id: brandId<"accounts">(id),
      name,
      currency: currencyCode(currency),
      ...(opts?.kind !== undefined ? { kind: opts.kind as AccountKind } : {}),
      ...(opts?.openingBalance !== undefined
        ? { openingBalance: money.toMoney(opts.openingBalance) }
        : {}),
    })
    .run();
}

export function seedRate(
  j: Journey,
  base: string,
  quote: string,
  date: string,
  rate: string,
  source: FxSource = "manual",
): void {
  j.raw()
    .replica.db.insert(ledgerSchema.fxRates)
    .values({
      base: currencyCode(base),
      quote: currencyCode(quote),
      date: accountingDate(date),
      rate: money.unitsPerPivot(rate),
      source,
    })
    .run();
}

export function seedCounterparty(j: Journey, id: string, name: string): void {
  // `nameFolded` is written here, not left at its `''` default — a raw insert
  // that skips it is a row `counterparties_name_uq` cannot see collide (R2
  // H1). `fold()`, not the index's own SQL, because this bypasses
  // `create_counterparty` on purpose (see the module doc) and must still
  // produce the value that executor would have written.
  j.raw()
    .replica.db.insert(ledgerSchema.counterparties)
    .values({ id: brandId<"counterparties">(id), name, nameFolded: fold(name.trim()) })
    .run();
}

export const ID = {
  accountPln: brandId<"accounts">("11111111-1111-4111-8111-111111111111"),
  accountUsd: brandId<"accounts">("22222222-2222-4222-8222-222222222222"),
  accountEur: brandId<"accounts">("33333333-3333-4333-8333-333333333333"),
  cpA: brandId<"counterparties">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
  cpB: brandId<"counterparties">("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
  txn1: brandId<"transactions">("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
  txn2: brandId<"transactions">("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
} as const;
