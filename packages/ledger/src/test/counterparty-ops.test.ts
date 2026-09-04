/**
 * The six counterparty and settlement operations, as the phone applies them
 * — `create_counterparty` `update_counterparty` `merge_counterparties`
 * `unmerge_counterparties` `record_distinct_counterparties` `settle_debt`.
 *
 * Same harness as `account-ops.test.ts`: real two-file writes through
 * `writeLocally` and the real `ledgerRegistry`, so a refusal here is a
 * refusal a caller of `writeLocally` actually meets.
 */

import { accountingDate } from "@waltning/core/date";
import { type Id, id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import { createCounterpartyExecutor } from "../counterparties/create-counterparty.executor.ts";
import { mergeCounterpartiesExecutor } from "../counterparties/merge-counterparties.executor.ts";
import { recordDistinctCounterpartiesExecutor } from "../counterparties/record-distinct-counterparties.executor.ts";
import { settleDebtExecutor } from "../counterparties/settle-debt.executor.ts";
import { unmergeCounterpartiesExecutor } from "../counterparties/unmerge-counterparties.executor.ts";
import { updateCounterpartyExecutor } from "../counterparties/update-counterparty.executor.ts";
import type { LocalExecutor } from "../executor.ts";
import { ledgerRegistry } from "../registry.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { Capture, LocalTx, LocalWriteResult } from "../write.ts";
import { writeLocally } from "../write.ts";
import { type ScratchStores, scratchStores } from "./stores.ts";

const { counterparties, counterpartyDistinctPairs, outbox, transactions } = schema;

const EUR = currencyCode("EUR");
const ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");
const NINA = id<"counterparties">("22222222-2222-4222-8222-222222222222");
const MAREK = id<"counterparties">("33333333-3333-4333-8333-333333333333");
const OLA = id<"counterparties">("44444444-4444-4444-8444-444444444444");

const capture: Capture = { timeZone: "Europe/Warsaw", offsetMinutes: 60 };

let s: ScratchStores;

beforeEach(() => {
  s = scratchStores();
  const db = s.ledger.replica.db;
  db.insert(schema.currencies)
    .values({ code: EUR, name: "Placeholder", decimals: 2, isPivot: true })
    .run();
  db.insert(schema.accounts).values({ id: ACCOUNT, name: "Cash · EUR", currency: EUR }).run();
  db.insert(counterparties)
    .values([
      { id: NINA, name: "Nina" },
      { id: MAREK, name: "Marek" },
      { id: OLA, name: "Ola" },
    ])
    .run();
});

afterEach(() => s?.close());

function write<Input extends z.ZodTypeAny, Row>(
  executor: LocalExecutor<Input, Row, LocalTx<unknown, typeof schema>>,
  input: unknown,
): LocalWriteResult<Row> {
  return writeLocally(s.ledger, { executor, registry: ledgerRegistry, input, capture });
}

const entries = () => s.ledger.outbox.db.select().from(outbox).all();
const counterparty = (counterpartyId: Id<"counterparties">) =>
  s.ledger.replica.db
    .select()
    .from(counterparties)
    .where(eq(counterparties.id, counterpartyId))
    .all()[0];

/** Insert a debt-role transaction directly, without going through capture. */
function debtRow(opts: {
  id: string;
  type: "income" | "expense";
  amount: string;
  counterpartyId: Id<"counterparties">;
  role?: "debt" | "contribution" | "reference";
}) {
  s.ledger.replica.db
    .insert(transactions)
    .values({
      id: id<"transactions">(opts.id),
      date: accountingDate("2026-08-01"),
      type: opts.type,
      accountId: ACCOUNT,
      amountOriginal: money.toMoney(opts.amount),
      currency: EUR,
      fxRate: money.pivotPerUnit("1"),
      counterpartyId: opts.counterpartyId,
      counterpartyRole: opts.role ?? "debt",
    })
    .run();
}

/* ── create_counterparty ─────────────────────────────────────────────────── */

describe("create_counterparty", () => {
  it("lands the row, defaults kind to person, and queues one entry", () => {
    const result = write(createCounterpartyExecutor, {
      id: "55555555-5555-4555-8555-555555555555",
      name: "Piotr",
    });

    expect(result.row.kind).toBe("person");
    expect(entries()).toHaveLength(1);
  });

  it("refuses a folded-name collision with a live counterparty", () => {
    expect(() =>
      write(createCounterpartyExecutor, {
        id: "66666666-6666-4666-8666-666666666666",
        name: "  NINA  ",
      }),
    ).toThrow(/collides with existing counterparty "Nina"/);
    // The crash window: the outbox entry commits before the replica throws.
    expect(entries()).toHaveLength(1);
  });

  it("replays idempotently — twice is once", () => {
    const input = { id: "77777777-7777-4777-8777-777777777777", name: "Darek" };
    write(createCounterpartyExecutor, input);

    expect(() => write(createCounterpartyExecutor, input)).not.toThrow();
  });

  it("breaks the SQLite name index directly — a raw insert also refuses it", () => {
    expect(() =>
      s.ledger.replica.db
        .insert(counterparties)
        .values({ id: id<"counterparties">("88888888-8888-4888-8888-888888888888"), name: "nina" })
        .run(),
    ).toThrow(/UNIQUE constraint failed/);
  });
});

/* ── update_counterparty ─────────────────────────────────────────────────── */

describe("update_counterparty", () => {
  it("patches the fields sent and bumps version", () => {
    const before = counterparty(NINA);
    const result = write(updateCounterpartyExecutor, {
      id: NINA,
      version: before?.version,
      patch: { settlementCurrency: "EUR", note: "splits dinners" },
    });

    expect(result.row.settlementCurrency).toBe("EUR");
    expect(result.row.version).toBe((before?.version ?? 0) + 1);
  });

  it("refuses a stale version", () => {
    expect(() =>
      write(updateCounterpartyExecutor, { id: NINA, version: 999, patch: { note: "x" } }),
    ).toThrow(/stale version/);
  });

  it("refuses archiving while a §7 balance is open", () => {
    debtRow({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      type: "income",
      amount: "120",
      counterpartyId: NINA,
    });
    const before = counterparty(NINA);

    expect(() =>
      write(updateCounterpartyExecutor, {
        id: NINA,
        version: before?.version,
        patch: { archived: true },
      }),
    ).toThrow(/archiving is for settled relationships/);
  });

  it("allows archiving once every balance is settled", () => {
    // Marek has no debt rows at all — nothing open.
    const before = counterparty(MAREK);

    const result = write(updateCounterpartyExecutor, {
      id: MAREK,
      version: before?.version,
      patch: { archived: true },
    });

    expect(result.row.archived).toBe(true);
  });
});

/* ── merge_counterparties / unmerge_counterparties ───────────────────────── */

describe("merge_counterparties", () => {
  it("moves every live transaction, records the merge, and archives the loser", () => {
    debtRow({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      type: "income",
      amount: "40",
      counterpartyId: OLA,
    });

    const result = write(mergeCounterpartiesExecutor, {
      mergeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      winnerId: MAREK,
      loserId: OLA,
    });

    expect(result.row.movedTransactions).toBe(1);
    expect(result.row.loser.archived).toBe(true);
    expect(result.row.merge.movedTransactionIds).toEqual(["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]);
    const moved = s.ledger.replica.db
      .select({ counterpartyId: transactions.counterpartyId })
      .from(transactions)
      .where(eq(transactions.id, id<"transactions">("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")))
      .all()[0];
    expect(moved?.counterpartyId).toBe(MAREK);
  });

  it("refuses merging an already-archived counterparty", () => {
    const before = counterparty(OLA);
    write(updateCounterpartyExecutor, {
      id: OLA,
      version: before?.version,
      patch: { archived: true },
    });

    expect(() =>
      write(mergeCounterpartiesExecutor, {
        mergeId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        winnerId: MAREK,
        loserId: OLA,
      }),
    ).toThrow(/archived/);
  });

  it("refuses a pair recorded distinct", () => {
    write(recordDistinctCounterpartiesExecutor, { aId: NINA, bId: MAREK });

    expect(() =>
      write(mergeCounterpartiesExecutor, {
        mergeId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        winnerId: NINA,
        loserId: MAREK,
      }),
    ).toThrow(/recorded as distinct/);
  });
});

describe("unmerge_counterparties", () => {
  it("reverses exactly the recorded ids and un-archives the loser", () => {
    debtRow({
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      type: "income",
      amount: "10",
      counterpartyId: OLA,
    });
    const merge = write(mergeCounterpartiesExecutor, {
      mergeId: "10101010-1010-4101-8101-101010101010",
      winnerId: MAREK,
      loserId: OLA,
    });

    const result = write(unmergeCounterpartiesExecutor, {
      mergeId: merge.row.merge.id,
    });

    expect(result.row.restoredTransactions).toBe(1);
    expect(result.row.skipped).toBe(0);
    expect(result.row.loser.archived).toBe(false);
    const restored = s.ledger.replica.db
      .select({ counterpartyId: transactions.counterpartyId })
      .from(transactions)
      .where(eq(transactions.id, id<"transactions">("ffffffff-ffff-4fff-8fff-ffffffffffff")))
      .all()[0];
    expect(restored?.counterpartyId).toBe(OLA);
  });

  it("skips a row soft-deleted since the merge, and counts it as skipped", () => {
    debtRow({
      id: "20202020-2020-4202-8202-202020202020",
      type: "income",
      amount: "10",
      counterpartyId: OLA,
    });
    const merge = write(mergeCounterpartiesExecutor, {
      mergeId: "30303030-3030-4303-8303-303030303030",
      winnerId: MAREK,
      loserId: OLA,
    });
    s.ledger.replica.db
      .update(transactions)
      .set({ deletedAt: new Date() })
      .where(eq(transactions.id, id<"transactions">("20202020-2020-4202-8202-202020202020")))
      .run();

    const result = write(unmergeCounterpartiesExecutor, { mergeId: merge.row.merge.id });

    expect(result.row.restoredTransactions).toBe(0);
    expect(result.row.skipped).toBe(1);
  });

  it("refuses a merge already unmerged", () => {
    const merge = write(mergeCounterpartiesExecutor, {
      mergeId: "40404040-4040-4404-8404-404040404040",
      winnerId: MAREK,
      loserId: OLA,
    });
    write(unmergeCounterpartiesExecutor, { mergeId: merge.row.merge.id });

    expect(() => write(unmergeCounterpartiesExecutor, { mergeId: merge.row.merge.id })).toThrow(
      /already unmerged/,
    );
  });
});

/* ── record_distinct_counterparties ──────────────────────────────────────── */

describe("record_distinct_counterparties", () => {
  it("normalises the pair to a < b regardless of the order named", () => {
    write(recordDistinctCounterpartiesExecutor, { aId: MAREK, bId: NINA });

    const [aId, bId] = NINA < MAREK ? [NINA, MAREK] : [MAREK, NINA];
    const row = s.ledger.replica.db
      .select()
      .from(counterpartyDistinctPairs)
      .where(eq(counterpartyDistinctPairs.aId, aId))
      .all()[0];
    expect(row?.bId).toBe(bId);
  });

  it("is idempotent — recording the same pair twice is a no-op", () => {
    write(recordDistinctCounterpartiesExecutor, { aId: NINA, bId: MAREK });

    expect(() =>
      write(recordDistinctCounterpartiesExecutor, { aId: MAREK, bId: NINA }),
    ).not.toThrow();
  });

  it("breaks the distinct-pair primary key directly — a raw duplicate insert refuses", () => {
    const [aId, bId] = NINA < MAREK ? [NINA, MAREK] : [MAREK, NINA];
    s.ledger.replica.db.insert(counterpartyDistinctPairs).values({ aId, bId }).run();

    expect(() =>
      s.ledger.replica.db.insert(counterpartyDistinctPairs).values({ aId, bId }).run(),
    ).toThrow();
  });

  it("breaks the ordering CHECK directly — a raw unordered insert refuses", () => {
    const [aId, bId] = NINA < MAREK ? [NINA, MAREK] : [MAREK, NINA];

    // Written the wrong way round: bId < aId once decided, which the CHECK
    // (`counterparty_distinct_pairs_ordered`) exists to catch even though the
    // executor above never produces it.
    expect(() =>
      s.ledger.replica.db.insert(counterpartyDistinctPairs).values({ aId: bId, bId: aId }).run(),
    ).toThrow();
  });
});

/* ── settle_debt ──────────────────────────────────────────────────────────── */

describe("settle_debt", () => {
  it("S14's worked example — owe 120 EUR, settle 50 EUR, residual −70", () => {
    // Cash +120 (you borrowed it) → debt delta −120 — you owe them.
    debtRow({
      id: "50505050-5050-4505-8505-505050505050",
      type: "income",
      amount: "120",
      counterpartyId: NINA,
    });

    const result = write(settleDebtExecutor, {
      id: "60606060-6060-4606-8606-606060606060",
      counterpartyId: NINA,
      accountId: ACCOUNT,
      date: "2026-08-04",
      amount: "50",
      currency: "EUR",
      discharges: { currency: "EUR", amount: "50" },
    });

    expect(result.row.row.type).toBe("expense");
    expect(result.row.row.debtCurrency).toBe("EUR");
    expect(result.row.row.debtAmount).toBe(money.toMoney("50"));
    expect(result.row.residual).toBe(money.toMoney("-70"));
    expect(result.row.overSettled).toBe(false);
  });

  it("clears exactly to zero", () => {
    debtRow({
      id: "70707070-7070-4707-8707-707070707070",
      type: "income",
      amount: "50",
      counterpartyId: NINA,
    });

    const result = write(settleDebtExecutor, {
      id: "80808080-8080-4808-8808-808080808080",
      counterpartyId: NINA,
      accountId: ACCOUNT,
      date: "2026-08-04",
      amount: "50",
      currency: "EUR",
      discharges: { currency: "EUR", amount: "50" },
    });

    expect(result.row.residual).toBe(money.ZERO);
    expect(result.row.overSettled).toBe(false);
  });

  it("over-settlement flips the sign and is not refused", () => {
    debtRow({
      id: "90909090-9090-4909-8909-909090909090",
      type: "income",
      amount: "50",
      counterpartyId: NINA,
    });

    const result = write(settleDebtExecutor, {
      id: "a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0",
      counterpartyId: NINA,
      accountId: ACCOUNT,
      date: "2026-08-04",
      amount: "80",
      currency: "EUR",
      discharges: { currency: "EUR", amount: "80" },
    });

    expect(result.row.row.type).toBe("expense");
    expect(result.row.residual).toBe(money.toMoney("30"));
    expect(result.row.overSettled).toBe(true);
  });

  it("refuses a zero balance", () => {
    expect(() =>
      write(settleDebtExecutor, {
        id: "b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0",
        counterpartyId: NINA,
        accountId: ACCOUNT,
        date: "2026-08-04",
        amount: "10",
        currency: "EUR",
        discharges: { currency: "EUR", amount: "10" },
      }),
    ).toThrow(/nothing to settle/);
  });

  it("never counts a contribution-role row", () => {
    debtRow({
      id: "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0",
      type: "income",
      amount: "500",
      counterpartyId: NINA,
      role: "contribution",
    });

    expect(() =>
      write(settleDebtExecutor, {
        id: "d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0",
        counterpartyId: NINA,
        accountId: ACCOUNT,
        date: "2026-08-04",
        amount: "10",
        currency: "EUR",
        discharges: { currency: "EUR", amount: "10" },
      }),
    ).toThrow(/nothing to settle/);
  });
});
