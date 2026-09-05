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
import { sql } from "drizzle-orm";
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
