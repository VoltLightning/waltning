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
 * **Category and account are opened, never rendered, here.** `CategorySheet`
 * (`categories/`) and `AccountPicker` (`accounts/`) are both sibling domains,
 * so this only ever calls `onOpenCategoryPicker` and `onOpenAccountPicker` —
 * the screen composes whichever sheet is open, the same escape `QuickAddForm`
 * already uses for category (`architecture/11`: a module never imports a
 * sibling module).
 *
 * **A proposal is shown, never applied, by this component (§14, P2).** The
 * category chip reads the proposed name, machine-filled, the moment
 * `categoryProposal` arrives — but `categoryId` does not change until the
 * screen hears a real pick, from this composer's own chip tap opening the
 * sheet where *Use* or a leaf commits it. Nothing here writes a category on
 * its own.
 */

import {
  type CategoryProposal,
  PROPOSAL_DISPLAY_THRESHOLD,
} from "@waltning/core/capture/payee-memory";
import type { CurrencyCode } from "@waltning/core/money";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { AmountField } from "../fx/amount-field";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
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
  /** The account's own fraction digits — `amount-keys.ts#applyKey`'s `decimals` cap. */
  decimals: number;
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
  /** Opens `AccountPicker` (`accounts/`) — the screen composes it and wires its own pick straight to `accountId`, this only ever asks. */
  onOpenAccountPicker: () => void;
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
  /**
   * S15's *+ New* escape — the counterparty sheet's own footer, the same
   * shape `onCreateAccount` already gives the account sheet. Optional: a
   * screen that has not wired S15 yet (a story, an older test) still renders.
   */
  onCreateCounterparty?: () => void;
  /** `create_transaction`'s own field paths — same keys `QuickAddForm` resolves. */
  fieldErrors?: FieldErrorMap;
  onCancel: () => void;
};

type OpenSheet = "date" | "scope" | "payee" | "note" | "counterparty" | null;

export function QuickAddComposer({
  raw,
  type,
  onTypeChange,
  accounts,
  accountId,
  accountMachineFilled,
  onOpenAccountPicker,
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
  onCreateCounterparty,
  fieldErrors,
  onCancel,
}: QuickAddComposerProps) {
  const t = useT();
  const styles = useStyles();
  const [openSheet, setOpenSheet] = useState<OpenSheet>(null);

  const selectedAccount = accounts.find((account) => account.id === accountId);
  const closeSheet = useCallback(() => setOpenSheet(null), []);
  const handleOpenDateSheet = useCallback(() => setOpenSheet("date"), []);
  const handleOpenScopeSheet = useCallback(() => setOpenSheet("scope"), []);
  const handleOpenPayeeSheet = useCallback(() => setOpenSheet("payee"), []);
  const handleOpenNoteSheet = useCallback(() => setOpenSheet("note"), []);
  const handleOpenCounterpartySheet = useCallback(() => setOpenSheet("counterparty"), []);

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
  /**
   * §14's display threshold — below it, the chip alone (already amber, P2's
   * trail marker on every machine-filled value) is not enough: a guess this
   * unsure needs the words, not only the tint (P5). At or above, the plain
   * machine-filled chip already says "something chose this" and a proposal
   * that confident is not the thing P4's amber exists to flag.
   */
  const categoryLowConfidence =
    categoryMachineFilled &&
    categoryProposal !== undefined &&
    categoryProposal !== null &&
    categoryProposal.confidence < PROPOSAL_DISPLAY_THRESHOLD;

  const notePreview =
    note.trim() === ""
      ? undefined
      : note.length > NOTE_CHIP_PREVIEW
        ? `${note.slice(0, NOTE_CHIP_PREVIEW)}…`
        : note;

  const pickedCounterparty = counterparties.find(
    (counterparty) => counterparty.id === counterpartyId,
  );
  /**
   * **§6.6, never defaulted.** A counterparty with no role is not a smaller
   * claim than one with a role — `createTransactionInput`'s own refine
   * reports the mismatch, and this chip is where a person sees why: the name
   * alone would read as "picked and done," so an unresolved role is spelled
   * out on the chip itself rather than left to a form-level error nobody
   * connects to this field.
   */
  const counterpartyValue =
    pickedCounterparty === undefined
      ? undefined
      : counterpartyRole === null
        ? t("transactions.counterpartyRoleMissing", { name: pickedCounterparty.name })
        : pickedCounterparty.name;

  const amountError = fieldErrors?.byField["amountOriginal"]?.[0];
  // §14.6 — the same proactive caption `QuickAddForm`'s own `blocked` text
  // already carries on the desk fallback: an uncapturable account is a fact
  // knowable the moment it is picked, not only after `create_transaction`
  // bounces it. `accountError` stays the fallback for whatever else
  // `byField.accountId` might carry.
  const accountError = fieldErrors?.byField["accountId"]?.[0];
  const accountNeedsRate =
    selectedAccount !== undefined && !selectedAccount.capturable
      ? t("transactions.needsRate", { currency: selectedAccount.currency })
      : undefined;
  const accountCaption = accountNeedsRate ?? accountError;
  const categoryError = fieldErrors?.byField["categoryId"]?.[0];
  const payeeError = fieldErrors?.byField["payee"]?.[0];
  const dateError = fieldErrors?.byField["date"]?.[0];
  const counterpartyError = fieldErrors?.byField["counterpartyId"]?.[0];
  const counterpartyRoleError = fieldErrors?.byField["counterpartyRole"]?.[0];
  /** §6.7's mirror (`create-transaction.executor.ts`'s own refusal), named onto the field the scope chip actually renders. */
  const scopeError = fieldErrors?.byField["isBusiness"]?.[0];

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
          onPress={onOpenAccountPicker}
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
            value={counterpartyValue}
            onPress={handleOpenCounterpartySheet}
            machineFilled={false}
          />
        )}
      </View>
      {accountCaption === undefined ? null : <Text style={styles.needsRate}>{accountCaption}</Text>}
      {categoryError === undefined ? null : <Text style={styles.fieldError}>{categoryError}</Text>}
      {!categoryLowConfidence ? null : (
        <Text style={styles.lowConfidence}>{t("categories.lowConfidence")}</Text>
      )}
      {payeeError === undefined ? null : <Text style={styles.fieldError}>{payeeError}</Text>}
      {dateError === undefined ? null : <Text style={styles.fieldError}>{dateError}</Text>}
      {scopeError === undefined ? null : <Text style={styles.fieldError}>{scopeError}</Text>}
      {counterpartyError === undefined ? null : (
        <Text style={styles.fieldError}>{counterpartyError}</Text>
      )}
      {counterpartyRoleError === undefined ? null : (
        <Text style={styles.fieldError}>{counterpartyRoleError}</Text>
      )}

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
        {onCreateCounterparty ? (
          <Button
            label={t("transactions.newCounterparty")}
            onPress={onCreateCounterparty}
            variant="secondary"
          />
        ) : null}
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
 * control has nothing else to say about `Mine`, and an own account's has
 * nothing to say about `Shared`. `onPick` simply never fires for `Shared`:
 * `common.later`'s "named but not yet reachable" would be the wrong claim for
 * *"not applicable to this account"*, so `Shared` stays a plain, un-disabled
 * segment that this component's own `handleChange` never routes anywhere.
 *
 * **`Business` is different: it is a §6.7 guarantee, not a shrug.** A shared
 * account is never business (`accounts_shared_not_business`,
 * `transactions_business_not_shared`) — picking it must be impossible, not
 * merely a tap this component declines to forward, because a caller reading
 * `isBusiness` off this sheet needs to be able to trust it never became `true`
 * here. So `Business` **is** `Segment#disabled` when the account is shared,
 * carrying its own reason (`transactions.sharedNeverBusiness`) rather than
 * `common.later` — the one case where naming *why* it is unreachable is more
 * honest than pretending it is merely unbuilt. `handleChange` also never
 * routes `"business"` while `shared`, so the guarantee holds even if a caller
 * somehow reached this handler around the disabled control.
 */
function ScopeSegments({ shared, isBusiness, onPick }: ScopeSegmentsProps) {
  const t = useT();
  const segments = useMemo<readonly [Segment, Segment, Segment]>(
    () => [
      { value: "mine", label: t("shell.scopeMine") },
      { value: "shared", label: t("shell.scopeShared") },
      {
        value: "business",
        label: t("shell.scopeBusiness"),
        ...(shared === true
          ? { disabled: true, disabledReason: t("transactions.sharedNeverBusiness") }
          : {}),
      },
    ],
    [t, shared],
  );
  const value = shared === true ? "shared" : isBusiness ? "business" : "mine";
  const handleChange = useCallback(
    (next: string) => {
      if (next === "business" && shared !== true) onPick(true);
      else if (next === "mine") onPick(false);
    },
    [onPick, shared],
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
  /** §14 — text, not tint alone (P5); `theme.textMuted`, the same colour `CategorySheet`'s own caption uses. */
  lowConfidence: { color: theme.textMuted, ...text.ui("caption") },
  /** §14.6's own caption — a fact about now, not an error (`quick-add-form.tsx`'s `blocked`, matched). */
  needsRate: { color: theme.textMuted, ...text.ui("caption") },
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
