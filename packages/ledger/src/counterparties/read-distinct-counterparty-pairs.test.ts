import { id } from "@waltning/core/id";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import type { LocalExecutor } from "../executor.ts";
import { ledgerRegistry } from "../registry.ts";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import type { Capture, LocalTx, LocalWriteResult } from "../write.ts";
import { writeLocally } from "../write.ts";
import { readDistinctCounterpartyPairs } from "./read-distinct-counterparty-pairs.ts";
import { recordDistinctCounterpartiesExecutor } from "./record-distinct-counterparties.executor.ts";

const { counterparties } = ledgerSchema;

const NINA = id<"counterparties">("11111111-1111-4111-8111-111111111111");
const MAREK = id<"counterparties">("22222222-2222-4222-8222-222222222222");
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

describe("readDistinctCounterpartyPairs", () => {
  it("is empty when nothing has been recorded distinct", () => {
    expect(readDistinctCounterpartyPairs(stores.ledger.replica.db)).toEqual([]);
  });

  it("carries a recorded pair back, so a pair told apart is never asked again", () => {
    // Reversed on purpose — `record_distinct_counterparties` normalises to
    // `a < b` regardless of argument order (NINA's id sorts before MAREK's).
    write(recordDistinctCounterpartiesExecutor, { aId: MAREK, bId: NINA });

    const pairs = readDistinctCounterpartyPairs(stores.ledger.replica.db);

    expect(pairs).toEqual([[NINA, MAREK]]);
  });
});
