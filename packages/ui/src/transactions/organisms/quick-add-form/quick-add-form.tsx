import { accountingDate, isAccountingDate } from "@waltning/core/date";
import type { CurrencyCode } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { formatRate } from "../../../fx/format-rate.ts";
import { AmountField, parseAmount } from "../../../fx/molecules/amount-field/amount-field";
import { dayLabel, decimalMark } from "../../../i18n/locales.ts";
import { useLocale, useT } from "../../../i18n/provider";
import { Button } from "../../../primitives/atoms/button/button";
import { Chip } from "../../../primitives/atoms/chip/chip";
import { DateField } from "../../../primitives/atoms/date-field/date-field";
import { RadioGroup, type RadioGroupProps } from "../../../primitives/atoms/radio/radio";
import {
  SegmentControl,
  type SegmentControlProps,
} from "../../../primitives/atoms/segment-control/segment-control";
import { Select, type SelectProps } from "../../../primitives/atoms/select/select";
import { TextField } from "../../../primitives/atoms/text-field/text-field";
import { Toggle } from "../../../primitives/atoms/toggle/toggle";
import { FieldAnchor } from "../../../primitives/field-anchor";
import type { FieldErrorMap } from "../../../primitives/field-errors.ts";
import { useSubmitCheck } from "../../../primitives/use-submit-check.ts";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { space } from "../../../tokens.ts";

/**
 * `currency` was declared `"USD"`, which made the compiler the enforcer of a
 * single-currency preview at every call site. It is the account's own currency,
 * and the amount field takes it from whichever account is selected — an expense
 * is denominated by the account it leaves.
 */
export type QuickAddAccount = {
  id: string;
  name: string;
  currency: CurrencyCode;
  /**
   * Whether an expense against this account can be valued.
   *
   * `false` when the ledger holds no exchange rate for the account's currency,
   * which is the ordinary state of a phone that has never synced (§14.6). The
   * account is shown either way — hiding it would read as *this account is
   * gone* rather than *not into this one, yet* — and picking it explains why.
   */
  capturable: boolean;
};

/** A leaf category the form can offer — `kind` narrows the list to the type in hand. */
export type QuickAddCategory = { id: string; name: string; kind: "income" | "expense" };

/** A counterparty the form can attach a role to (§6.6). */
export type QuickAddCounterparty = { id: string; name: string };

const OBLIGATION_ROLES = ["debt", "contribution"] as const;
type ObligationRole = (typeof OBLIGATION_ROLES)[number];

/**
 * The user-owned subset of `CreateTransactionInput` — everything Quick add
 * lets someone set, beyond amount and account. Ids stay plain `string`:
 * `createTransactionInput.parse` in the controller is where the brand and the
 * shape are actually checked, and a form asserting that first would be a
 * claim it cannot verify.
 */
export type QuickAddDraft = {
  type: "expense" | "income";
  amount: string;
  accountId: string;
  categoryId: string | null;
  /** `AccountingDate`'s shape (`YYYY-MM-DD`). Defaults to `today`. */
  date: string;
  note: string;
  isBusiness: boolean;
  /** §6.6.1 — who it was with; the picker's answer, whether or not a role turns it into an obligation. */
  counterpartyId: string | null;
  obligationCounterpartyId: string | null;
  obligationRole: ObligationRole | null;
  /**
   * §7.8 — what was handed over, when that was not the account's currency.
   * `amount` is then what the account was *charged*. Both or neither.
   */
  paidAmount?: string;
  paidCurrency?: string;
};

/**
 * §7.8 — the desk's way into a foreign amount: a currency choice beside the
 * amount, and the account's figure pre-filled at the day's cross rate.
 */
export type QuickAddFormForeign = {
  /** Every currency the amount could be paid in. */
  currencies: readonly { code: string; name: string }[];
  /** The cross rate for one pair on one day, or `null` when none is held — nothing is priced at `1`. */
  readCrossRate: (pair: {
    from: string;
    to: string;
    date: string;
  }) => { rate: money.CrossRate; asOf: string } | null;
  /** An account currency's own fraction digits — the charged figure's rounding. */
  decimalsOf: (currency: string) => number;
};

export type QuickAddFormProps = {
  accounts: readonly QuickAddAccount[];
  categories: readonly QuickAddCategory[];
  /**
   * Every counterparty the ledger holds. **Offered only when non-empty** —
   * `#e3` has not shipped a write path yet, so this is ordinarily `[]`, and an
   * empty picker for a thing nobody can create yet would be a dead end (S05
   * §5).
   */
  counterparties: readonly QuickAddCounterparty[];
  /** The device's local `AccountingDate` (§7.0a) — the date field's default. */
  today: string;
  initialAmount?: string;
  /**
   * The chosen account, or `null` before one is picked — **controlled**, the
   * same reason `categoryId` is: `AccountPicker` (`accounts/`) is a sibling
   * domain, composed by the screen and not by this form (`architecture/11`),
   * so a pick has to travel back in through a prop rather than living in
   * local state.
   */
  accountId: string | null;
  /**
   * Opens `AccountPicker`, carrying the amount typed so far — the escape to
   * account creation the sheet's own footer offers needs it, and this form is
   * the only place that amount lives (S05's own account-chip rule: shown,
   * never hidden, even uncapturable).
   */
  onOpenAccountPicker: (current: { amount: string }) => void;
  /**
   * The chosen leaf, or `null` before one is picked — **controlled**, unlike
   * every other field here. S06's sheet is composed by the screen, not by
   * this form (`architecture/11`: a module composes at app routes, not by
   * importing a sibling domain), so the pick has to travel back in through a
   * prop rather than living in local state the way `accountId` does. A stale
   * id from a type switch is handled on this side: see `effectiveCategoryId`.
   */
  categoryId: string | null;
  /**
   * Opens S06's category sheet, scoped to the current `type` — the form owns
   * `type`, so it is the one place that knows which half of the taxonomy the
   * screen should filter to.
   */
  onOpenCategoryPicker: (kind: "income" | "expense") => void;
  /**
   * §6.6 — the ids of the categories that are debts (*Borrowed*, *Lent out*,
   * the two repayments), decided by the screen from their seed tags. Picking
   * one fixes the role to `debt` and asks **Who?**, which is required.
   */
  debtCategoryIds?: readonly string[];
  /** The kind to start on — the round trip through S15 hands back the one it left on. */
  initialType?: "expense" | "income";
  /** A person to start with — S15's round trip (`returnTo: quick-add`) hands the one it just made back. */
  initialCounterpartyId?: string | null;
  /** Who?'s *+ New* — carries the draft's amount and kind, which live only here. */
  onCreateCounterparty?: (current: { amount: string; type: "expense" | "income" }) => void;
  /**
   * A refusal from the last save attempt, matched onto `amountOriginal` /
   * `accountId` — the input schema's own paths, so a controller refusal and a
   * server one bind to the same field the same way (`mapFieldErrors`,
   * `architecture/12`). Absent before a first attempt.
   */
  fieldErrors?: FieldErrorMap;
  /** §7.8 — absent, the amount is always in the account's own currency. */
  foreign?: QuickAddFormForeign;
  onCancel: () => void;
  onSave: (draft: QuickAddDraft) => void;
};

export function QuickAddForm({
  accounts,
  categories,
  counterparties,
  today,
  initialAmount = "",
  accountId,
  onOpenAccountPicker,
  categoryId,
  onOpenCategoryPicker,
  debtCategoryIds = [],
  initialType = "expense",
  initialCounterpartyId = null,
  onCreateCounterparty,
  fieldErrors,
  foreign,
  onCancel,
  onSave,
}: QuickAddFormProps) {
  const t = useT();
  const locale = useLocale();
  const mark = decimalMark(locale);
  const [amount, setAmount] = useState(parseAmount(initialAmount) ?? "");
  const [type, setType] = useState<"expense" | "income">(initialType);
  const [moreOpen, setMoreOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [isBusiness, setIsBusiness] = useState(false);
  const [obligationCounterpartyId, setObligationCounterpartyId] = useState<string | null>(
    initialCounterpartyId,
  );
  const [obligationRole, setObligationRole] = useState<ObligationRole | null>(null);
  // §7.8 — the chosen foreign currency, and the charged figure once typed over.
  const [paidChoice, setPaidChoice] = useState<string | null>(null);
  // …and the account currency it was a figure in: it dies with a change of that currency.
  const [typedIn, setTypedIn] = useState<{ raw: string; account: string | undefined } | null>(null);

  const styles = useStyles();
  const selected = accounts.find((account) => account.id === accountId);
  const blocked = selected !== undefined && !selected.capturable;
  const dateValid = isAccountingDate(date);
  const selectedCategory = categories.find((category) => category.id === categoryId);
  /**
   * A category chosen under one kind rarely belongs to the other — TAXONOMY
   * R1 pairs `categoryId` with `type`. `categoryId` is controlled from the
   * screen now, so this form cannot clear it the moment `type` flips the way
   * it once did; masking a mismatch here, for both display and the save,
   * gets the same guarantee without the form reaching into state it does not
   * own. Switching back restores the pick rather than losing it.
   */
  const effectiveCategoryId = selectedCategory?.kind === type ? categoryId : null;
  // §6.6 — the role a debt category gives is derived, never stored: leaving
  // the category takes it back, and a role chosen by hand is what is left.
  const debt = effectiveCategoryId !== null && debtCategoryIds.includes(effectiveCategoryId);
  const effectiveRole: ObligationRole | null = debt ? "debt" : obligationRole;
  let positive = false;
  try {
    positive = amount !== "" && money.dec(amount).gt(0);
  } catch {
    positive = false;
  }

  const accountCurrency = selected?.currency;
  const paidCurrency = paidChoice !== null && paidChoice !== accountCurrency ? paidChoice : null;
  const paidSelectable = foreign !== undefined && accountCurrency !== undefined;
  // The account's figure: the rate's guess until the person types over it.
  const found =
    paidCurrency === null || accountCurrency === undefined || !dateValid
      ? null
      : (foreign?.readCrossRate({ from: paidCurrency, to: accountCurrency, date }) ?? null);
  const rate = found?.rate ?? null;
  const derivedCharged =
    rate === null || !positive || accountCurrency === undefined
      ? ""
      : money.chargedFor(money.toMoney(amount), rate, foreign?.decimalsOf(accountCurrency) ?? 2);
  const chargedTyped = typedIn !== null && typedIn.account === accountCurrency ? typedIn.raw : null;
  const charged = chargedTyped ?? derivedCharged.replace(".", mark);
  const chargedAmount = paidCurrency === null ? null : parseAmount(charged);
  const chargedKey = `${paidCurrency}:${derivedCharged}:${chargedTyped === null ? "d" : "t"}`;
  const handleAmountChange = useCallback((next: string | null) => setAmount(next ?? ""), []);
  const handleChargedChange = useCallback(
    (typed: string) => setTypedIn({ raw: typed, account: accountCurrency }),
    [accountCurrency],
  );
  const handlePaidChange = useCallback(
    (next: string) => {
      setPaidChoice(next === accountCurrency ? null : next);
      setTypedIn(null);
    },
    [accountCurrency],
  );
  const handleOpenAccountPicker = useCallback(
    () => onOpenAccountPicker({ amount }),
    [amount, onOpenAccountPicker],
  );
  const handleTypeChange = useCallback((next: string) => {
    setType(next === "income" ? "income" : "expense");
  }, []);
  const handleOpenCategoryPicker = useCallback(
    () => onOpenCategoryPicker(type),
    [onOpenCategoryPicker, type],
  );
  const handleToggleMore = useCallback(() => setMoreOpen((open) => !open), []);
  const handleDateChange = useCallback((next: string) => setDate(next), []);
  const handleNoteChange = useCallback((next: string) => setNote(next), []);
  const handleBusinessChange = useCallback((next: boolean) => setIsBusiness(next), []);
  const handleCreateCounterparty = useCallback(
    () => onCreateCounterparty?.({ amount, type }),
    [amount, onCreateCounterparty, type],
  );
  const handleCounterpartyChange = useCallback(
    (next: string) => setObligationCounterpartyId(next),
    [],
  );
  const handleRoleChange = useCallback((next: string) => {
    setObligationRole(isObligationRole(next) ? next : null);
  }, []);
  // Drawn order: the figure, the account, then the date under *More*.
  const check = useSubmitCheck({
    amount: !positive && t("common.required"),
    charged: paidCurrency !== null && chargedAmount === null && t("common.required"),
    account: !accountId
      ? t("common.chooseOne")
      : blocked && t("transactions.needsRate", { currency: selected.currency }),
    date: !dateValid && t("transactions.invalidDate"),
    who: debt && obligationCounterpartyId === null && t("transactions.whoRequired"),
  });
  const save = useCallback(() => {
    if (!accountId || blocked || !positive || !dateValid) return;
    if (paidCurrency !== null && chargedAmount === null) return;
    onSave({
      type,
      // §7.8 — the entry's own figure is what the account was charged.
      amount: chargedAmount ?? amount,
      ...(paidCurrency === null ? {} : { paidAmount: amount, paidCurrency }),
      accountId,
      categoryId: effectiveCategoryId,
      date,
      note,
      isBusiness,
      // Who it was with, as the phone carries it: the picker's answer is the
      // identity link whatever the role. The obligation pair is both or neither
      // (`transactions_obligation_pair_shape`), so leaving a debt category —
      // which takes the role with it — takes the person off the obligation too.
      counterpartyId: obligationCounterpartyId,
      obligationCounterpartyId: effectiveRole === null ? null : obligationCounterpartyId,
      obligationRole: effectiveRole,
    });
  }, [
    accountId,
    amount,
    blocked,
    chargedAmount,
    paidCurrency,
    effectiveCategoryId,
    obligationCounterpartyId,
    effectiveRole,
    date,
    dateValid,
    isBusiness,
    note,
    onSave,
    positive,
    type,
  ]);
  const handleSave = useCallback(() => {
    // The date lives under *More*: open it, so the field scrolled to is drawn.
    if (!dateValid) setMoreOpen(true);
    check.submit(save);
  }, [check, dateValid, save]);
  const accountError = check.errorFor("account") ?? fieldErrors?.byField["accountId"]?.[0];
  const amountError =
    check.errorFor("amount") ??
    fieldErrors?.byField[paidCurrency === null ? "amountOriginal" : "paidAmount"]?.[0];
  const chargedError = check.errorFor("charged") ?? fieldErrors?.byField["amountOriginal"]?.[0];
  const paidOptions = useMemo<SelectProps["options"]>(
    () =>
      accountCurrency === undefined || foreign === undefined
        ? []
        : [
            {
              value: accountCurrency,
              label: t("transactions.paidInOwn", { currency: accountCurrency }),
            },
            ...foreign.currencies
              .filter((currency) => currency.code !== accountCurrency)
              .map((currency) => ({
                value: currency.code,
                label: `${currency.code} · ${currency.name}`,
              })),
          ],
    [accountCurrency, foreign, t],
  );
  const categoryError = fieldErrors?.byField["categoryId"]?.[0];
  const whoError = check.errorFor("who") ?? fieldErrors?.byField["obligationCounterpartyId"]?.[0];

  const counterpartyOptions = counterparties.map((counterparty) => ({
    value: counterparty.id,
    label: counterparty.name,
  }));
  const typeSegments = useMemo<SegmentControlProps["segments"]>(
    () => [
      { value: "expense", label: t("transactions.expense") },
      { value: "income", label: t("transactions.income") },
    ],
    [t],
  );
  const roleOptions = useMemo<RadioGroupProps["options"]>(
    () => [
      // `none` is a real option, not a blank: a role stopped being required when
      // §6.6.1's identity link arrived, and a radio group cannot be un-picked.
      { value: NO_OBLIGATION, label: t("transactions.role.none") },
      { value: "debt", label: t("transactions.role.debt") },
      { value: "contribution", label: t("transactions.role.contribution") },
    ],
    [t],
  );

  return (
    <View style={styles.root}>
      {fieldErrors && fieldErrors.formLevel.length > 0 ? (
        <View style={styles.formLevel} accessibilityRole="alert">
          <Text style={styles.formLevelHeading}>{t("common.couldNotSave")}</Text>
          {fieldErrors.formLevel.map((message) => (
            <Text key={message} style={styles.formLevelMessage}>
              {message}
            </Text>
          ))}
        </View>
      ) : null}
      <SegmentControl segments={typeSegments} value={type} onChange={handleTypeChange} />
      <FieldAnchor check={check} field="account" style={styles.root}>
        <Chip
          placeholder={t("transactions.account")}
          value={selected?.name}
          onPress={handleOpenAccountPicker}
          machineFilled={false}
        />
        {/* Under the picker, not under Save: the reason belongs to the choice
          that caused it, and Save being dim is the consequence rather than the
          thing to explain. */}
        {blocked ? (
          <Text style={styles.blocked}>
            {t("transactions.needsRate", { currency: selected.currency })}
          </Text>
        ) : accountError === undefined ? null : (
          <Text style={styles.fieldError}>{accountError}</Text>
        )}
      </FieldAnchor>
      {/* No account chosen yet, so no currency is known — and a placeholder
          currency here would be a figure labelled in something the money is
          not. The field carries the label alone until one is picked. */}
      <FieldAnchor check={check} field="amount">
        <AmountField
          label={t("transactions.amount")}
          {...(selected ? { currency: selected.currency } : {})}
          initial={initialAmount}
          onChange={handleAmountChange}
          error={amountError}
        />
      </FieldAnchor>
      {selected ? null : (
        <Text style={styles.waits}>{t("transactions.amountWaitsForAccount")}</Text>
      )}
      {/* §7.8 — the amount's currency, when it is not the account's. Offered
          only with another currency to offer. */}
      {paidSelectable && paidOptions.length > 1 ? (
        <Select
          label={t("transactions.paidInCurrency")}
          placeholder={t("transactions.paidInTitle")}
          options={paidOptions}
          value={paidCurrency ?? accountCurrency ?? null}
          onChange={handlePaidChange}
          searchable
        />
      ) : null}
      {paidCurrency !== null && selected !== undefined ? (
        <FieldAnchor check={check} field="charged">
          <AmountField
            // Remounted when the pre-fill moves and the figure is still the
            // guess: the field keeps what it was given at mount.
            key={chargedKey}
            label={t("transactions.chargedTo", { account: selected.name })}
            currency={selected.currency}
            initial={charged}
            onChangeText={handleChargedChange}
            error={chargedError}
          />
          <Text style={styles.waits}>
            {found === null || rate === null
              ? t("transactions.chargedNoRate", { paid: paidCurrency })
              : t(
                  found.asOf === date
                    ? "transactions.chargedRate"
                    : "transactions.chargedRateCarried",
                  {
                    paid: paidCurrency,
                    rate: formatRate(rate, locale),
                    charged: selected.currency,
                    date: isAccountingDate(found.asOf)
                      ? dayLabel(accountingDate(found.asOf), locale)
                      : found.asOf,
                  },
                )}
          </Text>
        </FieldAnchor>
      ) : null}
      <Chip
        placeholder={t("transactions.category")}
        value={selectedCategory?.kind === type ? selectedCategory.name : undefined}
        onPress={handleOpenCategoryPicker}
        machineFilled={false}
      />
      {categoryError === undefined ? null : <Text style={styles.fieldError}>{categoryError}</Text>}
      {/* §6.6 — a debt is between two people, asked where the category was picked. */}
      {debt ? (
        <FieldAnchor check={check} field="who" style={styles.root}>
          <Select
            label={t("transactions.who")}
            placeholder={t("transactions.whoPlaceholder")}
            options={counterpartyOptions}
            value={obligationCounterpartyId}
            onChange={handleCounterpartyChange}
            searchable
          />
          {whoError === undefined ? null : <Text style={styles.fieldError}>{whoError}</Text>}
          {onCreateCounterparty === undefined ? null : (
            <Button
              label={t("transactions.newCounterparty")}
              onPress={handleCreateCounterparty}
              variant="secondary"
            />
          )}
        </FieldAnchor>
      ) : null}
      <Button label={t("transactions.more")} onPress={handleToggleMore} variant="ghost" />

      {moreOpen ? (
        <View style={styles.more}>
          <FieldAnchor check={check} field="date">
            <DateField
              label={t("transactions.date")}
              value={date}
              onChange={handleDateChange}
              today={today}
              {...(dateValid ? {} : { error: t("transactions.invalidDate") })}
            />
          </FieldAnchor>
          <TextField
            label={t("common.note")}
            value={note}
            onChangeText={handleNoteChange}
            maxLength={2000}
            counter
          />
          <Toggle
            label={t("transactions.business")}
            value={isBusiness}
            onChange={handleBusinessChange}
          />
          {counterpartyOptions.length > 0 && !debt ? (
            <>
              <Select
                label={t("transactions.counterparty")}
                placeholder={t("transactions.noCounterparty")}
                options={counterpartyOptions}
                value={obligationCounterpartyId}
                onChange={handleCounterpartyChange}
                searchable
              />
              {obligationCounterpartyId ? (
                <RadioGroup
                  label={t("transactions.role")}
                  options={roleOptions}
                  value={obligationRole ?? NO_OBLIGATION}
                  onChange={handleRoleChange}
                />
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button label={t("common.cancel")} onPress={onCancel} variant="ghost" />
        <Button label={t("common.save")} onPress={handleSave} variant="primary" />
      </View>
    </View>
  );
}

/** The radio value standing for "named, and owing nothing". */
const NO_OBLIGATION = "none";

function isObligationRole(value: string): value is ObligationRole {
  return (OBLIGATION_ROLES as readonly string[]).includes(value);
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.x3 },
  blocked: { color: theme.textMuted, ...text.ui("caption") },
  more: { gap: space.x3 },
  waits: { color: theme.textMuted, ...text.ui("caption") },
  fieldError: { color: theme.dangerText, ...text.ui("caption") },
  formLevel: { gap: space.xs },
  formLevelHeading: { color: theme.dangerText, ...text.ui("body", 600) },
  formLevelMessage: { color: theme.dangerText, ...text.ui("caption") },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.xl },
}));
