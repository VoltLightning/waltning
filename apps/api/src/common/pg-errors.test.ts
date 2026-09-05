/**
 * Every guard, driven against real Postgres, and asked what code comes back.
 *
 * The guarantees in `0001_database_objects.sql` were already enforced — that
 * was never in question. What was missing is that nothing reading the failure
 * could tell **which** rule refused, because all fifteen raised
 * `check_violation`. So these tests do not check that a write is refused; they
 * check that the refusal is *identifiable*, which is the part §13.4 and
 * `architecture/09` actually depend on.
 *
 * Driven through Drizzle rather than the raw driver on purpose: Drizzle wraps
 * the error and moves the code onto `.cause`, which is the exact reason the
 * first version of this mapping silently never fired.
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "../../../../packages/db/src/test/scratch.ts";
import type { DomainError } from "./errors.ts";
import { GUARDS, SQLSTATE, TRIGGER, toDomainError } from "./pg-errors.ts";

let s: Scratch;

/**
 * Finds our own codes in a function body.
 *
 * `g` flag, so it is stateful — declared once and used inside a loop only
 * because `matchAll` resets `lastIndex` itself. The `WA` prefix is the one
 * place a literal belongs: this is the pattern the constants must *look* like,
 * so writing `SQLSTATE.X` here would make the check circular.
 */
const ERRCODE_WA = /ERRCODE = '(WA\d{3})'/g;

/** Fixture ids, fixed so a failure names something recognisable. */
const ACC_OWN = "11111111-1111-1111-1111-111111111111";
const ACC_SHARED = "22222222-2222-2222-2222-222222222222";
const ACC_PLN = "33333333-3333-3333-3333-333333333333";
const CAT_GROUP = "44444444-4444-4444-4444-444444444444";
const CAT_LEAF = "55555555-5555-5555-5555-555555555555";
const CAT_ARCHIVED = "77777777-7777-7777-7777-777777777777";
const SCHEME = "66666666-6666-6666-6666-666666666666";

beforeAll(async () => {
  s = await scratchDatabase("guards");

  await s.sql`INSERT INTO currencies (code, name, is_pivot) VALUES ('USD', 'US Dollar', true)`;
  await s.sql`INSERT INTO currencies (code, name) VALUES ('PLN', 'Polish Zloty')`;

  await s.sql`
    INSERT INTO accounts (id, name, currency, ownership) VALUES
      (${ACC_OWN}::uuid,    'Bank A', 'USD', 'own'),
      (${ACC_SHARED}::uuid, 'Bank B', 'USD', 'shared'),
      (${ACC_PLN}::uuid,    'Bank C', 'PLN', 'own')`;

  await s.sql`
    INSERT INTO categories (id, name, kind, is_leaf) VALUES
      (${CAT_GROUP}::uuid, 'Group', 'expense', false)`;
  await s.sql`
    INSERT INTO categories (id, name, kind, is_leaf, parent_id) VALUES
      (${CAT_LEAF}::uuid, 'Leaf', 'expense', true, ${CAT_GROUP}::uuid)`;

  await s.sql`INSERT INTO tax_jurisdictions (code, name) VALUES ('PL', 'Placeholder')`;
  await s.sql`
    INSERT INTO tax_schemes (id, jurisdiction, code, version, effective_from)
    VALUES (${SCHEME}::uuid, 'PL', 'ryczalt', '2025', '2025-01-01')`;
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

/**
 * Runs a statement expected to be refused, and reports what the refusal *meant*.
 *
 * Fails loudly if the statement succeeds — a guard that does not fire is the
 * worse outcome of the two, and it would otherwise show up here as a confusing
 * `undefined`.
 */
async function refusal(statement: string): Promise<DomainError> {
  let caught: unknown;
  try {
    await s.db.execute(sql.raw(statement));
  } catch (e) {
    caught = e;
  }

  if (caught === undefined) throw new Error(`the guard did not fire: ${statement}`);

  const domain = toDomainError(caught);
  if (!domain) {
    throw new Error(
      `unmapped Postgres error — the guard fired and nothing understood it: ${String(caught)}`,
    );
  }
  return domain;
}

const txn = (extra: string, cols = "", vals = "") =>
  `INSERT INTO transactions (date, type, account_id, amount_original, currency, fx_rate${cols})
   VALUES ${extra}${vals}`;

describe("the guard that is handled differently", () => {
  /**
   * **The one this whole change is for.** Every other guard maps to
   * `validation`; this one maps to `period_closed`, which `architecture/09`
   * never retries.
   *
   * Before, it arrived as `internal` — a 5xx, which the status table *does*
   * retry. A queued edit into a filed period would have been retried forever,
   * and the period does not reopen on its own.
   */
  it("a closed period refuses with period_closed, not internal", async () => {
    await s.sql`
      INSERT INTO tax_period_locks (jurisdiction, period_start, period_end, scheme_id)
      VALUES ('PL', '2025-01-01', '2025-12-31', ${SCHEME}::uuid)`;

    const error = await refusal(txn(`('2025-06-01', 'expense', '${ACC_OWN}', 10, 'USD', 1)`));

    expect(error.code).toBe("period_closed");
    expect(error.details?.constraint).toBe(TRIGGER.PERIOD_NOT_CLOSED);
    // The message stays human — it names the rule and the date. What changed is
    // that nothing has to *parse* it to classify the failure.
    expect(error.message).toContain("closed tax period");

    await s.sql`DELETE FROM tax_period_locks`;
  });
});

describe("every other guard is identifiable", () => {
  // Each case names the SQLSTATE it expects, so a code moved to the wrong
  // RAISE in the migration fails here rather than mapping quietly to the wrong
  // rule. `code` is `validation` throughout; `constraint` is what differs.

  it("WA002 · exactly one pivot currency", async () => {
    const error = await refusal(`UPDATE currencies SET is_pivot = false WHERE code = 'USD'`);
    expect(error.code).toBe("validation");
    expect(error.details?.constraint).toBe(GUARDS[SQLSTATE.ONE_PIVOT].constraint);
  });

  it("WA003 · a transaction's currency is its account's", async () => {
    const error = await refusal(txn(`('2026-01-01', 'expense', '${ACC_OWN}', 10, 'PLN', 1)`));
    expect(error.details?.constraint).toBe(TRIGGER.CURRENCY_MATCHES_ACCOUNT);
  });

  it("WA004 · a transfer's destination currency is the destination account's", async () => {
    const error = await refusal(
      `INSERT INTO transactions
         (date, type, account_id, amount_original, currency, fx_rate,
          to_account_id, to_amount, to_currency, to_fx_rate)
       VALUES ('2026-01-01', 'transfer', '${ACC_OWN}', 10, 'USD', 1,
               '${ACC_PLN}', 40, 'USD', 1)`,
    );
    expect(error.details?.constraint).toBe(TRIGGER.CURRENCY_MATCHES_ACCOUNT);
  });

  it("WA005 · only leaves are assignable", async () => {
    const error = await refusal(
      `INSERT INTO transactions
         (date, type, account_id, amount_original, currency, fx_rate, category_id)
       VALUES ('2026-01-01', 'expense', '${ACC_OWN}', 10, 'USD', 1, '${CAT_GROUP}')`,
    );
    expect(error.details?.constraint).toBe(TRIGGER.CATEGORY_IS_LEAF);
  });

  it("WA006 · a category with children cannot be a leaf", async () => {
    const error = await refusal(`UPDATE categories SET is_leaf = true WHERE id = '${CAT_GROUP}'`);
    expect(error.details?.constraint).toBe(TRIGGER.CATEGORY_SHAPE);
  });

  it("WA007 · nothing may be a child of a leaf", async () => {
    const error = await refusal(
      `INSERT INTO categories (name, kind, is_leaf, parent_id)
       VALUES ('Under a leaf', 'expense', true, '${CAT_LEAF}')`,
    );
    expect(error.details?.constraint).toBe(TRIGGER.CATEGORY_SHAPE);
  });

  it("WA008 · a category holding transactions cannot become a group", async () => {
    await s.sql`
      INSERT INTO transactions (date, type, account_id, amount_original, currency, fx_rate, category_id)
      VALUES ('2026-01-01', 'expense', ${ACC_OWN}::uuid, 10, 'USD', 1, ${CAT_LEAF}::uuid)`;

    const error = await refusal(`UPDATE categories SET is_leaf = false WHERE id = '${CAT_LEAF}'`);
    expect(error.details?.constraint).toBe(TRIGGER.CATEGORY_SHAPE);

    await s.sql`DELETE FROM transactions`;
  });

  it("WA009 · a child shares its parent's kind", async () => {
    const error = await refusal(
      `INSERT INTO categories (name, kind, is_leaf, parent_id)
       VALUES ('Wrong kind', 'income', true, '${CAT_GROUP}')`,
    );
    expect(error.details?.constraint).toBe(TRIGGER.CATEGORY_SHAPE);
  });

  it("WA010 · changing a parent's kind revalidates its children", async () => {
    const error = await refusal(`UPDATE categories SET kind = 'income' WHERE id = '${CAT_GROUP}'`);
    expect(error.details?.constraint).toBe(TRIGGER.CHILDREN_KIND);
  });

  it("WA011 · business money is never in a shared account", async () => {
    const error = await refusal(
      `INSERT INTO transactions
         (date, type, account_id, amount_original, currency, fx_rate, is_business)
       VALUES ('2026-01-01', 'expense', '${ACC_SHARED}', 10, 'USD', 1, true)`,
    );
    expect(error.details?.constraint).toBe(TRIGGER.BUSINESS_NOT_SHARED);
  });

  it("WA012 · business money never moves into a shared account", async () => {
    const error = await refusal(
      `INSERT INTO transactions
         (date, type, account_id, amount_original, currency, fx_rate, is_business,
          to_account_id, to_amount, to_currency, to_fx_rate)
       VALUES ('2026-01-01', 'transfer', '${ACC_OWN}', 10, 'USD', 1, true,
               '${ACC_SHARED}', 10, 'USD', 1)`,
    );
    expect(error.details?.constraint).toBe(TRIGGER.BUSINESS_NOT_SHARED_TARGET);
  });

  it("WA013 · an account's currency cannot change under its transactions", async () => {
    await s.sql`
      INSERT INTO transactions (date, type, account_id, amount_original, currency, fx_rate)
      VALUES ('2026-01-01', 'expense', ${ACC_OWN}::uuid, 10, 'USD', 1)`;

    const error = await refusal(`UPDATE accounts SET currency = 'PLN' WHERE id = '${ACC_OWN}'`);
    expect(error.details?.constraint).toBe(TRIGGER.ACCOUNT_CHANGE_SAFE);
  });

  it("WA014 · an account holding business rows cannot become shared", async () => {
    await s.sql`
      INSERT INTO transactions (date, type, account_id, amount_original, currency, fx_rate, is_business)
      VALUES ('2026-01-01', 'expense', ${ACC_OWN}::uuid, 10, 'USD', 1, true)`;

    const error = await refusal(`UPDATE accounts SET ownership = 'shared' WHERE id = '${ACC_OWN}'`);
    expect(error.details?.constraint).toBe(TRIGGER.ACCOUNT_CHANGE_SAFE);

    await s.sql`DELETE FROM transactions`;
  });

  /** H2 — `0011_transaction_scale_and_category_kind.sql`. PLN holds two decimal places. */
  it("WA016 · an amount holds more decimals than its own currency", async () => {
    const error = await refusal(
      `INSERT INTO transactions (date, type, account_id, amount_original, currency, fx_rate)
       VALUES ('2026-01-01', 'expense', '${ACC_PLN}', 10.125, 'PLN', 1)`,
    );
    expect(error.details?.constraint).toBe(TRIGGER.AMOUNT_SCALE);
    // M3 — the column rides the envelope too, so a client can route the
    // refusal to the right field without parsing the message.
    expect(error.details?.column).toBe("amount_original");
  });

  /**
   * M3 — the concrete bug: WA016 is shared by several triggers, and the map
   * used to hard-wire every one of them to `TRIGGER.AMOUNT_SCALE`
   * (`transactions_amount_scale_matches_currency`) regardless of which
   * table actually refused. `debt_reassignments_amount_scale_matches_currency`
   * is a different trigger on a different table; it must report itself.
   */
  it("WA016 · a debt reassignment's own trigger reports its own name, not transactions'", async () => {
    await s.sql`INSERT INTO counterparties (name, kind) VALUES ('Placeholder Nina', 'person')`;
    await s.sql`INSERT INTO counterparties (name, kind) VALUES ('Placeholder Marek', 'person')`;
    const [nina] = await s.sql<{ id: string }[]>`
      SELECT id FROM counterparties WHERE name = 'Placeholder Nina'`;
    const [marek] = await s.sql<{ id: string }[]>`
      SELECT id FROM counterparties WHERE name = 'Placeholder Marek'`;

    const error = await refusal(
      `INSERT INTO debt_reassignments (date, from_counterparty_id, to_counterparty_id, currency, amount)
       VALUES ('2026-01-01', '${nina?.id}', '${marek?.id}', 'PLN', 10.125)`,
    );
    expect(error.details?.constraint).not.toBe(TRIGGER.AMOUNT_SCALE);
    expect(error.details?.constraint).toBe("debt_reassignments_amount_scale_matches_currency");
    expect(error.details?.column).toBe("amount");
  });

  /** C1 — `0011_transaction_scale_and_category_kind.sql`. Lowering under a row that would no longer fit. */
  it("WA018 · a currency's own decimals cannot be lowered under an existing row", async () => {
    await s.sql`INSERT INTO currencies (code, name, decimals) VALUES ('XAA', 'Placeholder', 8)`;
    await s.sql`
      INSERT INTO accounts (name, currency, ownership) VALUES ('Placeholder XAA', 'XAA', 'own')`;
    const [account] = await s.sql<{ id: string }[]>`
      SELECT id FROM accounts WHERE name = 'Placeholder XAA'`;
    if (!account) throw new Error("fixture insert did not return a row");
    await s.sql`
      INSERT INTO transactions (date, type, account_id, amount_original, currency, fx_rate)
      VALUES ('2026-01-01', 'expense', ${account.id}::uuid, 48.90512340, 'XAA', 1)`;

    const error = await refusal(`UPDATE currencies SET decimals = 2 WHERE code = 'XAA'`);
    expect(error.details?.constraint).toBe(TRIGGER.CURRENCY_DECIMALS_SAFE);
    expect(error.code).toBe("validation");
  });

  /** H1-b — `0011_transaction_scale_and_category_kind.sql`. `CAT_LEAF` is `expense`. */
  it("WA017 · a category's own kind disagrees with the transaction's type", async () => {
    const error = await refusal(
      `INSERT INTO transactions (date, type, account_id, amount_original, currency, fx_rate, category_id)
       VALUES ('2026-01-01', 'income', '${ACC_OWN}', 10, 'USD', 1, '${CAT_LEAF}')`,
    );
    expect(error.details?.constraint).toBe(TRIGGER.CATEGORY_KIND_MATCHES_TYPE);
  });

  /**
   * H1a — `0001_database_objects.sql`. Broken once, here: an archived leaf is
   * one no picker offers and no chip can name, so a row pointing at one is
   * invisible in the composer that wrote it. D2's payee memory is what reached
   * for it (history remembers a leaf across its archiving), and this is the
   * guard that holds when the two client refusals above it do not.
   */
  it("WA019 · an archived category is not assignable", async () => {
    await s.sql`
      INSERT INTO categories (id, name, kind, is_leaf, parent_id, archived) VALUES
        (${CAT_ARCHIVED}::uuid, 'Retired', 'expense', true, ${CAT_GROUP}::uuid, true)`;

    const error = await refusal(
      `INSERT INTO transactions (date, type, account_id, amount_original, currency, fx_rate, category_id)
       VALUES ('2026-01-01', 'expense', '${ACC_OWN}', 10, 'USD', 1, '${CAT_ARCHIVED}')`,
    );
    expect(error.code).toBe("validation");
    expect(error.details?.constraint).toBe(TRIGGER.CATEGORY_NOT_ARCHIVED);
  });

  /**
   * L7 — the *other* WA019 raiser, and the reason the raise names its own
   * constraint. `transaction_lines` shares `assert_category_not_archived`
   * with `transactions`; before the `CONSTRAINT = TG_TABLE_NAME || …` on the
   * raise, both refusals reached the client carrying no constraint at all and
   * fell back to the map's `transactions_…` default, so a client could not
   * tell a split line's refusal from its parent's — which is exactly the
   * figure it would have to point at to be fixed.
   */
  it("WA019 · a split line's own archived category is a distinguishable refusal", async () => {
    const txn = "88888888-8888-8888-8888-888888888888";
    // Idempotent: the transactions case above inserts the same fixture, and a
    // test that only passes in file order is not a test of anything.
    await s.sql`
      INSERT INTO categories (id, name, kind, is_leaf, parent_id, archived) VALUES
        (${CAT_ARCHIVED}::uuid, 'Retired', 'expense', true, ${CAT_GROUP}::uuid, true)
      ON CONFLICT (id) DO NOTHING`;
    await s.sql`
      INSERT INTO transactions (id, date, type, account_id, amount_original, currency, fx_rate)
      VALUES (${txn}::uuid, '2026-01-01', 'expense', ${ACC_OWN}::uuid, 10, 'USD', 1)`;

    const error = await refusal(
      `INSERT INTO transaction_lines (transaction_id, description, amount, category_id)
       VALUES ('${txn}', 'coffee', 10, '${CAT_ARCHIVED}')`,
    );
    expect(error.code).toBe("validation");
    expect(error.details?.constraint).toBe(TRIGGER.LINES_CATEGORY_NOT_ARCHIVED);
    expect(error.details?.column).toBe("category_id");
    // The two names differ — that is the whole point of naming them.
    expect(TRIGGER.LINES_CATEGORY_NOT_ARCHIVED).not.toBe(TRIGGER.CATEGORY_NOT_ARCHIVED);

    await s.sql`DELETE FROM transactions WHERE id = ${txn}::uuid`;
  });

  /**
   * And the archiving itself stays legal — the rows a category already holds
   * are history, and archiving rather than deleting is what keeps them
   * readable. A guard that refused this would make a category with any
   * transaction on it permanently un-retireable.
   */
  it("WA019 · archiving a category that already holds rows is still allowed", async () => {
    await s.sql`
      INSERT INTO transactions (date, type, account_id, amount_original, currency, fx_rate, category_id)
      VALUES ('2026-01-01', 'expense', ${ACC_OWN}::uuid, 10, 'USD', 1, ${CAT_LEAF}::uuid)`;

    await s.sql`UPDATE categories SET archived = true WHERE id = ${CAT_LEAF}::uuid`;

    await s.sql`DELETE FROM transactions`;
    await s.sql`UPDATE categories SET archived = false WHERE id = ${CAT_LEAF}::uuid`;
  });

  /**
   * `DESK4` — the below-bound `dashboard_layouts_one_active` cannot state.
   * The seed migration leaves exactly one active layout, so clearing it is
   * the shape a real `set_active_layout` bug would take: the index is
   * perfectly happy with zero, and `S01` would render an empty grid.
   */
  it("WA020 · exactly one dashboard layout is active", async () => {
    const error = await refusal(`UPDATE dashboard_layouts SET is_active = false`);
    expect(error.code).toBe("validation");
    expect(error.details?.constraint).toBe(GUARDS[SQLSTATE.ONE_ACTIVE_LAYOUT].constraint);
  });
});

describe("Postgres's own refusals", () => {
  /**
   * R2 H2 — `name_folded` is `GENERATED ALWAYS AS (…) STORED` now, never
   * supplied by an insert (Postgres refuses a value for a generated column
   * outright). Naming only `name` here is the point: the raw, un-normalised
   * spelling is what a caller actually has, and the index must still catch
   * it without anything computing the fold on this test's behalf.
   *
   * R3 M1 — differs by case alone, not whitespace too: an untrimmed `name`
   * is now refused by `counterparties_name_trimmed` before it ever reaches
   * this index (see `counterparty-name-folded-parity.test.ts`), so a padded
   * second insert here would hit that CHECK instead of the one this test is
   * actually about.
   */
  it("maps a unique violation and names the index", async () => {
    await s.sql`INSERT INTO counterparties (name, kind) VALUES ('Placeholder One', 'person')`;

    const error = await refusal(
      `INSERT INTO counterparties (name, kind) VALUES ('PLACEHOLDER ONE', 'person')`,
    );
    expect(error.code).toBe("validation");
    // The normalized-name index, which is the one that actually holds.
    expect(error.details?.constraint).toBe("counterparties_name_uq");
  });

  it("leaves an error it does not recognise alone", async () => {
    // `undefined`, not a manufactured `internal`: the caller re-throws the
    // original, keeping the stack and the driver's detail for the log. Claiming
    // to understand a failure we do not is how a real bug gets a tidy label.
    let caught: unknown;
    try {
      await s.db.execute(sql.raw(`SELECT * FROM a_table_that_does_not_exist`));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(toDomainError(caught)).toBeUndefined();
  });
});

describe("the map and the migration agree", () => {
  it("has an entry for every code the migration raises, and no others", async () => {
    // Read from the database rather than the file: this is what actually ran.
    const rows = await s.sql<{ src: string }[]>`
      SELECT prosrc AS src FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace AND prosrc LIKE '%ERRCODE%'`;

    const raised = new Set<string>();
    for (const row of rows) {
      for (const m of row.src.matchAll(ERRCODE_WA)) {
        if (m[1]) raised.add(m[1]);
      }
    }

    // Compared against the constants, not against `GUARDS`' keys — the two are
    // the same set by construction, and comparing a map to its own keys would
    // prove nothing. `SQLSTATE` is the declaration; this asks Postgres.
    expect([...raised].sort(), "codes raised by the installed functions").toEqual(
      Object.values(SQLSTATE).sort(),
    );
  });

  it("raises nothing as a bare check_violation any more", async () => {
    // The state this replaces: fifteen guarantees, one code, and nothing able
    // to tell them apart.
    const rows = await s.sql<{ name: string }[]>`
      SELECT proname AS name FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND prosrc LIKE '%check_violation%'`;
    expect(rows.map((r) => r.name)).toEqual([]);
  });
});
