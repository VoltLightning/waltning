/**
 * Molecules — small compositions that carry domain meaning but still fetch
 * nothing. `design-system/05-composites.md` §5.1–5.2, §5.4.
 *
 * `Amount` and `FxAmount` are D0 (`12-build-order.md`): **every screen depends
 * on them, and P1 is enforced here or nowhere.**
 *
 * Amount · FxAmount · TransferAmount — then StatTile, TransactionRow,
 * BalanceRow, ServiceIcon as the screens that need them arrive.
 */

export { Amount, type AmountEmphasis, type AmountProps, type AmountSize } from "./amount";
export { FxAmount, type FxAmountProps, type FxProvenance } from "./fx-amount";
export {
  BalanceRow,
  type BalanceRowProps,
  TransactionRow,
  type TransactionRowProps,
} from "./rows";
export { TransferAmount, type TransferAmountProps } from "./transfer-amount";
