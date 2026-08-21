/**
 * Row identity, branded by the table it belongs to.
 *
 * **Twenty-two id columns were the same type.** `accountId`, `categoryId` and
 * `counterpartyId` are all UUIDs in a string, so
 * `createTransaction({ accountId: categoryId })` compiled — and the failure is
 * quiet in the worst way: the write succeeds until a foreign key catches it, or
 * does not catch it, because plenty of those columns are nullable and plenty of
 * ids exist in more than one table's history.
 *
 * A brand per table makes the mix-up a compile error and costs nothing at run
 * time: `Id<"accounts">` is a string with a phantom property, which
 * `erasableSyntaxOnly` compiles away entirely.
 *
 * **Keyed on the table name, not on a nominal class**, because the table name
 * is already the thing every reader uses to talk about the row — a foreign key
 * declared `Id<"categories">` says what it points at without a second lookup,
 * which is exactly what the column name was failing to do for `parent_id`.
 */

declare const ID: unique symbol;

/**
 * The id of a row in `Table`.
 *
 * ```ts
 * function archive(id: Id<"accounts">): void
 * archive(categoryId)   // ✗ does not compile
 * ```
 */
export type Id<Table extends string> = string & { readonly [ID]: Table };

/** Every table an id can belong to. Narrower than `string` on purpose. */
export type IdTable =
  | "accountGroups"
  | "accounts"
  | "agentSessions"
  | "categories"
  | "counterparties"
  | "dashboardLayouts"
  | "dashboardWidgets"
  | "importBatches"
  | "receipts"
  | "recurringTransactions"
  | "tags"
  | "transactionLines"
  | "transactions";

/**
 * Assert that a string is the id of a row in `Table`.
 *
 * **This is a cast with a name, and that is the honest description.** Unlike
 * `Money`, an id carries nothing to validate against — a UUID from the database
 * is already the identity of whatever row returned it, and there is no parse
 * that could tell an account's from a category's. What the brand buys is that
 * the *claim* is made once, here, where it can be searched for, rather than
 * implied by every assignment.
 *
 * Rows read through the schema are branded by their column types, so this is
 * for the boundaries: a route parameter, a request body, a test fixture.
 */
export const id = <Table extends IdTable>(value: string): Id<Table> => value as Id<Table>;
