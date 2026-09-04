/**
 * `<SettleSheet>` — `screens/S14` §3–§9: discharge a debt, possibly in a
 * different currency, at a rate the two of you agreed.
 *
 * **Fully controlled**, the same contract `QuickAddComposer` keeps for its own
 * fields: every value is a prop in, every change a callback out. This
 * component owns no draft state of its own — the composing screen is the one
 * place `SettleDebtDraft` (`packages/client`) is assembled, and the one place
 * that ever calls `readCrossRate` (`counterparties/` may not import
 * `transactions/`, and neither may import `client` — `architecture/11`).
 *
 * **The keypad is `keypad`, not a prop this component understands** — the
 * same escape `Dock` already uses for the same reason: `Keypad` and
 * `applyKey` live in the sibling `transactions/` domain, so the screen wires
 * them (exactly as `quick-add-screen.tsx` already does) and hands the result
 * in. `activeField` says which of the two hero amounts the keypad is
 * currently editing; tapping the other one moves it (S31 §7, the same
 * interaction this sheet borrows).
 *
 * **The "Into"/"From" account is opened, never rendered, here.**
 * `AccountPicker` (`accounts/`) is a sibling domain — `counterparties/` may
 * not import it any more than it may import `transactions/` — so this only
 * ever calls `onOpenAccountPicker`, and the screen composes the sheet, wiring
 * its own pick straight onto `accountId` (`architecture/11`).
 *
 * **The rate is derived, never typed** (§6, correcting §3's own stale
 * mockup): `amount` (what changed hands, in the "Into"/"From" account's own
 * currency) and `dischargesAmount` (how much of the picked balance this
 * clears, in its own currency) are the two facts a person enters — this
 * sheet follows `TransferAmount`'s own shape, two amounts, one derived rate.
 * The residual shown is **always an estimate, before commit** (§5) — the real
 * remainder is `settleDebt`'s own return (H9), computed server-side or by the
 * local executor from live data, never from this sheet's stale snapshot.
 */

import * as money from "@waltning/core/money";
import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { Amount } from "../fx/amount";
import { AmountField } from "../fx/amount-field";
import { decimalMark } from "../i18n/locales.ts";
import { useLocale, useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { Chip } from "../primitives/chip";
import type { FieldErrorMap } from "../primitives/field-errors.ts";
import { RadioGroup, type RadioGroupProps } from "../primitives/radio";
import { RateField } from "../primitives/rate-field";
import { TextField } from "../primitives/text-field";
import { BottomSheet } from "../shell/bottom-sheet";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { radius, space } from "../tokens.ts";

export type SettleSheetBalance = {
  currency: string;
  /** Signed by obligation (§6.6) — positive: they owe you; negative: you owe them. */
  balance: money.Money;
  decimals?: number;
};

export type SettleSheetAccount = {
  id: string;
  name: string;
  currency: string;
  capturable: boolean;
};

export type SettleSheetReferenceRate = {
  /** Pivot-per-unit, discharges-currency → account-currency — multiply `dischargesAmount` by this to reach `amount` (§7.5's direction, `readCrossRate`'s answer). */
  rate: money.PivotPerUnit;
  source: string;
  date: string;
};

export type SettleSheetField = "amount" | "discharges";

export type SettleSheetProps = {
  visible: boolean;
  counterpartyName: string;
  /** Every open balance with this counterparty — the Discharges picker (S14 §9.1). */
  balances: readonly SettleSheetBalance[];
  /** Where the money lands or leaves from. */
  accounts: readonly SettleSheetAccount[];

  /** The raw string `Keypad` edits for the "Into"/"From" leg. */
  amountRaw: string;
  /** Which balance currency this settlement discharges — `null` before a pick. */
  dischargesCurrency: string | null;
  onDischargesCurrencyChange: (currency: string) => void;
  /** The raw string `Keypad` edits for the discharged leg. */
  dischargesRaw: string;
  /** Which hero amount the keypad below is currently routed to. */
  activeField: SettleSheetField;
  onActiveFieldChange: (field: SettleSheetField) => void;

  accountId: string | null;
  /** Opens `AccountPicker` (`accounts/`) — the screen composes it, this only ever asks. */
  onOpenAccountPicker: () => void;

  /** `readCrossRate` for the currently picked pair — `undefined` with nothing held (offline, S14 §6). */
  referenceRate?: SettleSheetReferenceRate | undefined;

  note: string;
  onNoteChange: (note: string) => void;

  /** Older than this session (S14 §6) — every balance row and the result card say so. */
  stale: boolean;
  /** The phone's own last write — the "as of" stamp. Required when `stale`. */
  stampedAt?: number;

  /** `Keypad`, wired to whichever raw string `activeField` names — never built here. */
  keypad: React.ReactNode;

  onDismiss: () => void;
  onSettle: () => void;
  fieldErrors?: FieldErrorMap;
};

function decimalsOf(list: readonly { currency: string; decimals?: number }[], currency: string) {
  return list.find((row) => row.currency === currency)?.decimals ?? 2;
}

/** `money.DebtDirection`, as the signed multiplier this sheet's own arithmetic needs (M1). */
function directionSign(direction: money.DebtDirection): -1 | 0 | 1 {
  if (direction === "settled") return 0;
  return direction === "theyOwe" ? 1 : -1;
}

/**
 * An account's own label — name plus currency, **once**.
 *
 * The placeholder convention already bakes the currency into the name
 * (`Cash · PLN`), so appending it unconditionally read `Cash · PLN · PLN`
 * (S14 §3's own mockup shows the field with the name alone). This only
 * appends when the name does not already end with it.
 */
function accountLabel(name: string, currency: string): string {
  return name.endsWith(`· ${currency}`) ? name : `${name} · ${currency}`;
}

/** `HH:mm`, the device's own locale — `formatClockTime`'s own twin (`quick-add-composer.tsx`). */
function formatClockTime(at: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(
    new Date(at),
  );
}

export function SettleSheet({
  visible,
  counterpartyName,
  balances,
  accounts,
  amountRaw,
  dischargesCurrency,
  onDischargesCurrencyChange,
  dischargesRaw,
  activeField,
  onActiveFieldChange,
  accountId,
  onOpenAccountPicker,
  referenceRate,
  note,
  onNoteChange,
  stale,
  stampedAt,
  keypad,
  onDismiss,
  onSettle,
  fieldErrors,
}: SettleSheetProps) {
  const t = useT();
  const styles = useStyles();
  const mark = decimalMark(useLocale());
  const handleActivateAmount = useCallback(
    () => onActiveFieldChange("amount"),
    [onActiveFieldChange],
  );
  const handleActivateDischarges = useCallback(
    () => onActiveFieldChange("discharges"),
    [onActiveFieldChange],
  );

  const picked = balances.find((row) => row.currency === dischargesCurrency);
  const dischargesDecimals = decimalsOf(balances, dischargesCurrency ?? "");
  // M1 — decided at the currency's own scale (§6.6), the same rule
  // `debtDirection` states everywhere else: a balance that reads `0,00` at
  // its own decimals must never be called "they owe you" just because the
  // full 8dp value is a whisker off zero.
  const sign = directionSign(
    picked === undefined ? "settled" : money.debtDirection(picked.balance, dischargesDecimals),
  );
  const account = accounts.find((row) => row.id === accountId);

  const dischargesAmount = money.toMoney(
    dischargesRaw === "" ? "0" : dischargesRaw.replace(",", "."),
  );
  const amount = money.toMoney(amountRaw === "" ? "0" : amountRaw.replace(",", "."));

  // §6 — the rate two typed amounts imply, never an input. Zero divides by
  // zero, so an empty discharge has no rate yet, same rule `TransferAmount`
  // states for a zero source leg. `Money`, not `PivotPerUnit`: this is a
  // figure for `RateField` to *display*, the same way `TransferAmount`'s own
  // `realized` is `toMoney`'d rather than branded for conversion arithmetic.
  const realizedRate = money.isZero(dischargesAmount)
    ? money.ZERO
    : money.toMoney(money.dec(amount).dividedBy(dischargesAmount));

  // The residual, estimated from this session's own snapshot — S14 §5's
  // whole reason for existing: shown, but never what `onSettle` sends. §6.6's
  // negation, applied forward: discharging moves the balance toward zero by
  // `dischargesAmount`, signed the same way the balance itself is.
  const residual =
    picked === undefined
      ? money.ZERO
      : money.sub(picked.balance, money.mul(dischargesAmount, sign));
  const residualSign = directionSign(money.debtDirection(residual, dischargesDecimals));
  const overSettled = sign !== 0 && residualSign !== 0 && residualSign !== sign;
  // P5 — direction in words, never by sign alone. `residual` above stays
  // signed for the arithmetic; everything rendered reads its magnitude and
  // states the direction separately.
  const residualDirection =
    residualSign === 0
      ? undefined
      : residualSign > 0
        ? t("counterparties.theyOweYou")
        : t("counterparties.youOweThem");

  const balanceLabel = useMemo(
    () => (row: SettleSheetBalance) => {
      const direction =
        money.debtDirection(row.balance, row.decimals ?? 2) === "theyOwe"
          ? t("counterparties.theyOweYou")
          : t("counterparties.youOweThem");
      return `${row.currency} · ${money.forDisplay(money.abs(row.balance), row.decimals ?? 2, mark)} · ${direction}`;
    },
    [t, mark],
  );
  const balanceHint = useMemo(
    () =>
      stale && stampedAt !== undefined
        ? t("counterparties.asOf", { date: formatClockTime(stampedAt) })
        : undefined,
    [stale, stampedAt, t],
  );

  // M1 — a balance that is `settled` at its own currency's scale cannot be
  // settled again (the executor itself refuses "nothing to settle" —
  // `settle-debt.executor.ts`), so it is never offered as a Discharges
  // choice, whether the picker renders as a radio group or a lone plain
  // fact.
  const openBalances = useMemo(
    () =>
      balances.filter((row) => money.debtDirection(row.balance, row.decimals ?? 2) !== "settled"),
    [balances],
  );

  // `RadioGroup`'s own contract needs two options — "a lone radio is a
  // checkbox with worse manners" — and the ordinary case here is exactly one
  // open balance. One row reads as a fact, not a choice, so it renders as
  // plain text rather than a radio group of one.
  const balanceOptions = useMemo<RadioGroupProps["options"] | undefined>(() => {
    const mapped = openBalances.map((row) => ({
      value: row.currency,
      label: balanceLabel(row),
      ...(balanceHint === undefined ? {} : { hint: balanceHint }),
    }));
    const [first, second, ...rest] = mapped;
    if (first === undefined || second === undefined) return undefined;
    return [first, second, ...rest];
  }, [openBalances, balanceLabel, balanceHint]);
  const singleOpenBalance = openBalances.length === 1 ? openBalances[0] : undefined;

  const intoLabel = sign < 0 ? t("transactions.from") : t("counterparties.into");

  const dischargesError = fieldErrors?.byField["discharges.currency"]?.[0];
  const accountError = fieldErrors?.byField["accountId"]?.[0];
  const amountError = fieldErrors?.byField["amount"]?.[0];
  // H1 — `settleDebtRefusal` (`create-phone-ledger.ts`) never returns
  // `null`: an unrecognised message still lands here, at `path: ""`, which
  // `mapFieldErrors` routes to `formLevel` rather than dropping it. A
  // refusal a person cannot see is a refusal that never happened.
  const counterpartyError = fieldErrors?.byField["counterpartyId"]?.[0];

  // C1 — the same guard `TransferComposer`'s own `fromNeedsRate` states: the
  // controller refuses `settle_debt` on `accountId` before the write once the
  // picked account holds no rate (§14.6), so this sheet declines proactively
  // rather than letting a tap reach the controller only to bounce. Takes
  // priority over any other `accountId` refusal already on the field, the
  // same ordering `fromCaption` keeps.
  const accountNeedsRate =
    account !== undefined && !account.capturable
      ? t("transactions.needsRate", { currency: account.currency })
      : undefined;
  const accountCaption = accountNeedsRate ?? accountError;

  const saveDisabled =
    // L1 — the *picked* currency must itself be open, not merely "something
    // is": `openBalances.length === 0` passed even when `dischargesCurrency`
    // named a balance that had since settled (dust) while a different
    // currency was still open — armed Settle on a discharge that no longer
    // exists. `.some` over the picked currency catches that stale pick too.
    !openBalances.some((row) => row.currency === dischargesCurrency) ||
    dischargesCurrency === null ||
    accountId === null ||
    money.isZero(amount) ||
    money.isZero(dischargesAmount) ||
    accountNeedsRate !== undefined;

  return (
    <BottomSheet
      visible={visible}
      title={t("counterparties.settlingWith", { name: counterpartyName })}
      onDismiss={onDismiss}
    >
      <View style={styles.body}>
        {counterpartyError === undefined ? null : (
          <Text style={styles.fieldError}>{counterpartyError}</Text>
        )}
        <AmountField
          variant="hero"
          label={t("transactions.amount")}
          {...(account ? { currency: account.currency } : {})}
          value={amountRaw}
          onPress={handleActivateAmount}
          active={activeField === "amount"}
        />
        {amountError === undefined ? null : <Text style={styles.fieldError}>{amountError}</Text>}

        <Text style={styles.sectionLabel}>{t("counterparties.discharges")}</Text>
        {balanceOptions === undefined ? (
          singleOpenBalance === undefined ? (
            // M — every balance held is dust at its own currency's scale
            // (M1's own filter, empty): nothing here for Settle to discharge,
            // stated plainly rather than an empty section with the button
            // still armed.
            <Text style={styles.nothingToSettle}>{t("counterparties.nothingToSettle")}</Text>
          ) : (
            <Text style={styles.singleBalance}>
              {balanceLabel(singleOpenBalance)}
              {balanceHint === undefined ? "" : ` · ${balanceHint}`}
            </Text>
          )
        ) : (
          <RadioGroup
            label={t("counterparties.discharges")}
            options={balanceOptions}
            value={dischargesCurrency}
            onChange={onDischargesCurrencyChange}
          />
        )}
        {dischargesError === undefined ? null : (
          <Text style={styles.fieldError}>{dischargesError}</Text>
        )}

        {dischargesCurrency === null ? null : (
          <AmountField
            variant="hero"
            label={t("counterparties.discharges")}
            currency={dischargesCurrency}
            value={dischargesRaw}
            onPress={handleActivateDischarges}
            active={activeField === "discharges"}
          />
        )}

        <Chip
          placeholder={intoLabel}
          value={account === undefined ? undefined : accountLabel(account.name, account.currency)}
          onPress={onOpenAccountPicker}
          machineFilled={false}
        />
        {accountCaption === undefined ? null : (
          <Text style={accountNeedsRate === undefined ? styles.fieldError : styles.needsRate}>
            {accountCaption}
          </Text>
        )}

        <RateField
          label={t("transactions.realized")}
          value={realizedRate}
          // L9 — a rate has no unit of its own (`RateField`'s own doc);
          // `realizedRate` is `amount` (the account's currency) per one
          // `dischargesAmount` (the picked balance's own), the same
          // `{{quote}} per {{base}}` reading `RateTable`'s header states.
          {...(account && dischargesCurrency
            ? {
                unit: t("fx.rateTableRateHeader", {
                  quote: account.currency,
                  base: dischargesCurrency,
                }),
              }
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

        <View style={styles.result}>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>{t("counterparties.resultDischarges")}</Text>
            <Amount
              value={dischargesAmount}
              currency={dischargesCurrency ?? ""}
              decimals={dischargesDecimals}
            />
          </View>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>
              {stale
                ? t("counterparties.resultRemainingEstimated")
                : t("counterparties.resultRemaining")}
            </Text>
            <View style={styles.resultValueGroup}>
              <Amount
                value={money.abs(residual)}
                currency={dischargesCurrency ?? ""}
                decimals={dischargesDecimals}
              />
              {residualDirection === undefined ? null : (
                <Text style={styles.direction}>{residualDirection}</Text>
              )}
            </View>
          </View>
          {!stale || stampedAt === undefined ? null : (
            <Text style={styles.staleLine}>
              {t("counterparties.stampedFrom", { time: formatClockTime(stampedAt) })}
            </Text>
          )}
          {!overSettled ? null : (
            <Text style={styles.staleLine}>
              {t("counterparties.overSettled", {
                amount: `${money.forDisplay(money.abs(residual), dischargesDecimals, mark)} ${dischargesCurrency ?? ""}`,
              })}
              {residualDirection === undefined ? null : ` · ${residualDirection}`}
            </Text>
          )}
        </View>

        <TextField
          label={t("common.note")}
          hint={t("counterparties.notePrompt")}
          value={note}
          onChangeText={onNoteChange}
          maxLength={2000}
        />

        {keypad}

        {fieldErrors && fieldErrors.formLevel.length > 0 ? (
          <View style={styles.formLevel} accessibilityRole="alert">
            {fieldErrors.formLevel.map((message) => (
              <Text key={message} style={styles.formLevelMessage}>
                {message}
              </Text>
            ))}
          </View>
        ) : null}

        <Button
          label={t("counterparties.settle")}
          onPress={onSettle}
          disabled={saveDisabled}
          variant="primary"
          size="lg"
        />
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((theme) => ({
  body: { gap: space.x3 },
  fieldError: { color: theme.dangerText, ...text.ui("caption") },
  formLevel: { gap: space.xs },
  formLevelMessage: { color: theme.dangerText, ...text.ui("caption") },
  needsRate: { color: theme.textMuted, ...text.ui("caption") },
  sectionLabel: {
    color: theme.textMuted,
    ...text.ui("kicker"),
    textTransform: "uppercase",
  },
  singleBalance: { color: theme.text, ...text.ui("body") },
  nothingToSettle: { color: theme.textMuted, ...text.ui("body") },
  result: {
    gap: space.xs,
    padding: space.x3,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  resultRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resultLabel: { color: theme.textMuted, ...text.ui("body") },
  /** The magnitude and its direction — P5's "in words", stacked so the sign is never the only signal. */
  resultValueGroup: { alignItems: "flex-end", gap: space.xxs },
  direction: { color: theme.textMuted, ...text.ui("caption") },
  staleLine: { color: theme.assertedText, ...text.ui("caption") },
}));
