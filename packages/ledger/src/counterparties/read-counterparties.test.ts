import { id } from "@waltning/core/id";
import { currencyCode } from "@waltning/core/money";
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

  it("orders by sort, name, then id and omits archived rows by default", () => {
    stores.ledger.replica.db
      .insert(ledgerSchema.currencies)
      .values({ code: currencyCode("EUR"), name: "Placeholder", decimals: 2 })
      .run();
    stores.ledger.replica.db
      .insert(counterparties)
      .values([
        {
          id: BOB,
          name: "Counterparty B",
          nameFolded: "counterparty b",
          sort: 1,
          kind: "person" as const,
          settlementCurrency: currencyCode("EUR"),
          archived: false,
        },
        {
          id: ALICE,
          name: "Counterparty A",
          nameFolded: "counterparty a",
          sort: 0,
          kind: "company" as const,
          settlementCurrency: null,
          archived: false,
        },
        {
          id: ARCHIVED,
          name: "Counterparty C",
          nameFolded: "counterparty c",
          sort: 2,
          kind: "person" as const,
          settlementCurrency: null,
          archived: true,
        },
      ])
      .run();

    const result = readCounterparties(stores.ledger.replica.db);

    expect(result).toEqual([
      {
        id: ALICE,
        name: "Counterparty A",
        kind: "company",
        settlementCurrency: null,
        contact: null,
        note: "",
        archived: false,
        version: 1,
      },
      {
        id: BOB,
        name: "Counterparty B",
        kind: "person",
        settlementCurrency: "EUR",
        contact: null,
        note: "",
        archived: false,
        version: 1,
      },
    ]);
  });

  it("includes archived rows when asked", () => {
    stores.ledger.replica.db
      .insert(counterparties)
      .values([
        { id: ARCHIVED, name: "Counterparty C", nameFolded: "counterparty c", archived: true },
      ])
      .run();

    const result = readCounterparties(stores.ledger.replica.db, { includeArchived: true });

    expect(result.map((row) => row.id)).toEqual([ARCHIVED]);
    expect(result[0]?.archived).toBe(true);
  });
});
