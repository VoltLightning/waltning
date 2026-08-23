/**
 * Transactions — `design-system/05` §5.2, minus the rows that belong to other
 * domains.
 *
 * `Tag` is deliberately **not** here despite its `biz` variant — see
 * `primitives/tag.tsx`. A variant naming a domain does not move the shape.
 */

export { type QuickAddAccount, QuickAddForm, type QuickAddFormProps } from "./quick-add-form";
export { TransactionRow, type TransactionRowProps } from "./transaction-row";
