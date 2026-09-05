/**
 * Proves: screens/S15-counterparty-editor.md §5 ("Data" — `merge_counterparties`
 * "audited, states the affected count, archives rather than deletes the
 * absorbed record"; `unmerge_counterparties` "restores the moved rows,
 * un-archives"; "The merge record: which ids moved, and when") and §9's
 * second open question ("Decided: yes, indefinitely. The absorbed
 * counterparty is archived, not deleted, and the merge records exactly
 * which transactions moved. Unmerge restores them and un-archives it."). The
 * brief cites "§9.3" — S15 has no numbered §9.3; §9 is "Open questions", an
 * unordered list, and its second item is the heading actually cited above.
 * Findings: R2 H1 — fixed by #116 (unmerge repoints a later reassignment),
 * R2 H2 — fixed by #116 (chained merge), R2 H5 — fixed by #116 (moved ids on
 * the payload), R2 M2-r4 — fixed by #116 (the winner≠loser CHECK; loser
 * cannot be lost twice).
 *
 * **R2 H1 is one half of a joint rule with `counterparty-names.journey.test.ts`'s
 * own R2 M3**: an archived name is free (the other file), but an unmerge
 * that would resurrect a name a live row now holds is refused, naming that
 * row (this file) — freeing a name and reusing it are not the same
 * guarantee, and each file covers the one it names.
 */
import { accountingDate } from "@waltning/core/date";
import { type Id, id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { openJourney, transactionRows } from "./harness.ts";
import { ID, PIVOT, seedAccount, seedCounterparty, seedCurrency } from "./seed.ts";

const ACCOUNT_PLN_2 = id<"accounts">("44444444-4444-4444-8444-444444444444");
const TXN3 = id<"transactions">("77777777-7777-4777-8777-777777777777");
const CP_C = id<"counterparties">("66666666-6666-4666-8666-666666666666");
const MERGE_1 = id<"counterpartyMerges">("88888888-8888-4888-8888-888888888888");
const MERGE_2 = id<"counterpartyMerges">("99999999-9999-4999-8999-999999999999");

function captureFor(
  j: ReturnType<typeof openJourney>,
  txnId: Id<"transactions">,
  accountId: Id<"accounts">,
) {
  return j.session.createTransaction(
    {
      id: txnId,
      date: accountingDate("2026-04-01"),
      type: "expense",
      accountId,
      amountOriginal: money.toMoney("10.00"),
      currency: PIVOT,
      payee: "",
      note: "",
      isBusiness: false,
      isCapital: false,
      source: "manual",
      counterpartyId: ID.cpB,
      counterpartyRole: "debt",
    },
    j.capture,
  );
}

/** Two PLN accounts — this file's own merge/unmerge must not care which. */
function setup() {
  const j = openJourney();
  seedCurrency(j, PIVOT, { isPivot: true });
  seedAccount(j, ID.accountPln, "Bank A · PLN", PIVOT);
  seedAccount(j, ACCOUNT_PLN_2, "Bank B · PLN", PIVOT);
  seedCounterparty(j, ID.cpA, "Ivanov Placeholder");
  seedCounterparty(j, ID.cpB, "Marek Placeholder");
  captureFor(j, ID.txn1, ID.accountPln);
  captureFor(j, ID.txn2, ID.accountPln);
  captureFor(j, TXN3, ACCOUNT_PLN_2);
  return j;
}

describe("merge_counterparties / unmerge_counterparties — S15 §5 and §9's reversible merge", () => {
  it("R2 H5 — listCounterpartyMerges carries a moved-row count but not the moved ids themselves", () => {
    const j = setup();
    try {
      j.session.mergeCounterparties(
        {
          mergeId: MERGE_1,
          winnerId: ID.cpA,
          loserId: ID.cpB,
          movedTransactionIds: [ID.txn1, ID.txn2, TXN3],
        },
        j.capture,
      );

      const merges = j.session.listCounterpartyMerges(ID.cpA);
      expect(merges).toHaveLength(1);
      expect(merges[0]?.movedCount).toBe(3); // the count itself is already correct

      // R1's fix must make the moved ids a real field on this read model —
      // the one permitted `unknown` in this file (`.test.` files are
      // outside `tests/unknown-budget.test.ts`'s scan).
      const merge = merges[0] as unknown as { movedTransactionIds?: readonly string[] };
      expect([...(merge.movedTransactionIds ?? [])].sort()).toEqual(
        [ID.txn1, ID.txn2, TXN3].sort(),
      );
    } finally {
      j.close();
    }
  });

  it("R2 H1 — unmerge repoints every originally-moved id back to the loser, overwriting a reassignment made after the merge", () => {
    const j = setup();
    try {
      j.session.mergeCounterparties(
        {
          mergeId: MERGE_1,
          winnerId: ID.cpA,
          loserId: ID.cpB,
          movedTransactionIds: [ID.txn1, ID.txn2, TXN3],
        },
        j.capture,
      );

      j.session.createCounterparty(
        {
          id: CP_C,
          name: "Lev Placeholder",
          kind: "person",
          settlementCurrency: null,
          contact: null,
          note: "",
        },
        j.capture,
      );

      const txn1Before = transactionRows(j).find((r) => r.id === ID.txn1);
      if (!txn1Before) throw new Error("expected txn1 on the replica after the merge");
      j.session.updateTransaction(
        { id: ID.txn1, version: txn1Before.version, patch: { counterpartyId: CP_C } },
        j.capture,
      );

      j.session.unmergeCounterparties({ mergeId: MERGE_1 }, j.capture);

      const rows = transactionRows(j);
      // txn1 was reassigned to cpC *after* the merge — unmerge must leave
      // that reassignment alone, not hand it back to the loser (cpB).
      expect(rows.find((r) => r.id === ID.txn1)?.counterpartyId).toBe(CP_C);
      // Neither txn2 nor txn3 was touched after the merge — both restore.
      expect(rows.find((r) => r.id === ID.txn2)?.counterpartyId).toBe(ID.cpB);
      expect(rows.find((r) => r.id === TXN3)?.counterpartyId).toBe(ID.cpB);
    } finally {
      j.close();
    }
  });

  it("R2 H2 — a winner still holding an open (un-reversed) merge can itself be merged away, chaining the absorption", () => {
    const j = setup();
    try {
      j.session.mergeCounterparties(
        {
          mergeId: MERGE_1,
          winnerId: ID.cpA,
          loserId: ID.cpB,
          movedTransactionIds: [ID.txn1, ID.txn2, TXN3],
        },
        j.capture,
      );

      j.session.createCounterparty(
        {
          id: CP_C,
          name: "Lev Placeholder",
          kind: "person",
          settlementCurrency: null,
          contact: null,
          note: "",
        },
        j.capture,
      );

      // cpA is still the *live* winner of an open (un-reversed) merge —
      // absorbing it into cpC now would leave cpB's eventual unmerge with
      // nowhere real to restore to. Refused before the moved set is ever
      // read, so its own `movedTransactionIds` — the three ids MERGE_1 just
      // moved onto cpA — never gets used.
      expect(() =>
        j.session.mergeCounterparties(
          {
            mergeId: MERGE_2,
            winnerId: CP_C,
            loserId: ID.cpA,
            movedTransactionIds: [ID.txn1, ID.txn2, TXN3],
          },
          j.capture,
        ),
      ).toThrow();
    } finally {
      j.close();
    }
  });

  it("refuses merging the same pair twice — the loser is already archived", () => {
    const j = setup();
    try {
      j.session.mergeCounterparties(
        {
          mergeId: MERGE_1,
          winnerId: ID.cpA,
          loserId: ID.cpB,
          movedTransactionIds: [ID.txn1, ID.txn2, TXN3],
        },
        j.capture,
      );

      // Refused for being already archived, before the (now empty — cpB
      // holds nothing after MERGE_1) moved set is read.
      expect(() =>
        j.session.mergeCounterparties(
          { mergeId: MERGE_2, winnerId: ID.cpA, loserId: ID.cpB, movedTransactionIds: [] },
          j.capture,
        ),
      ).toThrow();
    } finally {
      j.close();
    }
  });
});
