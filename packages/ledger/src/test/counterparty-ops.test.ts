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
import { randomId } from "@waltning/core/random";
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
      { id: NINA, name: "Nina", nameFolded: "nina" },
      { id: MAREK, name: "Marek", nameFolded: "marek" },
      { id: OLA, name: "Ola", nameFolded: "ola" },
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
        .values({
          id: id<"counterparties">("88888888-8888-4888-8888-888888888888"),
          name: "nina",
          nameFolded: "nina",
        })
        .run(),
    ).toThrow(/UNIQUE constraint failed/);
  });

  /**
   * R2 C1 — SQLite's `lower()` is ASCII-only: `ŁUKASZ` and `łukasz` folded to
   * two different strings and both landed. `fold()` strips the diacritic in
   * JavaScript before either row is written, so the two spellings collide on
   * `name_folded` the same way an ASCII name always did.
   */
  it("refuses ŁUKASZ after łukasz — SQLite's lower() alone would miss this", () => {
    write(createCounterpartyExecutor, {
      id: "99999999-9999-4999-8999-999999999999",
      name: "łukasz",
    });

    expect(() =>
      write(createCounterpartyExecutor, {
        id: "aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa",
        name: "ŁUKASZ",
      }),
    ).toThrow(/collides with existing counterparty "łukasz"/);
  });

  /** R2 M3 — an archived counterparty's old name is free for a fresh one. */
  it("does not collide with an archived counterparty's old name", () => {
    const before = counterparty(OLA);
    write(updateCounterpartyExecutor, {
      id: OLA,
      version: before?.version,
      patch: { archived: true },
    });

    expect(() =>
      write(createCounterpartyExecutor, {
        id: "bbbbbbbb-1111-4bbb-8bbb-bbbbbbbbbbbb",
        name: "Ola",
      }),
    ).not.toThrow();
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

  it("refuses renaming into a folded-name collision with a live counterparty", () => {
    const before = counterparty(MAREK);

    expect(() =>
      write(updateCounterpartyExecutor, {
        id: MAREK,
        version: before?.version,
        patch: { name: "  nina  " },
      }),
    ).toThrow(/collides with existing counterparty "Nina"/);
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

  /**
   * R2 H1 — `counterparties_name_uq` is partial (unarchived rows only), so a
   * fresh "Ola" is legal while the archived one sits out of the index. Without
   * the pre-check, un-archiving would hit the raw SQLite collision instead of
   * a refusal naming the live row.
   */
  it("refuses un-archiving into a folded-name collision with a live counterparty", () => {
    const before = counterparty(OLA);
    write(updateCounterpartyExecutor, {
      id: OLA,
      version: before?.version,
      patch: { archived: true },
    });
    write(createCounterpartyExecutor, {
      id: "cdcdcdcd-1111-4cdc-8cdc-cdcdcdcdcdcd",
      name: "Ola",
    });
    const archived = counterparty(OLA);

    expect(() =>
      write(updateCounterpartyExecutor, {
        id: OLA,
        version: archived?.version,
        patch: { archived: false },
      }),
    ).toThrow(/un-archiving "Ola" collides with existing counterparty "Ola"/);
    // Refused, not half-applied — still archived.
    expect(counterparty(OLA)?.archived).toBe(true);
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
      movedTransactionIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
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
        movedTransactionIds: [],
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
        movedTransactionIds: [],
      }),
    ).toThrow(/recorded as distinct/);
  });

  /**
   * R2 H5 — the controller's own list is the one moved, and a transaction
   * reassigned away from the loser since that list was built is refused
   * rather than silently dropped from the move.
   */
  it("refuses a named id that no longer names the loser", () => {
    debtRow({
      id: "bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb",
      type: "income",
      amount: "10",
      counterpartyId: OLA,
    });
    // Reassigned to NINA after the controller would have read it.
    s.ledger.replica.db
      .update(transactions)
      .set({ counterpartyId: NINA })
      .where(eq(transactions.id, id<"transactions">("bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb")))
      .run();

    expect(() =>
      write(mergeCounterpartiesExecutor, {
        mergeId: "ffffffff-2222-4fff-8fff-ffffffffffff",
        winnerId: MAREK,
        loserId: OLA,
        movedTransactionIds: ["bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb"],
      }),
    ).toThrow(/no longer name/);
  });

  /** R2 H2 — A→B then B→C reverses into the wrong owner if allowed. */
  it("refuses a chained merge while the first is still open", () => {
    write(mergeCounterpartiesExecutor, {
      mergeId: "10101010-2222-4101-8101-101010101010",
      winnerId: MAREK,
      loserId: OLA,
      movedTransactionIds: [],
    });

    expect(() =>
      write(mergeCounterpartiesExecutor, {
        mergeId: "20202020-2222-4202-8202-202020202020",
        winnerId: NINA,
        loserId: MAREK,
        movedTransactionIds: [],
      }),
    ).toThrow(/already appears on an open merge/);
  });

  it("allows the chain once the first merge is unmerged", () => {
    const merge = write(mergeCounterpartiesExecutor, {
      mergeId: "30303030-2222-4303-8303-303030303030",
      winnerId: MAREK,
      loserId: OLA,
      movedTransactionIds: [],
    });
    write(unmergeCounterpartiesExecutor, { mergeId: merge.row.merge.id });

    expect(() =>
      write(mergeCounterpartiesExecutor, {
        mergeId: "40404040-2222-4404-8404-404040404040",
        winnerId: NINA,
        loserId: MAREK,
        movedTransactionIds: [],
      }),
    ).not.toThrow();
  });

  /** R2 M1 — a recurring rule naming the loser is repointed to the winner. */
  it("repoints a recurring rule's counterparty", () => {
    s.ledger.replica.db
      .insert(schema.recurringTransactions)
      .values({
        id: id<"recurringTransactions">("50505050-2222-4505-8505-505050505050"),
        type: "expense",
        accountId: ACCOUNT,
        counterpartyId: OLA,
        amountOriginal: money.toMoney("10"),
        currency: EUR,
        rrule: "FREQ=MONTHLY",
      })
      .run();

    write(mergeCounterpartiesExecutor, {
      mergeId: "60606060-2222-4606-8606-606060606060",
      winnerId: MAREK,
      loserId: OLA,
      movedTransactionIds: [],
    });

    const rule = s.ledger.replica.db
      .select({ counterpartyId: schema.recurringTransactions.counterpartyId })
      .from(schema.recurringTransactions)
      .where(
        eq(
          schema.recurringTransactions.id,
          id<"recurringTransactions">("50505050-2222-4505-8505-505050505050"),
        ),
      )
      .all()[0];
    expect(rule?.counterpartyId).toBe(MAREK);
  });

  /**
   * R2 L3 — a live transaction the controller never named at all (not a
   * reassignment H5 would catch — one that simply was not on the moved
   * list) must not be silently archived out of view; the merge refuses
   * instead of leaving it stranded on an archived counterparty.
   */
  it("refuses to archive the loser when a live transaction still names it", () => {
    debtRow({
      id: "c1c1c1c1-1111-4c1c-8c1c-c1c1c1c1c1c1",
      type: "income",
      amount: "10",
      counterpartyId: OLA,
    });

    expect(() =>
      write(mergeCounterpartiesExecutor, {
        mergeId: "c2c2c2c2-2222-4c2c-8c2c-c2c2c2c2c2c2",
        winnerId: MAREK,
        loserId: OLA,
        // The controller never named the row above — an omission, not a
        // reassignment.
        movedTransactionIds: [],
      }),
    ).toThrow(/still has a live transaction .* after the move — refusing to archive/);

    expect(counterparty(OLA)?.archived).toBe(false);
  });

  /**
   * R2 M3 — `inArray` binds one SQLite variable per id; 1 200 crosses
   * `SQLITE_MAX_VARIABLE_NUMBER` (999) in one statement. Chunked at 500,
   * both the stale-id check and the move itself see every id across three
   * batches rather than throwing "too many SQL variables".
   */
  it("moves 1 200 transactions — past SQLite's single-statement variable limit", () => {
    const ids = Array.from({ length: 1200 }, () => randomId());
    s.ledger.replica.db
      .insert(transactions)
      .values(
        ids.map((txnId) => ({
          id: id<"transactions">(txnId),
          date: accountingDate("2026-08-01"),
          type: "income" as const,
          accountId: ACCOUNT,
          amountOriginal: money.toMoney("1"),
          currency: EUR,
          fxRate: money.pivotPerUnit("1"),
          counterpartyId: OLA,
          counterpartyRole: "debt" as const,
        })),
      )
      .run();

    const merge = write(mergeCounterpartiesExecutor, {
      mergeId: "c3c3c3c3-3333-4c3c-8c3c-c3c3c3c3c3c3",
      winnerId: MAREK,
      loserId: OLA,
      movedTransactionIds: ids,
    });

    expect(merge.row.movedTransactions).toBe(1200);
    expect(
      s.ledger.replica.db
        .select()
        .from(transactions)
        .where(eq(transactions.counterpartyId, MAREK))
        .all(),
    ).toHaveLength(1200);

    const result = write(unmergeCounterpartiesExecutor, { mergeId: merge.row.merge.id });

    expect(result.row.restoredTransactions).toBe(1200);
    expect(result.row.skipped).toBe(0);
    expect(
      s.ledger.replica.db
        .select()
        .from(transactions)
        .where(eq(transactions.counterpartyId, OLA))
        .all(),
    ).toHaveLength(1200);
  });

  /**
   * R2 M1 — distinct-pairs are transitive: whoever the loser was recorded
   * distinct from, the winner now stands in for.
   */
  it("carries a distinct pair from the loser onto the winner", () => {
    write(recordDistinctCounterpartiesExecutor, { aId: OLA, bId: NINA });

    write(mergeCounterpartiesExecutor, {
      mergeId: "70707070-2222-4707-8707-707070707070",
      winnerId: MAREK,
      loserId: OLA,
      movedTransactionIds: [],
    });

    const [a, b] = MAREK < NINA ? [MAREK, NINA] : [NINA, MAREK];
    const row = s.ledger.replica.db
      .select()
      .from(counterpartyDistinctPairs)
      .where(eq(counterpartyDistinctPairs.aId, a))
      .all()
      .find((r) => r.bId === b);
    expect(row).toBeDefined();
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
      movedTransactionIds: ["ffffffff-ffff-4fff-8fff-ffffffffffff"],
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
      movedTransactionIds: ["20202020-2020-4202-8202-202020202020"],
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
      movedTransactionIds: [],
    });
    write(unmergeCounterpartiesExecutor, { mergeId: merge.row.merge.id });

    expect(() => write(unmergeCounterpartiesExecutor, { mergeId: merge.row.merge.id })).toThrow(
      /already unmerged/,
    );
  });

  /**
   * R2 H1 — a row deliberately reassigned away from the winner after the
   * merge must not be silently overwritten by unmerge; only a row still on
   * the winner is repointed back, and the rest count as skipped.
   */
  it("skips a row reassigned away from the winner since the merge", () => {
    debtRow({
      id: "80808080-2222-4808-8808-808080808080",
      type: "income",
      amount: "10",
      counterpartyId: OLA,
    });
    const merge = write(mergeCounterpartiesExecutor, {
      mergeId: "90909090-2222-4909-8909-909090909090",
      winnerId: MAREK,
      loserId: OLA,
      movedTransactionIds: ["80808080-2222-4808-8808-808080808080"],
    });
    // A deliberate reassignment, unrelated to the merge, made after it.
    s.ledger.replica.db
      .update(transactions)
      .set({ counterpartyId: NINA })
      .where(eq(transactions.id, id<"transactions">("80808080-2222-4808-8808-808080808080")))
      .run();

    const result = write(unmergeCounterpartiesExecutor, { mergeId: merge.row.merge.id });

    expect(result.row.restoredTransactions).toBe(0);
    expect(result.row.skipped).toBe(1);
    const row = s.ledger.replica.db
      .select({ counterpartyId: transactions.counterpartyId })
      .from(transactions)
      .where(eq(transactions.id, id<"transactions">("80808080-2222-4808-8808-808080808080")))
      .all()[0];
    // Untouched — still NINA's, never overwritten back to OLA.
    expect(row?.counterpartyId).toBe(NINA);
  });

  /**
   * R2 H1 — the same collision `update_counterparty` refuses, reached from
   * unmerge instead: a new "Ola" is legal while the merged-away one sits
   * archived, and un-archiving it here must refuse by the same rule rather
   * than hit the raw SQLite `UNIQUE constraint failed` and abort the whole
   * unmerge, transaction restores included.
   */
  it("refuses to un-archive into a folded-name collision, and restores nothing", () => {
    debtRow({
      id: "b1b1b1b1-1111-4b1b-8b1b-b1b1b1b1b1b1",
      type: "income",
      amount: "10",
      counterpartyId: OLA,
    });
    const merge = write(mergeCounterpartiesExecutor, {
      mergeId: "b2b2b2b2-2222-4b2b-8b2b-b2b2b2b2b2b2",
      winnerId: MAREK,
      loserId: OLA,
      movedTransactionIds: ["b1b1b1b1-1111-4b1b-8b1b-b1b1b1b1b1b1"],
    });
    // Legal while OLA sits archived — the partial index does not see it.
    write(createCounterpartyExecutor, {
      id: "b3b3b3b3-3333-4b3b-8b3b-b3b3b3b3b3b3",
      name: "Ola",
    });

    expect(() => write(unmergeCounterpartiesExecutor, { mergeId: merge.row.merge.id })).toThrow(
      /un-archiving "Ola" collides with existing counterparty "Ola"/,
    );

    // Refused, not half-applied: still archived, the merge still open, and
    // the moved transaction still on the winner.
    expect(counterparty(OLA)?.archived).toBe(true);
    const row = s.ledger.replica.db
      .select({ counterpartyId: transactions.counterpartyId })
      .from(transactions)
      .where(eq(transactions.id, id<"transactions">("b1b1b1b1-1111-4b1b-8b1b-b1b1b1b1b1b1")))
      .all()[0];
    expect(row?.counterpartyId).toBe(MAREK);
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
      type: "expense",
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
      type: "expense",
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
      type: "expense",
      discharges: { currency: "EUR", amount: "80" },
    });

    expect(result.row.row.type).toBe("expense");
    expect(result.row.residual).toBe(money.toMoney("30"));
    expect(result.row.overSettled).toBe(true);
  });

  /**
   * L — a currency this replica has no row for must never silently settle
   * at an assumed 2 decimals; the refusal names the currency so a caller can
   * tell "unseeded currency" from "nothing to settle" (they were the same
   * unreachable branch before).
   */
  it("throws naming the currency, never assumes 2 decimals, when the currency has no row", () => {
    expect(() =>
      write(settleDebtExecutor, {
        id: "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0",
        counterpartyId: NINA,
        accountId: ACCOUNT,
        date: "2026-08-04",
        amount: "10",
        currency: "EUR",
        type: "expense",
        discharges: { currency: "PLN", amount: "10" },
      }),
    ).toThrow(/PLN/);
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
        type: "income",
        discharges: { currency: "EUR", amount: "10" },
      }),
    ).toThrow(/nothing to settle/);
  });

  /**
   * L1 — "nothing to settle" rounds to the currency's own decimals first,
   * the same rounding `settleResidualDirection` (packages/client) reads a
   * residual at. A raw 8dp balance of `-0.001` EUR is sub-minor-unit dust,
   * `0,00` on any screen that renders it (2dp) — it must refuse the same way
   * a genuinely zero balance does, not silently settle against dust.
   */
  it("rounds to the currency's own decimals before refusing a zero balance", () => {
    debtRow({
      id: "e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0",
      type: "income",
      amount: "0.001",
      counterpartyId: NINA,
    });

    // R4 — the refusal below is decided entirely by the *pre-existing*
    // balance `debtRow` just inserted (dust, raw, bypassing the scale
    // check `create_transaction` itself now carries); this settle's own
    // `amount`/`discharges.amount` never factors into "nothing to settle",
    // so it is scripted at EUR's own valid 2dp scale rather than the
    // fixture's original `0.001`.
    expect(() =>
      write(settleDebtExecutor, {
        id: "f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0",
        counterpartyId: NINA,
        accountId: ACCOUNT,
        date: "2026-08-04",
        amount: "0.01",
        currency: "EUR",
        type: "expense",
        discharges: { currency: "EUR", amount: "0.01" },
      }),
    ).toThrow(/nothing to settle/);
  });

  /**
   * L1 — `overSettled` rounds to the currency's own decimals too, so it
   * agrees with `settleResidualDirection`: a residual that rounds to `0,00`
   * reads as settled everywhere, never a flipped direction here and
   * "settled" on screen.
   *
   * C2 — this must be an actual over-settlement in raw terms (paying more
   * than the debt, flipping the balance's sign), or the rounding this test
   * claims to cover is never exercised: a debt of `0.014` settled by `0.01`
   * (the earlier script here) is *under*-settled — the residual (`0.004`)
   * never crosses zero, so `overSettled` reads `false` for a reason this
   * test does not test. Here the debt is `0.006` and the settle pays `0.01`:
   * raw residual `-0.004` (paid more than owed, sign flipped — a genuine
   * over-settlement) which rounds to `0.00` at EUR's own 2dp — `overSettled`
   * is `false` only because of that rounding. Mutation-proven: replacing
   * `money.round(residual, decimals)` with the raw `residual` in the
   * executor flips this to `true`, and reverting restores `false`.
   */
  it("does not report over-settlement when the residual rounds to zero", () => {
    // The dust lives in the *debt* row, inserted raw (bypassing
    // `create_transaction`'s own scale check, the same way a real
    // FX-converted lend can fold to sub-cent precision at 8dp); the settle
    // itself pays a clean, currency-valid `0.01` against it, genuinely
    // over-paying the `0.006` owed.
    debtRow({
      id: "11111111-2222-4333-8444-555555555501",
      type: "expense",
      amount: "0.006",
      counterpartyId: NINA,
    });

    const result = write(settleDebtExecutor, {
      id: "11111111-2222-4333-8444-555555555502",
      counterpartyId: NINA,
      accountId: ACCOUNT,
      date: "2026-08-04",
      amount: "0.01",
      currency: "EUR",
      type: "income",
      discharges: { currency: "EUR", amount: "0.01" },
    });

    // Raw residual is `-0.004` — a genuine sign flip (paid more than owed) —
    // and rounds to zero at EUR's own 2dp; `cmp` reads that rounded `-0.00`
    // as equal to zero, which is the only reason `overSettled` comes out
    // `false` here.
    expect(money.round(result.row.residual, 2)).toBe("-0.00");
    expect(result.row.overSettled).toBe(false);
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
        type: "income",
        discharges: { currency: "EUR", amount: "10" },
      }),
    ).toThrow(/nothing to settle/);
  });

  /** R2 H3 — a currency that contradicts the account is refused, naming both. */
  it("refuses a currency that contradicts the account's own currency", () => {
    debtRow({
      id: "e1e1e1e1-1111-4e1e-8e1e-e1e1e1e1e1e1",
      type: "income",
      amount: "50",
      counterpartyId: NINA,
    });

    expect(() =>
      write(settleDebtExecutor, {
        id: "e2e2e2e2-2222-4e2e-8e2e-e2e2e2e2e2e2",
        counterpartyId: NINA,
        accountId: ACCOUNT,
        date: "2026-08-04",
        amount: "50",
        currency: "PLN",
        type: "expense",
        discharges: { currency: "EUR", amount: "50" },
      }),
    ).toThrow(/currency PLN does not match account currency EUR/);
  });

  /**
   * R2 H4 — the direction is verified against the live balance, never
   * silently flipped: a stale `type` (the balance moved since it was read)
   * refuses rather than posting the wrong direction.
   */
  it("refuses a type that disagrees with the live balance's sign", () => {
    debtRow({
      id: "e3e3e3e3-3333-4e3e-8e3e-e3e3e3e3e3e3",
      type: "income",
      amount: "50",
      counterpartyId: NINA,
    });

    expect(() =>
      write(settleDebtExecutor, {
        id: "e4e4e4e4-4444-4e4e-8e4e-e4e4e4e4e4e4",
        counterpartyId: NINA,
        accountId: ACCOUNT,
        date: "2026-08-04",
        amount: "50",
        currency: "EUR",
        // The balance is negative (you owe them) — expense is correct, so
        // "income" disagrees and must be refused rather than silently
        // corrected.
        type: "income",
        discharges: { currency: "EUR", amount: "50" },
      }),
    ).toThrow(/the balance moved, reload/);
  });
});
