/**
 * `<CommandBar>` — `screens/S05-quick-add.md` §3's "Web — ≥1024px": `DeskBand`'s
 * command-bar slot, one line that resolves into chips as it is typed.
 *
 * **Fully controlled**, the same contract `QuickAddComposer` keeps: `value` /
 * `onChangeText` in, a `parse` already computed by the caller (`useCommandBar`,
 * `packages/client`) in — this component owns no draft state of its own beyond
 * which chip Tab has walked to. `parse` arriving as a prop rather than this
 * component calling `parseCapture` itself is what keeps D1's grammar, D2's
 * context (accounts, categories, today, a default account) and this render
 * cleanly separated — the same split `create-phone-ledger.ts`'s own doc draws
 * between "a rule" and "a rendering".
 *
 * **No model path, no picker.** A line D1 cannot resolve renders its reason and
 * nothing else (`screens/S05-quick-add.md` §3) — this component never offers
 * *interpret with model*, and none of the chips below open a sheet: correcting
 * a resolved field means retyping the line, not tapping a chip. Both are
 * deliberately out of this arc's scope.
 *
 * **The keyboard contract is the whole interaction** (`screens/S05-quick-add.md`
 * §7 Web): `Enter` saves, `Esc` discards (or undoes a highlighted D2 pick —
 * M3/P2, below), `Tab` walks the resolved chips and — M1 — **leaves the bar**
 * once the last one is reached, exactly like leaving any other field; `Shift
 * +Tab` walks back the same way, and leaving from chip zero (or with nothing
 * highlighted) is the ordinary backward tab out. Trapping focus inside a
 * resolved line would be a WCAG 2.1.2 violation dressed as a feature.
 * `TextInput` hardcodes its own DOM `keydown` listener (`react-native-web`'s
 * own `TextInput`, which sets `supportedProps.onKeyDown` itself and would
 * silently drop one passed in as a prop) — `onSubmitEditing` is Enter's own
 * cross-platform event, and `onKeyPress` is where Esc and Tab surface.
 * `TextInputKeyPressEventData` only promises `.key`, but RNW hands
 * `onKeyPress` the *real* browser `KeyboardEvent` as `.nativeEvent`
 * (`react-native-web`'s own `TextInput`, `handleKeyDown` passing `e` straight
 * through) — `.shiftKey` is genuinely there, and `ShiftableKeyPress` below
 * reads it by *widening* rather than casting: RN's `{ key: string }` is
 * assignable to a shape that adds one optional field, so nothing is asserted
 * away and no `unknown` is spent to get at a fact the runtime does carry.
 *
 * **The resolved chips are `role="option"` in a `role="listbox"`**, `aria
 * -selected` tracking the Tab-walked one — RN's own `Role` type has no
 * `"listbox"` entry (only `"option"` is standard), so the container's role is
 * the one thing here asserted past its type, on the value rather than the
 * event.
 *
 * **`blurOnSubmit={false}`** — `TextInput`'s own default blurs on Enter
 * (`shouldBlurOnSubmit`, true for any single-line field), which would drop
 * focus the moment a line saves. A command bar exists to keep taking the next
 * line without a click back into it.
 *
 * `N`'s own "focus the bar from anywhere" is a platform read (a global
 * listener) and lives in `apps/mobile/src/platform.ts`, not here — this
 * component only exposes `focus()` through its ref for that caller to reach.
 */

import type { CaptureParse } from "@waltning/core/capture/grammar";
import type { CategoryProposal } from "@waltning/core/capture/payee-memory";
import type { CurrencyCode } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Role, Text, TextInput, type TextInputKeyPressEvent, View } from "react-native";
import { Amount } from "../fx/amount";
import { useLocale, useT } from "../i18n/provider";
import type { FieldErrorMap } from "../primitives/field-errors.ts";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";

/** RN's own `Role` type has no `"listbox"` entry (see the file doc). */
const LISTBOX_ROLE = "listbox" as Role;

/**
 * M1 — what `onKeyPress` actually hands over on web: RN's own
 * `TextInputKeyPressEventData` (`{ key: string }`) plus the `shiftKey` the
 * real browser `KeyboardEvent` carries and RNW passes straight through. The
 * field is optional because a native keyboard event has none, and the whole
 * shape is a *supertype* of RN's — the widening is an assignment, not a cast.
 */
type ShiftableKeyPress = { readonly key: string; readonly shiftKey?: boolean };

export type CommandBarAccount = {
  id: string;
  name: string;
  currency: CurrencyCode;
  decimals: number;
};
/** Already scoped to the draft's own type (expense — `use-command-bar.ts`'s own fixed choice) by the caller, so this component never filters by `kind`. */
export type CommandBarCategory = { id: string; name: string };

export type CommandBarProps = {
  /** The line as typed — `TextInput`'s own controlled value. */
  value: string;
  onChangeText: (value: string) => void;
  accounts: readonly CommandBarAccount[];
  categories: readonly CommandBarCategory[];
  /** `AccountingDate` — today's own chip value, matching `QuickAddComposer`'s `today`. */
  today: string;
  /** `useCommandBar`'s own read — `null` on an empty bar. */
  parse: CaptureParse | null;
  /** D2's own proposal — shown machine-filled at or above the display threshold, low-confidence otherwise. */
  categoryProposal?: CategoryProposal;
  categoryAutoFilled?: boolean;
  /** M3/P2 — Esc while the category chip is highlighted calls this instead of `onDiscard`. Optional: a caller with nothing to undo (no proposal ever applies) still renders. */
  onUndoCategory?: () => void;
  /** `create_transaction`'s own refusal, already resolved to plain text by the screen that owns both `packages/client` and `useT()` (`primitives/field-errors.ts`'s own doc). */
  fieldErrors?: FieldErrorMap;
  onSubmit: () => void;
  onDiscard: () => void;
};

export type CommandBarHandle = { focus: () => void };

const CHIP_COUNT = 3; // account, date, category — the three resolved chips Tab ever walks.
const CATEGORY_CHIP_INDEX = 2;

/**
 * The date chip's own label — "Today", or a day and a month said the way the
 * reader's language says it ("2 Sep", "2 wrz").
 *
 * **L4 — never the bare `YYYY-MM-DD`.** S05 §3's own sketch shows a short
 * date, and the chips are a *reading* of the typed line: a line that said
 * "yesterday" resolving to `2026-09-02` makes the reader do the arithmetic
 * back. `Intl.DateTimeFormat` for the same reason `locales.ts`'s own
 * `monthLabel` gives — a month name has no fixed separator to lose, unlike a
 * money figure — and `timeZone: "UTC"` because an accounting date is a bare
 * string with no zone in it, so anything else can shift it by a day.
 */
function formatDate(date: string, today: string, locale: string, t: ReturnType<typeof useT>) {
  if (date === today) return t("shell.today");
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export const CommandBar = forwardRef<CommandBarHandle, CommandBarProps>(function CommandBar(
  {
    value,
    onChangeText,
    accounts,
    categories,
    today,
    parse,
    categoryProposal,
    categoryAutoFilled = false,
    onUndoCategory,
    fieldErrors,
    onSubmit,
    onDiscard,
  },
  ref,
) {
  const t = useT();
  const locale = useLocale();
  const styles = useStyles();
  const inputRef = useRef<TextInput>(null);
  const [highlight, setHighlight] = useState<number | null>(null);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  // A fresh keystroke retires the previous walk — the chips it named may not
  // even be the same fields once the line changes underneath it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `value` is the trigger; the effect reads no value from it.
  useEffect(() => {
    setHighlight(null);
  }, [value]);

  const ok = parse?.ok === true;
  const selectedAccount = ok
    ? accounts.find((account) => account.id === parse.accountId)
    : undefined;
  const pickedCategory = ok
    ? categories.find((category) => category.id === parse.categoryId)
    : undefined;
  const proposedCategory =
    ok && pickedCategory === undefined && categoryProposal
      ? categories.find((category) => category.id === categoryProposal.categoryId)
      : undefined;
  // A below-threshold proposal (`categoryProposal` present, `categoryAutoFilled`
  // false) is a suggestion this compact bar does not surface at all — the
  // chip asks (`commandBarCategoryPrompt`) exactly as if D2 had said nothing,
  // the same "suggestion, not a value" line `quick-add-screen.tsx` draws at
  // `PROPOSAL_DISPLAY_THRESHOLD`.
  const categoryLabel =
    pickedCategory?.name ?? (categoryAutoFilled ? proposedCategory?.name : undefined);
  const categoryMachineFilled = categoryAutoFilled && pickedCategory === undefined;
  /**
   * M3/P2 — "every machine-filled field states what produced it, in one
   * line, with Undo." The marker glyph is the chip's own half of that (`Chip`
   * primitive's `common.autoFilled`, matched); this caption is the line —
   * `categories.fromHistory`, the same string `quick-add-composer.tsx`'s own
   * trail row prints, naming the payee the proposal actually came from.
   */
  const categoryFromHistory =
    categoryMachineFilled && parse?.ok === true
      ? t("categories.fromHistory", { payee: parse.payee })
      : undefined;

  /**
   * L1 — the figure past its own account's scale. `<Amount decimals={2}>`
   * rounds half-up for *display* (`money.ts`'s own `toFixed`) regardless of
   * what was actually typed — `48.905` renders `48,91`, a number nobody
   * typed and Enter would refuse (`transactions.tooManyDecimals`). Naming the
   * refusal here, before Enter, is what keeps the rounded preview from
   * reading as the figure that would save.
   */
  const amountScaleCaption =
    ok &&
    selectedAccount !== undefined &&
    money.dec(parse.amount).decimalPlaces() > selectedAccount.decimals
      ? t("transactions.tooManyDecimals", {
          currency: selectedAccount.currency,
          decimals: String(selectedAccount.decimals),
        })
      : undefined;

  const partial = !ok && parse && !parse.ok ? parse.partial : undefined;
  const partialAccount =
    partial?.accountId === undefined
      ? undefined
      : accounts.find((account) => account.id === partial.accountId);

  const reasonText = !ok && parse && !parse.ok ? t(reasonKey(parse.reason)) : undefined;

  const fieldErrorLines = useMemo(() => {
    if (!fieldErrors) return [];
    const byField = Object.keys(fieldErrors.byField).flatMap(
      (path) => fieldErrors.byField[path] ?? [],
    );
    return [...fieldErrors.formLevel, ...byField];
  }, [fieldErrors]);

  // Enter — `TextInput`'s own cross-platform "return key pressed" event, not
  // read through `onKeyPress` (the file doc explains why: `onKeyDown` is
  // hardcoded inside `react-native-web`'s `TextInput`, and `onSubmitEditing`
  // is the one event RN promises fires for it instead).
  const handleSubmitEditing = useCallback(() => onSubmit(), [onSubmit]);

  // Esc and Tab — the two keys `onSubmitEditing` has no opinion about.
  // `ok`/`highlight`/`categoryAutoFilled`/`onUndoCategory` are read from the
  // render closure rather than threaded through a ref: a stale closure here
  // would walk stale chips for one keystroke, never call the wrong handler.
  const handleKeyPress = useCallback(
    (event: TextInputKeyPressEvent) => {
      const key = event.nativeEvent.key;
      if (key === "Escape") {
        // M3/P2 — Esc on the highlighted category chip undoes the applied
        // proposal rather than discarding the whole typed line; every other
        // position (or nothing highlighted) discards, as before.
        if (highlight === CATEGORY_CHIP_INDEX && categoryAutoFilled && onUndoCategory) {
          event.preventDefault();
          onUndoCategory();
          return;
        }
        event.preventDefault();
        onDiscard();
        return;
      }
      if (key === "Tab" && ok) {
        // M1 — `TextInputKeyPressEventData` promises only `.key`; the raw
        // browser event RNW hands `onKeyPress` (the file doc) carries
        // `.shiftKey` too. Widened by *assignment*, never a cast: `{ key:
        // string }` is assignable to a shape that adds one optional field, so
        // the extra fact is read without discarding the type RN did give.
        const nativeEvent: ShiftableKeyPress = event.nativeEvent;
        if (nativeEvent.shiftKey === true) {
          if (highlight === null || highlight === 0) return; // leave backward — nothing to walk to.
          event.preventDefault();
          setHighlight(highlight - 1);
          return;
        }
        if (highlight === null) {
          event.preventDefault();
          setHighlight(0);
          return;
        }
        if (highlight < CHIP_COUNT - 1) {
          event.preventDefault();
          setHighlight(highlight + 1);
          return;
        }
        // Already on the last chip — leave the bar forward, browser default.
      }
    },
    [ok, highlight, categoryAutoFilled, onUndoCategory, onDiscard],
  );

  return (
    <View style={styles.root}>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={handleSubmitEditing}
        onKeyPress={handleKeyPress}
        blurOnSubmit={false}
        placeholder={t("transactions.commandBarPlaceholder")}
        accessibilityLabel={t("transactions.commandBarLabel")}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {parse === null ? null : (
        <View style={styles.preview} {...(ok ? { role: LISTBOX_ROLE } : {})}>
          {ok ? (
            <>
              <View style={styles.row}>
                <Amount
                  value={parse.amount}
                  currency={selectedAccount?.currency ?? ""}
                  decimals={selectedAccount?.decimals ?? 2}
                  size="body"
                  kind="spend"
                />
                <PreviewChip label={selectedAccount?.name ?? "?"} highlighted={highlight === 0} />
                <PreviewChip
                  label={formatDate(parse.date, today, locale, t)}
                  highlighted={highlight === 1}
                />
              </View>
              {amountScaleCaption === undefined ? null : (
                <Text style={styles.reason}>{amountScaleCaption}</Text>
              )}
              <View style={styles.row}>
                <Text style={styles.payee}>
                  {t("transactions.payee")}: {parse.payee === "" ? "—" : parse.payee}
                </Text>
                <PreviewChip
                  label={categoryLabel ?? t("transactions.commandBarCategoryPrompt")}
                  muted={categoryLabel === undefined}
                  machineFilled={categoryMachineFilled}
                  highlighted={highlight === 2}
                />
              </View>
              {categoryFromHistory === undefined ? null : (
                <Text style={styles.trailCaption}>{categoryFromHistory}</Text>
              )}
            </>
          ) : (
            <>
              {partial?.amount === undefined && partialAccount === undefined ? null : (
                <View style={styles.row}>
                  {partial?.amount === undefined ? null : (
                    <Amount
                      value={partial.amount}
                      currency={partialAccount?.currency ?? ""}
                      decimals={partialAccount?.decimals ?? 2}
                      size="body"
                      kind="spend"
                    />
                  )}
                  {partialAccount === undefined ? null : (
                    <PreviewChip label={partialAccount.name} />
                  )}
                </View>
              )}
              {reasonText === undefined ? null : <Text style={styles.reason}>{reasonText}</Text>}
            </>
          )}
        </View>
      )}
      {fieldErrorLines.length === 0
        ? null
        : fieldErrorLines.map((line, index) => (
            // L3 — indexed, not keyed on the message text: two refusals can
            // share the identical template (`tooManyDecimals` against
            // `amountOriginal` and `fee` on the same account, say), and a
            // duplicate `key` silently drops the second `<Text>` in React's
            // reconciliation rather than rendering both.
            // biome-ignore lint/suspicious/noArrayIndexKey: the list has no other stable identity — see above.
            <Text key={`${index}-${line}`} style={styles.fieldError}>
              {line}
            </Text>
          ))}
    </View>
  );
});

/**
 * D1's own reason (`grammar.ts`'s `CaptureParse`) onto its catalogue key —
 * a `switch`, not a `Record`, because a lookup table's value type widens to
 * `string` the moment more than one literal is in it, and `useT()`'s `t` is
 * typed against the catalogue's exact keys (`i18n/provider.tsx`).
 */
function reasonKey(
  reason: Exclude<CaptureParse, { ok: true }>["reason"],
):
  | "transactions.commandBarNoAmount"
  | "transactions.commandBarNoAccount"
  | "transactions.commandBarCurrencyMismatch"
  | "transactions.commandBarTooMuchUnmatched" {
  switch (reason) {
    case "no_amount":
      return "transactions.commandBarNoAmount";
    case "no_account":
      return "transactions.commandBarNoAccount";
    case "currency_mismatch":
      return "transactions.commandBarCurrencyMismatch";
    case "too_much_unmatched":
      return "transactions.commandBarTooMuchUnmatched";
  }
}

type PreviewChipProps = {
  label: string;
  muted?: boolean;
  machineFilled?: boolean;
  highlighted?: boolean;
};

/**
 * A read-only preview, not `<Chip>` — nothing here opens a picker (this
 * component's own file doc), so the interactive semantics `<Chip>` carries
 * (radio role, a picker to open) would be a false affordance. `highlighted`
 * is the visual half of Tab's walk; it never moves DOM focus, which stays on
 * the text input throughout — `role="option"` and `aria-selected` (M1) are
 * what let a screen reader hear the walk despite that, the same way a
 * roving-tabindex listbox announces a selection with no focus move of its
 * own.
 */
function PreviewChip({
  label,
  muted = false,
  machineFilled = false,
  highlighted = false,
}: PreviewChipProps) {
  const t = useT();
  const styles = useStyles();
  return (
    <View
      role="option"
      aria-selected={highlighted}
      accessibilityLabel={
        machineFilled ? t("common.autoFilledLabel", { field: label, value: label }) : label
      }
      style={[
        styles.chip,
        machineFilled ? styles.chipMachine : null,
        highlighted ? styles.chipHighlighted : null,
      ]}
    >
      <Text style={[styles.chipText, muted ? styles.chipTextMuted : null]}>
        {label}
        {/* Text, not tint alone (P5) — `Chip`'s own marker, matched. */}
        {machineFilled ? <Text style={styles.chipMarker}>{t("common.autoFilled")}</Text> : null}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.xs },
  input: {
    minHeight: touchTarget.min,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: theme.borderInteractive,
    backgroundColor: theme.surface,
    paddingHorizontal: space.x3,
    color: theme.text,
    ...text.ui("body"),
  },
  preview: { gap: space.xs, paddingHorizontal: space.x3 },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },
  payee: { color: theme.textMuted, ...text.ui("bodySm") },
  trailCaption: { color: theme.textMuted, ...text.ui("caption") },
  reason: { color: theme.textMuted, ...text.ui("bodySm") },
  fieldError: { color: theme.dangerText, ...text.ui("caption"), paddingHorizontal: space.x3 },
  chip: {
    minHeight: touchTarget.min - space.md,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: theme.borderInteractive,
    backgroundColor: theme.subtleFill,
  },
  chipMachine: { borderColor: theme.accentFillBorder },
  chipHighlighted: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  chipText: { color: theme.text, ...text.ui("bodySm", 600) },
  chipTextMuted: { color: theme.textMuted },
  chipMarker: { color: theme.accentText, ...text.ui("caption") },
}));
