/**
 * `<OpeningDebtSheet>` — S13's *Add an existing debt* (§6.6): a debt that
 * predates the ledger, entered on the person's page. Direction (they owe you /
 * you owe them), currency, amount and the day it dates from.
 *
 * It sets the person's balance in that currency the way an account's opening
 * balance does and is never income or spending, so the sheet asks for none of
 * what a transaction asks for — no account, no category. One debt per person
 * per currency: opening it for a currency that already holds one prefills that
 * debt, and saying so beforehand is what keeps *Save* from being a surprise.
 *
 * **State lives here, and a fresh opening is a fresh mount** — the screen keys
 * the sheet, the way `ReconcileSheet` is used, so no stale draft carries over.
 */

import { isAccountingDate } from "@waltning/core/date";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { AmountField, parseAmount } from "../../../fx/molecules/amount-field/amount-field";
import { useT } from "../../../i18n/provider";
import { Button } from "../../../primitives/atoms/button/button";
import { DateField } from "../../../primitives/atoms/date-field/date-field";
import { SegmentControl } from "../../../primitives/atoms/segment-control/segment-control";
import { Select } from "../../../primitives/atoms/select/select";
import { FieldAnchor } from "../../../primitives/field-anchor";
import type { FieldErrorMap } from "../../../primitives/field-errors.ts";
import { BottomSheet } from "../../../primitives/organisms/bottom-sheet/bottom-sheet";
import { useSubmitCheck } from "../../../primitives/use-submit-check.ts";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { space } from "../../../tokens.ts";

export type OpeningDebtDirection = "theyOwe" | "youOwe";

/** What the sheet hands back — plain strings; the controller mints the id and parses. */
export type OpeningDebtDraft = {
  direction: OpeningDebtDirection;
  amount: string;
  currency: string;
  date: string;
};

export type OpeningDebtSheetProps = {
  visible: boolean;
  counterpartyName: string;
  /** Every currency the ledger holds, in the order to offer them. */
  currencies: readonly { code: string }[];
  /** Currencies this person already has an existing debt in — saving into one replaces it. */
  existingCurrencies: readonly string[];
  /** Prefills the form: the debt being corrected, or the person's settlement currency. */
  initial?: Partial<OpeningDebtDraft>;
  /** The device's local `AccountingDate` (§7.0a) — `DateField`'s shortcut row and default. */
  today: string;
  fieldErrors?: FieldErrorMap;
  onDismiss: () => void;
  onSave: (draft: OpeningDebtDraft) => void;
};

export function OpeningDebtSheet({
  visible,
  counterpartyName,
  currencies,
  existingCurrencies,
  initial,
  today,
  fieldErrors,
  onDismiss,
  onSave,
}: OpeningDebtSheetProps) {
  const t = useT();
  const styles = useStyles();

  const [direction, setDirection] = useState<OpeningDebtDirection>(initial?.direction ?? "theyOwe");
  const [currency, setCurrency] = useState<string | null>(
    initial?.currency ?? currencies[0]?.code ?? null,
  );
  const [typed, setTyped] = useState<string | null>(initial?.amount ?? null);
  const [date, setDate] = useState(initial?.date ?? today);

  const segments = useMemo(
    () =>
      [
        { value: "theyOwe", label: t("counterparties.existingDebtTheyOwe") },
        { value: "youOwe", label: t("counterparties.existingDebtYouOwe") },
      ] as const,
    [t],
  );
  const currencyOptions = useMemo(
    () => currencies.map((row) => ({ value: row.code, label: row.code })),
    [currencies],
  );

  const dateInvalid = date === "" || !isAccountingDate(date);
  const parsed = typed === null ? null : parseAmount(typed);
  const replaces = currency !== null && existingCurrencies.includes(currency);

  const amountError = fieldErrors?.byField["amount"]?.[0];
  const currencyError = fieldErrors?.byField["currency"]?.[0];
  const dateError = fieldErrors?.byField["date"]?.[0];
  const personError = fieldErrors?.byField["counterpartyId"]?.[0];
  const formLevel = [...(fieldErrors?.formLevel ?? []), ...(personError ? [personError] : [])];

  const check = useSubmitCheck({
    amount: parsed === null && t("common.required"),
    currency: currency === null && t("common.chooseOne"),
    date: dateInvalid && t("accounts.openingDateInvalid"),
  });
  const save = useCallback(() => {
    if (parsed === null || currency === null) return;
    onSave({ direction, amount: parsed, currency, date });
  }, [currency, date, direction, onSave, parsed]);
  const handleSave = useCallback(() => check.submit(save), [check, save]);
  const dateShown = check.errorFor("date") ?? dateError;

  const handleDirection = useCallback((value: OpeningDebtDirection) => setDirection(value), []);

  return (
    <BottomSheet
      visible={visible}
      title={t("counterparties.existingDebtTitle", { name: counterpartyName })}
      onDismiss={onDismiss}
    >
      <View style={styles.root}>
        <Text style={styles.hint}>{t("counterparties.existingDebtHint")}</Text>

        {formLevel.length > 0 ? (
          <View accessibilityRole="alert">
            {formLevel.map((message) => (
              <Text key={message} style={styles.error}>
                {message}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.field}>
          <Text style={styles.label}>{t("counterparties.existingDebtDirection")}</Text>
          <SegmentControl segments={segments} value={direction} onChange={handleDirection} />
        </View>

        <FieldAnchor check={check} field="currency">
          <Select
            label={t("counterparties.existingDebtCurrency")}
            placeholder={t("common.chooseOne")}
            options={currencyOptions}
            value={currency}
            onChange={setCurrency}
            error={check.errorFor("currency") ?? currencyError}
          />
        </FieldAnchor>

        <FieldAnchor check={check} field="amount">
          <AmountField
            label={t("transactions.amount")}
            onChange={setTyped}
            {...(initial?.amount === undefined ? {} : { initial: initial.amount })}
            {...(currency === null ? {} : { currency })}
            error={check.errorFor("amount") ?? amountError}
          />
        </FieldAnchor>

        <FieldAnchor check={check} field="date">
          <DateField
            label={t("counterparties.existingDebtDate")}
            value={date}
            onChange={setDate}
            today={today}
            {...(dateShown === undefined ? {} : { error: dateShown })}
          />
        </FieldAnchor>

        {replaces && currency !== null ? (
          <Text style={styles.hint}>{t("counterparties.existingDebtReplaces", { currency })}</Text>
        ) : null}

        <View style={styles.actions}>
          <Button label={t("common.cancel")} onPress={onDismiss} variant="ghost" />
          <Button
            label={t("counterparties.existingDebtSave")}
            onPress={handleSave}
            variant="primary"
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.xl },
  field: { gap: space.x3 },
  label: { color: theme.textMuted, ...text.ui("kicker") },
  hint: { color: theme.textMuted, ...text.ui("caption") },
  error: { color: theme.dangerText, ...text.ui("caption") },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.xl },
}));
