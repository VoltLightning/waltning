/**
 * `<TransferComposer>` — `screens/S31` §3–§9: move money between two of your
 * own accounts, and make the FX cost visible while typing rather than in a
 * report months later.
 *
 * **Fully controlled**, `QuickAddComposer`'s own contract: every value is a
 * prop in, every change a callback out. This component assembles no draft —
 * the screen is the one place `readCrossRate` is called and `QuickAddDraft`
 * is built, the same split D4b already drew for the ordinary capture path.
 *
 * **The destination amount is pre-filled from the reference rate and stays
 * editable** (§3) — that is the screen's job (recomputing `toAmountRaw`
 * whenever `amountRaw` changes and `activeField` is still `"amount"`), not
 * this component's: a `useEffect` that also *writes* the prop it renders
 * would fight the screen that owns it. `activeField` is what the screen reads
 * to know whether to keep recomputing.
 *
 * **Same currency collapses.** One amount, no rate panel, no spread — the
 * realized rate is exactly 1 and showing it would be showing nothing (§3).
 * The screen still owns `toAmountRaw`; keeping it equal to `amountRaw` here
 * is the screen's job, the same way §7.5 states it: *"`to_amount` equals
 * `amount_original`"*.
 *
 * **`Dock` is the screen's, not this component's** — the same split
 * `QuickAddComposer`/`quick-add-screen.tsx` already draws: this renders
 * everything above the keypad, the screen composes `Dock` (mode row, keypad,
 * full-width Save) below it. `onCancel` is this component's own header ✕,
 * `QuickAddComposer`'s own escape for the same reason — Save belongs to
 * `Dock`, Cancel does not.
 *
 * **`from`/`to` are opened, never rendered, here.** `AccountPicker`
 * (`accounts/`) is a sibling domain, the same rule `QuickAddComposer` keeps
 * for `CategorySheet` — this only ever calls `onOpenFromAccountPicker` /
 * `onOpenToAccountPicker`, and the screen composes the sheet, wiring its own
 * pick straight onto `fromAccountId` / `toAccountId` (`architecture/11`).
 */

import * as money from "@waltning/core/money";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { Amount } from "../fx/amount";
import { AmountField } from "../fx/amount-field";
import { useT } from "../i18n/provider";
import { Chip } from "../primitives/chip";
import { DateField } from "../primitives/date-field";
import type { FieldErrorMap } from "../primitives/field-errors.ts";
import { IconButton } from "../primitives/icon-button";
import { RateField } from "../primitives/rate-field";
import { TextField } from "../primitives/text-field";
import { BottomSheet } from "../shell/bottom-sheet";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { radius, space } from "../tokens.ts";

export type TransferComposerAccount = {
  id: string;
  name: string;
  currency: string;
  decimals: number;
  /** Whether an expense against this account can be valued (S05, §14.6) — shown either way. */
  capturable: boolean;
};

export type TransferComposerReferenceRate = {
  /** Pivot-per-unit, source → destination — multiply `amountRaw` by this to reach `toAmountRaw` (§7.5). */
  rate: money.PivotPerUnit;
  source: string;
  date: string;
};

export type TransferComposerField = "amount" | "toAmount";

export type TransferComposerProps = {
  accounts: readonly TransferComposerAccount[];
  fromAccountId: string | null;
  /** Opens `AccountPicker` for the *from* leg — the screen composes it, this only ever asks. */
  onOpenFromAccountPicker: () => void;
  toAccountId: string | null;
  /** Opens `AccountPicker` for the *to* leg — the screen composes it, this only ever asks. */
  onOpenToAccountPicker: () => void;
  /** Swaps the two accounts with one control rather than re-picking both (S31 §7). */
  onSwap: () => void;

  amountRaw: string;
  toAmountRaw: string;
  activeField: TransferComposerField;
  onActiveFieldChange: (field: TransferComposerField) => void;

  /** `readCrossRate` for the current pair — `undefined` offline with nothing held (§6). */
  referenceRate?: TransferComposerReferenceRate | undefined;

  /** The bank's stated fee — optional, distinct from the margin (§9.1). */
  fee: string;
  onFeeChange: (fee: string) => void;

  date: string;
  onDateChange: (date: string) => void;
  today: string;
  note: string;
  onNoteChange: (note: string) => void;

  fieldErrors?: FieldErrorMap;
  onCancel: () => void;
};

type OpenSheet = "date" | "note" | null;

export function TransferComposer({
  accounts,
  fromAccountId,
  onOpenFromAccountPicker,
  toAccountId,
  onOpenToAccountPicker,
  onSwap,
  amountRaw,
  toAmountRaw,
  activeField,
  onActiveFieldChange,
  referenceRate,
  fee,
  onFeeChange,
  date,
  onDateChange,
  today,
  note,
  onNoteChange,
  fieldErrors,
  onCancel,
}: TransferComposerProps) {
  const t = useT();
  const styles = useStyles();
  const [openSheet, setOpenSheet] = useState<OpenSheet>(null);

  const from = accounts.find((account) => account.id === fromAccountId);
  const to = accounts.find((account) => account.id === toAccountId);
  const sameCurrency = from !== undefined && to !== undefined && from.currency === to.currency;
  const sameAccount = fromAccountId !== null && fromAccountId === toAccountId;

  const closeSheet = useCallback(() => setOpenSheet(null), []);
  const handleOpenDateSheet = useCallback(() => setOpenSheet("date"), []);
  const handleOpenNoteSheet = useCallback(() => setOpenSheet("note"), []);
  const handleActivateAmount = useCallback(
    () => onActiveFieldChange("amount"),
    [onActiveFieldChange],
  );
  const handleActivateToAmount = useCallback(
    () => onActiveFieldChange("toAmount"),
    [onActiveFieldChange],
  );

  const amount = money.toMoney(amountRaw === "" ? "0" : amountRaw.replace(",", "."));
  const toAmount = money.toMoney(toAmountRaw === "" ? "0" : toAmountRaw.replace(",", "."));

  // §7.5's own worked example, generalised: `amount` valued at `1` (this
  // leg's own currency, treated as the common ground), `toAmount` valued at
  // the reciprocal of the reference rate. Neither figure is the system's real
  // pivot (§7.0 — invisible past `readCrossRate`), and `margin` does not need
  // it to be: the formula only needs both legs expressed in one shared unit.
  const marginResult =
    referenceRate === undefined || money.isZero(amount)
      ? undefined
      : money.margin({
          amountOriginal: amount,
          fxRate: money.pivotPerUnit(1),
          toAmount,
          toFxRate: money.pivotPerUnit(money.dec(1).dividedBy(referenceRate.rate)),
        });

  const marginInDestination =
    marginResult === undefined || referenceRate === undefined
      ? undefined
      : money.toMoney(money.dec(marginResult.marginPivot).times(referenceRate.rate));

  // S31 §3's own footer — the two costs, summed for the one figure this
  // screen states while typing. `FX Cost` (§12.2) still reports them apart;
  // this is a capture-time convenience, not a second definition of "total".
  const feeAmount = fee === "" ? undefined : money.toMoney(fee.replace(",", "."));
  const total =
    marginInDestination === undefined && feeAmount === undefined
      ? undefined
      : money.add(marginInDestination ?? money.ZERO, feeAmount ?? money.ZERO);

  const feeError = fieldErrors?.byField["fee"]?.[0];
  const toAccountError = fieldErrors?.byField["toAccountId"]?.[0];
  const amountError = fieldErrors?.byField["amountOriginal"]?.[0];
  const toAmountError = fieldErrors?.byField["toAmount"]?.[0];
  // §14.6 — declined before the write, with the currency named: the
  // controller refuses `create_transaction` on `accountId` (the *from* leg)
  // the moment the account holds no rate, and this is the one place that
  // refusal is ever rendered. `fromNeedsRate` covers it proactively, the
  // moment the picker names an uncapturable account; `accountIdError` is the
  // fallback for whatever else `byField.accountId` might carry.
  const accountIdError = fieldErrors?.byField["accountId"]?.[0];
  const fromNeedsRate =
    from !== undefined && !from.capturable
      ? t("transactions.needsRate", { currency: from.currency })
      : undefined;
  const fromCaption = fromNeedsRate ?? accountIdError;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <IconButton label={t("common.cancel")} onPress={onCancel}>
          <CrossMark />
        </IconButton>
        <Text style={styles.title}>{t("transactions.transfer")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.chipRow}>
        <View style={styles.fromColumn}>
          <Chip
            placeholder={t("transactions.from")}
            value={from?.name}
            onPress={onOpenFromAccountPicker}
            machineFilled={false}
          />
          {fromCaption === undefined ? null : <Text style={styles.needsRate}>{fromCaption}</Text>}
        </View>
        <IconButton label={t("transactions.swapDirection")} onPress={onSwap}>
          <SwapArrow />
        </IconButton>
        <Chip
          placeholder={t("transactions.to")}
          value={to?.name}
          onPress={onOpenToAccountPicker}
          machineFilled={false}
        />
      </View>
      {toAccountError === undefined && !sameAccount ? null : (
        <Text style={styles.fieldError}>
          {toAccountError ?? t("transactions.sameAccountRefused")}
        </Text>
      )}

      <AmountField
        variant="hero"
        label={t("transactions.amount")}
        {...(from ? { currency: from.currency } : {})}
        value={amountRaw}
        onPress={handleActivateAmount}
        active={activeField === "amount"}
      />
      {amountError === undefined ? null : <Text style={styles.fieldError}>{amountError}</Text>}

      {sameCurrency ? null : (
        <>
          <AmountField
            variant="hero"
            label={t("transactions.destinationAmount")}
            {...(to ? { currency: to.currency } : {})}
            value={toAmountRaw}
            onPress={handleActivateToAmount}
            active={activeField === "toAmount"}
          />
          {toAmountError === undefined ? null : (
            <Text style={styles.fieldError}>{toAmountError}</Text>
          )}

          <RateField
            label={t("transactions.realized")}
            value={marginResult?.realizedRate ?? money.ZERO}
            // L9 — a rate has no unit of its own (`RateField`'s own doc);
            // the realized rate reads destination per source, the same
            // `{{quote}} per {{base}}` `RateTable`'s header states.
            {...(from && to
              ? { unit: t("fx.rateTableRateHeader", { quote: to.currency, base: from.currency }) }
              : {})}
            {...(referenceRate
              ? {
                  reference: {
                    rate: referenceRate.rate,
                    source: referenceRate.source,
                    date: referenceRate.date,
                  },
                }
              : {})}
          />

          {marginInDestination === undefined || to === undefined ? null : (
            <View style={styles.marginRow}>
              <Text style={styles.marginLabel}>{t("transactions.margin")}</Text>
              <Amount value={marginInDestination} currency={to.currency} decimals={to.decimals} />
            </View>
          )}

          <TextField
            label={t("transactions.fee")}
            value={fee}
            onChangeText={onFeeChange}
            {...(feeError === undefined ? {} : { error: feeError })}
          />

          {total === undefined || to === undefined ? null : (
            <View style={styles.marginRow}>
              <Text style={styles.marginLabel}>{t("transactions.total")}</Text>
              <Amount value={total} currency={to.currency} decimals={to.decimals} />
            </View>
          )}
        </>
      )}

      <View style={styles.chipRow}>
        <Chip
          placeholder={t("transactions.date")}
          value={date === today ? t("shell.today") : date}
          onPress={handleOpenDateSheet}
          machineFilled={false}
        />
        <Chip
          placeholder={t("transactions.addNote")}
          value={note.trim() === "" ? undefined : note}
          onPress={handleOpenNoteSheet}
          machineFilled={false}
        />
      </View>

      <BottomSheet
        visible={openSheet === "date"}
        title={t("transactions.date")}
        onDismiss={closeSheet}
      >
        <DateField
          label={t("transactions.date")}
          value={date}
          onChange={onDateChange}
          today={today}
        />
      </BottomSheet>
      <BottomSheet visible={openSheet === "note"} title={t("common.note")} onDismiss={closeSheet}>
        <TextField
          label={t("common.note")}
          value={note}
          onChangeText={onNoteChange}
          maxLength={2000}
          counter
        />
      </BottomSheet>
    </View>
  );
}

/** The drawn ✕ — `QuickAddComposer`'s own construction, matched rather than shared (one more use, still under the third). */
function CrossMark() {
  const styles = useStyles();
  return (
    <View style={styles.crossMark}>
      <View style={[styles.crossMarkBar, styles.crossMarkBarA]} />
      <View style={[styles.crossMarkBar, styles.crossMarkBarB]} />
    </View>
  );
}

/** The drawn swap glyph — two arrows, opposed. Matches `keypad.tsx`'s own rule: never a font glyph. */
function SwapArrow() {
  const styles = useStyles();
  return (
    <View style={styles.swap}>
      <View style={[styles.swapBar, styles.swapBarTop]} />
      <View style={[styles.swapBar, styles.swapBarBottom]} />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.x3 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: theme.text, ...text.ui("displayThree") },
  /** Balances the header ✕ so the title stays centred. */
  headerSpacer: { width: 44 },
  crossMark: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  crossMarkBar: { position: "absolute", width: 17, height: 2, backgroundColor: theme.text },
  crossMarkBarA: { transform: [{ rotate: "45deg" }] },
  crossMarkBarB: { transform: [{ rotate: "-45deg" }] },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.md,
  },
  fromColumn: { gap: space.xs },
  fieldError: { color: theme.dangerText, ...text.ui("caption") },
  /** §14.6's own caption — a fact about now, not an error (`quick-add-form.tsx`'s `blocked`, matched). */
  needsRate: { color: theme.textMuted, ...text.ui("caption") },
  marginRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  marginLabel: { color: theme.textMuted, ...text.ui("body") },
  swap: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  swapBar: { position: "absolute", width: 14, height: 2, backgroundColor: theme.text },
  swapBarTop: { top: 5, borderRadius: radius.xs },
  swapBarBottom: { bottom: 5, borderRadius: radius.xs },
}));
