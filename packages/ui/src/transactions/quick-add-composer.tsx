/**
 * `<QuickAddComposer>` — `screens/S05-quick-add.md` §3 mobile: the header,
 * the hero amount, and "the whole model" — the chip row.
 *
 * **The keypad is not here.** `Dock` owns the mode row, the keypad and Save
 * (`dock.tsx`'s own doc: "the keypad is `children`, not a prop this component
 * understands") — `quick-add-screen.tsx` composes this above a `Dock` the
 * same way it composes `AmountField`'s hero variant inside this component.
 * This is the part of the screen above the dock: everything a person fills in
 * without a thumb reaching for the bottom edge.
 *
 * **Fully controlled.** Every field is a prop in, a callback out — this
 * component owns no draft state of its own beyond which sheet is open, the
 * same contract `QuickAddForm` already keeps for its own controlled fields
 * (`categoryId`). The screen is the one place `packages/client`'s
 * `QuickAddDraft` is assembled.
 *
 * **Category is opened, never rendered, here.** `CategorySheet` lives in
 * `categories/` — a sibling domain — so this only ever calls
 * `onOpenCategoryPicker`, the same escape `QuickAddForm` already uses
 * (`architecture/11`: a module never imports a sibling module).
 *
 * **A proposal is shown, never applied, by this component (§14, P2).** The
 * category chip reads the proposed name, machine-filled, the moment
 * `categoryProposal` arrives — but `categoryId` does not change until the
 * screen hears a real pick, from this composer's own chip tap opening the
 * sheet where *Use* or a leaf commits it. Nothing here writes a category on
 * its own.
 */

import type { CategoryProposal } from "@waltning/core/capture/payee-memory";
import type { CurrencyCode } from "@waltning/core/money";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { AmountField } from "../fx/amount-field";
import { useT } from "../i18n/provider";
import { Chip } from "../primitives/chip";
import { DateField } from "../primitives/date-field";
import type { FieldErrorMap } from "../primitives/field-errors.ts";
import { IconButton } from "../primitives/icon-button";
import { useInteraction } from "../primitives/interaction.ts";
import { usePressScale } from "../primitives/press-scale.ts";
import { RadioGroup, type RadioGroupProps } from "../primitives/radio";
import { type Segment, SegmentControl } from "../primitives/segment-control";
import { Select } from "../primitives/select";
import { TextField } from "../primitives/text-field";
import { BottomSheet } from "../shell/bottom-sheet";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";

const NOTE_CHIP_PREVIEW = 24;
const COUNTERPARTY_ROLES = ["debt", "contribution", "reference"] as const;
type CounterpartyRole = (typeof COUNTERPARTY_ROLES)[number];

export type QuickAddComposerAccount = {
  id: string;
  name: string;
  currency: CurrencyCode;
  capturable: boolean;
  ownership: "own" | "shared";
};

export type QuickAddComposerCategory = { id: string; name: string; kind: "income" | "expense" };
export type QuickAddComposerCounterparty = { id: string; name: string };

export type QuickAddComposerProps = {
  /** The raw string `Keypad` edits — `AmountField(hero)`'s own value. */
  raw: string;
  type: "expense" | "income";
  onTypeChange: (type: "expense" | "income") => void;
  accounts: readonly QuickAddComposerAccount[];
  accountId: string | null;
  /** The account chip fills machine, carrying the trail — `useLastUsedAccount`'s own result. */
  accountMachineFilled: boolean;
  /** Epoch ms — the sheet's own "from your last capture, 14:20" line. Absent when nothing was ever captured. */
  accountMachineFilledAt?: number;
  onAccountChange: (accountId: string) => void;
  categories: readonly QuickAddComposerCategory[];
  categoryId: string | null;
  /** D2's own proposal, already computed by the screen — this composer never proposes. */
  categoryProposal?: CategoryProposal;
  onOpenCategoryPicker: () => void;
  payee: string;
  onPayeeChange: (payee: string) => void;
  /** `AccountingDate`'s shape (`YYYY-MM-DD`). */
  date: string;
  onDateChange: (date: string) => void;
  /** The device's local `AccountingDate` (§7.0a) — `Today`'s own chip value and `DateField`'s shortcuts. */
  today: string;
  isBusiness: boolean;
  onBusinessChange: (isBusiness: boolean) => void;
  note: string;
  onNoteChange: (note: string) => void;
  /** Offered only when non-empty — S05 §5, the same rule `QuickAddForm` already keeps. */
  counterparties: readonly QuickAddComposerCounterparty[];
  counterpartyId: string | null;
  onCounterpartyChange: (counterpartyId: string) => void;
  counterpartyRole: CounterpartyRole | null;
  onCounterpartyRoleChange: (role: CounterpartyRole) => void;
  /** `create_transaction`'s own field paths — same keys `QuickAddForm` resolves. */
  fieldErrors?: FieldErrorMap;
  onCancel: () => void;
};

type OpenSheet = "account" | "date" | "scope" | "payee" | "note" | "counterparty" | null;

export function QuickAddComposer({
  raw,
  type,
  onTypeChange,
  accounts,
  accountId,
  accountMachineFilled,
  accountMachineFilledAt,
  onAccountChange,
  categories,
  categoryId,
  categoryProposal,
  onOpenCategoryPicker,
  payee,
  onPayeeChange,
  date,
  onDateChange,
  today,
  isBusiness,
  onBusinessChange,
  note,
  onNoteChange,
  counterparties,
  counterpartyId,
  onCounterpartyChange,
  counterpartyRole,
  onCounterpartyRoleChange,
  fieldErrors,
  onCancel,
}: QuickAddComposerProps) {
  const t = useT();
  const styles = useStyles();
  const [openSheet, setOpenSheet] = useState<OpenSheet>(null);

  const selectedAccount = accounts.find((account) => account.id === accountId);
  const closeSheet = useCallback(() => setOpenSheet(null), []);
  const handleOpenAccountSheet = useCallback(() => setOpenSheet("account"), []);
  const handleOpenDateSheet = useCallback(() => setOpenSheet("date"), []);
  const handleOpenScopeSheet = useCallback(() => setOpenSheet("scope"), []);
  const handleOpenPayeeSheet = useCallback(() => setOpenSheet("payee"), []);
  const handleOpenNoteSheet = useCallback(() => setOpenSheet("note"), []);
  const handleOpenCounterpartySheet = useCallback(() => setOpenSheet("counterparty"), []);

  const handleAccountPick = useCallback(
    (next: string) => {
      onAccountChange(next);
      setOpenSheet(null);
    },
    [onAccountChange],
  );
  const handleScopePick = useCallback(
    (next: boolean) => {
      onBusinessChange(next);
      setOpenSheet(null);
    },
    [onBusinessChange],
  );

  const pickedCategory = categories.find(
    (category) => category.id === categoryId && category.kind === type,
  );
  const proposedCategory =
    pickedCategory === undefined && categoryProposal
      ? categories.find(
          (category) => category.id === categoryProposal.categoryId && category.kind === type,
        )
      : undefined;
  const categoryValue = pickedCategory?.name ?? proposedCategory?.name;
  const categoryMachineFilled = pickedCategory === undefined && proposedCategory !== undefined;

  const notePreview =
    note.trim() === ""
      ? undefined
      : note.length > NOTE_CHIP_PREVIEW
        ? `${note.slice(0, NOTE_CHIP_PREVIEW)}…`
        : note;

  const pickedCounterparty = counterparties.find(
    (counterparty) => counterparty.id === counterpartyId,
  );

  const amountError = fieldErrors?.byField["amountOriginal"]?.[0];
  const accountError = fieldErrors?.byField["accountId"]?.[0];
  const categoryError = fieldErrors?.byField["categoryId"]?.[0];
  const dateError = fieldErrors?.byField["date"]?.[0];
  const counterpartyError = fieldErrors?.byField["counterpartyId"]?.[0];

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <IconButton label={t("common.cancel")} onPress={onCancel}>
          <CrossMark />
        </IconButton>
        <TypeToggle type={type} onChange={onTypeChange} />
      </View>

      <AmountField
        variant="hero"
        label={t("transactions.amount")}
        {...(selectedAccount ? { currency: selectedAccount.currency } : {})}
        value={raw}
      />
      {amountError === undefined ? null : <Text style={styles.fieldError}>{amountError}</Text>}

      <View style={styles.chipRow}>
        <Chip
          placeholder={t("transactions.account")}
          value={selectedAccount?.name}
          onPress={handleOpenAccountSheet}
          machineFilled={accountMachineFilled && selectedAccount !== undefined}
        />
        <Chip
          placeholder={t("transactions.category")}
          value={categoryValue}
          onPress={onOpenCategoryPicker}
          machineFilled={categoryMachineFilled}
        />
        <Chip
          placeholder={t("transactions.addPayee")}
          value={payee.trim() === "" ? undefined : payee}
          onPress={handleOpenPayeeSheet}
          machineFilled={false}
        />
        <Chip
          placeholder={t("transactions.date")}
          value={date === today ? t("shell.today") : date}
          onPress={handleOpenDateSheet}
          machineFilled={false}
        />
        <Chip
          placeholder={t("transactions.scope")}
          value={scopeLabel(t, selectedAccount, isBusiness)}
          onPress={handleOpenScopeSheet}
          machineFilled={false}
        />
        <Chip
          placeholder={t("transactions.addNote")}
          value={notePreview}
          onPress={handleOpenNoteSheet}
          machineFilled={false}
        />
        {counterparties.length === 0 ? null : (
          <Chip
            placeholder={t("transactions.addPerson")}
            value={pickedCounterparty?.name}
            onPress={handleOpenCounterpartySheet}
            machineFilled={false}
          />
        )}
      </View>
      {accountError === undefined ? null : <Text style={styles.fieldError}>{accountError}</Text>}
      {categoryError === undefined ? null : <Text style={styles.fieldError}>{categoryError}</Text>}
      {dateError === undefined ? null : <Text style={styles.fieldError}>{dateError}</Text>}
      {counterpartyError === undefined ? null : (
        <Text style={styles.fieldError}>{counterpartyError}</Text>
      )}

      <BottomSheet
        visible={openSheet === "account"}
        title={t("transactions.account")}
        onDismiss={closeSheet}
      >
        {accountMachineFilled && accountMachineFilledAt !== undefined ? (
          <Text style={styles.hint}>
            {t("transactions.lastCapture", { time: formatClockTime(accountMachineFilledAt) })}
          </Text>
        ) : null}
        <ScrollView style={styles.accountScroll}>
          <View style={styles.accountList}>
            {accounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                selected={account.id === accountId}
                onPick={handleAccountPick}
              />
            ))}
          </View>
        </ScrollView>
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

      <BottomSheet
        visible={openSheet === "scope"}
        title={t("transactions.scope")}
        onDismiss={closeSheet}
      >
        <ScopeSegments
          shared={selectedAccount?.ownership === "shared"}
          isBusiness={isBusiness}
          onPick={handleScopePick}
        />
      </BottomSheet>

      <BottomSheet
        visible={openSheet === "payee"}
        title={t("transactions.payee")}
        onDismiss={closeSheet}
      >
        <TextField
          label={t("transactions.payee")}
          value={payee}
          onChangeText={onPayeeChange}
          maxLength={200}
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

      <BottomSheet
        visible={openSheet === "counterparty"}
        title={t("transactions.counterparty")}
        onDismiss={closeSheet}
      >
        <CounterpartyPicker
          counterparties={counterparties}
          counterpartyId={counterpartyId}
          onCounterpartyChange={onCounterpartyChange}
          counterpartyRole={counterpartyRole}
          onCounterpartyRoleChange={onCounterpartyRoleChange}
        />
      </BottomSheet>
    </View>
  );
}

function scopeLabel(
  t: ReturnType<typeof useT>,
  account: QuickAddComposerAccount | undefined,
  isBusiness: boolean,
): string | undefined {
  if (account === undefined) return undefined;
  if (account.ownership === "shared") return t("shell.scopeShared");
  return isBusiness ? t("shell.scopeBusiness") : t("shell.scopeMine");
}

/** `HH:mm`, the device's own locale — a system instant, not an accounting date (§7.0a is the other kind). */
function formatClockTime(at: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(
    new Date(at),
  );
}

type TypeToggleProps = {
  type: "expense" | "income";
  onChange: (type: "expense" | "income") => void;
};

/**
 * S05 §9's decided escape hatch — top-right, deliberately out of the thumb
 * zone. Two values only (§9.1: a transfer gets its own composer via `+`
 * long-press), so a tap toggles rather than opening a picker for a choice of
 * one alternative.
 */
function TypeToggle({ type, onChange }: TypeToggleProps) {
  const t = useT();
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const press = usePressScale();
  const label = type === "expense" ? t("transactions.expense") : t("transactions.income");
  const handlePress = useCallback(
    () => onChange(type === "expense" ? "income" : "expense"),
    [onChange, type],
  );

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={handlePress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        {...handlers}
        style={[
          styles.typeToggle,
          hovered ? styles.typeToggleHovered : null,
          focused ? styles.focused : null,
        ]}
      >
        <Text style={styles.typeToggleLabel}>{label}</Text>
        <View style={styles.typeToggleChevron} />
      </Pressable>
    </Animated.View>
  );
}

/** The drawn ✕ — a literal glyph would be the one icon depending on a font shipping it (`keypad.tsx`'s own rule). */
function CrossMark() {
  const styles = useStyles();
  return (
    <View style={styles.crossMark}>
      <View style={[styles.crossMarkBar, styles.crossMarkBarA]} />
      <View style={[styles.crossMarkBar, styles.crossMarkBarB]} />
    </View>
  );
}

type AccountRowProps = {
  account: QuickAddComposerAccount;
  selected: boolean;
  onPick: (accountId: string) => void;
};

function AccountRow({ account, selected, onPick }: AccountRowProps) {
  const t = useT();
  const handlePick = useCallback(() => onPick(account.id), [account.id, onPick]);
  return (
    <Chip
      placeholder={t("transactions.account")}
      value={account.name}
      selected={selected}
      onPress={handlePick}
      machineFilled={false}
    />
  );
}

type ScopeSegmentsProps = {
  /** The chosen account's own ownership — `undefined` before one is picked. */
  shared: boolean | undefined;
  isBusiness: boolean;
  onPick: (isBusiness: boolean) => void;
};

/**
 * S05 §4's `SegmentControl`, inside the sheet the scope chip opens.
 *
 * **`Shared` is read-only** — a shared account's scope is a fact about the
 * account, not a choice this draft makes, so a shared account's segment
 * control has nothing else to offer and an own account's has nothing to say
 * about `Shared`. Neither is expressed through `Segment#disabled`: that flag
 * carries `common.later` in its accessible name (`segment-control.tsx`'s own
 * comment) — "named but not yet reachable" — which is the wrong claim for
 * *"not applicable to this account"*. `onPick` simply never fires for the
 * segment that does not apply.
 */
function ScopeSegments({ shared, isBusiness, onPick }: ScopeSegmentsProps) {
  const t = useT();
  const segments = useMemo<readonly [Segment, Segment, Segment]>(
    () => [
      { value: "mine", label: t("shell.scopeMine") },
      { value: "shared", label: t("shell.scopeShared") },
      { value: "business", label: t("shell.scopeBusiness") },
    ],
    [t],
  );
  const value = shared === true ? "shared" : isBusiness ? "business" : "mine";
  const handleChange = useCallback(
    (next: string) => {
      if (next === "business") onPick(true);
      else if (next === "mine") onPick(false);
    },
    [onPick],
  );
  return <SegmentControl segments={segments} value={value} onChange={handleChange} />;
}

type CounterpartyPickerProps = {
  counterparties: readonly QuickAddComposerCounterparty[];
  counterpartyId: string | null;
  onCounterpartyChange: (counterpartyId: string) => void;
  counterpartyRole: CounterpartyRole | null;
  onCounterpartyRoleChange: (role: CounterpartyRole) => void;
};

/** §6.6 — the role picker lives in the same sheet, and is never defaulted. */
function CounterpartyPicker({
  counterparties,
  counterpartyId,
  onCounterpartyChange,
  counterpartyRole,
  onCounterpartyRoleChange,
}: CounterpartyPickerProps) {
  const t = useT();
  const options = useMemo(
    () =>
      counterparties.map((counterparty) => ({ value: counterparty.id, label: counterparty.name })),
    [counterparties],
  );
  const roleOptions = useMemo<RadioGroupProps["options"]>(
    () => [
      { value: "debt", label: t("transactions.role.debt") },
      { value: "contribution", label: t("transactions.role.contribution") },
      { value: "reference", label: t("transactions.role.reference") },
    ],
    [t],
  );
  const handleRoleChange = useCallback(
    (next: string) => {
      if (isCounterpartyRole(next)) onCounterpartyRoleChange(next);
    },
    [onCounterpartyRoleChange],
  );

  const styles = useStyles();
  return (
    <View style={styles.counterparty}>
      <Select
        label={t("transactions.counterparty")}
        placeholder={t("transactions.noCounterparty")}
        options={options}
        value={counterpartyId}
        onChange={onCounterpartyChange}
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
    </View>
  );
}

function isCounterpartyRole(value: string): value is CounterpartyRole {
  return (COUNTERPARTY_ROLES as readonly string[]).includes(value);
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.x3 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  fieldError: { color: theme.dangerText, ...text.ui("caption") },
  hint: { color: theme.textMuted, ...text.ui("caption") },
  accountScroll: { maxHeight: touchTarget.min * 6 },
  accountList: { gap: space.md, paddingBottom: space.md },
  counterparty: { gap: space.x3 },
  typeToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: touchTarget.min,
    paddingHorizontal: space.x2,
    borderRadius: radius.sm,
  },
  typeToggleHovered: { backgroundColor: theme.hoverFill },
  typeToggleLabel: { color: theme.text, ...text.ui("body", 600) },
  typeToggleChevron: {
    width: 8,
    height: 8,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: theme.textMuted,
    transform: [{ rotate: "45deg" }],
    marginTop: -4,
  },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  crossMark: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  crossMarkBar: { position: "absolute", width: 17, height: 2, backgroundColor: theme.text },
  crossMarkBarA: { transform: [{ rotate: "45deg" }] },
  crossMarkBarB: { transform: [{ rotate: "-45deg" }] },
}));
