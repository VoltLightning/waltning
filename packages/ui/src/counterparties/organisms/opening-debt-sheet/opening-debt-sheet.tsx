/**
 * `<OpeningDebtSheet>` — S13's *Add an existing debt* (§6.6): a debt that
 * predates the ledger, entered on the person's page. Direction (they owe you /
 * you owe them), currency, amount and the day it dates from.
 *
 * It sets the person's balance in that currency the way an account's opening
 * balance does and is never income or spending, so the sheet asks for none of
 * what a transaction asks for — no account, no category. **The figure is the
 * original debt, never the current balance**: repayments are recorded with
 * *Settle* and count against it.
 *
 * One debt per person per currency: choosing a currency that already holds one
 * says so, shows what has already been repaid and the balance the new figure
 * leaves, and **warns before a save turns the debt around** (more repaid than
 * the new figure). That same state offers *Delete this debt*, which the screen
 * confirms by listing the repayments it takes with it.
 *
 * **State lives here, and a fresh opening is a fresh mount** — the screen keys
 * the sheet, the way `ReconcileSheet` is used, so no stale draft carries over.
 */

import { isAccountingDate } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Amount } from "../../../fx/atoms/amount/amount";
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

/** A debt this person already has — one per currency. */
export type OpeningDebtSheetExisting = {
  id: string;
  currency: string;
  direction: OpeningDebtDirection;
  amount: money.Money;
  /** What the repayments made against it have discharged. */
  repaid: money.Money;
};

export type OpeningDebtSheetProps = {
  visible: boolean;
  counterpartyName: string;
  /** Every currency the ledger holds, in the order to offer them. */
  currencies: readonly { code: string; decimals: number }[];
  /** The debts this person already has; saving into one of their currencies replaces it. */
  existingDebts: readonly OpeningDebtSheetExisting[];
  /** The person's balances now, per currency — what the preview is taken from. */
  balances: readonly { currency: string; balance: money.Money }[];
  /** Prefills the form: the debt being corrected, or the person's settlement currency. */
  initial?: Partial<OpeningDebtDraft>;
  /** The device's local `AccountingDate` (§7.0a) — `DateField`'s shortcut row, default and ceiling. */
  today: string;
  fieldErrors?: FieldErrorMap;
  onDismiss: () => void;
  onSave: (draft: OpeningDebtDraft) => void;
  /** Delete the debt that is open for the chosen currency (the screen confirms first). */
  onDelete: (openingDebtId: string) => void;
};

const signOf = (direction: OpeningDebtDirection, amount: money.Money): money.Money =>
  direction === "theyOwe" ? amount : money.neg(amount);

export function OpeningDebtSheet({
  visible,
  counterpartyName,
  currencies,
  existingDebts,
  balances,
  initial,
  today,
  fieldErrors,
  onDismiss,
  onSave,
  onDelete,
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
  // A bare date compares as text (§7.0a); the contract refuses it too.
  const dateFuture = !dateInvalid && date > today;
  const parsed = typed === null ? null : parseAmount(typed);
  const existing =
    currency === null ? undefined : existingDebts.find((d) => d.currency === currency);
  const decimals = currencies.find((row) => row.code === currency)?.decimals ?? 2;

  // What saving does to the balance: the existing row's signed figure comes
  // out, the new one goes in — the same arithmetic the executor reads back.
  const preview = useMemo(() => {
    if (existing === undefined || currency === null || parsed === null) return null;
    const current = balances.find((row) => row.currency === currency)?.balance ?? money.ZERO;
    const after = money.add(
      money.sub(current, signOf(existing.direction, existing.amount)),
      signOf(direction, money.toMoney(parsed)),
    );
    const sign = money.cmp(money.round(after, decimals), money.ZERO);
    const flips = sign !== 0 && sign !== (direction === "theyOwe" ? 1 : -1);
    return { after, sign, flips };
  }, [balances, currency, decimals, direction, existing, parsed]);

  const amountError = fieldErrors?.byField["amount"]?.[0];
  const currencyError = fieldErrors?.byField["currency"]?.[0];
  const dateError = fieldErrors?.byField["date"]?.[0];
  const personError = fieldErrors?.byField["counterpartyId"]?.[0];
  const formLevel = [...(fieldErrors?.formLevel ?? []), ...(personError ? [personError] : [])];

  const check = useSubmitCheck({
    amount: parsed === null && t("common.required"),
    currency: currency === null && t("common.chooseOne"),
    date:
      (dateInvalid && t("accounts.openingDateInvalid")) ||
      (dateFuture && t("counterparties.existingDebtDateFuture")),
  });
  const save = useCallback(() => {
    if (parsed === null || currency === null) return;
    onSave({ direction, amount: parsed, currency, date });
  }, [currency, date, direction, onSave, parsed]);
  const handleSave = useCallback(() => check.submit(save), [check, save]);
  const handleDelete = useCallback(() => {
    if (existing !== undefined) onDelete(existing.id);
  }, [existing, onDelete]);
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

        {existing !== undefined && currency !== null ? (
          <View style={styles.replaces}>
            <Text style={styles.hint}>
              {t("counterparties.existingDebtReplaces", { currency })}
            </Text>
            <View style={styles.row}>
              <Text style={styles.label}>{t("counterparties.existingDebtRepaid")}</Text>
              <Amount
                value={existing.repaid}
                currency={currency}
                decimals={decimals}
                size="small"
              />
            </View>
            {preview === null ? null : (
              <View style={styles.row}>
                <Text style={styles.label}>{t("counterparties.existingDebtBalanceAfter")}</Text>
                <View style={styles.after}>
                  <Amount
                    value={money.abs(preview.after)}
                    currency={currency}
                    decimals={decimals}
                    size="small"
                  />
                  {preview.sign === 0 ? null : (
                    <Text style={styles.hint}>
                      {preview.sign > 0
                        ? t("counterparties.theyOweYou")
                        : t("counterparties.youOweThem")}
                    </Text>
                  )}
                </View>
              </View>
            )}
            {preview?.flips ? (
              <Text style={styles.warning} accessibilityRole="alert">
                {t("counterparties.existingDebtFlips")}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button label={t("common.cancel")} onPress={onDismiss} variant="ghost" />
          <Button
            label={t("counterparties.existingDebtSave")}
            onPress={handleSave}
            variant="primary"
          />
        </View>
        {existing === undefined ? null : (
          <Button
            label={t("counterparties.existingDebtDelete")}
            onPress={handleDelete}
            variant="ghost"
          />
        )}
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.xl },
  field: { gap: space.x3 },
  replaces: { gap: space.x3 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  after: { alignItems: "flex-end", gap: space.xxs },
  label: { color: theme.textMuted, ...text.ui("kicker") },
  hint: { color: theme.textMuted, ...text.ui("caption") },
  error: { color: theme.dangerText, ...text.ui("caption") },
  warning: { color: theme.assertedText, ...text.ui("caption") },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.xl },
}));
