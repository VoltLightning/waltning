/**
 * Batches a list of ids so `inArray` never binds more than SQLite allows in
 * one statement (R2 M3).
 *
 * SQLite's default `SQLITE_MAX_VARIABLE_NUMBER` is 999; a single `inArray`
 * over `movedTransactionIds` binds one variable per id, so a merge or
 * unmerge that moves more than that in one write throws `too many SQL
 * variables` instead of the refusal or the result the person actually asked
 * for. 500 stays comfortably under the ceiling with room for the statement's
 * other bound values.
 *
 * Shared by `merge-counterparties.executor.ts` (the stale-id check and the
 * move itself) and `unmerge-counterparties.executor.ts` (the restore) —
 * three call sites over the same `movedTransactionIds` list, never derived
 * independently three times.
 */
export const IN_ARRAY_CHUNK_SIZE = 500;

/** `ids`, split into runs of at most `size`. Empty in, empty out — never `[[]]`. */
export function chunkIds<T>(ids: readonly T[], size = IN_ARRAY_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}
