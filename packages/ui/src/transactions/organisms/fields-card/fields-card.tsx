/**
 * S09's editable fields — one card of rows, then the flags as chips
 * (`screens/S09-transaction-detail.md` §3). *Someone owes* opens the
 * obligation picker and, once somebody is named, becomes an *Owes* row inside
 * the card with its role beneath; *Business* and *One-off* are on/off chips.
 * One Save commits the draft, and appears only once there is something to
 * commit. Pickers are composed by the screen so each domain owns its controls.
 */

import { accountingDate, isAccountingDate } from "@waltning/core/date";
import type { AccountKind } from "@waltning/core/registry/inputs";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useT } from "../../../i18n/provider";
import { Button } from "../../../primitives/atoms/button/button";
import { Chip } from "../../../primitives/atoms/chip/chip";
import { DateField } from "../../../primitives/atoms/date-field/date-field";
import { RadioGroup, type RadioGroupProps } from "../../../primitives/atoms/radio/radio";
import { TextField } from "../../../primitives/atoms/text-field/text-field";
import { useDisclosureMotion } from "../../../primitives/disclosure-motion.ts";
import type { FieldErrorMap } from "../../../primitives/field-errors.ts";
import { useInteraction } from "../../../primitives/interaction.ts";
import { DatePicker } from "../../../primitives/molecules/date-picker/date-picker";
import { usePressScale } from "../../../primitives/press-scale.ts";
import { useBreakpoint } from "../../../primitives/use-breakpoint.ts";
import { Card } from "../../../shell/molecules/card/card";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, hairline, space, touchTarget } from "../../../tokens.ts";

/**
 * One account this card can name — structural, matching `AccountPicker`'s own
 * `AccountPickerAccount` rather than importing it (`accounts/` is a sibling
 * domain, `architecture/11`). Widened past `{id, name}` so the same list the
 * screen already builds for `AccountPicker` (grouped, capturable-tinted) also
 * answers this card's own "what is the current pick called" lookup, rather
 * than a second, narrower mapping existing only for this card.
 */
export type FieldsCardAccount = {
  id: string;
  name: string;
  currency: string;
  kind: AccountKind;
  capturable: boolean;
  ownership: "own" | "shared";
  groupId: string | null;
  archived?: boolean;
};

/** §6.6's three roles, restated structurally — `client` is a sibling package. */
export type ObligationRoleValue = "debt" | "contribution";

/** The saved values this card diffs every draft against. */
export type TransactionFields = {
  date: string;
  accountId: string;
  categoryId: string | null;
  /**
   * §6.6.1 — who the transaction was **with**. Separate from the obligation
   * below, and S09 is the one surface where the two can differ: paying a shop
   * for a friend names the shop here and the friend there, which no single
   * chip row can express.
   */
  counterpartyId: string | null;
  obligationCounterpartyId: string | null;
  obligationRole: ObligationRoleValue | null;
  enteredName: string;
  note: string;
  isBusiness: boolean;
  isCapital: boolean;
};

/** What `onSave` sends — only the keys that changed. */
export type TransactionFieldsPatch = {
  date?: string;
  accountId?: string;
  categoryId?: string | null;
  counterpartyId?: string | null;
  obligationCounterpartyId?: string | null;
  obligationRole?: ObligationRoleValue | null;
  enteredName?: string;
  note?: string;
  isBusiness?: boolean;
  isCapital?: boolean;
};

export type FieldsCardProps = {
  fields: TransactionFields;
  accounts: readonly FieldsCardAccount[];
  /**
   * The account pick, controlled from the screen — `categoryId`'s own
   * contract. `AccountPicker` (`accounts/`) is a sibling domain, composed by
   * the screen and not by this card (`architecture/11`), so a pick travels
   * back in through this prop rather than living in local state the way it
   * once did.
   */
  accountId: string;
  onOpenAccountPicker: () => void;
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
  /**
   * The counterparty pick, controlled from the screen — `categoryId`'s own
   * contract, for the same reason: `counterparties/` is a sibling domain and
   * its picker is the screen's to compose (`architecture/11`).
   */
  counterpartyId: string | null;
  counterpartyName: string | null;
  obligationCounterpartyId: string | null;
  obligationCounterpartyName: string | null;
  /**
   * Which link the picker is being opened for — one sheet, two rows. A second
   * picker component would be the same list twice with two sets of state to
   * keep in step, which is the arrangement §6.6.1's own merge argument is
   * about.
   */
  onOpenCounterpartyPicker: (target: "identity" | "obligation") => void;
  fieldErrors?: FieldErrorMap;
  saving?: boolean;
  onSave: (patch: TransactionFieldsPatch) => void;
};

type OpenField = "date" | "enteredName" | "note" | "role";

export function FieldsCard({
  fields,
  accounts,
  accountId,
  onOpenAccountPicker,
  today,
  categoryId,
  categoryName,
  onOpenCategoryPicker,
  counterpartyId,
  counterpartyName,
  obligationCounterpartyId,
  obligationCounterpartyName,
  onOpenCounterpartyPicker,
  fieldErrors,
  saving = false,
  onSave,
}: FieldsCardProps) {
  const t = useT();
  const styles = useStyles();

  const [open, setOpen] = useState<ReadonlySet<OpenField>>(new Set());
  const [date, setDate] = useState(fields.date);
  const [enteredName, setEnteredName] = useState(fields.enteredName);
  const [note, setNote] = useState(fields.note);
  const [isBusiness, setIsBusiness] = useState(fields.isBusiness);
  const [isCapital, setIsCapital] = useState(fields.isCapital);
  const [role, setRole] = useState<ObligationRoleValue | null>(fields.obligationRole);

  const toggleField = useCallback((field: OpenField) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }, []);
  /*
    **On a phone the date row opens the drum itself.** Unfolding the row to show
    a date field, to tap the field, to get the drum, is two steps too many; a
    desk still unfolds, because there the field is typed into.
  */
  const phone = useBreakpoint() === "phone";
  const [pickingDate, setPickingDate] = useState(false);
  const closeDatePicker = useCallback(() => setPickingDate(false), []);
  const handleToggleDate = useCallback(() => {
    if (phone) setPickingDate(true);
    else toggleField("date");
  }, [phone, toggleField]);
  const handleToggleEnteredName = useCallback(() => toggleField("enteredName"), [toggleField]);
  const handleToggleRole = useCallback(() => toggleField("role"), [toggleField]);
  const handleRoleChange = useCallback((next: string) => setRole(isRole(next) ? next : null), []);
  const handleToggleNote = useCallback(() => toggleField("note"), [toggleField]);
  const handleToggleBusiness = useCallback(() => setIsBusiness((current) => !current), []);
  const handleToggleCapital = useCallback(() => setIsCapital((current) => !current), []);
  const handleOpenIdentityPicker = useCallback(
    () => onOpenCounterpartyPicker("identity"),
    [onOpenCounterpartyPicker],
  );
  const handleOpenObligationPicker = useCallback(
    () => onOpenCounterpartyPicker("obligation"),
    [onOpenCounterpartyPicker],
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

  const dateValid = isAccountingDate(date);
  const selectedAccountName =
    accounts.find((account) => account.id === accountId)?.name ?? accountId;

  const patch = useMemo<TransactionFieldsPatch>(() => {
    const next: TransactionFieldsPatch = {};
    if (dateValid && date !== fields.date) next.date = date;
    if (accountId !== fields.accountId) next.accountId = accountId;
    if (categoryId !== fields.categoryId) next.categoryId = categoryId;
    if (counterpartyId !== fields.counterpartyId) next.counterpartyId = counterpartyId;
    if (obligationCounterpartyId !== fields.obligationCounterpartyId) {
      next.obligationCounterpartyId = obligationCounterpartyId;
      // §6.6 — a role belongs to the person it is about. Whoever is picked
      // next has their own, and nobody at all has none.
      if (obligationCounterpartyId === null) next.obligationRole = null;
    }
    if (obligationCounterpartyId !== null && role !== fields.obligationRole)
      next.obligationRole = role;
    if (isCapital !== fields.isCapital) next.isCapital = isCapital;
    if (enteredName !== fields.enteredName) next.enteredName = enteredName;
    if (note !== fields.note) next.note = note;
    if (isBusiness !== fields.isBusiness) next.isBusiness = isBusiness;
    return next;
  }, [
    accountId,
    categoryId,
    counterpartyId,
    obligationCounterpartyId,
    date,
    dateValid,
    fields,
    isBusiness,
    isCapital,
    note,
    enteredName,
    role,
  ]);
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

      <Card>
        <View>
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
          {pickingDate ? (
            <DatePicker
              prompt={t("transactions.date")}
              value={isAccountingDate(date) ? accountingDate(date) : accountingDate(today)}
              onChange={setDate}
              today={accountingDate(today)}
              onDismiss={closeDatePicker}
            />
          ) : null}

          <FieldDisclosureRow
            label={t("transactions.account")}
            value={selectedAccountName}
            placeholder={t("transactions.account")}
            onPress={onOpenAccountPicker}
          />

          {/* Who it was *with* — the commoner fact, and the plainer label. */}
          <FieldDisclosureRow
            label={t("transactions.counterparty")}
            value={counterpartyName}
            placeholder={t("transactions.noCounterparty")}
            onPress={handleOpenIdentityPicker}
          />

          <FieldDisclosureRow
            label={t("transactions.enteredName")}
            value={enteredName}
            placeholder="—"
            open={open.has("enteredName")}
            onPress={handleToggleEnteredName}
          >
            <TextField
              label={t("transactions.enteredName")}
              value={enteredName}
              onChangeText={setEnteredName}
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

          {/*
            And who it *owes*, a different question with a different answer
            often enough to deserve its own row: paying a shop for a friend
            names the shop above and the friend here. Drawn only once somebody
            is named — until then the *Someone owes* chip below asks.
          */}
          {obligationCounterpartyId === null ? null : (
            <>
              <FieldDisclosureRow
                label={t("transactions.obligationParty")}
                value={obligationCounterpartyName}
                placeholder={t("transactions.noObligation")}
                onPress={handleOpenObligationPicker}
              />

              <FieldDisclosureRow
                label={t("transactions.role")}
                value={role === null ? null : t(`transactions.role.${role}`)}
                placeholder={t("transactions.chooseRole")}
                open={open.has("role")}
                onPress={handleToggleRole}
              >
                <RadioGroup
                  label={t("transactions.role")}
                  options={roleOptions}
                  value={role ?? NO_OBLIGATION}
                  onChange={handleRoleChange}
                />
              </FieldDisclosureRow>
            </>
          )}
        </View>
      </Card>

      <View style={styles.flags}>
        {obligationCounterpartyId === null ? (
          <Chip placeholder={t("transactions.someoneOwes")} onPress={handleOpenObligationPicker} />
        ) : null}
        <Chip
          placeholder={t("transactions.business")}
          selected={isBusiness}
          role="checkbox"
          onPress={handleToggleBusiness}
        />
        {/*
          §6.8's one-off. Not on the capture sheet and never will be: you
          rarely know at the till that a purchase would distort a trend, and
          marking it later is the ordinary path. It moves no balance — only
          what a comparison counts — and its hint says so once it is on.
        */}
        <Chip
          placeholder={t("transactions.capital")}
          selected={isCapital}
          role="checkbox"
          onPress={handleToggleCapital}
        />
      </View>
      {isCapital ? <Text style={styles.hint}>{t("transactions.capitalHint")}</Text> : null}

      {hasChanges ? (
        <View style={styles.actions}>
          <Button
            label={t("common.save")}
            onPress={handleSave}
            loading={saving}
            variant="primary"
          />
        </View>
      ) : null}
    </View>
  );
}

/** The radio value standing for "named, and owing nothing". */
const NO_OBLIGATION = "none";

function isRole(value: string): value is ObligationRoleValue {
  return value === "debt" || value === "contribution";
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
          // `textMuted` measured 4.47:1 when this was written, short of AA's 4.5:1 (it clears it now, at 4.89). Focus ring and
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
  root: { gap: space.x3 },
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
  label: { color: theme.textMuted, ...text.ui("bodySm") },
  valueGroup: { flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 },
  value: { color: theme.text, ...text.ui("bodySm", 500), flexShrink: 1, textAlign: "right" },
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
  actions: { flexDirection: "row", justifyContent: "flex-end" },
  flags: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  hint: { color: theme.textMuted, ...text.ui("caption"), marginTop: -space.md },
}));
