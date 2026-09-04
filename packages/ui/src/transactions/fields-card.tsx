/**
 * `<FieldsCard>` — `screens/S09-transaction-detail.md` §3 mobile, the block
 * of fields under the hero.
 *
 * **A row, not a button.** S09 §4 draws every editable field as a labelled
 * row inside the card: the kicker on the left in `textMuted`, the value on
 * the right in `text`, a drawn chevron — `Select`'s own mark, not a new one
 * — and a hairline between rows, the same anatomy `BalanceRow` and
 * `TransactionRow` already use. A `Chip` per field read as a row of centred,
 * filled buttons; nothing here fills a background.
 *
 * **Six rows, not the mock's seven.** Counterparty is not offered:
 * `#e3` has no counterparty write path yet, and `wave-3-shared.md` names
 * counterparty writes unbuilt this wave — a row that opened nothing would
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
 * uses, so its chevron never turns. `isBusiness` is a `Toggle`, already a
 * direct, one-tap control; wrapping it behind a row that has to be tapped
 * open first would cost a tap for nothing.
 *
 * **A stale-version refusal is a `formLevel` message, not a field one** — it
 * names no single row, because every row is stale at once. The screen resolves
 * `transactions.changedElsewhere` through `useT()` before it reaches here,
 * matching `QuickAddForm`'s own `fieldErrors` contract.
 */

import { isAccountingDate } from "@waltning/core/date";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { DateField } from "../primitives/date-field";
import { useDisclosureMotion } from "../primitives/disclosure-motion.ts";
import type { FieldErrorMap } from "../primitives/field-errors.ts";
import { useInteraction } from "../primitives/interaction.ts";
import { usePressScale } from "../primitives/press-scale.ts";
import { Select } from "../primitives/select";
import { TextField } from "../primitives/text-field";
import { Toggle } from "../primitives/toggle";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, hairline, space, touchTarget } from "../tokens.ts";

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

      <FieldDisclosureRow
        first
        label={t("transactions.category")}
        value={categoryName}
        placeholder={t("transactions.noCategory")}
        onPress={onOpenCategoryPicker}
      />

      <FieldDisclosureRow
        label={t("transactions.date")}
        value={date}
        placeholder={t("transactions.date")}
        open={open.has("date")}
        onPress={handleToggleDate}
      >
        <DateField
          label={t("transactions.date")}
          value={date}
          onChange={setDate}
          today={today}
          {...(dateValid ? {} : { error: t("transactions.invalidDate") })}
        />
      </FieldDisclosureRow>

      <FieldDisclosureRow
        label={t("transactions.account")}
        value={selectedAccountName}
        placeholder={t("transactions.account")}
        open={open.has("account")}
        onPress={handleToggleAccount}
      >
        <Select
          label={t("transactions.account")}
          placeholder={t("transactions.account")}
          options={accountOptions}
          value={accountId}
          onChange={setAccountId}
        />
      </FieldDisclosureRow>

      <View style={styles.separated}>
        <Toggle label={t("transactions.business")} value={isBusiness} onChange={setIsBusiness} />
      </View>

      <FieldDisclosureRow
        label={t("transactions.payee")}
        value={payee}
        placeholder="—"
        open={open.has("payee")}
        onPress={handleTogglePayee}
      >
        <TextField
          label={t("transactions.payee")}
          value={payee}
          onChangeText={setPayee}
          maxLength={200}
        />
      </FieldDisclosureRow>

      <FieldDisclosureRow
        label={t("common.note")}
        value={note}
        placeholder="—"
        open={open.has("note")}
        onPress={handleToggleNote}
      >
        <TextField
          label={t("common.note")}
          value={note}
          onChangeText={setNote}
          maxLength={2000}
          counter
        />
      </FieldDisclosureRow>

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

type FieldDisclosureRowProps = {
  label: string;
  /** `null`/`""` shows `placeholder`, muted — the field has nothing set. */
  value: string | null;
  placeholder: string;
  /**
   * Present only for a field that opens inline (`children` follows). Absent
   * for `category`, which opens `CategorySheet` instead — its chevron never
   * turns, because nothing here is disclosed.
   */
  open?: boolean;
  onPress: () => void;
  first?: boolean;
  children?: React.ReactNode;
};

/**
 * One row: kicker left, value right, a drawn chevron — `Select`'s own
 * `useDisclosureMotion` and chevron mark, not a second implementation of
 * either. `open`'s absence (the category row) still renders the chevron,
 * static, because "tap to see more" is the same promise whether what
 * follows is a panel here or a sheet over the screen.
 */
function FieldDisclosureRow({
  label,
  value,
  placeholder,
  open = false,
  onPress,
  first = false,
  children,
}: FieldDisclosureRowProps) {
  const t = useT();
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  const press = usePressScale();
  const { chevron } = useDisclosureMotion(open);

  const filled = value !== null && value !== "";
  const displayValue = filled ? value : placeholder;

  return (
    <View style={first ? null : styles.separated}>
      <Animated.View style={press.style}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={filled ? t("common.fieldValue", { field: label, value }) : label}
          accessibilityState={{ expanded: open }}
          onPress={onPress}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          {...handlers}
          // No hover fill: the label is `textMuted` and a real hover leaves
          // the cursor resting for the screenshot — `theme.hoverFill` under
          // `textMuted` measures 4.47:1, short of AA's 4.5:1. Focus ring and
          // press-scale carry the feedback instead; `BalanceRow`, the
          // anatomy this row copies, has no hover treatment either.
          style={[styles.row, focused ? styles.focused : null]}
        >
          <Text style={styles.label}>{label}</Text>
          <View style={styles.valueGroup}>
            <Text numberOfLines={1} style={[styles.value, filled ? null : styles.valueMuted]}>
              {displayValue}
            </Text>
            <Animated.View style={[styles.chevron, chevron]}>
              <View style={styles.chevronMark} />
            </Animated.View>
          </View>
        </Pressable>
      </Animated.View>
      {open ? <View style={styles.editor}>{children}</View> : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {},
  separated: { borderTopWidth: hairline.width, borderTopColor: theme.hairline },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    minHeight: touchTarget.min,
    paddingVertical: space.md,
  },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  label: { color: theme.textMuted, ...text.ui("body") },
  valueGroup: { flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 },
  value: { color: theme.text, ...text.ui("body"), flexShrink: 1, textAlign: "right" },
  valueMuted: { color: theme.textMuted },
  chevron: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  /** Two borders rotated 45° — `Select`'s own drawn chevron, unchanged. */
  chevronMark: {
    width: 9,
    height: 9,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: theme.textMuted,
    transform: [{ rotate: "45deg" }],
    marginTop: -4,
  },
  editor: { paddingBottom: space.md },
  formLevel: { gap: space.xs },
  formLevelMessage: { color: theme.dangerText, ...text.ui("caption") },
  actions: { flexDirection: "row", justifyContent: "flex-end", paddingTop: space.md },
}));
