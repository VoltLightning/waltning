import { id } from "@waltning/core/id";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { type ScratchStores, scratchStores } from "../test/stores.ts";
import { readCounterparties } from "./read-counterparties.ts";

const { counterparties } = ledgerSchema;

const ALICE = id<"counterparties">("11111111-1111-4111-8111-111111111111");
const BOB = id<"counterparties">("22222222-2222-4222-8222-222222222222");
const ARCHIVED = id<"counterparties">("33333333-3333-4333-8333-333333333333");

let stores: ScratchStores;

beforeEach(() => {
  stores = scratchStores();
});

afterEach(() => stores.close());

describe("readCounterparties", () => {
  it("returns nothing against an empty table", () => {
    expect(readCounterparties(stores.ledger.replica.db)).toEqual([]);
  });

  it("orders by sort, name, then id and omits archived rows", () => {
    stores.ledger.replica.db
      .insert(counterparties)
      .values([
        { id: BOB, name: "Counterparty B", sort: 1 },
        { id: ALICE, name: "Counterparty A", sort: 0 },
        { id: ARCHIVED, name: "Counterparty C", archived: true, sort: 2 },
      ])
      .run();

    const result = readCounterparties(stores.ledger.replica.db);

    expect(result).toEqual([
      { id: ALICE, name: "Counterparty A" },
      { id: BOB, name: "Counterparty B" },
    ]);
  });
});
