/**
 * `<TransferComposer>` — `screens/S31` §3–§9: move money between two of your
 * own accounts, and make the FX cost visible while typing rather than in a
 * report months later. The deck's anatomy: a *Leaves* card holding the amount
 * and the two legs as rows, and — across currencies — an *Arrives* card
 * holding the destination amount, the rate used and what it costs.
 *
 * **Fully controlled**, `QuickAddComposer`'s own contract: every value is a
 * prop in, every change a callback out. This component assembles no draft —
 * the screen is the one place `readCrossRate` is called and `QuickAddDraft`
 * is built.
 *
 * **Both amounts are typed, on the system keyboard.** The destination is
 * pre-filled from the reference rate and stays editable (§3): typing over it
 * is the primary interaction, because it is how a statement gets recorded
 * faithfully (§7). The screen owns both strings and the rule for when the
 * destination follows the source; this component only reports what was typed,
 * folded through `sanitizeAmount` onto the draft's one shape.
 *
 * **Same currency collapses.** One card, no *Arrives* — the realized rate is
 * exactly 1 and showing it would be showing nothing (§3).
 *
 * **The header and the footer are the screen's.** `ComposerHeader` is a fixed
 * band above the page scroller and Save is fixed below it; this is the part of
 * the screen between them.
 *
 * **`from`/`to` are opened, never rendered, here.** `AccountPicker`
 * (`accounts/`) is a sibling domain (`architecture/11`) — this only ever calls
 * `onOpenFromAccountPicker` / `onOpenToAccountPicker`.
 */

import { accountingDate, isAccountingDate } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { useCallback, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Amount } from "../../../fx/atoms/amount/amount";
import { formatRate } from "../../../fx/format-rate.ts";
import { parseAmount } from "../../../fx/molecules/amount-field/amount-field";
import { dayLabel, decimalMark } from "../../../i18n/locales";
import { useLocale, useT } from "../../../i18n/provider";
import { DateField } from "../../../primitives/atoms/date-field/date-field";
import { IconButton } from "../../../primitives/atoms/icon-button/icon-button";
import { Tag } from "../../../primitives/atoms/tag";
import { TextField } from "../../../primitives/atoms/text-field/text-field";
import type { FieldErrorMap } from "../../../primitives/field-errors.ts";
import { BottomSheet } from "../../../shell/organisms/bottom-sheet/bottom-sheet";
import { ArrowsLeftRightIcon } from "../../../shell/phosphor";
import { Banner } from "../../../states/molecules/banner/banner";
import { text, textCap } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import {
  DIGIT_EM,
  focus,
  radius,
  space,
  tabularNums,
  touchTarget,
  type as typeScale,
} from "../../../tokens.ts";
import { AMOUNT_INTEGER_DIGITS, sanitizeAmount } from "../../amount-keys.ts";
import { ComposerRow, ComposerRows } from "../../molecules/composer-rows/composer-rows";

export type TransferComposerAccount = {
  id: string;
  name: string;
  currency: string;
  /** The currency's own mark — `zł` — drawn beside the figure; the code where a currency has none. */
  symbol?: string;
  decimals: number;
  /** What the account holds, drawn on its leg row — the deck's own detail. */
  balance?: money.Money;
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

  /** The raw strings the draft holds — `"565,20"`, `""` at rest. Already folded onto the draft's shape. */
  amountRaw: string;
  onAmountChange: (raw: string) => void;
  toAmountRaw: string;
  onToAmountChange: (raw: string) => void;

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

type OpenSheet = "fee" | "date" | "note" | null;

export function TransferComposer({
  accounts,
  fromAccountId,
  onOpenFromAccountPicker,
  toAccountId,
  onOpenToAccountPicker,
  onSwap,
  amountRaw,
  onAmountChange,
  toAmountRaw,
  onToAmountChange,
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
  const locale = useLocale();
  const theme = useTheme();
  const styles = useStyles();
  const [openSheet, setOpenSheet] = useState<OpenSheet>(null);
  const [moreShown, setMoreShown] = useState(false);
  const [focused, setFocused] = useState<"amount" | "toAmount" | null>(null);

  const from = accounts.find((account) => account.id === fromAccountId);
  const to = accounts.find((account) => account.id === toAccountId);
  const sameCurrency = from !== undefined && to !== undefined && from.currency === to.currency;
  const sameAccount = fromAccountId !== null && fromAccountId === toAccountId;
  const mark = decimalMark(locale);

  const closeSheet = useCallback(() => setOpenSheet(null), []);
  const handleOpenFeeSheet = useCallback(() => setOpenSheet("fee"), []);
  const handleOpenDateSheet = useCallback(() => setOpenSheet("date"), []);
  const handleOpenNoteSheet = useCallback(() => setOpenSheet("note"), []);
  const handleToggleMore = useCallback(() => setMoreShown((shown) => !shown), []);
  const handleAmountFocus = useCallback(() => setFocused("amount"), []);
  const handleToAmountFocus = useCallback(() => setFocused("toAmount"), []);
  const handleBlur = useCallback(() => setFocused(null), []);
  const handleAmountText = useCallback(
    (typed: string) => onAmountChange(sanitizeAmount(typed, from?.decimals ?? 2, mark)),
    [onAmountChange, from?.decimals, mark],
  );
  const handleToAmountText = useCallback(
    (typed: string) => onToAmountChange(sanitizeAmount(typed, to?.decimals ?? 2, mark)),
    [onToAmountChange, to?.decimals, mark],
  );

  const amount = money.toMoney(amountRaw === "" ? "0" : amountRaw.replace(",", "."));
  const toAmount = money.toMoney(toAmountRaw === "" ? "0" : toAmountRaw.replace(",", "."));

  /**
   * M2 — `toAmount ÷ amount` needs neither a reference rate nor the pivot.
   * **Both figures, though.** The rate is *derived from two amounts* (§3:
   * "the realized rate is derived and displayed, never typed"), so before
   * both exist there is no rate to state, and the tile shows the reference
   * instead — a fact the ledger already holds.
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

  /**
   * S31 §3's *Costs you* — the margin and the stated fee, summed for the one
   * figure this screen states while typing, **in the source currency**: the
   * margin's pivot leg above *is* the source (valued at 1), and §9.1 states
   * the fee in the source too, so the two add without a conversion — which
   * is what the deck draws (*−8,40 zł* on a transfer out of złoty). An
   * earlier line added the fee in the source to a margin in the destination
   * and labelled the sum with the destination's currency; on 150 USD to
   * 565,20 PLN with a 5 USD fee it read *11,30 PLN* for a cost of 25,35.
   * `FX Cost` (§12.2) still reports the two apart.
   *
   * C2/H1 — `fee` is raw typed text, and `money.toMoney` throws on anything
   * that is not a number — `parseAmount` is the one place that boundary is
   * crossed. `null` on a non-empty field is *unparsable*, not *absent*, so
   * the total omits it and the field shows its own caption instead.
   */
  const parsedFee = fee === "" ? null : parseAmount(fee);
  const feeAmount = parsedFee === null ? undefined : money.toMoney(parsedFee);
  const feeUnparsable = fee !== "" && parsedFee === null;
  // Rounded to the source's own scale before it is drawn: a residue of
  // 0.0036 from rounding the prefilled figure is *0.00*, and its sign is not
  // a cost or a gain.
  const total =
    marginResult === undefined && feeAmount === undefined
      ? undefined
      : money.round(
          money.add(marginResult?.marginPivot ?? money.ZERO, feeAmount ?? money.ZERO),
          from?.decimals ?? 2,
        );

  const feeError =
    fieldErrors?.byField["fee"]?.[0] ?? (feeUnparsable ? t("transactions.feeInvalid") : undefined);
  const toAccountError = fieldErrors?.byField["toAccountId"]?.[0];
  const amountError = fieldErrors?.byField["amountOriginal"]?.[0];
  const toAmountError = fieldErrors?.byField["toAmount"]?.[0];
  const dateError = fieldErrors?.byField["date"]?.[0];
  // §14.6 — declined before the write, with the currency named: the
  // controller refuses `create_transaction` on `accountId` (the *from* leg)
  // the moment the account holds no rate, and this is the one place that
  // refusal is ever rendered. `fromNeedsRate` covers it proactively.
  const rawAccountIdError = fieldErrors?.byField["accountId"]?.[0];
  const fromNeedsRate =
    from !== undefined && !from.capturable
      ? t("transactions.needsRate", { currency: from.currency })
      : undefined;
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

  /** What the folded *More details* row says it holds — only the fields that hold something. */
  const moreSummary = [
    fee === "" ? null : `${t("transactions.fee")} ${fee}`,
    date === today ? null : isAccountingDate(date) ? dayLabel(accountingDate(date), locale) : date,
    note.trim() === "" ? null : note,
  ]
    .filter((part) => part !== null)
    .join(" · ");
  const moreError = feeError ?? dateError;

  const referenceSource = referenceRate?.source.toUpperCase();
  const referenceDate =
    referenceRate === undefined
      ? undefined
      : isAccountingDate(referenceRate.date)
        ? dayLabel(accountingDate(referenceRate.date), locale)
        : referenceRate.date;
  const provenance =
    referenceRate === undefined
      ? undefined
      : t(
          referenceRate.carriedDays > 0
            ? "transactions.rateProvenanceCarried"
            : "transactions.rateProvenance",
          {
            source: referenceSource ?? "",
            date: referenceDate ?? "",
            count: referenceRate.carriedDays,
          },
        );
  const rateShown = realizedRate ?? referenceRate?.rate;
  // Sized to the figure, so the affix follows it (`amount-card.tsx`'s own reason).
  const leavesWidth = {
    width: Math.max(1, amountRaw.length) * DIGIT_EM * typeScale.displayOne.fontSize,
  };
  const arrivesWidth = {
    width: Math.max(1, toAmountRaw.length) * DIGIT_EM * typeScale.displayTwo.fontSize,
  };

  return (
    <View style={styles.root}>
      {fieldErrors && fieldErrors.formLevel.length > 0 ? (
        // A refusal a person cannot see is a refusal that never happened
        // (`field-errors.ts`): whatever `mapFieldErrors` could not place on a
        // field is stated here, over the cards, the way `QuickAddForm` does.
        <View style={styles.formLevel} accessibilityRole="alert">
          <Text style={styles.formLevelHeading}>{t("common.couldNotSave")}</Text>
          {fieldErrors.formLevel.map((message) => (
            <Text key={message} style={styles.fieldError}>
              {message}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={styles.card}>
        <View style={styles.kickerRow}>
          <Text style={styles.kicker}>{t("transactions.leaves")}</Text>
          <IconButton label={t("transactions.swapDirection")} onPress={onSwap} size={32}>
            <View style={styles.swap}>
              <ArrowsLeftRightIcon size={18} color={theme.textMuted} />
            </View>
          </IconButton>
        </View>
        <View style={[styles.figure, focused === "amount" ? styles.figureFocused : null]}>
          <TextInput
            accessibilityLabel={t("transactions.amount")}
            value={amountRaw.replace(",", mark)}
            onChangeText={handleAmountText}
            onFocus={handleAmountFocus}
            onBlur={handleBlur}
            placeholder="0"
            placeholderTextColor={styles.placeholder.color}
            keyboardType="decimal-pad"
            inputMode="decimal"
            maxLength={AMOUNT_INTEGER_DIGITS + 1 + (from?.decimals ?? 2)}
            maxFontSizeMultiplier={textCap("displayOne")}
            style={[styles.leavesInput, leavesWidth]}
          />
          {from === undefined ? null : (
            <Text style={styles.affix}>{from.symbol ?? from.currency}</Text>
          )}
        </View>
        {amountError === undefined ? null : <Text style={styles.fieldError}>{amountError}</Text>}
        {/* A same-currency pair has no *Arrives* card, so a refusal on the
            destination leg — one figure, two columns — is stated here. */}
        {sameCurrency && toAmountError !== undefined ? (
          <Text style={styles.fieldError}>{toAmountError}</Text>
        ) : null}
        <ComposerRows>
          <ComposerRow
            first
            label={t("transactions.from")}
            value={from?.name}
            placeholder={t("transactions.account")}
            onPress={onOpenFromAccountPicker}
            error={accountIdError}
            {...(from?.balance === undefined
              ? {}
              : {
                  trailing: (
                    <Amount
                      value={from.balance}
                      currency={from.currency}
                      decimals={from.decimals}
                      size="compact"
                      emphasis="muted"
                    />
                  ),
                })}
          />
          <ComposerRow
            label={t("transactions.to")}
            value={to?.name}
            placeholder={t("transactions.account")}
            onPress={onOpenToAccountPicker}
            error={
              toAccountError ?? (sameAccount ? t("transactions.sameAccountRefused") : undefined)
            }
            {...(to?.balance === undefined
              ? {}
              : {
                  trailing: (
                    <Amount
                      value={to.balance}
                      currency={to.currency}
                      decimals={to.decimals}
                      size="compact"
                      emphasis="muted"
                    />
                  ),
                })}
          />
          <ComposerRow
            label={t("transactions.moreDetails")}
            value={moreSummary === "" ? undefined : moreSummary}
            placeholder={t("transactions.moreDetailsTransferHint")}
            onPress={handleToggleMore}
            error={moreShown ? undefined : moreError}
          />
          {moreShown ? (
            <>
              <ComposerRow
                label={t("transactions.fee")}
                value={fee === "" ? undefined : fee}
                placeholder={from === undefined ? undefined : from.currency}
                onPress={handleOpenFeeSheet}
                // The sheet states it while it is open; the row states it after.
                error={openSheet === "fee" ? undefined : feeError}
              />
              <ComposerRow
                label={t("transactions.date")}
                value={date === today ? t("shell.today") : date}
                onPress={handleOpenDateSheet}
                error={dateError}
              />
              <ComposerRow
                label={t("common.note")}
                value={note.trim() === "" ? undefined : note}
                placeholder={t("transactions.notePlaceholder")}
                onPress={handleOpenNoteSheet}
              />
            </>
          ) : null}
        </ComposerRows>
        {fromNeedsRate === undefined ? null : (
          <Banner
            tone="neutral"
            message={fromNeedsRate}
            {...(setRateAction === undefined ? {} : { action: setRateAction })}
          />
        )}
      </View>

      {sameCurrency || to === undefined ? null : (
        <View style={styles.card}>
          <View style={styles.kickerRow}>
            <Text style={styles.kicker}>{t("transactions.arrives")}</Text>
            {provenance === undefined ? null : (
              <View style={styles.provenanceRow}>
                <Text style={styles.provenance} numberOfLines={1}>
                  {provenance}
                </Text>
                {/* H2 — the tag says a person corrected *some* leg; when the
                    leg shown is itself the manual one, the source already
                    says so and the tag would say it twice. */}
                {referenceRate?.manual && referenceRate.source !== "manual" ? (
                  <Tag variant="warn">{t("transactions.manualRate")}</Tag>
                ) : null}
              </View>
            )}
          </View>
          <View style={[styles.figure, focused === "toAmount" ? styles.figureFocused : null]}>
            <TextInput
              accessibilityLabel={t("transactions.destinationAmount")}
              value={toAmountRaw.replace(",", mark)}
              onChangeText={handleToAmountText}
              onFocus={handleToAmountFocus}
              onBlur={handleBlur}
              placeholder="0"
              placeholderTextColor={styles.placeholder.color}
              keyboardType="decimal-pad"
              inputMode="decimal"
              maxLength={AMOUNT_INTEGER_DIGITS + 1 + to.decimals}
              maxFontSizeMultiplier={textCap("displayTwo")}
              style={[styles.arrivesInput, arrivesWidth]}
            />
            <Text style={styles.affixSmall}>{to.symbol ?? to.currency}</Text>
          </View>
          {toAmountError === undefined ? null : (
            <Text style={styles.fieldError}>{toAmountError}</Text>
          )}
          {rateShown === undefined && total === undefined ? null : (
            <View style={styles.tiles}>
              {rateShown === undefined || from === undefined ? null : (
                <View style={styles.tile}>
                  <Text style={styles.tileLabel}>{t("transactions.rateUsed")}</Text>
                  <Text style={styles.tileRate}>{formatRate(rateShown, locale, 4)}</Text>
                  {/* L9 — a rate has no unit of its own; this one reads
                      destination per source, `RateTable`'s own header. */}
                  <Text style={styles.tileUnit}>
                    {t("fx.rateTableRateHeader", { quote: to.currency, base: from.currency })}
                  </Text>
                </View>
              )}
              {total === undefined || from === undefined ? null : (
                <View style={styles.tile}>
                  {/* A cost is money that left: drawn negative, in the spend
                      ink, under *Costs you*; a transfer that beat the
                      reference is money kept, drawn `+` under *Saves you* —
                      §7.5's *never clamped*, and the sign in words as well as
                      ink (P5). */}
                  <Text style={styles.tileLabel}>
                    {t(
                      money.isPositive(money.mul(total, -1))
                        ? "transactions.savesYou"
                        : "transactions.costsYou",
                    )}
                  </Text>
                  <Amount
                    value={money.mul(total, -1)}
                    currency={from.currency}
                    decimals={from.decimals}
                    size="body"
                    signed
                    kind={money.isZero(total) ? "transfer" : "net"}
                  />
                </View>
              )}
            </View>
          )}
          {realizedRate === undefined || referenceRate === undefined ? null : (
            <Text style={styles.reference}>
              {t(
                referenceRate.carriedDays > 0
                  ? "transactions.referenceRateCarried"
                  : "transactions.referenceRate",
                {
                  rate: formatRate(referenceRate.rate, locale, 4),
                  source: referenceSource ?? "",
                  count: referenceRate.carriedDays,
                  date: referenceDate ?? "",
                },
              )}
            </Text>
          )}
          <Text style={styles.note}>{t("transactions.transferSpreadNote")}</Text>
        </View>
      )}

      <BottomSheet
        visible={openSheet === "fee"}
        title={t("transactions.fee")}
        onDismiss={closeSheet}
      >
        <TextField
          label={t("transactions.fee")}
          value={fee}
          onChangeText={onFeeChange}
          keyboardType="decimal-pad"
          {...(feeError === undefined ? {} : { error: feeError })}
        />
      </BottomSheet>
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

const useStyles = makeStyles((theme) => ({
  // The deck's 16 between the two cards.
  root: { gap: space.x3 },
  // The deck's transfer card: 16 all round, 12 between its parts.
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.md,
    padding: space.x3,
    gap: space.xl,
  },
  kickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    minHeight: 32,
  },
  kicker: { color: theme.textMuted, ...text.ui("kicker"), textTransform: "uppercase" },
  provenanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: space.sm,
    flexShrink: 1,
  },
  provenance: { color: theme.textMuted, ...text.ui("caption"), flexShrink: 1 },
  figure: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.md,
    minHeight: touchTarget.min,
    borderRadius: radius.xs,
  },
  // The card is the field; the ring is on the row the input fills (§2.6).
  figureFocused: {
    outlineWidth: focus.width,
    outlineStyle: "solid",
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  leavesInput: {
    flexShrink: 1,
    padding: 0,
    color: theme.text,
    ...text.display("displayOne"),
    fontVariant: [...tabularNums],
    // The default `auto` renders its own ring regardless of an author
    // `outlineWidth: 0` (`amount-field.tsx`'s own note).
    outlineWidth: 0,
    outlineStyle: "solid",
  },
  arrivesInput: {
    flexShrink: 1,
    padding: 0,
    color: theme.text,
    ...text.display("displayTwo"),
    fontVariant: [...tabularNums],
    outlineWidth: 0,
    outlineStyle: "solid",
  },
  // `textMuted`, never `textFaint`: a placeholder is read.
  placeholder: { color: theme.textMuted },
  affix: { color: theme.accentText, ...text.ui("displayThree") },
  affixSmall: { color: theme.accentText, ...text.ui("body", 600) },
  fieldError: { color: theme.dangerText, ...text.ui("caption") },
  // The deck's two inset tiles: 12 inside, 10 apart, on the inset fill.
  tiles: { flexDirection: "row", gap: space.lg },
  tile: {
    backgroundColor: theme.insetFill,
    borderRadius: radius.sm,
    padding: space.xl,
    gap: space.xxs,
    minWidth: 120,
  },
  tileLabel: {
    color: theme.textMuted,
    ...text.ui("kicker", 500),
    textTransform: "none",
    letterSpacing: 0,
  },
  tileRate: { color: theme.text, ...text.ui("body", 600), fontVariant: [...tabularNums] },
  tileUnit: { color: theme.textMuted, ...text.ui("caption") },
  formLevel: { gap: space.xs },
  formLevelHeading: { color: theme.dangerText, ...text.ui("body", 600) },
  /** The reference, once the tile shows the realized rate — the deck's caption, tabular. */
  reference: {
    color: theme.textMuted,
    ...text.ui("caption"),
    fontVariant: [...tabularNums],
  },
  note: { color: theme.textMuted, ...text.ui("caption") },
  // The two arrows turned upright: the legs are stacked, so the swap is vertical.
  swap: { transform: [{ rotate: "90deg" }] },
}));
