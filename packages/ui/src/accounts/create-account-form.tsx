/**
 * `<CreateAccountForm>` — name and currency, with everything else folded away.
 *
 * **Currency is a choice, and it used to be a type.** The prop was declared
 * `currency: "USD"`, so the compiler enforced the single-currency preview at
 * every call site — a literal type doing the work of a decision nobody had
 * made. Which currencies exist is the ledger's answer, so the caller passes
 * them; this component renders whatever it is given and offers no default
 * beyond the first row.
 *
 * There is no *pivot* here and there must not be. USD is the technical hub rates
 * are quoted against (§7.0); putting it first, or preselecting it, would tell a
 * person banking in złoty that their currency is the exception.
 *
 * **Everything `create_account` takes from a person, behind one disclosure.**
 * `registry/inputs.ts`'s `createAccountInput` accepts kind, ownership, an
 * opening balance and date, a memo and a group — S16 §5 lists what each is for
 * — and until now this form asked for none of it, so every account was
 * created bare and then had to be edited to become real. The seven extra
 * fields sit under *More details* rather than in the flow: the minimal
 * name-and-currency path is what most accounts need, and a form that always
 * showed all eight fields would make the common case pay for the rare one.
 */

import { isAccountingDate } from "@waltning/core/date";
import type { CurrencyCode } from "@waltning/core/money";
import {
  ACCOUNT_KIND,
  type AccountKind,
  type CreateAccountInput,
} from "@waltning/core/registry/inputs";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { AmountField } from "../fx/amount-field";
import { CurrencyGrid } from "../fx/currency-grid";
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

export type CreateAccountCurrency = { code: CurrencyCode; name: string; symbol: string };

/** What the group picker needs — an id and a name, nothing S16's own reads use. */
export type CreateAccountGroup = { id: string; name: string };

type Ownership = CreateAccountInput["ownership"];

export type CreateAccountDraft = {
  name: string;
  currency: CurrencyCode;
  kind: AccountKind;
  ownership: Ownership;
  isBusiness: boolean;
  openingBalance: string;
  openingDate: string | null;
  memo: string;
  groupId: string | null;
};

export type CreateAccountFormProps = {
  /**
   * Every currency the ledger holds, in its own order.
   *
   * Never empty in practice — the replica is bootstrapped with the reference
   * set — and the component still handles it, because "no currency exists" is a
   * real state during a reset and a form with a dead Save button explains
   * itself better than one that crashes.
   */
  currencies: readonly CreateAccountCurrency[];
  /** The device's local `AccountingDate` (§7.0a) — `DateField`'s shortcut row for opening date. */
  today: string;
  /**
   * A refusal from the last save attempt, matched onto `name` / `currency` —
   * this form's own known paths (`mapFieldErrors`, `architecture/12`).
   * Absent before a first attempt, and on every render that did not refuse.
   */
  fieldErrors?: FieldErrorMap;
  /** Every group the ledger holds, in its own order. Empty is ordinary. */
  groups: readonly CreateAccountGroup[];
  onCancel: () => void;
  onSave: (draft: CreateAccountDraft) => void;
  /**
   * Start with *More details* disclosed. `Select`'s own `defaultOpen` for the
   * same reason: a screenshot suite cannot click, so the expanded state a
   * story wants to photograph has to be reachable through a prop.
   */
  defaultExpanded?: boolean;
};

/**
 * `t()` is typed from `Messages`, whose keys are exactly two levels — so a
 * key built by string concatenation (`` `accounts.kind${value}` ``) does not
 * narrow to a literal `t()` accepts. This table is the flat mapping instead:
 * `AccountKind`'s nine values to the nine keys `en.ts` declares for them.
 */
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

export function CreateAccountForm({
  currencies,
  today,
  groups,
  fieldErrors,
  onCancel,
  onSave,
  defaultExpanded = false,
}: CreateAccountFormProps) {
  const t = useT();
  const styles = useStyles();

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode | null>(currencies[0]?.code ?? null);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const [kind, setKind] = useState<AccountKind>("other");
  const [ownership, setOwnership] = useState<Ownership>("own");
  const [isBusiness, setIsBusiness] = useState(false);
  const [openingBalance, setOpeningBalance] = useState<string | null>(null);
  const [openingDateText, setOpeningDateText] = useState("");
  const [memo, setMemo] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);

  const trimmed = name.trim();
  const dateInvalid = openingDateText !== "" && !isAccountingDate(openingDateText);
  // §6.7 — the input refines this too; the form should not offer the
  // contradiction in the first place, forced off rather than merely warned.
  const businessValue = ownership === "shared" ? false : isBusiness;

  const kindOptions = useMemo(
    () =>
      ACCOUNT_KIND.map((value) => ({
        value,
        label: t(`accounts.${KIND_LABEL_KEY[value]}`),
      })),
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

  const handleToggleExpanded = useCallback(() => setExpanded((prior) => !prior), []);
  const handleKindChange = useCallback((value: string) => setKind(value as AccountKind), []);
  const handleOwnershipChange = useCallback(
    (value: string) => setOwnership(value as Ownership),
    [],
  );

  const handleSave = useCallback(() => {
    if (!currency || dateInvalid) return;
    onSave({
      name: trimmed,
      currency,
      kind,
      ownership,
      isBusiness: businessValue,
      openingBalance: openingBalance ?? "0",
      openingDate: openingDateText === "" ? null : openingDateText,
      memo,
      groupId,
    });
  }, [
    businessValue,
    currency,
    dateInvalid,
    groupId,
    kind,
    memo,
    openingBalance,
    openingDateText,
    onSave,
    ownership,
    trimmed,
  ]);
  const nameError = fieldErrors?.byField["name"]?.[0];
  const currencyError = fieldErrors?.byField["currency"]?.[0];

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
      {/* 120 is the shared operation contract's cap, stated where it binds. */}
      <TextField
        label={t("common.name")}
        value={name}
        onChangeText={setName}
        maxLength={120}
        {...(nameError === undefined ? {} : { error: nameError })}
      />
      <Text style={styles.label}>{t("accounts.currency")}</Text>
      <CurrencyGrid
        currencies={currencies}
        selected={currency}
        onSelect={setCurrency}
        label={t("accounts.currency")}
      />
      {currencyError === undefined ? null : <Text style={styles.fieldError}>{currencyError}</Text>}

      <Button
        label={t(expanded ? "accounts.fewerDetails" : "accounts.moreDetails")}
        onPress={handleToggleExpanded}
        variant="ghost"
      />

      {expanded ? (
        <View style={styles.more}>
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
            onChange={setOpeningBalance}
            {...(currency === null ? {} : { currency })}
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
          <Select
            label={t("accounts.group")}
            placeholder={t("accounts.noGroup")}
            options={groupOptions}
            value={groupId}
            onChange={setGroupId}
          />
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button label={t("common.cancel")} onPress={onCancel} variant="ghost" />
        <Button
          label={t("common.save")}
          onPress={handleSave}
          disabled={!trimmed || currency === null || dateInvalid}
          variant="primary"
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.xl },
  label: { color: theme.textMuted, ...text.ui("kicker") },
  fieldError: { color: theme.dangerText, ...text.ui("caption") },
  formLevel: { gap: space.xs },
  formLevelHeading: { color: theme.dangerText, ...text.ui("body", 600) },
  formLevelMessage: { color: theme.dangerText, ...text.ui("caption") },
  more: { gap: space.xl },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.xl },
}));
