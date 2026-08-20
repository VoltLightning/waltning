/**
 * Conflict detection — `architecture/14` §14.2, `architecture/08` H16.
 *
 * **`version` is the gate, not the answer.** §14.2 poses a per-field question —
 * *did **this field** change under you since you read it?* — and `version` is a
 * per-row counter that any update advances. It can only say that *something*
 * moved. Relying on it alone makes disjoint edits collide: a laptop fixing a
 * payee bumps the row, and a phone's queued `category` edit then arrives
 * "stale" and is reported as a conflict that §14.2 says must merge with no
 * prompt.
 *
 * That is not a cosmetic misfire. `is_business` is tax-sensitive, and H16 says a
 * tax-sensitive field with a stale version is **blocked** rather than
 * overwritten — so a payee typo fixed on another device permanently blocks an
 * unrelated queued edit, and S30 reports that another device changed
 * `is_business`. Nothing did. `defects.md` records the same symptom arriving
 * through the replay door; this is the field-granularity door.
 *
 * The failure is one-directional, which is the one piece of good news: every
 * update bumps the version, so there are **no false negatives**. A real
 * conflict is never missed, only manufactured. It fails loud.
 *
 * So a write carries the prior value of each field it sets, and the server
 * compares field by field — plain compare-and-swap, answering §14.2's question
 * literally. `version` survives as the fast path: equal versions mean nothing
 * moved and no per-field work is needed at all.
 *
 * **Why not derive the changed fields from `audit_log`.** It stores `before`
 * and `after` per change, so it could answer this — but it has no `version`
 * column to correlate against, and it would make conflict detection depend on
 * the audit trail being complete forever. A prune would silently turn conflicts
 * into merges, which is the direction that loses data.
 */

/**
 * Fields that move as a unit, declared per operation.
 *
 * §14.2: *"Non-independent fields are not independent conflicts."* The four
 * faces of a cross-currency transfer are the case this exists for —
 * `amount_original`, `to_amount`, `fx_rate` and `to_fx_rate`, two of which feed
 * generated values. Merging `amount_original` from one device with `fx_rate`
 * from another produces a plausible number **neither device ever held**, and it
 * looks entirely reasonable on screen.
 *
 * Declared rather than inferred, and declared beside `taxSensitiveFields`
 * because it is the same kind of statement: a property of the operation that
 * the resolver must not have to guess.
 */
export type ConflictGroups = readonly (readonly string[])[];

/** What the client last read, and what it wants the field to become. */
export type FieldPatch = {
  /** The value the client read. Compared against the row as it stands now. */
  from: unknown;
  to: unknown;
};

export type ConflictOutcome =
  /** Nothing moved under this write. Apply it. */
  | { kind: "clean" }
  /**
   * Something moved, but not in any field this write touches. §14.2: different
   * fields on the two sides merge with no prompt.
   */
  | { kind: "merge" }
  /** The same field, or a field grouped with one, moved under this write. */
  | { kind: "conflict"; fields: readonly string[]; taxSensitive: boolean };

/**
 * Expand a field set to include everything grouped with any member.
 *
 * A conflict on one face of a transfer is a conflict on all four, so the
 * *whole* group is presented and resolved together. Groups are treated as
 * closed sets rather than transitively merged: overlapping declarations are a
 * declaration mistake, and silently unioning them would hide it.
 */
function withGroups(fields: readonly string[], groups: ConflictGroups): readonly string[] {
  const out = new Set(fields);
  for (const group of groups) {
    if (group.some((f) => out.has(f))) for (const f of group) out.add(f);
  }
  return [...out];
}

/**
 * Decide what a write means against the row as it now stands.
 *
 * @param versionMatched  whether `version` is still what the client read
 * @param patch           the fields this write sets, each with the value read
 * @param current         the row as it stands on the server, by field name
 * @param groups          fields that move as a unit for this operation
 * @param taxFields       the tax-sensitive set — these always ask
 *
 * **`versionMatched` is passed in, not inferred from the patch**, because the
 * three outcomes are genuinely different and only the version separates the
 * first two. No patched field moved *and* the version is unchanged means
 * nothing happened at all. No patched field moved *and* the version advanced
 * means another device edited a different field — the merge §14.2 promises,
 * and the case the old row-level check reported as a conflict. Collapsing them
 * would leave `merge` unreachable and lose the distinction worth auditing.
 *
 * Equality is `Object.is` over values already normalised at this boundary:
 * money and dates are strings end to end (`CLAUDE.md`), so no numeric
 * comparison happens here and `0.1 + 0.2` never arises. A field whose value is
 * a structure is one that should have been grouped instead.
 */
export function conflictDecision(
  versionMatched: boolean,
  patch: Readonly<Record<string, FieldPatch>>,
  current: Readonly<Record<string, unknown>>,
  groups: ConflictGroups = [],
  taxFields: readonly string[] = [],
): ConflictOutcome {
  // Entries, not `Object.keys` plus an index — indexing back into the record
  // types every lookup as possibly-undefined, and the optional chaining that
  // silences it would compare `undefined` against a real value and call an
  // absent field unchanged.
  const moved = Object.entries(patch)
    .filter(([field, { from }]) => !Object.is(from, current[field]))
    .map(([field]) => field);

  if (moved.length === 0) return versionMatched ? { kind: "clean" } : { kind: "merge" };

  const fields = withGroups(moved, groups);
  return {
    kind: "conflict",
    fields,
    taxSensitive: fields.some((f) => taxFields.includes(f)),
  };
}

/**
 * The fast path, and the only thing `version` is still for on its own.
 *
 * Equal versions mean no update touched the row since the client read it, so
 * no field can have moved and the per-field comparison is skippable. A
 * mismatch means *look closer* — never *refuse*, which is exactly the
 * conflation this module exists to undo.
 */
export function versionUnchanged(read: number, current: number): boolean {
  return read === current;
}
