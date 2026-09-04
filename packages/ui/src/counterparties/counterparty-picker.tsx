/**
 * `<CounterpartyPicker>` — S05 §5, S15 §2. Over `<BottomSheet>`: search,
 * recent, the full list, *+ New*. **Same shape as the category sheet**
 * (`design-system/05` §5.5's own note) — `CategorySheet` is the pattern this
 * copies: search always covers the whole list, positions never move.
 *
 * **`+ New` is a callback, never a render.** `CounterpartySheet` composing
 * `CounterpartyForm` inline would be this component reaching into S15's own
 * screen; the same escape `CategorySheet`'s `onCreate` and
 * `QuickAddComposer`'s `onCreateAccount` already take — the screen owns the
 * navigation to `counterparty/new`.
 */

import { fold } from "@waltning/core/capture/names";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { useInteraction } from "../primitives/interaction.ts";
import { usePressScale } from "../primitives/press-scale.ts";
import { SearchField } from "../primitives/search-field";
import { BottomSheet } from "../shell/bottom-sheet";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";
import { monogramFor } from "./monogram.ts";

export type CounterpartyPickerCounterparty = {
  id: string;
  name: string;
  kind: "person" | "company";
};

export type CounterpartyPickerProps = {
  visible: boolean;
  counterparties: readonly CounterpartyPickerCounterparty[];
  /** Ids most recently attached to a transaction, most recent first — absent or empty hides the section. */
  recentIds?: readonly string[];
  onPick: (id: string) => void;
  onCreateNew: () => void;
  onDismiss: () => void;
};

export function CounterpartyPicker({
  visible,
  counterparties,
  recentIds = [],
  onPick,
  onCreateNew,
  onDismiss,
}: CounterpartyPickerProps) {
  const t = useT();
  const styles = useStyles();
  const [query, setQuery] = useState("");

  const handleClear = useCallback(() => setQuery(""), []);
  const handleDismiss = useCallback(() => {
    setQuery("");
    onDismiss();
  }, [onDismiss]);
  const handlePick = useCallback(
    (id: string) => {
      setQuery("");
      onPick(id);
    },
    [onPick],
  );

  const searching = query.trim() !== "";
  const needle = fold(query);
  const visibleList = useMemo(
    () =>
      searching
        ? counterparties.filter((cp) => fold(cp.name).includes(needle))
        : counterparties,
    [counterparties, needle, searching],
  );
  const recent = useMemo(
    () =>
      searching
        ? []
        : recentIds
            .map((id) => counterparties.find((cp) => cp.id === id))
            .filter((cp): cp is CounterpartyPickerCounterparty => cp !== undefined),
    [counterparties, recentIds, searching],
  );

  return (
    <BottomSheet visible={visible} title={t("counterparties.pickerTitle")} onDismiss={handleDismiss}>
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder={t("counterparties.pickerSearchPlaceholder")}
        onClear={handleClear}
        {...(searching ? { resultCount: visibleList.length } : {})}
      />
      <ScrollView style={styles.scroll}>
        {recent.length === 0 ? null : (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t("counterparties.pickerRecent")}</Text>
            {recent.map((cp) => (
              <PickerRow key={cp.id} counterparty={cp} onPick={handlePick} />
            ))}
          </View>
        )}
        <View style={styles.section}>
          {visibleList.length === 0 ? (
            <Text style={styles.noMatches}>{t("counterparties.pickerNoMatches")}</Text>
          ) : (
            visibleList.map((cp) => (
              <PickerRow key={cp.id} counterparty={cp} onPick={handlePick} />
            ))
          )}
        </View>
      </ScrollView>
      <Button label={t("counterparties.pickerNew")} onPress={onCreateNew} variant="secondary" />
    </BottomSheet>
  );
}

type PickerRowProps = {
  counterparty: CounterpartyPickerCounterparty;
  onPick: (id: string) => void;
};

function PickerRow({ counterparty, onPick }: PickerRowProps) {
  const t = useT();
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const press = usePressScale();
  const handlePress = useCallback(() => onPick(counterparty.id), [counterparty.id, onPick]);
  const monogram = monogramFor(counterparty.name);
  // Computed rather than in `useStyles`, matching `tag.tsx`'s own `fill`/`ink`.
  const monogramFill = { backgroundColor: monogram.fill };
  const monogramInk = { color: monogram.ink };

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={counterparty.name}
        onPress={handlePress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        {...handlers}
        style={[styles.row, hovered ? styles.hovered : null, focused ? styles.focused : null]}
      >
        <View style={[styles.monogram, monogramFill]}>
          <Text style={[styles.monogramText, monogramInk]}>{monogram.letter}</Text>
        </View>
        <View style={styles.identity}>
          <Text style={styles.name} numberOfLines={1}>
            {counterparty.name}
          </Text>
          <Text style={styles.kind}>
            {t(
              counterparty.kind === "company"
                ? "counterparties.kindCompany"
                : "counterparties.kindPerson",
            )}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((theme) => ({
  scroll: { maxHeight: touchTarget.min * 6 },
  section: { gap: space.xs },
  sectionLabel: { color: theme.textMuted, ...text.ui("kicker"), paddingTop: space.md },
  noMatches: { color: theme.textMuted, ...text.ui("body"), padding: space.x3 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: touchTarget.min,
    paddingHorizontal: space.xs,
    borderRadius: radius.sm,
  },
  hovered: { backgroundColor: theme.hoverFill },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  monogram: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  monogramText: { ...text.ui("caption", 600) },
  identity: { flex: 1 },
  name: { color: theme.text, ...text.ui("body") },
  kind: { color: theme.textMuted, ...text.ui("caption") },
}));
