/**
 * `<AccountPicker>` — the owner's own words: *"the list of accounts in
 * AddForm will be like 20 items long. we need to make sure it looks good…
 * we need to use a grid there."* One sheet, over `BottomSheet`, used
 * everywhere an account is chosen — `screens/S05` §4 (the account chip), `S16`
 * §3 (how accounts group), and `CategorySheet` (`categories/`) for the
 * anatomy: grabber, `SearchField`, grouped grid, pinned footer.
 *
 * **Grouped, then by kind (S16 §3).** Accounts sit under their account-group
 * header, in `groups`' own order; an account with no group renders last,
 * under *Other*. Within a group, `ACCOUNT_KIND`'s own order breaks ties —
 * the same list `create-account-form.tsx`'s kind picker enumerates — so a
 * caller that already sorted its own accounts is not fighting a second sort.
 *
 * **Last-used first, machine-filled (S05 §9.2).** When the caller passes
 * `lastUsedId` — a hit within `LAST_USED_WINDOW_MS` — that account's tile
 * repeats at the top, in its own *Recent* row, in `Chip`'s own machine tint:
 * the same "asserted, not chosen" signal a machine-filled chip carries
 * everywhere else (P2). It still appears once more in its own group below;
 * `CategorySheet`'s proposal row keeps the same duplication for the same
 * reason — a shortcut is not a removal.
 *
 * **An uncapturable account is never hidden (S05).** No exchange rate held
 * for its currency is a fact about *now*, not about the account, so the tile
 * stays tappable — muted, with a *Needs a rate* `Tag` rather than behind a
 * `disabled` state nobody can ask about. A tag, not the whole sentence: a
 * tile is a name, a currency and a balance, and `needsRate`'s full sentence
 * repeated in every uncapturable cell was longer than everything it sat
 * under. The sentence, and the way out of it, belong to the one place a
 * person is stopped — the composer's own banner (S05 §6).
 *
 * **Composed by the screen, never by a sibling domain.** The same rule
 * `CategorySheet`'s own doc states: `transactions/` and `counterparties/` do
 * not render this — they open it through a callback the screen owns, so
 * `accounts/` never has to import a sibling and a sibling never has to import
 * `accounts/` (`architecture/11`, enforced in `tests/module-boundaries.test.ts`).
 *
 * **Picking commits — there is no `Use` button.** A single tap both selects
 * and answers, the same contract every account chip already opened before
 * this sheet existed; the footer holds only the one action nothing else here
 * can do, *Create account…* (J02 §4).
 */

import { fold } from "@waltning/core/capture/names";
import type { Money } from "@waltning/core/money";
import { ACCOUNT_KIND, type AccountKind } from "@waltning/core/registry/inputs";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Amount } from "../fx/amount";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { useInteraction } from "../primitives/interaction.ts";
import { usePressScale } from "../primitives/press-scale.ts";
import { SearchField } from "../primitives/search-field";
import { Tag } from "../primitives/tag";
import { BottomSheet } from "../shell/bottom-sheet";
import { EmptyState } from "../states/empty-state";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";

/** `SearchField` only earns its place past this many accounts. */
const SEARCH_THRESHOLD = 8;

const KIND_ORDER = new Map<AccountKind, number>(ACCOUNT_KIND.map((kind, index) => [kind, index]));

/**
 * One account this picker can offer — structural, matching `PhoneAccount`
 * (`packages/client`) rather than importing it: `packages/ui` depends on
 * `@waltning/core` alone (`architecture/11`).
 */
export type AccountPickerAccount = {
  id: string;
  name: string;
  currency: string;
  /** Fraction digits for `<Amount>` — 2 for most, 0 for JPY. */
  decimals?: number;
  kind: AccountKind;
  /** Whether an expense against this account can be valued (S05) — shown either way. */
  capturable: boolean;
  ownership: "own" | "shared";
  groupId: string | null;
  /** Never offered — the caller filters, and this is the defensive twin. */
  archived?: boolean;
  /** Present only when the caller already knows it (Quick add's own snapshot) — not every caller has one. */
  balance?: Money;
};

/** One account-group header, in the order groups should render. */
export type AccountPickerGroup = { id: string; name: string };

export type AccountPickerProps = {
  visible: boolean;
  accounts: readonly AccountPickerAccount[];
  groups: readonly AccountPickerGroup[];
  /** The current pick, or `null` before one is made. */
  accountId: string | null;
  /** A hit within the last-used window (S05 §9.2) — absent when nothing qualifies. */
  lastUsedId?: string;
  /** Epoch ms — the *Recent* tile's own "from your last capture" caption. Required alongside `lastUsedId`. */
  lastUsedAt?: number;
  onPick: (accountId: string) => void;
  onCreateAccount: () => void;
  onDismiss: () => void;
};

function byGroupThenKind(
  a: AccountPickerAccount,
  b: AccountPickerAccount,
  order: readonly string[],
): number {
  const ai = order.indexOf(a.id);
  const bi = order.indexOf(b.id);
  if (ai !== bi) return ai - bi;
  return (
    (KIND_ORDER.get(a.kind) ?? ACCOUNT_KIND.length) -
    (KIND_ORDER.get(b.kind) ?? ACCOUNT_KIND.length)
  );
}

/** `HH:mm`, the device's own locale — `quick-add-composer.tsx`'s own `formatClockTime`, matched rather than shared. */
function formatClockTime(at: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(
    new Date(at),
  );
}

type AccountSection = {
  key: string;
  name: string | undefined;
  accounts: readonly AccountPickerAccount[];
};

export function AccountPicker({
  visible,
  accounts,
  groups,
  accountId,
  lastUsedId,
  lastUsedAt,
  onPick,
  onCreateAccount,
  onDismiss,
}: AccountPickerProps) {
  const t = useT();
  const styles = useStyles();
  const [query, setQuery] = useState("");

  const live = useMemo(() => accounts.filter((account) => account.archived !== true), [accounts]);
  const searching = query.trim() !== "";

  const matches = useMemo(() => {
    if (!searching) return live;
    const needle = fold(query);
    return live.filter((account) => fold(account.name).includes(needle));
  }, [live, query, searching]);

  const sections = useMemo<readonly AccountSection[]>(() => {
    if (searching) return [{ key: "search", name: undefined, accounts: matches }];
    const order = groups.map((group) => group.id);
    const sections: AccountSection[] = groups.map((group) => ({
      key: group.id,
      name: group.name,
      accounts: matches
        .filter((account) => account.groupId === group.id)
        .sort((a, b) => byGroupThenKind(a, b, order)),
    }));
    const ungrouped = matches
      .filter((account) => account.groupId === null || !order.includes(account.groupId))
      .sort((a, b) => byGroupThenKind(a, b, order));
    if (ungrouped.length > 0) {
      sections.push({ key: "other", name: t("accounts.otherGroup"), accounts: ungrouped });
    }
    return sections.filter((section) => section.accounts.length > 0);
  }, [groups, matches, searching, t]);

  const recent =
    !searching && lastUsedId !== undefined
      ? live.find((account) => account.id === lastUsedId)
      : undefined;

  const handleDismiss = useCallback(() => {
    setQuery("");
    onDismiss();
  }, [onDismiss]);

  const handlePick = useCallback(
    (id: string) => {
      onPick(id);
    },
    [onPick],
  );

  const hasAny = matches.length > 0;

  return (
    <BottomSheet visible={visible} title={t("transactions.account")} onDismiss={handleDismiss}>
      <View style={styles.grabber} />
      {live.length > SEARCH_THRESHOLD ? (
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder={t("accounts.search", { count: live.length })}
        />
      ) : null}
      <ScrollView style={styles.scroll}>
        {recent === undefined ? null : (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t("accounts.recent")}</Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={t("accounts.recent")}
              style={styles.grid}
            >
              <AccountTile
                account={recent}
                selected={recent.id === accountId}
                machineFilled
                {...(lastUsedAt === undefined
                  ? {}
                  : {
                      caption: t("transactions.lastCapture", { time: formatClockTime(lastUsedAt) }),
                    })}
                onPick={handlePick}
              />
            </View>
          </View>
        )}
        {hasAny ? (
          sections.map((section) => (
            <View key={section.key} style={styles.section}>
              {section.name === undefined ? null : (
                <Text style={styles.sectionLabel}>{section.name}</Text>
              )}
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel={section.name ?? t("transactions.account")}
                style={styles.grid}
              >
                {section.accounts.map((account) => (
                  <AccountTile
                    key={account.id}
                    account={account}
                    selected={account.id === accountId}
                    machineFilled={false}
                    onPick={handlePick}
                  />
                ))}
              </View>
            </View>
          ))
        ) : (
          <EmptyState
            variant="filtered"
            title={t("accounts.noMatchTitle")}
            body={t("accounts.noMatchBody", { query: query.trim() })}
            primaryAction={{ label: t("accounts.create"), onPress: onCreateAccount }}
          />
        )}
      </ScrollView>
      <View style={styles.footer}>
        <Button label={t("accounts.create")} onPress={onCreateAccount} variant="secondary" />
      </View>
    </BottomSheet>
  );
}

type AccountTileProps = {
  account: AccountPickerAccount;
  selected: boolean;
  machineFilled: boolean;
  caption?: string;
  onPick: (id: string) => void;
};

/** One cell of the two-column grid — `role="radio"` inside its section's `radiogroup`. */
function AccountTile({ account, selected, machineFilled, caption, onPick }: AccountTileProps) {
  const t = useT();
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const press = usePressScale();
  const handlePress = useCallback(() => onPick(account.id), [account.id, onPick]);
  const needsRate = !account.capturable;

  return (
    <Animated.View style={[press.style, styles.cellWrap]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel={account.name}
        accessibilityState={{ checked: selected }}
        aria-checked={selected}
        onPress={handlePress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        {...handlers}
        style={[
          styles.cell,
          selected ? styles.cellSelected : null,
          machineFilled ? styles.cellMachine : null,
          hovered && !selected ? styles.cellHovered : null,
          focused ? styles.focused : null,
        ]}
      >
        <Text
          style={[
            styles.cellName,
            selected ? styles.cellNameSelected : null,
            account.capturable ? null : styles.cellNameMuted,
          ]}
          numberOfLines={1}
        >
          {account.name}
        </Text>
        <View style={styles.cellMeta}>
          <Text style={styles.cellCurrency}>{account.currency}</Text>
          {account.balance === undefined ? null : (
            <Amount
              value={account.balance}
              currency={account.currency}
              {...(account.decimals === undefined ? {} : { decimals: account.decimals })}
              size="small"
            />
          )}
        </View>
        {account.ownership === "shared" ? (
          <Tag variant="neutral">{t("accounts.shared")}</Tag>
        ) : null}
        {caption === undefined ? null : <Text style={styles.hint}>{caption}</Text>}
        {needsRate ? <Tag variant="neutral">{t("transactions.needsRateTag")}</Tag> : null}
        {selected ? <View style={styles.check} /> : null}
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((theme) => ({
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: theme.borderInteractive,
  },
  scroll: { maxHeight: touchTarget.min * 9 },
  section: { gap: space.md },
  sectionLabel: {
    color: theme.textMuted,
    ...text.ui("kicker"),
    textTransform: "uppercase",
  },
  // Two columns (the owner's own request: "we need to use a grid there") —
  // `gap` on the wrapping row does the column gutter, the same construction
  // `CategorySheet`'s own leaf grid uses.
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  cellWrap: { width: "48%" },
  cell: {
    minHeight: touchTarget.min,
    gap: space.xs,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.sm,
    // `theme.surface` — the fill the money inks (`spend`/`income`) are tuned
    // against (`02-tokens.md` §2.1). `subtleFill` cost the negative-balance
    // pair its 4.5:1 margin; `axe`'s own `color-contrast` check caught it.
    backgroundColor: theme.surface,
    paddingHorizontal: space.x2,
    paddingVertical: space.lg,
  },
  cellHovered: { backgroundColor: theme.hoverFill },
  cellSelected: { borderWidth: 2, borderColor: theme.accent },
  /** The *Recent* tile — `Chip`'s own machine tint (P2, "asserted, not chosen"). */
  cellMachine: { borderColor: theme.assertedBorder, backgroundColor: theme.assertedFill },
  cellName: { color: theme.text, ...text.ui("body") },
  cellNameSelected: { color: theme.accentText, ...text.ui("body", 600) },
  /**
   * An uncapturable tile's name — text, not tint (`account-register.tsx`'s
   * own lesson: a whole-tile `opacity` fade failed `axe`'s `color-contrast`
   * on both themes). `needsRate` below carries the reason in words.
   */
  cellNameMuted: { color: theme.textMuted },
  cellMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  // `bodySm` (14.5px), not `caption` (12px) — `theme.textMuted` has no
  // contrast headroom at 12px anywhere in this palette.
  cellCurrency: { color: theme.textMuted, ...text.ui("bodySm") },
  hint: { color: theme.assertedText, ...text.ui("caption") },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  check: {
    position: "absolute",
    top: space.lg,
    right: space.x2,
    width: 11,
    height: 6,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: theme.accentText,
    transform: [{ rotate: "-45deg" }],
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingTop: space.x3,
  },
}));
