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
 * M3/P2, below, the keyboard's route to the same call the visible **Undo** on
 * the provenance line makes), `Tab` walks the resolved chips and — M1 — **leaves the bar**
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
 * **M3 — the walk is announced, not merely outlined.** DOM focus never leaves
 * the text input, so a highlight that is only a border is invisible to a
 * screen reader. The input is the `combobox` (`aria-expanded` once chips
 * exist, `aria-controls` naming the list, `aria-activedescendant` naming the
 * chip Tab has reached) and the three resolved chips are `role="option"`
 * inside one `role="listbox"`, each with an `id` for that pointer to name —
 * the standard shape for a listbox whose focus never moves. RN's own `Role`
 * type has no `"listbox"` entry (only `"option"` is standard) and RN declares
 * no `aria-controls`/`aria-activedescendant`, so those are the values asserted
 * past their types here, named once each with the reason beside them; RNW
 * forwards all three verbatim (`forwardedProps`).
 *
 * **The listbox holds options and nothing else.** `<Amount>`, the payee line
 * and the two captions sit outside it: a listbox containing text nodes that
 * are not options makes the option count a lie, and a reader stepping the
 * list would hear the amount announced as a choice. The partial branch's
 * account chip is not in a listbox at all, so it carries no `role` — an
 * `option` with no list around it is worse than a plain box.
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
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Role, Text, TextInput, type TextInputKeyPressEvent, View } from "react-native";
import { Amount } from "../fx/amount";
import { useLocale, useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import type { FieldErrorMap } from "../primitives/field-errors.ts";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";

/**
 * RN's own `Role` type has no `"listbox"` entry (see the file doc).
 *
 * **L-f — the one deviation from the APG combobox pattern that remains, and
 * it is deliberate.** Up, Down and Tab all move the active option now, so the
 * walk itself is the pattern's; what is not is that **the options cannot be
 * chosen.** In a real combobox `Enter` commits the active option and the
 * value of the field becomes it. Here `Enter` saves the transaction, `Escape`
 * discards the line (or undoes a machine-filled category), and no key, tap or
 * click changes what a chip says — the chips are a *reading* of the typed
 * line, and correcting a field means retyping it (this component's own file
 * doc: no picker, by design, in this arc). `aria-selected` therefore marks
 * the option the walk has reached and never a committed choice, which is why
 * it sits on exactly one option at a time and on none before the walk starts.
 * A reader who arrows to the end learns what the line resolved to, which is
 * the whole purpose of the list; nothing offers to change it.
 */
const LISTBOX_ROLE = "listbox" as Role;

/**
 * The two ARIA attributes RN declares no prop for and RNW forwards anyway
 * (`react-native-web`'s own `forwardedProps` lists both). Spread onto the
 * input rather than written inline so the widening is named once, here, with
 * the reason — and so a native build, where they mean nothing and RN drops
 * unknown props, reads the same source.
 */
type WebComboboxAria = {
  "aria-controls"?: string;
  "aria-activedescendant"?: string;
  /** L-d — the hint under the bar, named by the field it is about rather than left as loose text beside it. */
  "aria-describedby"?: string;
};

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
  const [year, month, day] = date.split("-").map(Number);
  const at =
    year === undefined || month === undefined || day === undefined
      ? new Date(Number.NaN)
      : new Date(Date.UTC(year, month - 1, day));
  // **The bare string is the fallback, never a throw.** `Intl.DateTimeFormat`
  // raises `RangeError` on an invalid `Date`, and this runs in a render body:
  // a chip that cannot say "2 Sep" must still say *something*, and the string
  // it was handed is the only honest thing left to say. The grammar refuses a
  // date-shaped token that names no real day before it ever reaches a chip
  // (`grammar.ts`'s `no_date`), so nothing today takes this branch — which is
  // exactly why it is written down rather than assumed: a render that throws
  // takes the whole bar with it, and the next caller of this component need
  // not carry the grammar's guarantee to be safe.
  if (Number.isNaN(at.getTime())) return date;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(at);
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
  // M3 — `aria-activedescendant` names a chip by id, so the ids have to be
  // unique per rendered bar rather than per file. `useId` is React's own
  // answer to exactly that; the chips derive theirs from it by index, which
  // is the same index `highlight` already holds.
  const bar = useId();
  const listboxId = `${bar}-chips`;
  const hintId = `${bar}-hint`;
  const chipId = (index: number) => `${bar}-chip-${index}`;

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
  /**
   * L-e — machine-filled *and* the name of the field it filled, as one value.
   *
   * The accent border, the `·auto` marker and `common.autoFilledLabel`'s
   * `{{field}}` are three renderings of a single fact, and while they were
   * two independent props (`machineFilled` and an optional `field`) a caller
   * could set the border without the name and the label fell back to
   * repeating the value — *"Food: Food, filled automatically"*, which is what
   * L4 found. Absent means not machine-filled; present carries what the
   * announcement needs, so the two can no longer be set apart.
   */
  const categoryMachineFilled =
    categoryAutoFilled && pickedCategory === undefined
      ? { field: t("transactions.category") }
      : undefined;
  /**
   * M3/P2 — "every machine-filled field states what produced it, in one
   * line, with Undo." The marker glyph is the chip's own half of that (`Chip`
   * primitive's `common.autoFilled`, matched); this caption is the line —
   * `categories.fromHistory`, the same string `quick-add-composer.tsx`'s own
   * trail row prints, naming the payee the proposal actually came from.
   */
  const categoryFromHistory =
    categoryMachineFilled !== undefined && parse?.ok === true
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

  // Esc, Tab and the arrows — the keys `onSubmitEditing` has no opinion about.
  // `ok`/`highlight`/`categoryAutoFilled`/`onUndoCategory` are read from the
  // render closure rather than threaded through a ref: a stale closure here
  // would walk stale chips for one keystroke, never call the wrong handler.
  const handleKeyPress = useCallback(
    (event: TextInputKeyPressEvent) => {
      const key = event.nativeEvent.key;
      /**
       * L-f — Up and Down move the active option, which is the combobox
       * pattern's own answer for a list whose focus never leaves the input.
       *
       * **They wrap; Tab does not.** That is the division of labour, not an
       * inconsistency: the arrows belong to the list — APG's own listbox
       * navigation cycles, and a reader stepping three chips to see what the
       * line resolved to should not fall out of the field for pressing Down
       * once too often. Tab belongs to the page, and a Tab that refused to
       * leave would be the keyboard trap M1 removed. So the arrows always
       * cycle and Tab always eventually leaves.
       *
       * Only while a line resolves (`ok`): with no chips there is nothing to
       * walk, and the caret keys have to stay the caret keys. `preventDefault`
       * is what stops Down from also moving the cursor in the text.
       */
      if ((key === "ArrowDown" || key === "ArrowUp") && ok) {
        event.preventDefault();
        const step = key === "ArrowDown" ? 1 : -1;
        // Down from nothing lands on the first chip, Up from nothing on the
        // last — the two ends a reader means by "start walking".
        const from = highlight ?? (step === 1 ? -1 : 0);
        setHighlight((from + step + CHIP_COUNT) % CHIP_COUNT);
        return;
      }
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

  const combobox: WebComboboxAria = {
    // L-d — always: the hint is about the field whether or not a line has
    // resolved, and it is the one rule a reader needs *before* typing.
    "aria-describedby": hintId,
    ...(ok ? { "aria-controls": listboxId } : {}),
    ...(ok && highlight !== null ? { "aria-activedescendant": chipId(highlight) } : {}),
  };

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
        // M3 — the input is the combobox; the chips are the list it controls.
        // `aria-expanded` is false until a line resolves, because until then
        // there is no list to expand into.
        role="combobox"
        aria-expanded={ok}
        {...combobox}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {/* L3 — the grammar's one non-obvious rule, said before it costs anyone
          a figure. L-d — `id`, because the input names it through
          `aria-describedby`: a caption sitting under a field is a caption a
          screen reader never reaches, and this one has to be heard *before*
          the figure is already wrong. */}
      <Text id={hintId} style={styles.hint}>
        {t("transactions.commandBarHint")}
      </Text>
      {parse === null ? null : (
        <View style={styles.preview}>
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
                <Text style={styles.payee}>
                  {t("transactions.payee")}: {parse.payee === "" ? "—" : parse.payee}
                </Text>
              </View>
              {amountScaleCaption === undefined ? null : (
                <Text style={styles.reason}>{amountScaleCaption}</Text>
              )}
              {/* M3 — options and nothing else. */}
              <View
                style={styles.row}
                role={LISTBOX_ROLE}
                id={listboxId}
                aria-label={t("transactions.commandBarChipsLabel")}
              >
                <PreviewChip
                  id={chipId(0)}
                  option
                  label={selectedAccount?.name ?? "?"}
                  highlighted={highlight === 0}
                />
                <PreviewChip
                  id={chipId(1)}
                  option
                  label={formatDate(parse.date, today, locale, t)}
                  highlighted={highlight === 1}
                />
                <PreviewChip
                  id={chipId(CATEGORY_CHIP_INDEX)}
                  option
                  label={categoryLabel ?? t("transactions.commandBarCategoryPrompt")}
                  muted={categoryLabel === undefined}
                  // L4/L-e — machine-filled carries the field's own name, not
                  // the value repeated twice. `common.autoFilledLabel` is
                  // "{{field}}: {{value}}, filled automatically"; "Food: Food,
                  // filled automatically" named nothing a reader could act on,
                  // and the shape now makes the pair inseparable. Spread
                  // rather than passed as `undefined` — `exactOptionalPropertyTypes`,
                  // the same idiom `id` above takes.
                  {...(categoryMachineFilled === undefined
                    ? {}
                    : { machineFilled: categoryMachineFilled })}
                  highlighted={highlight === CATEGORY_CHIP_INDEX}
                />
              </View>
              {categoryFromHistory === undefined ? null : (
                <View style={styles.row}>
                  <Text style={styles.trailCaption}>{categoryFromHistory}</Text>
                  {/* L5 — §8's P2 asks for Undo, and Esc on a chip nobody
                      can see is not one. The control is the Undo; Esc on the
                      highlighted chip is the keyboard's way to the same call. */}
                  {onUndoCategory === undefined ? null : (
                    <Button
                      label={t("states.undo")}
                      onPress={onUndoCategory}
                      variant="ghost"
                      size="sm"
                    />
                  )}
                </View>
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
  | "transactions.commandBarNoDate"
  | "transactions.commandBarCurrencyMismatch"
  | "transactions.commandBarTooMuchUnmatched" {
  switch (reason) {
    case "no_amount":
      return "transactions.commandBarNoAmount";
    case "no_account":
      return "transactions.commandBarNoAccount";
    case "no_date":
      return "transactions.commandBarNoDate";
    case "currency_mismatch":
      return "transactions.commandBarCurrencyMismatch";
    case "too_much_unmatched":
      return "transactions.commandBarTooMuchUnmatched";
  }
}

type PreviewChipProps = {
  label: string;
  /**
   * M3 — `role="option"` and `aria-selected`, set only by a caller that puts
   * this chip inside the `listbox`. The partial branch's account chip stands
   * alone, and an `option` with no list around it announces a choice that
   * does not exist.
   */
  option?: boolean;
  /** The chip's own DOM id — what the input's `aria-activedescendant` names. Only meaningful with `option`. */
  id?: string;
  muted?: boolean;
  /**
   * L-e — set exactly when this chip's value was filled by the machine, and
   * carrying the name of the field it filled (`common.autoFilledLabel`'s
   * `{{field}}`). One prop rather than a `machineFilled` boolean beside an
   * optional `field`, because the border, the marker and the announcement are
   * one fact: a `field` that could be omitted was omitted, and the label fell
   * back to repeating the value.
   */
  machineFilled?: { field: string };
  highlighted?: boolean;
};

/**
 * A read-only preview, not `<Chip>` — nothing here opens a picker (this
 * component's own file doc), so the interactive semantics `<Chip>` carries
 * (radio role, a picker to open) would be a false affordance. `highlighted`
 * is the visual half of Tab's walk; it never moves DOM focus, which stays on
 * the text input throughout — `role="option"`, `aria-selected` and the `id`
 * the input's `aria-activedescendant` names (M1/M3) are what let a screen
 * reader hear the walk despite that, the same way a roving-tabindex listbox
 * announces a selection with no focus move of its own.
 */
function PreviewChip({
  label,
  option = false,
  id,
  muted = false,
  machineFilled,
  highlighted = false,
}: PreviewChipProps) {
  const t = useT();
  const styles = useStyles();
  return (
    <View
      // L-f — `aria-selected` marks the option the walk has reached, and
      // nothing else. Writing `aria-selected="false"` onto the other two
      // would announce a selection state for chips this list can never select
      // (`LISTBOX_ROLE`'s own note: the options are not choosable), so an
      // unwalked option carries the attribute not at all — the shape APG's own
      // combobox examples take, where exactly one option is marked and only
      // once a walk has begun.
      {...(option ? { role: "option" as Role } : {})}
      {...(option && highlighted ? { "aria-selected": true } : {})}
      {...(id === undefined ? {} : { id })}
      accessibilityLabel={
        machineFilled
          ? t("common.autoFilledLabel", { field: machineFilled.field, value: label })
          : label
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
        {machineFilled === undefined ? null : (
          <Text style={styles.chipMarker}>{t("common.autoFilled")}</Text>
        )}
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
  hint: { color: theme.textMuted, ...text.ui("caption"), paddingHorizontal: space.x3 },
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
