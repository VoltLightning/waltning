/**
 * `create_transaction` at `opVersion` 1 → 2, for an entry captured before the
 * debt categories were debts (`SPEC.md` §6.6).
 *
 * **Why it exists.** An outbox entry that was never applied — deferred for want
 * of a rate, or above `applied_seq` after a crash — is replayed on the next
 * launch. If it was captured by the build before this rule, a *Borrowed* with a
 * person and no obligation, or a repayment, would be refused by the executor
 * forever and the capture lost. The migration converts the rows already in the
 * replica; this converts the intent still waiting to become one, **by the same
 * rule**, so a capture is never dropped for having been taken a day too early.
 *
 * - *Borrowed*, *Lent out* naming a person → the debt pair on that person.
 * - *Borrowed*, *Lent out* naming nobody (or a company) → the row, as a plain
 *   uncategorised one: a person-less debt category cannot exist on either
 *   engine, and the capture is kept rather than refused. Not counted as a debt.
 * - A repayment naming a person with an open debt in the matching direction and
 *   the row's own currency → `settle_debt` (the same row id), which is the only
 *   writer of a repayment. A different currency has no rate to convert at
 *   during replay, so it is kept plain, like the next case.
 * - A repayment otherwise → the row, plain and uncategorised, with no
 *   obligation: never a reverse debt.
 *
 * Deterministic and read-only: it reads the replica as it stands at replay and
 * writes nothing.
 */

import * as money from "@waltning/core/money";
import {
  type CreateTransactionInput,
  createTransactionInput,
  settleDebtInput,
} from "@waltning/core/registry/inputs";
import { DEBT_SEED_EXTERNAL_IDS, REPAYMENT_SEED_EXTERNAL_IDS } from "@waltning/core/taxonomy";
import { eq } from "drizzle-orm";
import { balancesForCounterparty } from "../counterparties/read-counterparty-balances.ts";
import { type ReplicaTx, ledgerSchema as schema } from "../schema-map.ts";

const { categories, counterparties, currencies } = schema;

export type Upcast = { operation?: string; payload: unknown };

export function upcastCreateTransaction(raw: unknown, fromVersion: number, tx: ReplicaTx): Upcast {
  if (fromVersion >= 2) return { payload: raw };
  const parsed = createTransactionInput.safeParse(raw);
  // A payload that does not parse is the executor's refusal to make, as before.
  if (!parsed.success) return { payload: raw };
  const input = parsed.data;
  if (input.categoryId === undefined || input.categoryId === null) return { payload: raw };

  const category = tx
    .select({ externalId: categories.externalId })
    .from(categories)
    .where(eq(categories.id, input.categoryId))
    .get();
  const externalId = category?.externalId ?? null;
  if (externalId === null || !DEBT_SEED_EXTERNAL_IDS.includes(externalId)) return { payload: raw };

  const person = input.obligationCounterpartyId ?? input.counterpartyId ?? null;
  const isPerson =
    person !== null &&
    tx
      .select({ kind: counterparties.kind })
      .from(counterparties)
      .where(eq(counterparties.id, person))
      .get()?.kind === "person";

  if (!REPAYMENT_SEED_EXTERNAL_IDS.includes(externalId)) {
    if (input.obligationRole === "debt" && input.obligationCounterpartyId) return { payload: raw };
    if (isPerson && person !== null) {
      return {
        payload: {
          ...input,
          counterpartyId: person,
          obligationCounterpartyId: person,
          obligationRole: "debt",
        },
      };
    }
    return { payload: plain(input) };
  }

  if (isPerson && person !== null) {
    const wantPositive = externalId === "seed:repayment-received";
    const decimals =
      tx
        .select({ decimals: currencies.decimals })
        .from(currencies)
        .where(eq(currencies.code, input.currency))
        .get()?.decimals ?? 2;
    const open = balancesForCounterparty(tx, person).find((row) => {
      if (row.currency !== input.currency) return false;
      const sign = money.cmp(money.round(row.balance, decimals), money.ZERO);
      return wantPositive ? sign > 0 : sign < 0;
    });
    if (open !== undefined && (input.type === "income" || input.type === "expense")) {
      const settle = settleDebtInput.safeParse({
        id: input.id,
        counterpartyId: person,
        accountId: input.accountId,
        date: input.date,
        amount: input.amountOriginal,
        currency: input.currency,
        type: wantPositive ? "income" : "expense",
        discharges: { currency: input.currency, amount: input.amountOriginal },
        note: input.note,
        categoryId: input.categoryId,
      });
      if (settle.success) return { operation: "settle_debt", payload: settle.data };
    }
  }
  return { payload: plain(input) };
}

/** The capture kept as an ordinary row: no category, no obligation; who it was with stays. */
function plain(input: CreateTransactionInput): unknown {
  const {
    categoryId: _category,
    obligationCounterpartyId: _o,
    obligationRole: _r,
    ...rest
  } = input;
  return rest;
}
