/**
 * Money and FX — `design-system/04`, which opens: *"These enforce §7 of
 * `SPEC.md` structurally."* One domain, because §7 is one domain.
 *
 * `AmountField` lives here rather than under Primitives, and §3.7's filing is
 * the thing that is wrong. It is the single place `numeric(20,8)` string
 * discipline meets keyboard input — it refuses `1.234,56` and `1,234.56` alike
 * rather than guess which thousand the typist meant. That is money knowledge,
 * not an input shape.
 *
 * `Keypad` and `RateField` (§3.7) carry the same knowledge and land here too
 * when they are built; leaving them under Primitives while moving `AmountField`
 * would prove Inputs is a shape group rather than a domain, which it is.
 */

export { Amount, type AmountEmphasis, type AmountProps, type AmountSize } from "./amount";
export { AmountField, type AmountFieldProps, parseAmount } from "./amount-field";
export { FxAmount, type FxAmountProps, type FxProvenance } from "./fx-amount";
export { TransferAmount, type TransferAmountProps } from "./transfer-amount";
