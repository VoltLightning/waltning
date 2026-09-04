/**
 * The sibling-uniqueness guarantee, on the device — shared by
 * `create_category` and `rename_category`, the two writes that can produce a
 * live name.
 *
 * **The executor is the guarantee; the client-side pre-check
 * (`create-phone-ledger.ts`) is only the good error.** Postgres enforces the
 * identical rule server-side with `categories_sibling_uq`, a unique index on
 * `(coalesce(parent_id, zero-uuid), kind, lower(btrim(name)))` — but the
 * phone's SQLite replica carries no such index (`packages/schema` states the
 * columns both engines share; this hand-written constraint is Postgres-only,
 * in `0001_database_objects.sql`). Without a check here, nothing stops two
 * colliding leaves reaching the replica through any caller that is not this
 * one already-careful screen — a future form, a bug in the pre-check, a
 * bulk-write path nobody has written the same guard into yet.
 *
 * **Folded, not merely lower-and-trimmed.** The Postgres index only
 * lowercases and trims; this uses `fold()` (`@waltning/core/capture/names`),
 * which also strips the Polish diacritics `TAXONOMY.md`'s own names use — the
 * same function the client-side pre-check already folds through. Two engines
 * enforcing slightly different rules would let a name through on the phone
 * that a sync then refused on the server; folding the stricter way here
 * closes that gap rather than opening one.
 *
 * **Archived siblings still block a name — not excluded.** The Postgres index
 * carries no `WHERE NOT archived` clause either: a name is a name, live or
 * retired, and a person renaming into an archived sibling's spot would get a
 * write that syncs, then conflicts, then loses — worse than a refusal now.
 *
 * **Trimmed before folding (R2 L2).** `fold()` never trims by itself — the
 * Postgres index is `lower(btrim(name))`, so `" Food"` and `"Food"` collide
 * there. Folding without trimming first missed that collision here, which let
 * the phone admit a name the server would then refuse.
 */

import { fold } from "@waltning/core/capture/names";
import type { Id } from "@waltning/core/id";
import type { CategoryKind } from "@waltning/schema/enums";
import { and, eq, isNull, ne } from "drizzle-orm";
import { LocalRefusal } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";

const { categories } = schema;
type ReplicaTx = LocalTx<unknown, typeof schema>;

export function refuseSiblingCollision(
  tx: ReplicaTx,
  target: {
    operation: string;
    id: Id<"categories">;
    parentId: Id<"categories"> | null;
    kind: CategoryKind;
    name: string;
  },
): void {
  const siblings = tx
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(
      and(
        target.parentId === null
          ? isNull(categories.parentId)
          : eq(categories.parentId, target.parentId),
        eq(categories.kind, target.kind),
        ne(categories.id, target.id),
      ),
    )
    .all();

  const folded = fold(target.name.trim());
  const collision = siblings.find((sibling) => fold(sibling.name.trim()) === folded);
  if (collision) {
    throw new LocalRefusal(
      `${target.operation}: "${collision.name}" already exists here — a category is unique by name within its parent and kind`,
    );
  }
}
