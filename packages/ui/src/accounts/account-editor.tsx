/**
 * `<AccountEditor>` — S16 §4, §5, §7. `CreateAccountForm`'s own fields, aimed
 * at a row that already exists rather than one being born.
 *
 * **Emits a patch, not a whole draft.** `update_account`'s executor refuses
 * an empty patch (`update-account.executor.ts`), so the diff against the
 * account this editor opened with is built here, once, rather than asked of
 * every caller — the same reason `CreateAccountForm` owns its own field
 * state instead of handing a screen eight `useState`s to wire up.
 *
 * **Currency is shown, never a field.** S16 §7: there is no in-place path for
 * it — with transactions present the change is refused outright, and with
 * none present the honest move is create-then-archive, not an edit. Offering
 * a picker here would be a control whose only two outcomes are "does nothing"
 * and "wrong".
 *
 * **No disclosure.** `CreateAccountForm` folds seven fields behind *More
 * details* because the minimal path — name and currency — is what most new
 * accounts need. Nobody opens an existing account's editor for the minimal
 * path; every field is already true of the row, so every field is shown.
 *
 * **Reconcile and Archive are not fields.** Both are separate registry
 * operations (`reconcile_account`, `archive_account`, S16 §5, §8) with their
 * own confirmation shape — a sheet, a plain danger action — so they surface
 * as their own callbacks rather than as more state this component tracks.
 */

import { isAccountingDate } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import {
  ACCOUNT_KIND,
  type AccountKind,
  type CreateAccountInput,
} from "@waltning/core/registry/inputs";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Amount } from "../fx/amount";
import { AmountField } from "../fx/amount-field";
import type { Messages } from "../i18n/en.ts";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { DateField } from "../primitives/date-field";
import type { FieldErrorMap } from "../primitives/field-errors.ts";
import { RadioGroup } from "../primitives/radio";
import { Select } from "../primitives/select";
import { TextField } from "../primitives/text-field";
import { Toggle } from "../primitives/toggle";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

type Ownership = CreateAccountInput["ownership"];

export type AccountEditorGroup = { id: string; name: string };

export type AccountEditorAccount = {
  id: string;
  name: string;
  currency: string;
  currencySymbol: string;
  /**
   * The currency's own scale. The stored figure is `numeric(20,8)`, so an
   * opening balance of nothing reads `0.00000000` in the field unless it is
   * presented at the scale the account is actually kept in.
   */
  decimals: number;
  kind: AccountKind;
  ownership: Ownership;
  isBusiness: boolean;
  openingBalance: money.Money;
  openingDate: string | null;
  memo: string;
  groupId: string | null;
  version: number;
  /** The last balance a reconciliation recorded (S16 §5) — `null` before the first one. */
  expectedBalance: money.Money | null;
};

/** Only the fields that changed — `update_account`'s executor refuses an empty patch. */
export type AccountPatch = Partial<{
  name: string;
  kind: AccountKind;
  groupId: string | null;
  ownership: Ownership;
  memo: string;
  isBusiness: boolean;
  openingBalance: string;
  openingDate: string | null;
}>;

export type AccountEditorProps = {
  account: AccountEditorAccount;
  /** The device's local `AccountingDate` (§7.0a) — `DateField`'s shortcut row. */
  today: string;
  groups: readonly AccountEditorGroup[];
  fieldErrors?: FieldErrorMap;
  onCancel: () => void;
  onSave: (patch: AccountPatch) => void;
  onArchive: () => void;
  onReconcile: () => void;
  /** Returns the new group's id, or `null` when the write was refused. */
  onCreateGroup: (name: string) => string | null;
};

/** See `create-account-form.tsx` — the same nine keys, the same reason for a table. */
const KIND_LABEL_KEY: Record<AccountKind, keyof Messages["accounts"]> = {
  cash: "kindCash",
  bank: "kindBank",
  card: "kindCard",
  loan_receivable: "kindLoanReceivable",
  loan_payable: "kindLoanPayable",
  clearing: "kindClearing",
  investment: "kindInvestment",
  deposit: "kindDeposit",
  other: "kindOther",
};

export function AccountEditor({
  account,
  today,
  groups,
  fieldErrors,
  onCancel,
  onSave,
  onArchive,
  onReconcile,
  onCreateGroup,
}: AccountEditorProps) {
  const t = useT();
  const styles = useStyles();

  const [name, setName] = useState(account.name);
  const [kind, setKind] = useState<AccountKind>(account.kind);
  const [ownership, setOwnership] = useState<Ownership>(account.ownership);
  const [isBusiness, setIsBusiness] = useState(account.isBusiness);
  const [openingBalance, setOpeningBalance] = useState<string>(account.openingBalance);
  const [openingDateText, setOpeningDateText] = useState(account.openingDate ?? "");
  const [memo, setMemo] = useState(account.memo);
  const [groupId, setGroupId] = useState<string | null>(account.groupId);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const trimmed = name.trim();
  const dateInvalid = openingDateText !== "" && !isAccountingDate(openingDateText);
  // §6.7 — forced off rather than merely warned, matching `CreateAccountForm`.
  const businessValue = ownership === "shared" ? false : isBusiness;
  /**
   * **Presented at the currency's own scale, saved exact.**
   *
   * `openingBalance` is stored as `numeric(20,8)` (`SPEC.md` §7.0), so an
   * account opened at nothing arrives here as `"0.00000000"` — eight
   * decimals of a scale no złoty account is ever kept in. `money.round` is
   * the display form for this field; the state above still holds whatever
   * the ledger handed over, so an untouched editor produces an empty patch
   * rather than a write of the rounded string.
   */
  const openingBalanceShown = money.round(account.openingBalance, account.decimals);
  /**
   * **Compared by value, not by spelling.** `"12.50"` typed back into a field
   * showing `"12.50"` is the same money as the stored `"12.50000000"`, and a
   * string comparison would call it a change and offer Save on a patch that
   * writes nothing new.
   */
  const openingBalanceChanged = !money.dec(openingBalance).eq(account.openingBalance);
  const openingChanged = openingBalanceChanged || (openingDateText || null) !== account.openingDate;

  /**
   * Only what changed — `update_account`'s executor refuses an empty patch,
   * and this is also what Save's own `disabled` reads: nothing to save is not
   * a state the button should pretend it can act on.
   */
  const patch = useMemo((): AccountPatch => {
    const next: AccountPatch = {};
    if (trimmed !== account.name) next.name = trimmed;
    if (kind !== account.kind) next.kind = kind;
    if (groupId !== account.groupId) next.groupId = groupId;
    if (ownership !== account.ownership) next.ownership = ownership;
    if (memo !== account.memo) next.memo = memo;
    if (businessValue !== account.isBusiness) next.isBusiness = businessValue;
    if (openingBalanceChanged) next.openingBalance = openingBalance;
    const nextOpeningDate = openingDateText === "" ? null : openingDateText;
    if (nextOpeningDate !== account.openingDate) next.openingDate = nextOpeningDate;
    return next;
  }, [
    account,
    businessValue,
    groupId,
    kind,
    memo,
    openingBalance,
    openingBalanceChanged,
    openingDateText,
    ownership,
    trimmed,
  ]);

  const kindOptions = useMemo(
    () => ACCOUNT_KIND.map((value) => ({ value, label: t(`accounts.${KIND_LABEL_KEY[value]}`) })),
    [t],
  );
  const ownershipOptions = useMemo(
    (): readonly [{ value: Ownership; label: string }, { value: Ownership; label: string }] => [
      { value: "own", label: t("accounts.ownershipOwn") },
      { value: "shared", label: t("accounts.ownershipShared") },
    ],
    [t],
  );
  const groupOptions = useMemo(
    () => groups.map((group) => ({ value: group.id, label: group.name })),
    [groups],
  );

  const handleKindChange = useCallback((value: string) => setKind(value as AccountKind), []);
  const handleOwnershipChange = useCallback(
    (value: string) => setOwnership(value as Ownership),
    [],
  );
  const handleOpeningBalanceChange = useCallback(
    (value: string | null) => setOpeningBalance(value ?? "0"),
    [],
  );
  const handleStartCreatingGroup = useCallback(() => setCreatingGroup(true), []);
  const handleConfirmNewGroup = useCallback(() => {
    const trimmedGroupName = newGroupName.trim();
    if (!trimmedGroupName) return;
    const id = onCreateGroup(trimmedGroupName);
    if (id === null) return;
    setGroupId(id);
    setCreatingGroup(false);
    setNewGroupName("");
  }, [newGroupName, onCreateGroup]);

  const patchEmpty = Object.keys(patch).length === 0;
  const handleSave = useCallback(() => {
    if (!trimmed || dateInvalid || patchEmpty) return;
    onSave(patch);
  }, [dateInvalid, onSave, patch, patchEmpty, trimmed]);

  const nameError = fieldErrors?.byField["name"]?.[0];

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

      <TextField
        label={t("common.name")}
        value={name}
        onChangeText={setName}
        maxLength={120}
        {...(nameError === undefined ? {} : { error: nameError })}
      />

      <View style={styles.currencyRow}>
        <Text style={styles.label}>{t("accounts.currency")}</Text>
        <Text style={styles.currencyValue}>
          {account.currency} {account.currencySymbol}
        </Text>
      </View>

      {account.expectedBalance === null ? null : (
        <View style={styles.currencyRow}>
          <Text style={styles.label}>{t("accounts.lastObserved")}</Text>
          <Amount value={account.expectedBalance} currency={account.currency} size="small" />
        </View>
      )}

      <Select
        label={t("accounts.kind")}
        placeholder={t("accounts.kind")}
        options={kindOptions}
        value={kind}
        onChange={handleKindChange}
      />
      <RadioGroup
        label={t("accounts.ownership")}
        options={ownershipOptions}
        value={ownership}
        onChange={handleOwnershipChange}
      />
      <Toggle
        label={t("accounts.business")}
        value={businessValue}
        onChange={setIsBusiness}
        disabled={ownership === "shared"}
      />
      <AmountField
        label={t("accounts.openingBalance")}
        initial={openingBalanceShown}
        onChange={handleOpeningBalanceChange}
        currency={account.currency}
      />
      <DateField
        label={t("accounts.openingDate")}
        value={openingDateText}
        onChange={setOpeningDateText}
        today={today}
        hint={t("accounts.openingDateHint")}
        {...(dateInvalid ? { error: t("accounts.openingDateInvalid") } : {})}
      />
      <TextField
        label={t("common.memo")}
        value={memo}
        onChangeText={setMemo}
        maxLength={2000}
        counter
      />
      <View style={styles.groupBlock}>
        <Select
          label={t("accounts.group")}
          placeholder={t("accounts.noGroup")}
          options={groupOptions}
          value={groupId}
          onChange={setGroupId}
        />
        {creatingGroup ? (
          <View style={styles.newGroupRow}>
            <TextField
              label={t("common.name")}
              value={newGroupName}
              onChangeText={setNewGroupName}
              maxLength={120}
            />
            <Button
              label={t("accounts.addGroup")}
              onPress={handleConfirmNewGroup}
              disabled={!newGroupName.trim()}
              variant="secondary"
            />
          </View>
        ) : (
          <Button
            label={t("accounts.newGroup")}
            onPress={handleStartCreatingGroup}
            variant="ghost"
          />
        )}
      </View>

      {openingChanged ? (
        <Text style={styles.openingConfirm}>{t("accounts.openingConfirm")}</Text>
      ) : null}

      <View style={styles.actions}>
        <Button label={t("common.cancel")} onPress={onCancel} variant="ghost" />
        <Button
          label={t("common.save")}
          onPress={handleSave}
          disabled={!trimmed || dateInvalid || patchEmpty}
          variant="primary"
        />
      </View>

      <View style={styles.secondaryActions}>
        <Button label={t("accounts.reconcile")} onPress={onReconcile} variant="secondary" />
        <Button label={t("accounts.archive")} onPress={onArchive} variant="danger" />
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.xl },
  label: { color: theme.textMuted, ...text.ui("kicker") },
  currencyRow: { gap: space.xs },
  currencyValue: { color: theme.text, ...text.ui("body") },
  formLevel: { gap: space.xs },
  formLevelHeading: { color: theme.dangerText, ...text.ui("body", 600) },
  formLevelMessage: { color: theme.dangerText, ...text.ui("caption") },
  groupBlock: { gap: space.md },
  newGroupRow: { gap: space.md },
  openingConfirm: { color: theme.assertedText, ...text.ui("caption") },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.xl },
  secondaryActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space.xl,
    paddingTop: space.xl,
    borderTopWidth: 1,
    borderTopColor: theme.hairline,
  },
}));
