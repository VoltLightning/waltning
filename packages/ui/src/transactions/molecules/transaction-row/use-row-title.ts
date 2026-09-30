import { useCallback } from "react";
import { useT } from "../../../i18n/provider";
import { type RowTitle, rowTitle } from "./row-title.ts";
import type { TransactionType } from "./transaction-row";

/** `rowTitle` with the locale's words for each kind — one rule for every list that draws a row. */
export function useRowTitle(
  enteredName: string,
  category: string | null | undefined,
  type: TransactionType | undefined,
): RowTitle {
  const t = useT();
  const kindLabel = useCallback(
    (kind: TransactionType) =>
      kind === "income"
        ? t("transactions.income")
        : kind === "transfer"
          ? t("transactions.transferKind")
          : kind === "adjustment"
            ? t("transactions.adjustmentKind")
            : t("transactions.expense"),
    [t],
  );
  return rowTitle({ enteredName, category, type, kindLabel });
}
