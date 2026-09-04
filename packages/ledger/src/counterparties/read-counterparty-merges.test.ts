import { id } from "@waltning/core/id";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import type { LocalExecutor } from "../executor.ts";
import { ledgerRegistry } from "../registry.ts";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import type { Capture, LocalTx, LocalWriteResult } from "../write.ts";
import { writeLocally } from "../write.ts";
import { mergeCounterpartiesExecutor } from "./merge-counterparties.executor.ts";
import { readCounterpartyMerges } from "./read-counterparty-merges.ts";
import { unmergeCounterpartiesExecutor } from "./unmerge-counterparties.executor.ts";

const { counterparties } = ledgerSchema;

const NINA = id<"counterparties">("11111111-1111-4111-8111-111111111111");
const MAREK = id<"counterparties">("22222222-2222-4222-8222-222222222222");
const MERGE_ID = id<"counterpartyMerges">("33333333-3333-4333-8333-333333333333");
const capture: Capture = { timeZone: "Europe/Warsaw", offsetMinutes: 60 };

let stores: ScratchStores;

beforeEach(() => {
  stores = scratchStores();
  stores.ledger.replica.db
    .insert(counterparties)
    .values([
      { id: NINA, name: "Nina" },
      { id: MAREK, name: "Marek" },
    ])
    .run();
});

afterEach(() => stores.close());

function write<Input extends z.ZodTypeAny, Row>(
  executor: LocalExecutor<Input, Row, LocalTx<unknown, typeof ledgerSchema>>,
  input: unknown,
): LocalWriteResult<Row> {
  return writeLocally(stores.ledger, { executor, registry: ledgerRegistry, input, capture });
}

describe("readCounterpartyMerges", () => {
  it("is empty for a counterparty with no merges", () => {
    expect(readCounterpartyMerges(stores.ledger.replica.db, NINA)).toEqual([]);
  });

  it("names a live merge — the loser's name and how many rows it moved", () => {
    write(mergeCounterpartiesExecutor, { mergeId: MERGE_ID, winnerId: NINA, loserId: MAREK });

    const merges = readCounterpartyMerges(stores.ledger.replica.db, NINA);

    expect(merges).toHaveLength(1);
    expect(merges[0]?.mergeId).toBe(MERGE_ID);
    expect(merges[0]?.loserName).toBe("Marek");
    expect(merges[0]?.movedCount).toBe(0);
  });

  it("drops a merge once it is undone — S13's overflow has nothing left to offer", () => {
    write(mergeCounterpartiesExecutor, { mergeId: MERGE_ID, winnerId: NINA, loserId: MAREK });
    write(unmergeCounterpartiesExecutor, { mergeId: MERGE_ID });

    expect(readCounterpartyMerges(stores.ledger.replica.db, NINA)).toEqual([]);
  });
});
