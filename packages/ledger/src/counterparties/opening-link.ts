/**
 * Which opening debt, if any, a repayment pays down (§6.6) — the one rule
 * `settle_debt` and `update_transaction` share, so that what is linked when a
 * settlement is written and what is linked when it is edited cannot differ.
 *
 * **A repayment is linked only to what is still open on the opening debt, and
 * only when it reduces the opening debt's own direction.**
 *
 * - *Still open.* The opening debt is the **oldest** debt a person has — it
 *   predates the ledger — so FIFO (§7, the order ageing uses) consumes it
 *   first. What the linked repayments so far have discharged is subtracted
 *   from its figure, and a repayment is linked up to what remains. Past that
 *   it is an ordinary repayment of an ordinary debt: deleting the opening debt
 *   must never delete a real one.
 * - *Own direction.* `theyOwe` is paid down by money coming in (`income`),
 *   `youOwe` by money going out (`expense`). A repayment the other way is
 *   paying down some other debt, even though it shares a person and a
 *   currency.
 *
 * Returns `null` when there is no live opening debt in the currency, the
 * repayment points the wrong way, or nothing is left open.
 */

import * as money from "@waltning/core/money";
import { and, eq, gt, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { type ReplicaTx, ledgerSchema as schema } from "../schema-map.ts";

const { currencies, openingDebts, transactions } = schema;

export type OpeningLink = {
  id: typeof openingDebts.$inferSelect.id;
  /** When the opening debt was first written — it keeps this across re-records. */
  createdAt: Date;
  /** What is still open on the opening debt, in its own currency. */
  open: money.Money;
};

export function openingLinkFor(
  tx: ReplicaTx,
  query: {
    counterpartyId: typeof openingDebts.$inferSelect.counterpartyId;
    currency: typeof openingDebts.$inferSelect.currency;
    /** The settlement's own type: `income` pays down `theyOwe`, `expense` pays down `youOwe`. */
    type: "income" | "expense";
    /** A row to leave out of what has been repaid — the one being re-derived. */
    excluding?: typeof transactions.$inferSelect.id;
  },
): OpeningLink | null {
  const [debt] = tx
    .select()
    .from(openingDebts)
    .where(
      and(
        eq(openingDebts.counterpartyId, query.counterpartyId),
        eq(openingDebts.currency, query.currency),
        isNull(openingDebts.deletedAt),
      ),
    )
    .all();
  if (!debt) return null;
  if ((debt.direction === "theyOwe") !== (query.type === "income")) return null;

  const repaid = tx
    .select({ amount: transactions.debtAmount, own: transactions.amountOriginal })
    .from(transactions)
    .where(
      and(
        eq(transactions.settlesOpeningDebtId, debt.id),
        isNull(transactions.deletedAt),
        query.excluding === undefined ? undefined : ne(transactions.id, query.excluding),
      ),
    )
    .all()
    .reduce((sum, row) => money.add(sum, row.amount ?? row.own), money.ZERO);

  const open = money.sub(debt.amount, repaid);
  return money.cmp(open, money.ZERO) > 0 ? { id: debt.id, open, createdAt: debt.createdAt } : null;
}

/** One row of a settlement: what changed hands, what it discharged, and the debt it pays down. */
export type SplitPart = {
  amount: money.Money;
  discharge: money.Money;
  link: OpeningLink["id"] | null;
};

/**
 * How one payment is written against an existing debt (§6.6): whole and linked
 * when it fits in what is open, whole and ordinary when nothing is open, and
 * **two rows** when it crosses the end — the linked part first, the ordinary
 * rest second. The same plan serves `settle_debt` and an import replacing a
 * payment, so the two cannot disagree about where the boundary falls.
 *
 * The two amounts are the same proportion of what changed hands as of what was
 * discharged, in the account currency's own decimals, the remainder landing on
 * the second row so the account moves by exactly what was paid. **Dust:** where
 * one side rounds to nothing it takes one smallest unit instead, so no
 * zero-amount row is written and the linked discharge stays capped at exactly
 * what is open — and that unit is not a rate, only the smallest figure the row
 * can hold. A payment of a single smallest unit cannot be two rows: it stays
 * whole and **unlinked**.
 */
export function planOpeningSplit(
  tx: ReplicaTx,
  query: {
    link: OpeningLink | null;
    amount: money.Money;
    accountCurrency: typeof transactions.$inferSelect.currency;
    discharge: money.Money;
    /** The debt currency's decimals — what `open` is rounded to. */
    dischargeDecimals: number;
  },
): readonly SplitPart[] {
  const whole: SplitPart = { amount: query.amount, discharge: query.discharge, link: null };
  const { link } = query;
  if (link === null) return [whole];
  const linkedDischarge = money.toMoney(money.round(link.open, query.dischargeDecimals));
  if (money.cmp(linkedDischarge, money.ZERO) <= 0) return [whole];
  if (money.cmp(query.discharge, linkedDischarge) <= 0) return [{ ...whole, link: link.id }];

  const [accountCurrency] = tx
    .select({ decimals: currencies.decimals })
    .from(currencies)
    .where(eq(currencies.code, query.accountCurrency))
    .all();
  const accountDecimals = accountCurrency?.decimals ?? 2;
  const total = money.dec(query.amount);
  const unit = money.dec(1).dividedBy(money.dec(10).pow(accountDecimals));
  let linkedAmount = money.dec(
    money.round(
      money.toMoney(total.times(money.dec(linkedDischarge)).dividedBy(money.dec(query.discharge))),
      accountDecimals,
    ),
  );
  if (linkedAmount.lte(0)) linkedAmount = unit;
  if (total.minus(linkedAmount).lte(0)) linkedAmount = total.minus(unit);
  if (linkedAmount.lte(0) || total.minus(linkedAmount).lte(0)) return [whole];
  return [
    { amount: money.toMoney(linkedAmount), discharge: linkedDischarge, link: link.id },
    {
      amount: money.toMoney(total.minus(linkedAmount)),
      discharge: money.toMoney(money.sub(query.discharge, linkedDischarge)),
      link: null,
    },
  ];
}

/** What a re-plan did to one repayment: the link it had, and the one it has now. */
export type LinkChange = { id: string; was: string | null; now: string | null };

/**
 * **Re-plans the repayments of an existing debt against `target`** (§6.6) —
 * what must happen whenever the opening debt itself changes under them: two
 * people's debts are combined by a merge, or a debt is recorded again (a
 * smaller figure, a larger one, the other way round). The links are not copied,
 * they are re-decided by the rule a new settlement meets, **over every
 * candidate, linked or not**: the rows linked to any of `fromIds`, and every
 * live settlement (a debt-role row stamped with the discharge it made) of the
 * target's person and currency that reduces its direction. Oldest first, a
 * repayment is linked whole if it fits in what is open; whatever does not fit
 * is unlinked, and a repayment that would cross the end stays whole rather than
 * being split (a re-plan never writes new rows). So raising a debt links the
 * repayments that now fit, and lowering it unlinks those past its end.
 * `target: null` unlinks them all — the debt is gone.
 *
 * **A repayment can be drawn in only if it was written after the existing debt
 * was** (`since`, by default the target's own `created_at`, which survives
 * re-records). A repayment already linked stays a candidate whenever it was
 * linked; one that is not is a candidate only from after that moment. Without
 * this the same data would give different period figures depending on history —
 * record 50 and later 60, or 60 directly — and recording a debt would reach
 * back into months it had no part in, and let deleting it remove cash recorded
 * before the debt was known. `created_at` is the write order the two rows
 * share: it is stored on both, set once at the first write, and the outbox
 * sequence (the other candidate) is on neither row, nor visible to an executor.
 *
 * Returns every row whose link changed, with the link it had, so a merge can
 * record them and unmerge can put them back.
 */
export function replanOpeningLinks(
  tx: ReplicaTx,
  fromIds: readonly OpeningLink["id"][],
  target: OpeningLink["id"] | null,
  since?: Date,
): readonly LinkChange[] {
  const debt =
    target === null
      ? undefined
      : tx.select().from(openingDebts).where(eq(openingDebts.id, target)).get();

  const linked = tx
    .select()
    .from(transactions)
    .where(
      and(inArray(transactions.settlesOpeningDebtId, [...fromIds]), isNull(transactions.deletedAt)),
    )
    .all();
  const scoped =
    debt === undefined
      ? []
      : tx
          .select()
          .from(transactions)
          .where(
            and(
              isNull(transactions.deletedAt),
              eq(transactions.obligationRole, "debt"),
              eq(transactions.obligationCounterpartyId, debt.counterpartyId),
              eq(transactions.debtCurrency, debt.currency),
              eq(transactions.type, debt.direction === "theyOwe" ? "income" : "expense"),
              isNotNull(transactions.debtAmount),
              gt(transactions.createdAt, since ?? debt.createdAt),
            ),
          )
          .all();
  const byId = new Map([...linked, ...scoped].map((row) => [row.id, row] as const));
  const rows = [...byId.values()].sort(
    // Oldest first; among rows of one day, those already linked keep their place.
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(b.settlesOpeningDebtId !== null) - Number(a.settlesOpeningDebtId !== null) ||
      a.id.localeCompare(b.id),
  );
  if (rows.length === 0) return [];

  tx.update(transactions)
    .set({ settlesOpeningDebtId: null })
    .where(
      inArray(
        transactions.id,
        rows.map((row) => row.id),
      ),
    )
    .run();

  const changes: LinkChange[] = [];
  for (const row of rows) {
    let now: string | null = null;
    if (
      target !== null &&
      row.obligationRole === "debt" &&
      row.obligationCounterpartyId !== null &&
      row.debtCurrency !== null &&
      row.debtAmount !== null &&
      (row.type === "income" || row.type === "expense")
    ) {
      const link = openingLinkFor(tx, {
        counterpartyId: row.obligationCounterpartyId,
        currency: row.debtCurrency,
        type: row.type,
      });
      if (link !== null && link.id === target && money.cmp(row.debtAmount, link.open) <= 0) {
        tx.update(transactions)
          .set({ settlesOpeningDebtId: link.id })
          .where(eq(transactions.id, row.id))
          .run();
        now = link.id;
      }
    }
    if (now !== row.settlesOpeningDebtId) {
      changes.push({ id: row.id, was: row.settlesOpeningDebtId, now });
    }
  }
  return changes;
}
