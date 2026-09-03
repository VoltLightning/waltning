/**
 * `computations.md` §1's `signed(t, 'from')`, in SQL, **once**.
 *
 * It was written twice — `accounts.service.ts` and `transactions.service.ts`
 * each carried the same CASE — which is exactly the drift surface §0a warns
 * about, and the third copy is `money.signed()` on the phone. The
 * differential test holds this one equal to that one; nothing holds two SQL
 * copies equal to each other.
 */

import type { Money } from "@waltning/core/money";
import { type SQL, sql } from "drizzle-orm";
import { transactions } from "../schema.ts";

export const signedFromLeg: SQL<Money> = sql<Money>`
  CASE ${transactions.type}
    WHEN 'expense'  THEN -${transactions.amountOriginal}
    WHEN 'transfer' THEN -${transactions.amountOriginal}
    ELSE                   ${transactions.amountOriginal}
  END`;
