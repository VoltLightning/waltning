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
 * `QuickAddComposer`/`quick-add-screen.tsx` already draws: this renders the
 * scrolling body, the screen composes `ComposerHeader` (the fixed ✕/title
 * band) above it and `Dock` (mode row, keypad, full-width Save) below.
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
import { AmountField, parseAmount } from "../fx/amount-field";
import { formatRate } from "../fx/format-rate.ts";
import { useLocale, useT } from "../i18n/provider";
import { Chip } from "../primitives/chip";
import { DateField } from "../primitives/date-field";
import type { FieldErrorMap } from "../primitives/field-errors.ts";
import { IconButton } from "../primitives/icon-button";
import { RateField } from "../primitives/rate-field";
import { Tag } from "../primitives/tag";
import { TextField } from "../primitives/text-field";
import { BottomSheet } from "../shell/bottom-sheet";
import { Banner } from "../states/banner";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { radius, space, tabularNums } from "../tokens.ts";

export type TransferComposerAccount = {
  id: string;
  name: string;
  currency: string;
  decimals: number;
  /** Whether an expense against this account can be valued (S05, §14.6) — shown either way. */
  capturable: boolean;
};

export type TransferComposerReferenceRate = {
  /**
   * A triangulated `CrossRate` (M1), source → destination — multiply
   * `amountRaw` by this to reach `toAmountRaw` (§7.5). Not `PivotPerUnit`:
   * `readCrossRate`'s own answer never goes to the pivot, it lands in the
   * destination currency directly.
   */
  rate: money.CrossRate;
  source: string;
  date: string;
  /** H2 — `crossRateProvenance`'s own carry, for the same leg `source`/`date` name. */
  carriedDays: number;
  /** H2 — true when either leg is a person's own correction, independent of which leg's `date` is shown. */
  manual: boolean;
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
  /**
   * §14.6's way out, the same one `QuickAddComposer` carries: one refusal,
   * one treatment. The screen owns the route (`architecture/11` — this
   * package names no router), so a caller with nowhere to send a person
   * passes nothing and the banner states the refusal alone.
   */
  onSetRate?: () => void;
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
  onSetRate,
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

  /**
   * M2 — `toAmount ÷ amount` needs neither a reference rate nor the pivot;
   * gating it behind `referenceRate` rendered `0,0000` offline with nothing
   * held (S31 §6), even though both figures typed are enough on their own.
   *
   * **Both figures, though.** The rate is *derived from two amounts* (§3:
   * "the realized rate is derived and displayed, never typed"), so before
   * both exist there is no rate to state and `0,0000` is the absence of one
   * wearing a reading's clothes — the first thing the screen said, on open,
   * with nothing typed. `undefined` here is what removes the whole rate
   * panel below rather than filling it with a zero.
   */
  const realizedRate =
    money.isZero(amount) || money.isZero(toAmount)
      ? undefined
      : money.toMoney(money.dec(toAmount).dividedBy(amount));

  // §7.5's own worked example, generalised: `amount` valued at `1` (this
  // leg's own currency, treated as the common ground), `toAmount` valued at
  // the reciprocal of the reference rate. Neither figure is the system's real
  // pivot (§7.0 — invisible past `readCrossRate`), and `margin` does not need
  // it to be: the formula only needs both legs expressed in one shared unit.
  const marginResult =
    referenceRate === undefined || realizedRate === undefined
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
  //
  // C2/H1 — `fee` is raw typed text, and `money.toMoney` throws on anything
  // that is not a number (a letter, mid-typed punctuation) — `parseAmount`
  // is the one place that boundary is crossed. `null` on a non-empty field
  // is *unparsable*, not *absent*, so the total omits it (never a mid-typed
  // fraction of a fee) and the field shows its own caption instead — the
  // screen's own `saveDisabled`/`fieldErrors` are what actually refuse the
  // malformed figure.
  const parsedFee = fee === "" ? null : parseAmount(fee);
  const feeAmount = parsedFee === null ? undefined : money.toMoney(parsedFee);
  const feeUnparsable = fee !== "" && parsedFee === null;
  const total =
    marginInDestination === undefined && feeAmount === undefined
      ? undefined
      : money.add(marginInDestination ?? money.ZERO, feeAmount ?? money.ZERO);

  const feeError =
    fieldErrors?.byField["fee"]?.[0] ?? (feeUnparsable ? t("transactions.feeInvalid") : undefined);
  const toAccountError = fieldErrors?.byField["toAccountId"]?.[0];
  const amountError = fieldErrors?.byField["amountOriginal"]?.[0];
  const toAmountError = fieldErrors?.byField["toAmount"]?.[0];
  // §14.6 — declined before the write, with the currency named: the
  // controller refuses `create_transaction` on `accountId` (the *from* leg)
  // the moment the account holds no rate, and this is the one place that
  // refusal is ever rendered. `fromNeedsRate` covers it proactively, the
  // moment the picker names an uncapturable account; `accountIdError` is the
  // fallback for whatever else `byField.accountId` might carry.
  const rawAccountIdError = fieldErrors?.byField["accountId"]?.[0];
  const fromNeedsRate =
    from !== undefined && !from.capturable
      ? t("transactions.needsRate", { currency: from.currency })
      : undefined;
  /**
   * S05 §6's treatment, on the composer that reaches the same gate: a
   * `Banner` with the one action that ends it, never a muted line with no way
   * out — a person arrives here from S16's *Transfer from here* on the very
   * account that is blocked. `neutral`, never amber: P4 reserves amber for
   * the estimated-rate marker, which this screen actually renders.
   */
  // L2 — the controller's own refusal carries the same `needsRate` sentence
  // the banner states; one fact, stated once, on the half that carries the
  // way out.
  const accountIdError = rawAccountIdError === fromNeedsRate ? undefined : rawAccountIdError;
  const setRateAction =
    onSetRate === undefined || from === undefined
      ? undefined
      : {
          label: t("transactions.needsRateAction", { currency: from.currency }),
          onPress: onSetRate,
        };

  return (
    <View style={styles.root}>
      <View style={styles.chipRow}>
        <View style={styles.fromColumn}>
          <Chip
            placeholder={t("transactions.from")}
            value={from?.name}
            onPress={onOpenFromAccountPicker}
            machineFilled={false}
          />
          {accountIdError === undefined ? null : (
            <Text style={styles.fieldError}>{accountIdError}</Text>
          )}
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
      {fromNeedsRate === undefined ? null : (
        <Banner
          tone="neutral"
          message={fromNeedsRate}
          {...(setRateAction === undefined ? {} : { action: setRateAction })}
        />
      )}
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

          {realizedRate !== undefined || referenceRate === undefined ? null : (
            <ReferenceOnly reference={referenceRate} />
          )}
          {realizedRate === undefined ? null : (
            <RateField
              label={t("transactions.realized")}
              value={realizedRate}
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
                      carriedDays: referenceRate.carriedDays,
                      manual: referenceRate.manual,
                    },
                  }
                : {})}
            />
          )}

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
            keyboardType="decimal-pad"
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

/**
 * **The reference rate, standing alone.** S31 §3 draws two lines, and only
 * one of them is derived: *realized* needs both amounts (§7.5), *reference*
 * needs neither. `RateField` renders the pair and takes its `value`
 * unconditionally, so it has no shape for "the reference exists and the
 * realized figure does not" — which is the state this screen opens in, and
 * the state it returns to for as long as someone is backspacing the
 * destination amount to retype it (S31 §7: *"editing the destination amount
 * is the primary interaction"*). Withholding a fact that is already known,
 * mid-way through the one interaction that fact exists for, is the opposite
 * defect from the `0,0000` this gate fixes.
 *
 * The line is `RateField`'s own, through the same two keys and the same
 * `formatRate` — a caller-side copy of one `<Text>`, not a second definition
 * of what a reference rate *is*.
 */
function ReferenceOnly({ reference }: { reference: TransferComposerReferenceRate }) {
  const t = useT();
  const styles = useStyles();
  const locale = useLocale();
  const line =
    reference.carriedDays > 0
      ? t("transactions.referenceRateCarried", {
          rate: formatRate(reference.rate, locale, 4),
          source: reference.source,
          count: reference.carriedDays,
          date: reference.date,
        })
      : t("transactions.referenceRate", {
          rate: formatRate(reference.rate, locale, 4),
          source: reference.source,
          date: reference.date,
        });

  // `RateField`'s own construction, matched: a bare `<Text>` unless the pair
  // carries a person's own correction, in which case the `Tag` needs a row
  // to sit in.
  return reference.manual ? (
    <View style={styles.referenceRow}>
      <Text style={styles.reference}>{line}</Text>
      <Tag variant="warn">{t("transactions.manualRate")}</Tag>
    </View>
  ) : (
    <Text style={styles.reference}>{line}</Text>
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
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.md,
  },
  fromColumn: { gap: space.xs },
  fieldError: { color: theme.dangerText, ...text.ui("caption") },
  marginRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  /** `RateField`'s own reference line, matched — mono, tabular, muted. */
  referenceRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  reference: {
    color: theme.textMuted,
    ...text.mono("caption"),
    fontVariant: [...tabularNums],
  },
  marginLabel: { color: theme.textMuted, ...text.ui("body") },
  swap: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  swapBar: { position: "absolute", width: 14, height: 2, backgroundColor: theme.text },
  swapBarTop: { top: 5, borderRadius: radius.xs },
  swapBarBottom: { bottom: 5, borderRadius: radius.xs },
}));
