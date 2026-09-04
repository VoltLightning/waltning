/**
 * `<DebtDirectionTag>` — `design-system/05` §5.5 · `SPEC.md` §6.6 · P5.
 *
 * `owes you` / `you owe` / `settled` — text, never a colour alone. **Owns the
 * sign**, the same rule `BalanceLedger` states for itself: a positive balance
 * reads *they owe you*, negative *you owe them* (§6.6's negation — the
 * ledger signs by cash flow, a debt balance by obligation). No caller
 * negates or interprets the sign a second time.
 */

import * as money from "@waltning/core/money";
import { useT } from "../i18n/provider";
import { Tag } from "../primitives/tag";

export type DebtDirectionTagProps = {
  /** A debt balance — positive means *they owe you* (§6.6). */
  balance: money.Money;
};

export function DebtDirectionTag({ balance }: DebtDirectionTagProps) {
  const t = useT();
  if (money.isZero(balance)) return <Tag>{t("counterparties.settled")}</Tag>;
  const theyOwe = money.cmp(balance, money.toMoney("0")) > 0;
  return <Tag>{t(theyOwe ? "counterparties.owesYou" : "counterparties.youOwe")}</Tag>;
}
