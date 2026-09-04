/**
 * `<DebtDirectionTag>` — `design-system/05` §5.5 · `SPEC.md` §6.6 · P5.
 *
 * `owes you` / `you owe` / `settled` — text, never a colour alone. **Owns the
 * sign**, the same rule `BalanceLedger` states for itself: a positive balance
 * reads *they owe you*, negative *you owe them* (§6.6's negation — the
 * ledger signs by cash flow, a debt balance by obligation). No caller
 * negates or interprets the sign a second time.
 *
 * **`decimals` is required (H2).** `money.debtDirection` compares at the
 * currency's own scale, not the full 8-dp stored value — a caller with no
 * scale on hand has not resolved enough to render this tag next to a figure
 * either, since every figure beside it renders through `<Amount>` at that
 * same scale.
 */

import * as money from "@waltning/core/money";
import { useT } from "../i18n/provider";
import { Tag } from "../primitives/tag";

export type DebtDirectionTagProps = {
  /** A debt balance — positive means *they owe you* (§6.6). */
  balance: money.Money;
  /** The currency's own scale — the same one the figure beside this tag renders at (H2). */
  decimals: number;
};

const KEY: Record<
  money.DebtDirection,
  "counterparties.owesYou" | "counterparties.youOwe" | "counterparties.settled"
> = {
  theyOwe: "counterparties.owesYou",
  youOwe: "counterparties.youOwe",
  settled: "counterparties.settled",
};

export function DebtDirectionTag({ balance, decimals }: DebtDirectionTagProps) {
  const t = useT();
  return <Tag>{t(KEY[money.debtDirection(balance, decimals)])}</Tag>;
}
