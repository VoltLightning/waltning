/**
 * `<PageTabs>` — the four names above S04's pager, S04 §3.
 *
 * **This exists because a swipe has no affordance.** The pages are reached by
 * swiping; a gesture nothing draws is a gesture only its author knows about,
 * so the names are on screen and tapping one does exactly what swiping to it
 * does. Neither is the primary.
 *
 * **A marker on a hairline, not a filled band.** Three treatments were drawn:
 * a recessed track with the active page as a raised chip, icons with only the
 * active page named, and this. The track spends a filled band on four words;
 * the icons ask three glyphs to carry meaning alone, which works for a grid
 * and a list and guesses at a summary. This is the quiet one, and the one
 * that survives a fifth page.
 *
 * **The marker is short and the rule is full width.** An underline as wide as
 * its label makes the longest word look selected before you read it — the bar
 * reads as ragged rather than as a control.
 */

import { memo, useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { useInteraction } from "../../../primitives/interaction.ts";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../../../tokens.ts";

export type PageTab = {
  /** Stable across renders — the page's identity, not its position. */
  key: string;
  /** Already localised by the caller: this component holds no copy. */
  label: string;
};

export type PageTabsProps = {
  tabs: readonly PageTab[];
  activeKey: string;
  onSelect: (key: string) => void;
};

function TabItem({
  tab,
  active,
  onSelect,
}: {
  tab: PageTab;
  active: boolean;
  onSelect: (key: string) => void;
}) {
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  const key = tab.key;
  const press = useCallback(() => onSelect(key), [onSelect, key]);

  // `react-native-web` never reads RN-core's `accessibilityState` object:
  // `createDOMProps` recognises only this flat legacy name, so `aria-selected`
  // never reaches the DOM without it and a web reader is told nothing about
  // what is current. `conformance.test.ts` now refuses one without the other.
  const ariaSelectedProps: { accessibilitySelected: boolean } = {
    accessibilitySelected: active,
  };

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      {...ariaSelectedProps}
      // `react-native-web` never reads the state object — `createDOMProps`
      // recognises only this flat legacy name, so `aria-selected` never
      // reaches the DOM without it (`conformance.test.ts` now refuses one
      // without the other).
      onPress={press}
      {...handlers}
      style={[styles.item, focused ? styles.focused : null]}
    >
      <Text style={active ? styles.labelActive : styles.label}>{tab.label}</Text>
      <View style={[styles.marker, active ? styles.markerOn : null]} />
    </Pressable>
  );
}

const MemoTabItem = memo(TabItem);

function PageTabsView({ tabs, activeKey, onSelect }: PageTabsProps) {
  const styles = useStyles();
  return (
    <View accessibilityRole="tablist" style={styles.row}>
      {tabs.map((tab) => (
        <MemoTabItem key={tab.key} tab={tab} active={tab.key === activeKey} onSelect={onSelect} />
      ))}
    </View>
  );
}

export const PageTabs = memo(PageTabsView);

const useStyles = makeStyles((theme) => ({
  row: {
    flexDirection: "row",
    gap: space.xxs,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  item: {
    flex: 1,
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: space.sm,
  },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  label: { ...text.ui("bodySm"), color: theme.textMuted },
  labelActive: { ...text.ui("bodySm", 600), color: theme.text },
  // Always laid out, so selecting a tab moves a marker rather than changing a
  // row's height — a bar that reflows on selection reads as a page reloading.
  marker: {
    width: 18,
    height: 2,
    borderRadius: radius.pill,
    backgroundColor: "transparent",
    marginBottom: -1,
  },
  markerOn: { backgroundColor: theme.accent },
}));
