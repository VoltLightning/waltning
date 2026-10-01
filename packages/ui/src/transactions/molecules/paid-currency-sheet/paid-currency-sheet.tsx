/**
 * `<PaidCurrencySheet>` — the choice the amount card's currency chip opens
 * (S05 §3, §7.8): which currency the amount was paid in.
 *
 * **The account's own is the first option and the default.** Choosing it takes
 * the entry back to what it is by default — one figure, in the account's
 * currency — so the sheet is also the way out of a foreign entry, and a
 * `null` pick says so rather than naming the account's currency a second time.
 * Every other currency the ledger holds follows, by code.
 *
 * Composed by the screen, never by the card: a sheet is chrome and the card is
 * a field, the same split `CategorySheet` and `AccountPicker` keep.
 */

import { useCallback, useMemo } from "react";
import { useT } from "../../../i18n/provider";
import { RadioGroup, type RadioGroupProps } from "../../../primitives/atoms/radio/radio";
import { BottomSheet } from "../../../primitives/organisms/bottom-sheet/bottom-sheet";

export type PaidCurrencyChoice = { code: string; name: string };

export type PaidCurrencySheetProps = {
  visible: boolean;
  /** The account's own currency — the first option, and the "not foreign" answer. */
  accountCurrency: string;
  /** Every other currency on offer, in the order to draw them. */
  currencies: readonly PaidCurrencyChoice[];
  /** The chosen foreign currency, or `null` for the account's own. */
  value: string | null;
  /** `null` is the account's own currency. */
  onPick: (code: string | null) => void;
  onDismiss: () => void;
};

export function PaidCurrencySheet({
  visible,
  accountCurrency,
  currencies,
  value,
  onPick,
  onDismiss,
}: PaidCurrencySheetProps) {
  const t = useT();
  const options = useMemo<RadioGroupProps["options"] | undefined>(() => {
    const own = {
      value: accountCurrency,
      label: t("transactions.paidInOwn", { currency: accountCurrency }),
    };
    const [first, ...rest] = currencies
      .filter((currency) => currency.code !== accountCurrency)
      .map((currency) => ({ value: currency.code, label: `${currency.code} · ${currency.name}` }));
    // One option is not a choice: with no other currency there is nothing to open.
    return first === undefined ? undefined : [own, first, ...rest];
  }, [accountCurrency, currencies, t]);
  const handleChange = useCallback(
    (code: string) => onPick(code === accountCurrency ? null : code),
    [accountCurrency, onPick],
  );
  if (options === undefined) return null;
  return (
    <BottomSheet visible={visible} title={t("transactions.paidInTitle")} onDismiss={onDismiss}>
      <RadioGroup
        label={t("transactions.paidInTitle")}
        options={options}
        value={value ?? accountCurrency}
        onChange={handleChange}
      />
    </BottomSheet>
  );
}
