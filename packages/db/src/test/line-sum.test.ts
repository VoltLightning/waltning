/**
 * A split adds up to what it splits.
 *
 * **The bug this closes.** `transaction_lines` is a split of one transaction,
 * and nothing required the parts to sum to the whole. A 100.00 grocery row
 * could carry lines of 30.00 and 40.00, and then two views of the same money
 * disagreed by 30.00 with neither looking wrong on its own: the account balance
 * reads `amount_original` and stayed right, while every per-category figure
 * derived from lines was quietly short. That is the shape `SPEC.md` §6.5 exists
 * to rule out — a guarantee stated in prose and enforced nowhere.
 *
 * **Why deferred.** The invariant cannot be true statement-by-statement.
 * Replacing a two-line split with a three-line one is legal and passes through
 * states where the sum is wrong, so an immediate trigger would refuse correct
 * edits. `currencies_exactly_one_pivot` is deferred for the same reason and is
 * the precedent this follows.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "./scratch.ts";

let s: Scratch;

const ACCOUNT = "11111111-1111-1111-1111-111111111111";

beforeAll(async () => {
  s = await scratchDatabase("linesum");
  // Placeholder data only — an invented bank in an invented currency.
  await s.sql.unsafe(`
    INSERT INTO currencies (code, name, is_pivot) VALUES ('PLN', 'Zloty', true);
    INSERT INTO accounts (id, name, kind, currency, ownership)
      VALUES ('${ACCOUNT}', 'Bank A · PLN', 'bank', 'PLN', 'own');`);
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

let n = 0;
/** A fresh 100.00 transaction, so no test depends on another's leftovers. */
async function transaction(amount = "100.00"): Promise<string> {
  const id = `22222222-2222-2222-2222-${String(++n).padStart(12, "0")}`;
  await s.sql.unsafe(`
    INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate)
    VALUES ('${id}', '${ACCOUNT}', '2026-01-01', 'expense', ${amount}, 'PLN', 0.25)`);
  return id;
}

/** The SQLSTATE, if the statement was refused by one of ours. */
async function refusal(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error: unknown) {
    // The driver's error carries the code; `catch` gives no choice about the
    // binding's type, which is one of the few legitimate uses of `unknown`.
    return (error as { code?: string }).code ?? "unknown";
  }
}

describe("split lines sum to their parent", () => {
  it("refuses a split that does not add up", async () => {
    const txn = await transaction();

    const code = await refusal(() =>
      s.sql.begin(async (tx) => {
        await tx.unsafe(`
          INSERT INTO transaction_lines (transaction_id, description, amount)
          VALUES ('${txn}', 'a', 30.00), ('${txn}', 'b', 40.00)`);
      }),
    );

    expect(code, "30 + 40 against a 100.00 parent must be refused").toBe("WA015");
  });

  it("admits a split that does", async () => {
    const txn = await transaction();

    const code = await refusal(() =>
      s.sql.begin(async (tx) => {
        await tx.unsafe(`
          INSERT INTO transaction_lines (transaction_id, description, amount)
          VALUES ('${txn}', 'a', 30.00), ('${txn}', 'b', 70.00)`);
      }),
    );

    expect(code).toBeNull();
  });

  /**
   * **The proof that it is deferred rather than merely lenient.**
   *
   * Inside the transaction the sum is 30.00 against a 100.00 parent — plainly
   * wrong — and the statement is accepted anyway. The refusal arrives at
   * COMMIT. An immediate trigger would fail on the first line of every
   * multi-line split, which is why this distinction is worth a test of its own.
   */
  it("passes through a wrong intermediate state and refuses at commit", async () => {
    const txn = await transaction();
    let insertSucceeded = false;

    const code = await refusal(() =>
      s.sql.begin(async (tx) => {
        await tx.unsafe(`
          INSERT INTO transaction_lines (transaction_id, description, amount)
          VALUES ('${txn}', 'only', 30.00)`);
        insertSucceeded = true;
      }),
    );

    expect(insertSucceeded, "the statement itself must not be refused").toBe(true);
    expect(code, "the commit must be").toBe("WA015");
  });

  /**
   * No lines is not a violation. A split is optional — most transactions have
   * none — and deleting the last line un-splits the transaction rather than
   * corrupting it. An invariant written as `sum(lines) = amount` without this
   * case would make every unsplit row in the ledger illegal.
   */
  it("allows a transaction with no lines at all", async () => {
    const txn = await transaction();

    const code = await refusal(() =>
      s.sql.begin(async (tx) => {
        await tx.unsafe(`
          INSERT INTO transaction_lines (transaction_id, description, amount)
          VALUES ('${txn}', 'a', 100.00)`);
        await tx.unsafe(`DELETE FROM transaction_lines WHERE transaction_id = '${txn}'`);
      }),
    );

    expect(code).toBeNull();
  });

  /**
   * The parent going away takes its lines with it via ON DELETE CASCADE, and
   * the deferred check then runs against a transaction that no longer exists.
   * Read naively — "the lines sum to 100 and the parent is NULL" — that is a
   * violation, and deleting any split transaction would become impossible.
   */
  it("allows deleting a split transaction outright", async () => {
    const txn = await transaction();
    await s.sql.begin(async (tx) => {
      await tx.unsafe(`
        INSERT INTO transaction_lines (transaction_id, description, amount)
        VALUES ('${txn}', 'a', 100.00)`);
    });

    const code = await refusal(() =>
      s.sql.begin(async (tx) => {
        await tx.unsafe(`DELETE FROM transactions WHERE id = '${txn}'`);
      }),
    );

    expect(code).toBeNull();
  });

  /**
   * The same invariant broken from the other side. Editing the parent's amount
   * is the likelier mistake in practice — a correction typed on the transaction
   * while a split nobody remembered sits underneath it.
   */
  it("refuses moving the parent's amount away from its lines", async () => {
    const txn = await transaction();
    await s.sql.begin(async (tx) => {
      await tx.unsafe(`
        INSERT INTO transaction_lines (transaction_id, description, amount)
        VALUES ('${txn}', 'a', 60.00), ('${txn}', 'b', 40.00)`);
    });

    const code = await refusal(() =>
      s.sql.begin(async (tx) => {
        await tx.unsafe(`UPDATE transactions SET amount_original = 90.00 WHERE id = '${txn}'`);
      }),
    );

    expect(code).toBe("WA015");
  });

  /**
   * **A defect found by attacking this migration, not by writing it.**
   *
   * The trigger read `COALESCE(NEW.transaction_id, OLD.transaction_id)`, which
   * is right for an INSERT and a DELETE and quietly wrong for the UPDATE that
   * moves a line between parents: only the *new* parent was re-checked. So a
   * 40.00 line moved off a 100.00 split onto a transaction that could absorb it
   * left the original summing to 60.00 against a 100.00 parent — accepted,
   * silent, and exactly the disagreement this whole invariant exists to stop.
   *
   * The obvious first attempt at this test does not find it. Moving the line
   * onto a parent that *cannot* absorb it is refused for the wrong reason —
   * the new parent goes over — and reads as a pass. The destination has to end
   * up valid for the source's shortfall to be the only thing wrong.
   */
  it("refuses moving a line even when the destination ends up valid", async () => {
    const from = await transaction("100.00"); // will be split 60 + 40
    const to = await transaction("40.00"); // unsplit, and exactly the moved amount

    let moved = "";
    await s.sql.begin(async (tx) => {
      const [row] = await tx.unsafe<{ id: string }[]>(`
        INSERT INTO transaction_lines (transaction_id, description, amount)
        VALUES ('${from}', 'a', 60.00), ('${from}', 'b', 40.00)
        RETURNING id`);
      // The 40.00 line, whichever id it got.
      const [forty] = await tx.unsafe<{ id: string }[]>(`
        SELECT id FROM transaction_lines
        WHERE transaction_id = '${from}' AND amount = 40.00`);
      moved = String(forty?.id ?? row?.id);
    });

    const code = await refusal(() =>
      s.sql.begin(async (tx) => {
        await tx.unsafe(`
          UPDATE transaction_lines SET transaction_id = '${to}' WHERE id = '${moved}'`);
      }),
    );

    expect(code, "the source parent is left short by 40.00").toBe("WA015");

    const [left] = await s.sql<{ total: string }[]>`
      SELECT COALESCE(sum(amount), 0)::text AS total
      FROM transaction_lines WHERE transaction_id = ${from}`;
    expect(left?.total, "and the move must not have landed").toBe("100.00000000");
  });

  /**
   * **Deferred to COMMIT means a split must be written inside one transaction.**
   *
   * Under autocommit every statement is its own transaction, so a caller
   * inserting the lines of a split one at a time is refused on the first one.
   * That is correct — 30.00 against a 100.00 parent really is wrong at that
   * commit — and it is the kind of correct that reads as a bug to whoever hits
   * it. Pinned so the constraint is a documented property rather than a
   * surprise, and so a service that forgets to wrap a split has a test naming
   * the reason.
   */
  it("refuses a split written one autocommitted statement at a time", async () => {
    const txn = await transaction();

    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO transaction_lines (transaction_id, description, amount)
        VALUES ('${txn}', 'first of two', 30.00)`),
    );

    expect(code).toBe("WA015");
  });

  /**
   * **Broken once, to prove the trigger is what holds it.**
   *
   * Every test above would pass unchanged against a database where the split
   * simply happened to be written correctly. Removing the constraint and
   * watching the bad split land is what distinguishes an enforced invariant
   * from a well-behaved test fixture.
   */
  it("admits the bad split once the constraint is dropped", async () => {
    const bad = await scratchDatabase("linesum_broken");
    try {
      await bad.sql.unsafe(`
        INSERT INTO currencies (code, name, is_pivot) VALUES ('PLN', 'Zloty', true);
        INSERT INTO accounts (id, name, kind, currency, ownership)
          VALUES ('${ACCOUNT}', 'Bank A · PLN', 'bank', 'PLN', 'own');
        INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate)
          VALUES ('${ACCOUNT}', '${ACCOUNT}', '2026-01-01', 'expense', 100.00, 'PLN', 0.25);
        DROP TRIGGER transaction_lines_sum_matches ON transaction_lines;`);

      const code = await refusal(() =>
        bad.sql.begin(async (tx) => {
          await tx.unsafe(`
            INSERT INTO transaction_lines (transaction_id, description, amount)
            VALUES ('${ACCOUNT}', 'a', 30.00), ('${ACCOUNT}', 'b', 40.00)`);
        }),
      );

      expect(code, "without the trigger the ledger accepts a 30 short split").toBeNull();
    } finally {
      await bad.drop();
    }
  });
});
