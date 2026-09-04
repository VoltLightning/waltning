import { isAccountingDate } from "@waltning/core/date";
import type { CurrencyCode } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { AmountField, parseAmount } from "../fx/amount-field";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { Chip } from "../primitives/chip";
import { DateField } from "../primitives/date-field";
import type { FieldErrorMap } from "../primitives/field-errors.ts";
import { RadioGroup, type RadioGroupProps } from "../primitives/radio";
import { SegmentControl, type SegmentControlProps } from "../primitives/segment-control";
import { Select } from "../primitives/select";
import { TextField } from "../primitives/text-field";
import { Toggle } from "../primitives/toggle";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

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

const COUNTERPARTY_ROLES = ["debt", "contribution", "reference"] as const;
type CounterpartyRole = (typeof COUNTERPARTY_ROLES)[number];

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
  counterpartyId: string | null;
  counterpartyRole: CounterpartyRole | null;
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
  initialAccountId?: string;
  /**
   * A refusal from the last save attempt, matched onto `amountOriginal` /
   * `accountId` — the input schema's own paths, so a controller refusal and a
   * server one bind to the same field the same way (`mapFieldErrors`,
   * `architecture/12`). Absent before a first attempt.
   */
  fieldErrors?: FieldErrorMap;
  onCancel: () => void;
  onCreateAccount: (draft: { amount: string; accountId: string | null }) => void;
  onSave: (draft: QuickAddDraft) => void;
};

export function QuickAddForm({
  accounts,
  categories,
  counterparties,
  today,
  initialAmount = "",
  initialAccountId,
  fieldErrors,
  onCancel,
  onCreateAccount,
  onSave,
}: QuickAddFormProps) {
  const t = useT();
  const [amount, setAmount] = useState(parseAmount(initialAmount) ?? "");
  const [accountId, setAccountId] = useState<string | null>(
    accounts.some((account) => account.id === initialAccountId) ? (initialAccountId ?? null) : null,
  );
  const [type, setType] = useState<"expense" | "income">("expense");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [isBusiness, setIsBusiness] = useState(false);
  const [counterpartyId, setCounterpartyId] = useState<string | null>(null);
  const [counterpartyRole, setCounterpartyRole] = useState<CounterpartyRole | null>(null);

  const styles = useStyles();
  const selected = accounts.find((account) => account.id === accountId);
  const blocked = selected !== undefined && !selected.capturable;
  const dateValid = isAccountingDate(date);
  let positive = false;
  try {
    positive = amount !== "" && money.dec(amount).gt(0);
  } catch {
    positive = false;
  }

  const handleAmountChange = useCallback((next: string | null) => setAmount(next ?? ""), []);
  const handleCreateAccount = useCallback(
    () => onCreateAccount({ amount, accountId }),
    [accountId, amount, onCreateAccount],
  );
  const handleTypeChange = useCallback((next: string) => {
    // A category chosen under one kind rarely belongs to the other — TAXONOMY
    // R1 pairs `categoryId` with `type`, so the pick is cleared rather than
    // carried into a category the new type may not even offer.
    setType(next === "income" ? "income" : "expense");
    setCategoryId(null);
  }, []);
  const handleCategoryChange = useCallback((next: string) => setCategoryId(next), []);
  const handleToggleMore = useCallback(() => setMoreOpen((open) => !open), []);
  const handleDateChange = useCallback((next: string) => setDate(next), []);
  const handleNoteChange = useCallback((next: string) => setNote(next), []);
  const handleBusinessChange = useCallback((next: boolean) => setIsBusiness(next), []);
  const handleCounterpartyChange = useCallback((next: string) => setCounterpartyId(next), []);
  const handleRoleChange = useCallback((next: string) => {
    setCounterpartyRole(isCounterpartyRole(next) ? next : null);
  }, []);
  const handleSave = useCallback(() => {
    if (!accountId || blocked || !positive || !dateValid) return;
    onSave({
      type,
      amount,
      accountId,
      categoryId,
      date,
      note,
      isBusiness,
      counterpartyId,
      counterpartyRole,
    });
  }, [
    accountId,
    amount,
    blocked,
    categoryId,
    counterpartyId,
    counterpartyRole,
    date,
    dateValid,
    isBusiness,
    note,
    onSave,
    positive,
    type,
  ]);
  const accountError = fieldErrors?.byField["accountId"]?.[0];

  const categoryOptions = categories
    .filter((category) => category.kind === type)
    .map((category) => ({ value: category.id, label: category.name }));
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
      { value: "debt", label: t("transactions.role.debt") },
      { value: "contribution", label: t("transactions.role.contribution") },
      { value: "reference", label: t("transactions.role.reference") },
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
      {/* No account chosen yet, so no currency is known — and a placeholder
          currency here would be a figure labelled in something the money is
          not. The field carries the label alone until one is picked. */}
      <AmountField
        label={t("transactions.amount")}
        {...(selected ? { currency: selected.currency } : {})}
        initial={initialAmount}
        onChange={handleAmountChange}
        error={fieldErrors?.byField["amountOriginal"]?.[0]}
      />
      <Text style={styles.label}>{t("transactions.account")}</Text>
      <View style={styles.accounts}>
        {accounts.map((account) => (
          <AccountChoice
            key={account.id}
            account={account}
            selected={account.id === accountId}
            onSelect={setAccountId}
          />
        ))}
      </View>
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
      <Button label={t("accounts.create")} onPress={handleCreateAccount} variant="secondary" />

      <SegmentControl segments={typeSegments} value={type} onChange={handleTypeChange} />
      <Select
        label={t("transactions.category")}
        placeholder={t("transactions.noCategory")}
        options={categoryOptions}
        value={categoryId}
        onChange={handleCategoryChange}
        searchable
      />
      <Button label={t("transactions.more")} onPress={handleToggleMore} variant="ghost" />

      {moreOpen ? (
        <View style={styles.more}>
          <DateField
            label={t("transactions.date")}
            value={date}
            onChange={handleDateChange}
            today={today}
            {...(dateValid ? {} : { error: t("transactions.invalidDate") })}
          />
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
          {counterpartyOptions.length > 0 ? (
            <>
              <Select
                label={t("transactions.counterparty")}
                placeholder={t("transactions.noCounterparty")}
                options={counterpartyOptions}
                value={counterpartyId}
                onChange={handleCounterpartyChange}
                searchable
              />
              {counterpartyId ? (
                <RadioGroup
                  label={t("transactions.role")}
                  options={roleOptions}
                  value={counterpartyRole}
                  onChange={handleRoleChange}
                />
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button label={t("common.cancel")} onPress={onCancel} variant="ghost" />
        <Button
          label={t("common.save")}
          onPress={handleSave}
          disabled={!positive || !accountId || blocked || !dateValid}
          variant="primary"
        />
      </View>
    </View>
  );
}

function isCounterpartyRole(value: string): value is CounterpartyRole {
  return (COUNTERPARTY_ROLES as readonly string[]).includes(value);
}

type AccountChoiceProps = {
  account: QuickAddAccount;
  selected: boolean;
  onSelect: (accountId: string) => void;
};

/**
 * An uncapturable account is still selectable, and that is deliberate. Making
 * the chip `disabled` would say *this account is unavailable* with no way to
 * ask why; letting it be chosen puts the reason on the screen the moment
 * someone wonders.
 */
function AccountChoice({ account, selected, onSelect }: AccountChoiceProps) {
  const t = useT();
  const handleSelect = useCallback(() => onSelect(account.id), [account.id, onSelect]);
  return (
    <Chip
      placeholder={t("transactions.account")}
      value={account.name}
      selected={selected}
      onPress={handleSelect}
      machineFilled={false}
    />
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.x3 },
  label: { color: theme.textMuted, ...text.ui("kicker") },
  accounts: { gap: space.md },
  blocked: { color: theme.textMuted, ...text.ui("caption") },
  more: { gap: space.x3 },
  fieldError: { color: theme.dangerText, ...text.ui("caption") },
  formLevel: { gap: space.xs },
  formLevelHeading: { color: theme.dangerText, ...text.ui("body", 600) },
  formLevelMessage: { color: theme.dangerText, ...text.ui("caption") },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.xl },
}));
