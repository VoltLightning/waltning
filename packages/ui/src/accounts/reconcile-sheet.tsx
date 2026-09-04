/**
 * `<ReconcileSheet>` — S16 §5, *"I counted, and it says this."*
 *
 * Computed (what the ledger derives) beside observed (what you counted), the
 * live difference between them, and a note — over `BottomSheet`, the same
 * overlay `D4a`'s category sheet and every other modal disclosure in this
 * system uses. `shell/` and `states/` are foundation (`tests/module-
 * boundaries.test.ts` — promoted by D4a's own `CategorySheet`, the first
 * module to compose one of these), so this composes `BottomSheet` directly
 * rather than asking the screen to wrap it.
 *
 * **The difference is `Amount`, never a bare number.** A negative difference
 * (you found *less* than the ledger claims — the ordinary case, H5) reads in
 * `spend` ink; a positive one in `income`; zero stays plain — the same
 * three-colour vocabulary `<Amount>` enforces everywhere money moves.
 *
 * **No category picker.** D4a's sheet had not merged when this was first
 * written; `categoryId` is optional on `reconcile_account` and the screen
 * sends none, which reads as Uncategorized in every list — the same as any
 * other transaction the phone captures with no category chosen.
 */

import { isAccountingDate } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { Amount, type AmountKind } from "../fx/amount";
import { AmountField } from "../fx/amount-field";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { DateField } from "../primitives/date-field";
import type { FieldErrorMap } from "../primitives/field-errors.ts";
import { TextField } from "../primitives/text-field";
import { BottomSheet } from "../shell/bottom-sheet";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type ReconcileDraft = {
  observedBalance: string;
  /** `AccountingDate`'s shape (`YYYY-MM-DD`) — defaults to `today`. */
  asOf: string;
  note: string;
};

export type ReconcileSheetProps = {
  visible: boolean;
  accountName: string;
  currency: string;
  decimals?: number;
  /** What the ledger derives — §2's fold, as of `asOf`. Refolded by the screen every time `asOf` changes. */
  computedBalance: money.Money;
  /** `AccountingDate`'s shape (`YYYY-MM-DD`) — controlled, so the screen can refold `computedBalance` as it moves. */
  asOf: string;
  onAsOfChange: (value: string) => void;
  /** The device's local `AccountingDate` (§7.0a) — `DateField`'s shortcut row. */
  today: string;
  fieldErrors?: FieldErrorMap;
  onDismiss: () => void;
  onSave: (draft: ReconcileDraft) => void;
};

export function ReconcileSheet({
  visible,
  accountName,
  currency,
  decimals = 2,
  computedBalance,
  asOf,
  onAsOfChange,
  today,
  fieldErrors,
  onDismiss,
  onSave,
}: ReconcileSheetProps) {
  const t = useT();
  const styles = useStyles();

  const [observed, setObserved] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const observedError = fieldErrors?.byField["observedBalance"]?.[0];
  const dateInvalid = asOf !== "" && !isAccountingDate(asOf);

  const difference = observed === null ? null : money.sub(money.toMoney(observed), computedBalance);
  const differenceKind: AmountKind =
    difference === null || money.isZero(difference)
      ? "auto"
      : money.cmp(difference, money.toMoney("0")) < 0
        ? "spend"
        : "income";

  const handleSave = useCallback(() => {
    if (observed === null) return;
    onSave({ observedBalance: observed, asOf, note });
  }, [asOf, note, observed, onSave]);

  return (
    <BottomSheet visible={visible} title={t("accounts.reconcileTitle")} onDismiss={onDismiss}>
      <View style={styles.root}>
        {fieldErrors && fieldErrors.formLevel.length > 0 ? (
          <View accessibilityRole="alert">
            {fieldErrors.formLevel.map((message) => (
              <Text key={message} style={styles.formLevelMessage}>
                {message}
              </Text>
            ))}
          </View>
        ) : null}

        <Text style={styles.accountName}>{accountName}</Text>

        <View style={styles.row}>
          <Text style={styles.label}>{t("accounts.computed")}</Text>
          <Amount value={computedBalance} currency={currency} decimals={decimals} size="small" />
        </View>

        <AmountField
          label={t("accounts.observed")}
          onChange={setObserved}
          currency={currency}
          {...(observedError === undefined ? {} : { error: observedError })}
        />

        <View style={styles.row}>
          <Text style={styles.label}>{t("accounts.difference")}</Text>
          {difference === null ? (
            <Text style={styles.pending}>—</Text>
          ) : (
            <Amount
              value={difference}
              currency={currency}
              decimals={decimals}
              size="small"
              kind={differenceKind}
              signed
            />
          )}
        </View>

        <DateField
          label={t("accounts.asOf")}
          value={asOf}
          onChange={onAsOfChange}
          today={today}
          {...(dateInvalid ? { error: t("accounts.openingDateInvalid") } : {})}
        />

        <TextField
          label={t("common.note")}
          value={note}
          onChangeText={setNote}
          maxLength={2000}
          counter
        />

        <View style={styles.actions}>
          <Button label={t("common.cancel")} onPress={onDismiss} variant="ghost" />
          <Button
            label={t("common.save")}
            onPress={handleSave}
            disabled={observed === null || dateInvalid}
            variant="primary"
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.xl },
  accountName: { color: theme.text, ...text.ui("body", 600) },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { color: theme.textMuted, ...text.ui("kicker") },
  pending: { color: theme.textMuted, ...text.ui("bodySm") },
  formLevelMessage: { color: theme.dangerText, ...text.ui("caption") },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.xl },
}));
