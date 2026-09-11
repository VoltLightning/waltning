/**
 * `<QuickAddComposer>` — `screens/S05-quick-add.md` §3: the amount in its
 * card, the choices under it as rows, a few categories within reach, and a
 * note. The deck's anatomy for *Add an expense*, on the deck's density.
 *
 * **The header is not here.** `ComposerHeader` is a fixed band the screen
 * composes above `GroundPanel`, because this component renders inside the page
 * scroller and a header that scrolls is not one. Neither is Save: the footer
 * is the screen's, fixed to the bottom edge, the way the band is fixed to the
 * top.
 *
 * **Fully controlled.** Every field is a prop in, a callback out — this
 * component owns no draft state of its own beyond which sheet is open and
 * whether the rarer rows are shown. The screen is the one place
 * `packages/client`'s `QuickAddDraft` is assembled.
 *
 * **Category and account are opened, never rendered, here.** `CategorySheet`
 * (`categories/`) and `AccountPicker` (`accounts/`) are both sibling domains,
 * so this only ever calls `onOpenCategoryPicker` and `onOpenAccountPicker` —
 * the screen composes whichever sheet is open (`architecture/11`: a module
 * never imports a sibling module). The chips under the rows are the one way a
 * category is picked *here*: they name an id the screen already knows, and
 * `onPickCategory` is the same callback the sheet's pick would reach.
 *
 * **A proposal is shown, never applied, by this component (§14, P2).** The
 * category row reads the proposed name, machine-filled, the moment
 * `categoryProposal` arrives — but `categoryId` does not change until the
 * screen hears a real pick. Nothing here writes a category on its own.
 */

import {
  type CategoryProposal,
  PROPOSAL_DISPLAY_THRESHOLD,
} from "@waltning/core/capture/payee-memory";
import type { CurrencyCode } from "@waltning/core/money";
import { useCallback, useMemo, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useT } from "../../../i18n/provider";
import { Button } from "../../../primitives/atoms/button/button";
import { DateField } from "../../../primitives/atoms/date-field/date-field";
import { RadioGroup, type RadioGroupProps } from "../../../primitives/atoms/radio/radio";
import {
  type Segment,
  SegmentControl,
} from "../../../primitives/atoms/segment-control/segment-control";
import { Select } from "../../../primitives/atoms/select/select";
import { TextField } from "../../../primitives/atoms/text-field/text-field";
import type { FieldErrorMap } from "../../../primitives/field-errors.ts";
import { categoryTintFor } from "../../../primitives/monogram.ts";
import { BottomSheet } from "../../../shell/organisms/bottom-sheet/bottom-sheet";
import { HouseIcon } from "../../../shell/phosphor";
import { Banner } from "../../../states/molecules/banner/banner";
import { text } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../../../tokens.ts";
import { AmountCard } from "../../molecules/amount-card/amount-card";
import { CategoryChips } from "../../molecules/category-chips/category-chips";
import {
  ComposerRow,
  ComposerRows,
  ComposerTileGlyph,
} from "../../molecules/composer-rows/composer-rows";

const COUNTERPARTY_ROLES = ["debt", "contribution", "reference"] as const;
type CounterpartyRole = (typeof COUNTERPARTY_ROLES)[number];
/** How many categories the chip row offers — the deck draws four. */
const CHIP_COUNT = 4;

export type QuickAddComposerAccount = {
  id: string;
  name: string;
  currency: CurrencyCode;
  /** The currency's own mark — `zł` — which is what the deck draws beside the figure; the code where a currency has none. */
  symbol?: string;
  /** The account's own fraction digits — `sanitizeAmount`'s cap. */
  decimals: number;
  capturable: boolean;
  ownership: "own" | "shared";
};

export type QuickAddComposerCategory = {
  id: string;
  name: string;
  kind: "income" | "expense";
  /** How often this ledger has used it — what puts a category among the chips. */
  usage?: number;
};
export type QuickAddComposerCounterparty = { id: string; name: string };

export type QuickAddComposerProps = {
  /** The raw string the draft holds — `AmountCard`'s own value. */
  raw: string;
  onRawChange: (raw: string) => void;
  /**
   * The draft's kind — read here (the category row and chips only ever offer
   * this kind's own leaves), chosen in the screen's segment control above.
   */
  type: "expense" | "income";
  accounts: readonly QuickAddComposerAccount[];
  accountId: string | null;
  /** The account row fills machine, carrying the trail — `useLastUsedAccount`'s own result. */
  accountMachineFilled: boolean;
  /** Opens `AccountPicker` (`accounts/`) — the screen composes it and wires its own pick straight to `accountId`, this only ever asks. */
  onOpenAccountPicker: () => void;
  /**
   * The uncapturable-account banner's own way out — S18, for the picked
   * account's currency and this draft's own `today`. The screen owns the
   * route (`architecture/11`: this package names no router), so the banner
   * carries no action at all when a caller has nowhere to send it.
   */
  onSetRate?: () => void;
  categories: readonly QuickAddComposerCategory[];
  /**
   * The draft's effective category — the screen's own pick, or (H1) a
   * proposal at or above `PROPOSAL_DISPLAY_THRESHOLD` it has applied on the
   * draft's behalf. `categoryAutoFilled` is what tells the two apart.
   */
  categoryId: string | null;
  /** D2's own proposal, already computed by the screen — this composer never proposes. */
  categoryProposal?: CategoryProposal;
  /**
   * True only while `categoryId` is the proposal's own id, applied without a
   * tap — never true for a category a person actually picked, even one that
   * happens to match the proposal (H1, S05 §8's P2 trail).
   */
  categoryAutoFilled?: boolean;
  /** P2's Undo — clears the automatic pick, shown only while `categoryAutoFilled`. */
  onUndoCategory?: () => void;
  onOpenCategoryPicker: () => void;
  /** A chip's pick — the same callback the sheet's pick reaches in the screen. */
  onPickCategory: (categoryId: string) => void;
  payee: string;
  onPayeeChange: (payee: string) => void;
  /** `AccountingDate`'s shape (`YYYY-MM-DD`). */
  date: string;
  onDateChange: (date: string) => void;
  /** The device's local `AccountingDate` (§7.0a) — the date row's *Today* and `DateField`'s shortcuts. */
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
   * S15's *+ New* escape — the counterparty sheet's own footer. Optional: a
   * screen that has not wired S15 yet (a story, an older test) still renders.
   */
  onCreateCounterparty?: () => void;
  /** The one finished line under the figure — `useCategoryPace`, already worded by the screen. */
  pace?: string | undefined;
  /** `create_transaction`'s own field paths — same keys `QuickAddForm` resolves. */
  fieldErrors?: FieldErrorMap;
};

type OpenSheet = "date" | "scope" | "payee" | "counterparty" | null;

export function QuickAddComposer({
  raw,
  onRawChange,
  type,
  accounts,
  accountId,
  accountMachineFilled,
  onOpenAccountPicker,
  onSetRate,
  categories,
  categoryId,
  categoryProposal,
  categoryAutoFilled = false,
  onUndoCategory,
  onOpenCategoryPicker,
  onPickCategory,
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
  pace,
  fieldErrors,
}: QuickAddComposerProps) {
  const t = useT();
  const theme = useTheme();
  const styles = useStyles();
  const [openSheet, setOpenSheet] = useState<OpenSheet>(null);
  const [moreShown, setMoreShown] = useState(false);
  // The note's card wears the ring, the way `AmountCard` does (§2.6).
  const [noteFocused, setNoteFocused] = useState(false);
  const handleNoteFocus = useCallback(() => setNoteFocused(true), []);
  const handleNoteBlur = useCallback(() => setNoteFocused(false), []);

  const selectedAccount = accounts.find((account) => account.id === accountId);
  const closeSheet = useCallback(() => setOpenSheet(null), []);
  const handleOpenDateSheet = useCallback(() => setOpenSheet("date"), []);
  const handleOpenScopeSheet = useCallback(() => setOpenSheet("scope"), []);
  const handleOpenPayeeSheet = useCallback(() => setOpenSheet("payee"), []);
  const handleOpenCounterpartySheet = useCallback(() => setOpenSheet("counterparty"), []);
  const handleToggleMore = useCallback(() => setMoreShown((shown) => !shown), []);

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
  /**
   * H1-a — below §14's display threshold, a guess this unsure never reads as
   * a *value*: `categoryAutoFilled` already implies `pickedCategory !==
   * undefined` (the screen never applies a proposal outside the categories
   * list), so `proposedCategory` is only ever defined in the "shown, not yet
   * applied" state this flag names.
   */
  const proposedBelowThreshold =
    proposedCategory !== undefined &&
    categoryProposal !== undefined &&
    categoryProposal !== null &&
    categoryProposal.confidence < PROPOSAL_DISPLAY_THRESHOLD;
  const categoryValue =
    pickedCategory?.name ?? (proposedBelowThreshold ? undefined : proposedCategory?.name);
  /**
   * Machine-filled (P2) either while an at-or-above-threshold proposal is
   * shown but not applied, or (H1) while `categoryId` itself is the applied
   * proposal — `categoryAutoFilled` names the second case. Never for a
   * below-threshold proposal (H1-a) — that one is a suggestion, not a filled
   * field, and machine-filled would claim more confidence than the proposal
   * itself carries.
   */
  const categoryMachineFilled =
    categoryAutoFilled ||
    (pickedCategory === undefined && proposedCategory !== undefined && !proposedBelowThreshold);
  const categoryLowConfidence = proposedBelowThreshold;
  /**
   * H1-a — the row's placeholder itself, replaced by the suggestion below
   * the display threshold rather than left generic.
   */
  const categoryPlaceholder =
    proposedBelowThreshold && proposedCategory !== undefined
      ? t("transactions.categorySuggested", { name: proposedCategory.name })
      : t("transactions.category");
  /**
   * H1, S05 §8's P2 trail — the caption and Undo for an applied proposal,
   * named from the proposal's own neighbour (the closest one that voted for
   * the winning category), not the typed `payee`: an applied proposal can
   * win on a fold match against a differently-spelled history row, and the
   * trail is naming *where the pick came from*.
   */
  const categoryFromHistory = !categoryAutoFilled
    ? undefined
    : t("categories.fromHistory", {
        payee:
          categoryProposal?.neighbours.find((n) => n.categoryId === categoryProposal.categoryId)
            ?.payee ?? payee,
      });

  /**
   * The chips: this kind's most-used categories, the picked one always among
   * them — a shortcut that hid the current pick would read as the pick being
   * gone. Ordered by use, then by name so two never-used categories keep a
   * stable order between renders.
   */
  const chips = useMemo(() => {
    const ofKind = categories
      .filter((category) => category.kind === type)
      .sort((a, b) => (b.usage ?? 0) - (a.usage ?? 0) || a.name.localeCompare(b.name));
    const top = ofKind.slice(0, CHIP_COUNT);
    const picked = ofKind.find((category) => category.id === categoryId);
    if (picked !== undefined && !top.some((category) => category.id === picked.id)) {
      top.splice(CHIP_COUNT - 1, 1, picked);
    }
    return top.map(({ id, name }) => ({ id, name }));
  }, [categories, type, categoryId]);

  const pickedCounterparty = counterparties.find(
    (counterparty) => counterparty.id === counterpartyId,
  );
  /**
   * **§6.6, never defaulted.** A counterparty with no role is not a smaller
   * claim than one with a role — an unresolved role is spelled out on the row
   * itself rather than left to a form-level error nobody connects to it.
   */
  const counterpartyValue =
    pickedCounterparty === undefined
      ? undefined
      : counterpartyRole === null
        ? t("transactions.counterpartyRoleMissing", { name: pickedCounterparty.name })
        : pickedCounterparty.name;

  const amountError = fieldErrors?.byField["amountOriginal"]?.[0];
  /**
   * L2 — `resolveFieldErrorMessage` maps the controller's own
   * `transactions.needsRate` key onto `byField.accountId`, so a refusal left
   * over from an earlier save attempt can carry the exact sentence the
   * banner below is already showing. One fact, stated once: the banner keeps
   * it, because the banner is the half that carries the way out.
   */
  const rawAccountError = fieldErrors?.byField["accountId"]?.[0];
  const accountNeedsRate =
    selectedAccount !== undefined && !selectedAccount.capturable
      ? t("transactions.needsRate", { currency: selectedAccount.currency })
      : undefined;
  const accountError = rawAccountError === accountNeedsRate ? undefined : rawAccountError;
  /**
   * `neutral`, not `warn` — S05 §8's P4: *the estimated-rate marker is the
   * only amber here*. A currency with no rate at all is a capability this
   * ledger does not have yet, not an asserted figure.
   */
  const setRateAction =
    onSetRate === undefined || selectedAccount === undefined
      ? undefined
      : {
          label: t("transactions.needsRateAction", { currency: selectedAccount.currency }),
          onPress: onSetRate,
        };
  const categoryError = fieldErrors?.byField["categoryId"]?.[0];
  const payeeError = fieldErrors?.byField["payee"]?.[0];
  const dateError = fieldErrors?.byField["date"]?.[0];
  const counterpartyError = fieldErrors?.byField["counterpartyId"]?.[0];
  const counterpartyRoleError = fieldErrors?.byField["counterpartyRole"]?.[0];
  /** §6.7's mirror (`create-transaction.executor.ts`'s own refusal), named onto the row the scope renders. */
  const scopeError = fieldErrors?.byField["isBusiness"]?.[0];
  const moreError =
    payeeError ?? dateError ?? scopeError ?? counterpartyError ?? counterpartyRoleError;

  /** What the collapsed *More details* row says it holds — only the fields that hold something. */
  const moreSummary = [
    payee.trim() === "" ? null : payee,
    date === today ? null : date,
    isBusiness ? t("shell.scopeBusiness") : null,
    pickedCounterparty?.name ?? null,
  ]
    .filter((part) => part !== null)
    .join(" · ");

  const categoryTint =
    categoryValue === undefined
      ? { fill: theme.subtleFill, ink: theme.textMuted }
      : categoryTintFor(categoryValue, theme);
  const categoryGlyph = categoryValue === undefined ? "?" : categoryValue.slice(0, 1).toUpperCase();

  return (
    <View style={styles.root}>
      {fieldErrors && fieldErrors.formLevel.length > 0 ? (
        // A refusal a person cannot see is a refusal that never happened
        // (`field-errors.ts`): whatever `mapFieldErrors` could not place on a
        // field is stated here, over the cards, the way `QuickAddForm` does.
        <View style={styles.formLevel} accessibilityRole="alert">
          <Text style={styles.formLevelHeading}>{t("common.couldNotSave")}</Text>
          {fieldErrors.formLevel.map((message) => (
            <Text key={message} style={styles.fieldError}>
              {message}
            </Text>
          ))}
        </View>
      ) : null}
      <AmountCard
        label={t("transactions.howMuch")}
        raw={raw}
        onChangeRaw={onRawChange}
        decimals={selectedAccount?.decimals ?? 2}
        currency={
          selectedAccount === undefined
            ? undefined
            : (selectedAccount.symbol ?? selectedAccount.currency)
        }
        kind={type}
        context={pace}
        error={amountError}
        autoFocus
      />

      <ComposerRows>
        <ComposerRow
          first
          label={t("transactions.fromAccount")}
          value={selectedAccount?.name}
          placeholder={t("transactions.account")}
          tile={<HouseIcon size={15} color={theme.accentText} />}
          tileFill={theme.accentFill}
          onPress={onOpenAccountPicker}
          machineFilled={accountMachineFilled && selectedAccount !== undefined}
          error={accountError}
        />
        <ComposerRow
          label={t("transactions.category")}
          value={categoryValue}
          placeholder={categoryPlaceholder}
          tile={<ComposerTileGlyph glyph={categoryGlyph} ink={categoryTint.ink} />}
          tileFill={categoryTint.fill}
          onPress={onOpenCategoryPicker}
          machineFilled={categoryMachineFilled}
          error={categoryError}
        />
        <ComposerRow
          label={t("transactions.moreDetails")}
          value={moreSummary === "" ? undefined : moreSummary}
          placeholder={t("transactions.moreDetailsHint")}
          tile={<ComposerTileGlyph glyph="…" ink={theme.textMuted} />}
          tileFill={theme.subtleFill}
          onPress={handleToggleMore}
          error={moreShown ? undefined : moreError}
        />
        {moreShown ? (
          <>
            <ComposerRow
              label={t("transactions.payee")}
              value={payee.trim() === "" ? undefined : payee}
              tile={<ComposerTileGlyph glyph="@" ink={theme.textMuted} />}
              tileFill={theme.subtleFill}
              onPress={handleOpenPayeeSheet}
              error={payeeError}
            />
            <ComposerRow
              label={t("transactions.date")}
              value={date === today ? t("shell.today") : date}
              tile={<ComposerTileGlyph glyph={date.slice(8, 10)} ink={theme.textMuted} />}
              tileFill={theme.subtleFill}
              onPress={handleOpenDateSheet}
              error={dateError}
            />
            <ComposerRow
              label={t("transactions.scope")}
              value={scopeLabel(t, selectedAccount, isBusiness)}
              tile={<ComposerTileGlyph glyph="◐" ink={theme.textMuted} />}
              tileFill={theme.subtleFill}
              onPress={handleOpenScopeSheet}
              error={scopeError}
            />
            {counterparties.length === 0 ? null : (
              <ComposerRow
                label={t("transactions.person")}
                value={counterpartyValue}
                tile={<ComposerTileGlyph glyph="&" ink={theme.textMuted} />}
                tileFill={theme.subtleFill}
                onPress={handleOpenCounterpartySheet}
                error={counterpartyError ?? counterpartyRoleError}
              />
            )}
          </>
        ) : null}
      </ComposerRows>

      {accountNeedsRate === undefined ? null : (
        <Banner
          tone="neutral"
          message={accountNeedsRate}
          {...(setRateAction === undefined ? {} : { action: setRateAction })}
        />
      )}
      {!categoryLowConfidence ? null : (
        <Text style={styles.lowConfidence}>{t("categories.lowConfidence")}</Text>
      )}
      {categoryFromHistory === undefined ? null : (
        <View style={styles.trailRow}>
          <Text style={styles.trailCaption}>{categoryFromHistory}</Text>
          {onUndoCategory === undefined ? null : (
            <Button label={t("states.undo")} onPress={onUndoCategory} variant="ghost" size="sm" />
          )}
        </View>
      )}

      <CategoryChips
        categories={chips}
        selectedId={pickedCategory?.id ?? null}
        onPick={onPickCategory}
      />

      <View style={[styles.noteCard, noteFocused ? styles.noteFocused : null]}>
        <TextInput
          accessibilityLabel={t("common.note")}
          value={note}
          onChangeText={onNoteChange}
          onFocus={handleNoteFocus}
          onBlur={handleNoteBlur}
          placeholder={t("transactions.notePlaceholder")}
          placeholderTextColor={styles.notePlaceholder.color}
          maxLength={2000}
          style={styles.note}
        />
      </View>

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

type ScopeSegmentsProps = {
  /** The chosen account's own ownership — `undefined` before one is picked. */
  shared: boolean | undefined;
  isBusiness: boolean;
  onPick: (isBusiness: boolean) => void;
};

/**
 * S05 §4's `SegmentControl`, inside the sheet the scope row opens.
 *
 * **`Shared` is read-only** — a shared account's scope is a fact about the
 * account, not a choice this draft makes, so `onPick` simply never fires for
 * it. **`Business` is a §6.7 guarantee, not a shrug**: a shared account is
 * never business (`accounts_shared_not_business`,
 * `transactions_business_not_shared`), so `Business` **is**
 * `Segment#disabled` when the account is shared, carrying its own reason, and
 * `handleChange` never routes `"business"` while `shared` either.
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
  // The deck's 20 between blocks — the same gap the page keeps between its cards.
  root: { gap: space.x4 },
  formLevel: { gap: space.xs, paddingHorizontal: space.xs },
  formLevelHeading: { color: theme.dangerText, ...text.ui("body", 600) },
  fieldError: { color: theme.dangerText, ...text.ui("caption") },
  /** §14 — text, not tint alone (P5); `theme.textMuted`, the same colour `CategorySheet`'s own caption uses. */
  lowConfidence: { color: theme.textMuted, ...text.ui("caption"), paddingHorizontal: space.xs },
  /** H1, S05 §8's P2 trail row — the caption and Undo beside it. */
  trailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.xs,
  },
  trailCaption: { color: theme.textMuted, ...text.ui("caption") },
  // The deck's note: one line in its own card, 14 above and below, 16 at the sides.
  noteCard: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.md,
    paddingVertical: space.x2,
    paddingHorizontal: space.x3,
    minHeight: touchTarget.min,
    justifyContent: "center",
  },
  noteFocused: {
    outlineWidth: focus.width,
    outlineStyle: "solid",
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  note: {
    color: theme.text,
    ...text.ui("bodySm"),
    padding: 0,
    // The card is the field — `amount-card.tsx`'s own reason for both lines.
    outlineWidth: 0,
    outlineStyle: "solid",
  },
  // `textMuted`, never `textFaint`: a placeholder is read (`tests/architecture.test.ts`'s faint-ink rule).
  notePlaceholder: { color: theme.textMuted },
  counterparty: { gap: space.x3 },
}));
