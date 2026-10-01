/**
 * `settle_debt`, on the device — `architecture/08` H9's whole resolution,
 * S14 §5.
 *
 * **Takes the amount that changed hands and the debt it discharges — never
 * the residual.** The residual is derived here, from the live replica, and
 * returned; a stale client figure never overwrites a balance that moved.
 * S14 §5: *"a settlement never implicitly clears a balance"* — the remainder
 * always lands somewhere, even when that somewhere is a flipped sign
 * (over-settlement, S14 §9.2 — never refused, only stated).
 *
 * **Direction is always read off the live balance's sign here; `input.type`
 * is verified against it, never trusted outright (R2 H4).** §6.6's four
 * cases collapse to one rule — they owe you (positive) → money flows in as
 * `income`; you owe them (negative) → money flows out as `expense`, the sign
 * and the cash direction always opposite. The controller reads the sign when
 * it builds the payload and names it as `input.type`, and a disagreement
 * with the live read here means *the balance moved — reload*, not a silent
 * flip — the phone's own outbox can apply a dependent write out of order, so
 * the direction shown and the direction actually taken could otherwise
 * disagree silently. Required, not optional (#116 review, M2): an omitted
 * `type` skipped this verification for exactly the caller least likely to
 * have re-derived it independently.
 *
 * **Refuses a currency that contradicts the account (R2 H3).** §6.5:
 * *a transaction's currency is its account's currency* — Postgres enforces it
 * with a trigger the phone has no equivalent of, so nothing caught
 * `settle_debt` writing an EUR row into a PLN account until drain. Checked
 * here, before `insertTransaction` ever runs.
 *
 * `insertTransaction` (`transactions/create-transaction.executor.ts`) is the
 * one write path for the table — this mints a row through it rather than a
 * second `tx.insert(transactions)`, the same reason `reconcile_account` and
 * `supersede_transaction` do.
 */

import type { Id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import {
  createTransactionInput,
  type SettleDebtInput,
  settleDebtInput,
} from "@waltning/core/registry/inputs";
import { and, count, eq, isNull } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { assertMoneyScale } from "../scale.ts";
import { type ReplicaTx, ledgerSchema as schema } from "../schema-map.ts";
import {
  insertTransaction,
  type LocalTransactionRow,
} from "../transactions/create-transaction.executor.ts";
import { openingLinkFor, planOpeningSplit } from "./opening-link.ts";
import { balancesForCounterparty } from "./read-counterparty-balances.ts";

const { accounts, counterparties, currencies } = schema;

export type SettleDebtResult = {
  row: LocalTransactionRow;
  /** The ordinary part of a settlement that crossed the end of an existing debt (§6.6) — see `openingLinkFor`. */
  spill?: LocalTransactionRow;
  /** What remains outstanding, in `discharges.currency`, after this write. */
  residual: money.Money;
  /** The balance's sign flipped — paid more than was owed (S14 §9.2). */
  overSettled: boolean;
};

export const settleDebtExecutor = defineLocalExecutor<
  typeof settleDebtInput,
  SettleDebtResult,
  ReplicaTx
>({
  operation: "settle_debt",
  opVersion: 1,
  input: settleDebtInput,
  /** One id: the settlement transaction's own — never the counterparty's. */
  mints: (input) => (input.spillId === undefined ? [input.id] : [input.id, input.spillId]),
  // R4 — read-only, run before the outbox commits (`LocalExecutor.validate`'s
  // own doc): both figures — `amount` (what changed hands, in `currency`)
  // and `discharges.amount` (S14's coalesce, in `discharges.currency`) — are
  // refused past their own currency's scale the same way a malformed
  // `create_transaction` fee already is, never queued as an intent nothing
  // will ever apply.
  validate: (input, tx) => {
    assertMoneyScale(tx, input.amount, input.currency, "settle_debt: amount_original");
    assertMoneyScale(
      tx,
      input.discharges.amount,
      input.discharges.currency,
      "settle_debt: debt_amount",
    );
  },
  apply: (input, tx) => settleDebt(input, tx),
});

function settleDebt(input: SettleDebtInput, tx: ReplicaTx): SettleDebtResult {
  const [counterparty] = tx
    .select({ name: counterparties.name })
    .from(counterparties)
    .where(eq(counterparties.id, input.counterpartyId))
    .all();
  if (!counterparty) {
    throw new LocalRefusal(`settle_debt: no counterparty ${input.counterpartyId}`, {
      dependency: true,
    });
  }

  // S09 — re-filing an existing row: it is soft-deleted first, in this same
  // replica transaction, so every check below reads the debt *without* it and
  // any refusal rolls the whole write back with the original intact.
  const replaced =
    input.supersedesId === undefined || input.supersedesVersion === undefined
      ? undefined
      : replaceOriginal(input.supersedesId, input.supersedesVersion, tx);

  // R2 H3 — §6.5: a transaction's currency is its account's currency.
  // Postgres has a trigger for this; the phone has none, so `settle_debt`
  // checks it directly rather than writing a row drain would refuse later.
  const [account] = tx
    .select({ currency: accounts.currency })
    .from(accounts)
    .where(eq(accounts.id, input.accountId))
    .all();
  if (!account) {
    throw new LocalRefusal(`settle_debt: no account ${input.accountId}`, { dependency: true });
  }
  if (account.currency !== input.currency) {
    throw new LocalRefusal(
      `settle_debt: currency ${input.currency} does not match account currency ` +
        `${account.currency} (account ${input.accountId})`,
    );
  }

  // L1 — the currency's own decimals, read here rather than trusted from a
  // caller: `balancesForCounterparty` folds at full 8dp precision, and both
  // signs below must agree with `settleResidualDirection`'s own rounded read
  // of the same figures, or the executor and the screen can each name a
  // different outcome for the same settlement.
  const [currencyRow] = tx
    .select({ decimals: currencies.decimals })
    .from(currencies)
    .where(eq(currencies.code, input.discharges.currency))
    .all();
  if (!currencyRow) {
    throw new LocalRefusal(`settle_debt: no currency ${input.discharges.currency}`, {
      dependency: true,
    });
  }
  const decimals = currencyRow.decimals;

  const before = balancesForCounterparty(tx, input.counterpartyId).find(
    (row) => row.currency === input.discharges.currency,
  );
  const balanceBefore = before?.balance ?? money.ZERO;
  const sign = money.cmp(money.round(balanceBefore, decimals), money.ZERO);

  if (sign === 0) {
    throw new LocalRefusal(`settle_debt: nothing to settle in ${input.discharges.currency}`);
  }

  // R2 H4 — §6.6's four cases, collapsed: they owe you (positive) → money
  // flows in as `income`; you owe them (negative) → money flows out as
  // `expense`. `input.type` is the controller's own read of this sign, taken
  // when the sheet built the payload; verified against the live sign rather
  // than trusted, and never silently overridden — a disagreement means the
  // balance moved since the sheet was shown. #116 review, M2: required, not
  // optional — an omitted `type` skipped this verification entirely for the
  // one caller least likely to have re-derived it.
  const liveType = sign > 0 ? ("income" as const) : ("expense" as const);
  if (input.type !== liveType) {
    throw new LocalRefusal(
      `settle_debt: expected ${input.type} but the live balance in ` +
        `${input.discharges.currency} now settles as ${liveType} — the balance moved, reload`,
    );
  }

  // `SPEC.md` §7.2 — `debt_amount` fits `debt_currency`'s own declared
  // decimals, the same guarantee this executor's own `validate` already gave
  // `amount`/`currency` above (L10 — `insertTransaction` no longer repeats
  // that check; see its own comment). `createTransactionInput` does not
  // carry `debt_amount`/`debt_currency` at all — see the comment below — so
  // this executor is their only scale check. `decimals`, not another lookup:
  // already read above, for the same currency, to round the balance sign.
  if (money.dec(input.discharges.amount).decimalPlaces() > decimals) {
    throw new Error(
      `settle_debt: debt_amount ${input.discharges.amount} holds more decimal places than ` +
        `${input.discharges.currency} allows (${decimals})`,
    );
  }

  /**
   * **Which opening debt this pays down, and how much of it (§6.6).** Only what
   * is still open on it, and only when it points the opening debt's own way
   * (`openingLinkFor`). A settlement that **crosses the boundary** — more than
   * is left open — is **split in the same write** into two rows: the part that
   * pays down the opening debt (linked, so no period figure counts it and
   * deleting the debt takes it) and the rest, an ordinary repayment of an
   * ordinary debt. The two amounts are the same proportion of what changed
   * hands as of what was discharged, the remainder landing on the second row so
   * the account moves by exactly what was paid.
   *
   * **Why split and not refuse.** A person paying back "everything" is one
   * payment, and refusing it would make them record two by hand against a
   * boundary only this ledger can see; linking it whole would let deleting the
   * opening debt delete a real repayment, and leaving it unlinked would count
   * the old debt's repayment as income. Splitting is sound because every
   * figure involved is a straight proportion in the two currencies' own
   * decimals and the pair always adds back to the original.
   */
  const link = openingLinkFor(tx, {
    counterpartyId: input.counterpartyId,
    currency: input.discharges.currency,
    type: liveType,
  });
  type Part = {
    id: Id<"transactions">;
    amount: money.Money;
    discharge: money.Money;
    link: Id<"openingDebts"> | null;
  };
  const plan = planOpeningSplit(tx, {
    link,
    amount: input.amount,
    accountCurrency: input.currency,
    discharge: input.discharges.amount,
    dischargeDecimals: decimals,
  });
  if (plan.length > 1 && input.spillId === undefined) {
    throw new LocalRefusal(
      "settle_debt: this settlement pays down the rest of an existing debt and more — " +
        "it is written as two rows, and the write carries no id for the second (spillId)",
    );
  }
  const parts: Part[] = plan.map((part, index) => ({
    ...part,
    id: index === 0 || input.spillId === undefined ? input.id : input.spillId,
  }));

  // `debt_currency`/`debt_amount` are not on `createTransactionInput` (the
  // ordinary capture path never sets them — see its own "not here, on
  // purpose" note); `settle_debt` is the one write that does, so it stamps
  // them directly rather than widening that schema for a single caller.
  const written = parts.map((part) => {
    const partId = part.id;
    const partAmount = part.amount;
    const inserted = insertTransaction(
      createTransactionInput.parse({
        id: partId,
        date: input.date,
        type: liveType,
        accountId: input.accountId,
        amountOriginal: partAmount,
        currency: input.currency,
        // Who it was with, and who it owes — the same person, as a captured debt carries both.
        counterpartyId: input.counterpartyId,
        obligationCounterpartyId: input.counterpartyId,
        obligationRole: "debt",
        // A re-filed row keeps what it was called, when it was, whose scope it is
        // and where it came from; a fresh settlement is named for the person.
        enteredName:
          replaced !== undefined && replaced.enteredName !== ""
            ? replaced.enteredName
            : counterparty.name,
        note: input.note,
        source: replaced?.source ?? "manual",
        ...(replaced === undefined
          ? {}
          : {
              isBusiness: replaced.isBusiness,
              isCapital: replaced.isCapital,
              ...(replaced.timeOfDay === null ? {} : { timeOfDay: replaced.timeOfDay }),
              ...(replaced.externalId === null ? {} : { externalId: replaced.externalId }),
              ...(replaced.brandKey !== null && replaced.brandSource === "manual"
                ? { brandKey: replaced.brandKey }
                : {}),
            }),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      }),
      tx,
      { settlement: true },
    );
    const [stamped] = tx
      .update(schema.transactions)
      .set({
        debtCurrency: input.discharges.currency,
        debtAmount: part.discharge,
        settlesOpeningDebtId: part.link,
        // Both halves of a split payment name the same pair (§6.6).
        paymentPairId: parts.length > 1 ? input.id : null,
      })
      .where(eq(schema.transactions.id, inserted.id))
      .returning()
      .all();
    if (!stamped) {
      throw new Error("settle_debt: the row changed between insert and the debt-fields update");
    }
    return stamped;
  });
  const [stamped, spill] = written;
  if (!stamped) throw new Error("settle_debt: no settlement row was written");
  const row = stamped;

  // The original's tags follow it to the row that replaces it.
  if (replaced !== undefined) {
    tx.update(schema.transactionTags)
      .set({ transactionId: row.id })
      .where(eq(schema.transactionTags.transactionId, replaced.id))
      .run();
  }

  const after = balancesForCounterparty(tx, input.counterpartyId).find(
    (r) => r.currency === input.discharges.currency,
  );
  const residual = after?.balance ?? money.ZERO;
  const residualSign = money.cmp(money.round(residual, decimals), money.ZERO);
  const overSettled = residualSign !== 0 && residualSign !== sign;

  return { row: stamped, ...(spill === undefined ? {} : { spill }), residual, overSettled };
}

/**
 * Soft-delete the row a settlement replaces, and hand back what the replacement
 * carries across. Refuses what cannot be carried honestly: a stale row, a row
 * that is gone, one with split lines (the settlement has none — un-split it
 * first), and one that is already a settlement (its discharge is the debt's own
 * business, not an identity to move).
 */
function replaceOriginal(id: Id<"transactions">, version: number, tx: ReplicaTx) {
  const old = tx.select().from(schema.transactions).where(eq(schema.transactions.id, id)).get();
  if (!old) {
    throw new LocalRefusal(`settle_debt: no transaction ${id} to replace`, { dependency: true });
  }
  if (old.deletedAt !== null) {
    throw new LocalRefusal(`settle_debt: ${id} is already deleted`);
  }
  if (old.version !== version) {
    throw new LocalRefusal(
      `settle_debt: stale version — read ${version}, row is at ${old.version}`,
    );
  }
  const [{ value: lines } = { value: 0 }] = tx
    .select({ value: count() })
    .from(schema.transactionLines)
    .where(eq(schema.transactionLines.transactionId, id))
    .all();
  if (lines > 0) {
    throw new LocalRefusal(
      `settle_debt: ${id} is split into ${lines} line(s) and a settlement has none — un-split it first`,
    );
  }
  if (old.debtAmount !== null) {
    throw new LocalRefusal(
      `settle_debt: ${id} is already a settlement — it cannot be replaced by one`,
    );
  }
  const [deleted] = tx
    .update(schema.transactions)
    .set({ deletedAt: new Date(), version: old.version + 1, updatedAt: new Date() })
    .where(
      and(
        eq(schema.transactions.id, id),
        eq(schema.transactions.version, version),
        isNull(schema.transactions.deletedAt),
      ),
    )
    .returning()
    .all();
  if (!deleted) {
    throw new Error("settle_debt: the replaced row changed between read and write");
  }
  return old;
}
