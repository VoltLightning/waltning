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
 * Shared by `counterparties/merge-counterparties.executor.ts` (the stale-id
 * check and the move itself), `counterparties/unmerge-counterparties.executor.ts`
 * (the restore) and `transactions/read-spend-by-category.ts` (the line query
 * driven off a period's expense ids) — never derived independently at each.
 *
 * **It sits at the package root, not inside `counterparties/`.** The ceiling
 * it works around is SQLite's, not a counterparty's, and a reader in
 * `transactions/` needing it is what made that concrete: a module importing
 * another module is the thing `CLAUDE.md` forbids, so the shared piece moves
 * to the domain-free floor rather than being reached across for.
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
