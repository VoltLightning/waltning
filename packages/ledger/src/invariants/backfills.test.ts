/**
 * Proves: architecture/08 §"Surviving an app update" (item 1 — each generated
 * migration file is one version, run in place, with the hand-written backfill
 * a schema step cannot express running straight after it) and
 * architecture/14 §14.6 ("A migration must not be able to destroy the
 * ledger").
 * Findings: R3 C1-r4, R3 H1-r4, R3 M3-r4.
 *
 * **The class of defect this file exists for is a hook that does not run.**
 * A backfill is registered under a generated file's tag — `"0006_schema"` —
 * and that string is the only thing binding the two together. Rename the
 * file, renumber the chain, drop a step, and the hook is still there,
 * exported, tested in isolation, passing, and never once executed against a
 * real database. Nothing in the type system says otherwise: a record with a
 * key nothing looks up is a well-typed record.
 *
 * So the three properties below are stated from the outside, against the
 * generated `REPLICA_STEPS` / `OUTBOX_STEPS` and a real SQLite file:
 *
 * 1. **Every key names a real step**, and the chain refuses to be built when
 *    one does not — a fatal error at import, not a silent no-op.
 * 2. **Every filled row holds exactly the value the write path would have
 *    written**, not merely something other than the column's default. "Not
 *    the sentinel" passes on a backfill that fills every row with the same
 *    wrong string; what the index over `name_folded` actually needs is that a
 *    migrated row and the same name captured on the next screen agree, which
 *    is `fold(name.trim())` — `create-counterparty.executor.ts`'s own
 *    expression, trim included, since `fold()` does not trim on its own. A
 *    row still at `''` beside a non-empty `name` is the state
 *    `counterparties_name_uq` would index every such row into one another,
 *    so this is the constraint's precondition, not a nicety.
 * 3. **A hook cannot be registered for a tag that does not exist** — the
 *    other direction of (1), proven by constructing one rather than by
 *    reading the code that would refuse it.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fold } from "@waltning/core/capture/names";
import Database from "better-sqlite3";
import { type SQL, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OUTBOX_STEPS, REPLICA_STEPS } from "../ddl.ts";
import {
  type Backfill,
  type LedgerFs,
  migrateReplica,
  migrationsFromSteps,
  OUTBOX_BACKFILLS,
  REPLICA_BACKFILLS,
  REPLICA_MIGRATIONS,
} from "../migrate.ts";
import { openLedger } from "../open.ts";
import { ledgerSchema as schema } from "../schema-map.ts";

/**
 * Every column a hook fills, with the sentinel it must not leave behind and
 * the column it derives from.
 *
 * A table rather than one hard-coded assertion because the property is about
 * *backfills*, not about `name_folded`: the second one this repository adds
 * gets a row here and inherits the check, which is the only way a rule
 * survives the PR that stops thinking about it.
 */
const FILLED_COLUMNS = [
  {
    tag: "0006_schema",
    table: "counterparties",
    column: "name_folded",
    /** What `ADD COLUMN … NOT NULL DEFAULT ''` leaves on every existing row. */
    sentinel: "",
    /** The column the fill derives from — empty here means there was nothing to derive. */
    source: "name",
    /**
     * What the write path would have written for that source, exactly — the
     * expression `create-counterparty.executor.ts` and
     * `update-counterparty.executor.ts` both use. A backfill that agreed with
     * the sentinel check and disagreed with this would give a migrated row a
     * different value than the same name captured a screen later, and the
     * unique index built over the column is precisely where that surfaces.
     */
    expected: (source: string) => fold(source.trim()),
  },
] as const;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "waltning-backfills-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const noopFs: LedgerFs = {
  exists: () => false,
  copy: () => {},
  remove: () => {},
};

/** One row of the projection below: the source column, and the filled one, both aliased. */
type Row = { source: string | null; filled: string | null };

describe("every backfill names a step that exists", () => {
  it("REPLICA_BACKFILLS", () => {
    const tags = new Set(REPLICA_STEPS.map((step) => step.tag));
    expect(Object.keys(REPLICA_BACKFILLS).length, "vacuity guard").toBeGreaterThan(0);
    for (const key of Object.keys(REPLICA_BACKFILLS)) {
      expect(tags.has(key), `REPLICA_BACKFILLS["${key}"] names no generated replica file`).toBe(
        true,
      );
    }
  });

  it("OUTBOX_BACKFILLS", () => {
    const tags = new Set(OUTBOX_STEPS.map((step) => step.tag));
    for (const key of Object.keys(OUTBOX_BACKFILLS)) {
      expect(tags.has(key), `OUTBOX_BACKFILLS["${key}"] names no generated outbox file`).toBe(true);
    }
  });

  /**
   * And the refusal itself, from the other side: a hook under a tag no file
   * carries stops the chain from being built at all. Without this, (1) above
   * is a test that the current keys happen to be right, not a rule.
   */
  it("refuses to build a chain whose backfill names no step", () => {
    const stranded: Readonly<Record<string, Backfill>> = {
      "9999_renamed_away": { fill: () => {} },
    };
    expect(() => migrationsFromSteps(REPLICA_STEPS, stranded, "replica")).toThrow(
      /names no generated migration file/,
    );
  });

  /**
   * `0009_schema` is exactly this shape: a `check` that refuses a rate its own
   * new `CHECK` cannot accept, and nothing to *derive*, so no `fill`.
   * `0010_schema` is the other shape — an `objects` hook alone, creating all
   * **six** of the replica's hand-written triggers. The hook rather than a
   * `.sql` file because a step's statements are frozen by its checksum once
   * an installed database has run them, so nothing in the chain can
   * re-create a trigger a later rebuild of `transactions` dropped; a hook
   * keyed by step tag can move to whatever step rebuilds it next. Proven two
   * ways — the type accepts a hook with no `fill`, and the real registry
   * carries two — so a future `Backfill` edit that makes `fill` required
   * again fails here first, at compile time, rather than as a mystery type
   * error inside `migrate.ts`.
   */
  it("allows a hook with only a check and no fill", () => {
    const checkOnly: Backfill = { check: () => {} };
    expect(checkOnly.fill).toBeUndefined();
    expect(
      REPLICA_BACKFILLS["0009_schema"]?.fill,
      "0009_schema derives no column value",
    ).toBeUndefined();
    expect(
      REPLICA_BACKFILLS["0010_schema"]?.objects,
      "0010_schema creates all six triggers no migration step can hold",
    ).toBeDefined();
  });
});

describe("every backfill with a fill is proven by a FILLED_COLUMNS row", () => {
  /**
   * The completeness this table's coverage depends on: before `fill` was
   * optional, every key in `REPLICA_BACKFILLS` had one, so "iterate
   * `FILLED_COLUMNS`" and "iterate every backfill" were the same set by
   * construction. `0009_schema` breaks that — it is a real key with no `fill`
   * — so what used to be implicit is asserted directly: a key that *does*
   * carry a `fill` still needs a row here, and a check-only key is skipped
   * rather than silently expected to have one.
   */
  it("names every REPLICA_BACKFILLS key that has a fill, and none that doesn't", () => {
    // `objects` is deliberately not covered by this table — a trigger leaves
    // no column to read back, and what proves one is a test that breaks the
    // guarantee (`src/test/transaction-ops.test.ts`). See `Backfill`'s doc.
    const filledTags = new Set<string>(FILLED_COLUMNS.map((c) => c.tag));
    for (const [tag, backfill] of Object.entries(REPLICA_BACKFILLS)) {
      if (backfill.fill === undefined) continue; // check-only — nothing to fill, nothing to prove here
      expect(filledTags.has(tag), `${tag} has a fill and needs a FILLED_COLUMNS entry`).toBe(true);
    }
  });
});

/**
 * The `objects` hook's own class of defect, and it is not the one
 * `FILLED_COLUMNS` catches. A trigger leaves no column to read back, so
 * "every filled column holds what the write path would have written" says
 * nothing about it — and the failure it is exposed to is the same one this
 * whole file exists for: a hook that is registered, exported, covered by a
 * behavioural test somewhere else, and never actually reached by the chain.
 *
 * So the property is stated from the outside, structurally and generically:
 * run the real chain twice on two fresh stores, once with the hook and once
 * with that one hook removed, and compare `sqlite_master`. A hook that is
 * reached leaves at least one object behind that the same chain without it
 * does not have. It says nothing about *what* the object is — a trigger
 * today, a view tomorrow — which is the point: the next `objects` hook
 * inherits this without a line being added, the same way `FILLED_COLUMNS`
 * was written as a table rather than an assertion about `name_folded`.
 */
describe("every objects hook creates something the chain would not otherwise have", () => {
  /** Every schema object the full chain leaves behind, by name. */
  function objectsAfterChain(label: string, backfills: Readonly<Record<string, Backfill>>) {
    const paths = {
      replica: join(dir, `${label}-replica.db`),
      outbox: join(dir, `${label}-outbox.db`),
    };
    const ledger = openLedger((filename: string) => {
      const sqlite = new Database(filename);
      return { db: drizzle(sqlite, { schema }), close: () => sqlite.close() };
    }, paths);
    migrateReplica(ledger.replica, {
      fs: noopFs,
      migrations: migrationsFromSteps(REPLICA_STEPS, backfills, "replica"),
    });
    const rows = ledger.replica.db.all<{ name: string }>(
      sql.raw(`select "name" from "sqlite_master" where "name" is not null`),
    );
    ledger.close();
    return new Set(rows.map((row) => row.name));
  }

  const tagsWithObjects = Object.entries(REPLICA_BACKFILLS)
    .filter(([, backfill]) => backfill.objects !== undefined)
    .map(([tag]) => ({ tag }));

  it("there is at least one to check", () => {
    expect(tagsWithObjects.length, "vacuity guard").toBeGreaterThan(0);
  });

  /**
   * And it can run against a database that already holds what it creates.
   * This is the hook's own idempotence, owed to nobody's migration history:
   * an `objects` hook is code rather than a hashed statement, so the journal
   * promises nothing about how many times it runs against a given database —
   * it runs whenever its step does. A bare `CREATE TRIGGER` meeting a name
   * already there would abort on the duplicate, roll the step back, and fail
   * identically on every launch after: a migration with no way forward from
   * the phone. `IF NOT EXISTS` removes that mode outright, which is defence
   * in depth and not a repair for any device known to be in that state.
   */
  it.each(tagsWithObjects)("$tag's objects hook is idempotent", ({ tag }) => {
    const paths = {
      replica: join(dir, `${tag}-twice-replica.db`),
      outbox: join(dir, `${tag}-twice-outbox.db`),
    };
    const ledger = openLedger((filename: string) => {
      const sqlite = new Database(filename);
      return { db: drizzle(sqlite, { schema }), close: () => sqlite.close() };
    }, paths);
    migrateReplica(ledger.replica, { fs: noopFs });

    const objects = REPLICA_BACKFILLS[tag]?.objects;
    expect(objects, `${tag} has an objects hook`).toBeDefined();
    // The same two capabilities `migrationsFromSteps` hands it, over a
    // database the chain has already migrated once.
    const runner = {
      all: <T>(query: SQL) => ledger.replica.db.all<T>(query),
      run: (query: SQL) => {
        ledger.replica.db.run(query);
      },
    };
    expect(() => objects?.(runner)).not.toThrow();
    ledger.close();
  });

  it.each(tagsWithObjects)("$tag's objects hook reaches sqlite_master", ({ tag }) => {
    const withHook = objectsAfterChain(`${tag}-with`, REPLICA_BACKFILLS);
    // The same chain with this one hook's `objects` dropped and everything
    // else — its `check`, its `fill` — left exactly as it is, so the
    // difference can only be what the hook creates.
    const { objects: _dropped, ...rest } = REPLICA_BACKFILLS[tag] ?? {};
    const without = objectsAfterChain(`${tag}-without`, { ...REPLICA_BACKFILLS, [tag]: rest });

    const created = [...withHook].filter((name) => !without.has(name));
    expect(created.length, `${tag}'s objects hook created nothing`).toBeGreaterThan(0);
  });

  /**
   * And the same question asked by name, because the generic diff above is
   * a property and this is the guarantee (round 4, and the reason the hook
   * moved off `0009_schema`).
   *
   * SQLite has no `ALTER TABLE … ALTER COLUMN`, so drizzle-kit expresses a
   * column addition on a constrained table as copy-rename-drop — and
   * `DROP TABLE` takes that table's triggers with it. `0010_schema` does
   * exactly that to `transactions`, so an `objects` hook on `0009_schema`
   * created two triggers the very next step deleted, leaving a fresh
   * install at the head with WA017 unenforced on the replica and every test
   * still green: `transaction-ops.test.ts` migrates the whole chain and
   * would have caught it, but only because it happens to write a bad row —
   * nothing said the *object* had to survive.
   *
   * **All six, because there is one home for them.** H1a's four spent one
   * commit at the tail of `0010_schema.sql`, a generated file, where the next
   * `pnpm ledger:generate` or the next rebuild of `transactions` would have
   * removed them just as quietly. Every hand-written replica trigger is
   * created by the `objects` hook on the last step that rebuilds
   * `transactions` now — `0010_schema`, which is no longer the chain's head —
   * so this is the list of every trigger the replica has.
   *
   * Run the real chain to the end, and ask for the six names. After the
   * whole chain, never after the hook's own step, which is precisely the
   * distinction the defect lived in.
   */
  it("every hand-written trigger exists after the whole chain, not merely after its own step", () => {
    const names = objectsAfterChain("triggers-head", REPLICA_BACKFILLS);
    for (const trigger of [
      "transactions_category_kind_matches_type_insert",
      "transactions_category_kind_matches_type_update",
      "transactions_category_not_archived_insert",
      "transactions_category_not_archived_update",
      "transaction_lines_category_not_archived_insert",
      "transaction_lines_category_not_archived_update",
    ]) {
      expect(names.has(trigger), `${trigger} survived the chain`).toBe(true);
    }
  });

  /**
   * And the converse, which is the half that keeps the rule from being
   * re-broken: **no migration step may write a trigger at all** — not the
   * generated `.sql` files, not the hand-written ones
   * (`0001_database_objects.sql`, `0011_dashboard_layout_seed.sql`), which
   * this test does not distinguish between on purpose.
   *
   * A step's statements are frozen by its checksum the moment an installed
   * database has run them, so a trigger written into one can never be
   * re-created from the chain after a later rebuild of its table drops it;
   * and a generated file loses it on the next `pnpm ledger:generate` besides.
   * The test above says the six triggers survive; this one says there is no
   * seventh living somewhere that cannot move.
   */
  it("no migration step creates a trigger — every one of them lives in a hook", () => {
    // Both chains: the checksum argument is the same for the outbox.
    const offenders = [...REPLICA_STEPS, ...OUTBOX_STEPS].flatMap((step) =>
      step.statements
        .filter((statement) => /^\s*CREATE\s+TRIGGER/i.test(statement))
        .map((statement) => `${step.tag}: ${statement.slice(0, 80)}`),
    );
    expect(offenders, "a trigger in a step cannot be moved when its table is rebuilt").toEqual([]);
  });
});

describe("a hook fills every row with the value the write path would have written", () => {
  /**
   * The real chain, run over a database seeded at the version just before the
   * step with the hook — the shape an installed app is in when the update
   * arrives. `migrateReplica` is what runs, not the hook directly: what is
   * under test is that the hook is *reached*.
   */
  it.each(FILLED_COLUMNS)(
    "$tag fills $table.$column exactly, on every row, archived included",
    ({ tag, table, column, sentinel, source, expected }) => {
      const stepIndex = REPLICA_STEPS.findIndex((step) => step.tag === tag);
      expect(stepIndex, `${tag} is a generated replica file`).toBeGreaterThanOrEqual(0);

      const paths = {
        replica: join(dir, `${tag}-replica.db`),
        outbox: join(dir, `${tag}-outbox.db`),
      };
      const ledger = openLedger((filename: string) => {
        const sqlite = new Database(filename);
        return { db: drizzle(sqlite, { schema }), close: () => sqlite.close() };
      }, paths);

      migrateReplica(ledger.replica, {
        fs: noopFs,
        migrations: REPLICA_MIGRATIONS.slice(0, stepIndex),
      });

      // Four names the fill has to get exactly right, not merely move off the
      // sentinel: an ASCII one, one whose fold needs more than SQLite's
      // ASCII-only `lower()`, one in decomposed form, and one carrying
      // surrounding whitespace — `fold()` does not trim, so an untrimmed
      // backfill and the trimmed value the write path stores differ by
      // exactly the spaces, which is invisible to "not the sentinel".
      const when = 1_767_225_600;
      for (const [id, name] of [
        ["cp-a", "Anna Placeholder"],
        ["cp-b", "Łukasz Placeholder"],
        ["cp-c", "Józef Placeholder".normalize("NFD")],
        ["cp-d", "  Marek Placeholder  "],
      ] as const) {
        ledger.replica.db.run(
          sql`insert into "counterparties" ("id", "name", "created_at", "updated_at") values (${id}, ${name}, ${when}, ${when})`,
        );
      }

      // And one already archived, because the fill covers every row rather
      // than the live ones: `counterparties_name_uq` is partial, so an
      // archived row is outside the index — and still needs a real value, or
      // unarchiving it later would restore a row the index cannot accept.
      ledger.replica.db.run(
        sql`insert into "counterparties" ("id", "name", "archived", "created_at", "updated_at") values ('cp-archived', 'Archived Placeholder', 1, ${when}, ${when})`,
      );

      migrateReplica(ledger.replica, { fs: noopFs });

      const rows = ledger.replica.db.all<Row>(
        sql.raw(`select "${source}" as source, "${column}" as filled from "${table}"`),
      );
      ledger.close();

      expect(rows.length, "rows to check").toBe(5);
      const stranded = rows.filter(
        (row) => row.filled === sentinel && (row.source ?? "").trim() !== "",
      );
      expect(
        stranded,
        `${table}.${column} rows still at ${JSON.stringify(sentinel)} with a non-empty ${source}`,
      ).toEqual([]);

      // The value itself, row by row — the property the sentinel check cannot
      // see. Every row, archived included.
      for (const row of rows) {
        expect(row.filled, `${table}.${column} for ${JSON.stringify(row.source)}`).toBe(
          expected(row.source ?? ""),
        );
      }
    },
  );
});
