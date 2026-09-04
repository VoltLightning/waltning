/**
 * `<FieldsCard>` — `screens/S09-transaction-detail.md` §3 mobile, the block
 * of fields under the hero.
 *
 * **Six rows, not the mock's seven.** Counterparty is not offered:
 * `#e3` has no counterparty write path yet, and `wave-3-shared.md` names
 * counterparty writes unbuilt this wave — a chip that opened nothing would
 * be worse than one that is not there. `is_capital`'s toggle (§6.8) is the
 * same story: nothing in this wave drives it. Both are the PR's own
 * decision, named in its body rather than left for someone to notice later.
 *
 * **One `Save`, not autosave per keystroke.** S09 §7 reads *"Save is implicit
 * per field"*; the plan this card was built from is explicit instead — a
 * person can open several fields, change them, and commit one patch. The
 * spec is the one that should have said this and did not; it changes
 * alongside this file rather than silently.
 *
 * **Category and scope never accordion.** `category` opens `CategorySheet`
 * — composed by the screen, never by this card (`architecture/11`: a domain
 * does not import a sibling domain) — the same escape `QuickAddForm` already
 * uses. `isBusiness` is a `Toggle`, already a direct, one-tap control; wrapping
 * it behind a chip that has to be tapped open first would cost a tap for
 * nothing.
 *
 * **A stale-version refusal is a `formLevel` message, not a field one** — it
 * names no single row, because every row is stale at once. The screen resolves
 * `transactions.changedElsewhere` through `useT()` before it reaches here,
 * matching `QuickAddForm`'s own `fieldErrors` contract.
 */

import { isAccountingDate } from "@waltning/core/date";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { Chip } from "../primitives/chip";
import { DateField } from "../primitives/date-field";
import type { FieldErrorMap } from "../primitives/field-errors.ts";
import { Select } from "../primitives/select";
import { TextField } from "../primitives/text-field";
import { Toggle } from "../primitives/toggle";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type FieldsCardAccount = { id: string; name: string };

/** The saved values this card diffs every draft against. */
export type TransactionFields = {
  date: string;
  accountId: string;
  categoryId: string | null;
  payee: string;
  note: string;
  isBusiness: boolean;
};

/** What `onSave` sends — only the keys that changed. */
export type TransactionFieldsPatch = {
  date?: string;
  accountId?: string;
  categoryId?: string | null;
  payee?: string;
  note?: string;
  isBusiness?: boolean;
};

export type FieldsCardProps = {
  fields: TransactionFields;
  accounts: readonly FieldsCardAccount[];
  /** The device's local `AccountingDate` (§7.0a) — `DateField`'s shortcuts. */
  today: string;
  /**
   * The category pick, controlled from the screen — `QuickAddForm`'s own
   * contract. `null` means "no category" (a transfer, or genuinely
   * uncategorised).
   */
  categoryId: string | null;
  categoryName: string | null;
  onOpenCategoryPicker: () => void;
  fieldErrors?: FieldErrorMap;
  saving?: boolean;
  onSave: (patch: TransactionFieldsPatch) => void;
};

type OpenField = "account" | "date" | "payee" | "note";

export function FieldsCard({
  fields,
  accounts,
  today,
  categoryId,
  categoryName,
  onOpenCategoryPicker,
  fieldErrors,
  saving = false,
  onSave,
}: FieldsCardProps) {
  const t = useT();
  const styles = useStyles();

  const [open, setOpen] = useState<ReadonlySet<OpenField>>(new Set());
  const [date, setDate] = useState(fields.date);
  const [accountId, setAccountId] = useState(fields.accountId);
  const [payee, setPayee] = useState(fields.payee);
  const [note, setNote] = useState(fields.note);
  const [isBusiness, setIsBusiness] = useState(fields.isBusiness);

  const toggleField = useCallback((field: OpenField) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }, []);
  const handleToggleAccount = useCallback(() => toggleField("account"), [toggleField]);
  const handleToggleDate = useCallback(() => toggleField("date"), [toggleField]);
  const handleTogglePayee = useCallback(() => toggleField("payee"), [toggleField]);
  const handleToggleNote = useCallback(() => toggleField("note"), [toggleField]);

  const dateValid = isAccountingDate(date);
  const accountOptions = useMemo(
    () => accounts.map((account) => ({ value: account.id, label: account.name })),
    [accounts],
  );
  const selectedAccountName =
    accounts.find((account) => account.id === accountId)?.name ?? fields.accountId;

  const patch = useMemo<TransactionFieldsPatch>(() => {
    const next: TransactionFieldsPatch = {};
    if (dateValid && date !== fields.date) next.date = date;
    if (accountId !== fields.accountId) next.accountId = accountId;
    if (categoryId !== fields.categoryId) next.categoryId = categoryId;
    if (payee !== fields.payee) next.payee = payee;
    if (note !== fields.note) next.note = note;
    if (isBusiness !== fields.isBusiness) next.isBusiness = isBusiness;
    return next;
  }, [accountId, categoryId, date, dateValid, fields, isBusiness, note, payee]);
  const hasChanges = Object.keys(patch).length > 0;

  const handleSave = useCallback(() => {
    if (!hasChanges || saving) return;
    onSave(patch);
  }, [hasChanges, onSave, patch, saving]);

  const formLevelErrors = fieldErrors?.formLevel ?? [];

  return (
    <View style={styles.root}>
      {formLevelErrors.length > 0 ? (
        <View style={styles.formLevel} accessibilityRole="alert">
          {formLevelErrors.map((message) => (
            <Text key={message} style={styles.formLevelMessage}>
              {message}
            </Text>
          ))}
        </View>
      ) : null}

      <FieldRow label={t("transactions.category")}>
        <Chip
          placeholder={t("transactions.category")}
          value={categoryName ?? undefined}
          onPress={onOpenCategoryPicker}
        />
      </FieldRow>

      <FieldRow label={t("transactions.date")}>
        <Chip placeholder={t("transactions.date")} value={date} onPress={handleToggleDate} />
        {open.has("date") ? (
          <DateField
            label={t("transactions.date")}
            value={date}
            onChange={setDate}
            today={today}
            {...(dateValid ? {} : { error: t("transactions.invalidDate") })}
          />
        ) : null}
      </FieldRow>

      <FieldRow label={t("transactions.account")}>
        <Chip
          placeholder={t("transactions.account")}
          value={selectedAccountName}
          onPress={handleToggleAccount}
        />
        {open.has("account") ? (
          <Select
            label={t("transactions.account")}
            placeholder={t("transactions.account")}
            options={accountOptions}
            value={accountId}
            onChange={setAccountId}
          />
        ) : null}
      </FieldRow>

      <FieldRow label={t("transactions.business")}>
        <Toggle label={t("transactions.business")} value={isBusiness} onChange={setIsBusiness} />
      </FieldRow>

      <FieldRow label={t("transactions.payee")}>
        <Chip placeholder={t("transactions.payee")} value={payee} onPress={handleTogglePayee} />
        {open.has("payee") ? (
          <TextField
            label={t("transactions.payee")}
            value={payee}
            onChangeText={setPayee}
            maxLength={200}
          />
        ) : null}
      </FieldRow>

      <FieldRow label={t("common.note")}>
        <Chip placeholder={t("common.note")} value={note} onPress={handleToggleNote} />
        {open.has("note") ? (
          <TextField
            label={t("common.note")}
            value={note}
            onChangeText={setNote}
            maxLength={2000}
            counter
          />
        ) : null}
      </FieldRow>

      <View style={styles.actions}>
        <Button
          label={t("common.save")}
          onPress={handleSave}
          disabled={!hasChanges}
          loading={saving}
          variant="primary"
        />
      </View>
    </View>
  );
}

type FieldRowProps = { label: string; children: React.ReactNode };

/** A labelled slot — the kicker names the field, the chip and its editor sit under it. */
function FieldRow({ label, children }: FieldRowProps) {
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.x3 },
  field: { gap: space.sm },
  label: { color: theme.textMuted, ...text.ui("kicker") },
  formLevel: { gap: space.xs },
  formLevelMessage: { color: theme.dangerText, ...text.ui("caption") },
  actions: { flexDirection: "row", justifyContent: "flex-end" },
}));
