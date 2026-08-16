/**
 * The row an `INSERT … RETURNING` must have produced.
 *
 * `noUncheckedIndexedAccess` types `rows[0]` as possibly undefined, which is
 * correct in general and wrong for a single-row insert — so the codebase had
 * `row!.id` in four places. A non-null assertion is the same shape as the weak
 * types this project has been removing: it tells the compiler to stop asking
 * rather than answering the question, and when it is wrong the failure is
 * `Cannot read properties of undefined`, several frames from the cause.
 *
 * This answers instead, and names what was being inserted.
 */
export function requireRow<Row>(rows: readonly Row[], what: string): Row {
  const row = rows[0];
  if (!row) {
    throw new Error(`${what}: expected the insert to return a row and it returned none`);
  }
  return row;
}
