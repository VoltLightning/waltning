/**
 * `<TabBar>` — `design-system/05` §5.1. Duotone icons, ≥44px targets.
 * **The add button is not one of them** — it floats above the whole screen
 * and parks on the bottom edge (`02-tokens` §2.9), so the bar never has to
 * make room for it. `packages/ui` names no router: the route file binds
 * `items`/`activeName`/`onSelect` to `expo-router`'s own `TabTrigger`, which
 * is the only file allowed to name it.
 *
 * **The count is the caller's**, not a prop this component enforces — four
 * is what the phone build wires today (Today · Ledger · Debt · Settings;
 * Calendar returns with S11), and a component that hardcoded the number
 * would have to change the day a fifth tab does. What *is* enforced: every
 * target clears the §10 floor, and every tab carries `role="tab"` with
 * `aria-selected` so the active one is announced, not just painted.
 *
 * **The vertical rhythm is the bar's, not each glyph's.** 8 above the icon,
 * the icon in a fixed `TAB_ICON_SIZE` box, 4 to the label, 8 under it, plus
 * the device's bottom inset — 56pt of bar over whatever the phone reserves,
 * against iOS's own 49pt + inset. It was 51 in total, with `Today`'s 14px
 * mark leaving its label 3px higher than the other four, because the box was
 * whatever each glyph happened to draw and the padding was 4.
 */

import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { useInteraction } from "../primitives/interaction.ts";
import { useSafeArea } from "../primitives/safe-area";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, space, touchTarget } from "../tokens.ts";
import { TAB_ICON_SIZE } from "./tab-icons";

export type TabBarItem = {
  name: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
};

export type TabBarProps = {
  items: readonly TabBarItem[];
  onSelect: (name: string) => void;
};

export function TabBar({ items, onSelect }: TabBarProps) {
  const styles = useStyles();
  const insets = useSafeArea();

  // Computed rather than in `useStyles`: the inset is per-device — `dock.tsx`'s
  // own `clearance` is the same shape, a plain object beside the JSX.
  const clearance = {
    paddingBottom: insets.bottom,
    paddingLeft: insets.left,
    paddingRight: insets.right,
  };

  return (
    <View accessibilityRole="tablist" style={[styles.bar, clearance]}>
      {items.map((item) => (
        <TabBarTarget key={item.name} item={item} onSelect={onSelect} />
      ))}
    </View>
  );
}

function TabBarTarget({ item, onSelect }: { item: TabBarItem; onSelect: (name: string) => void }) {
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  const onPress = useCallback(() => onSelect(item.name), [onSelect, item.name]);

  /**
   * `react-native-web` never reads the RN-core `accessibilityState` object at
   * all — `createDOMProps` only recognises the flat, legacy
   * `accessibilitySelected` name (the same gap `ThresholdSlider` documents for
   * `accessibilityValue`), so `aria-selected` never reaches the DOM without
   * it. Both forms are supplied: the object for native, this one for web.
   */
  const ariaSelectedProps: { accessibilitySelected: boolean } = {
    accessibilitySelected: item.active,
  };

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: item.active }}
      onPress={onPress}
      {...handlers}
      {...ariaSelectedProps}
      style={[styles.target, focused ? styles.targetFocused : null]}
    >
      <View style={styles.icon}>{item.icon}</View>
      <Text style={[styles.label, item.active ? styles.labelActive : null]}>{item.label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  bar: {
    flexDirection: "row",
    backgroundColor: theme.surface,
    borderTopWidth: theme.elevation.frame.borderWidth,
    borderTopColor: theme.elevation.frame.borderColor,
  },
  target: {
    flex: 1,
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    paddingVertical: space.md,
  },
  targetFocused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  /** The box, reserved by the bar — a glyph may be smaller, never taller. */
  icon: {
    width: TAB_ICON_SIZE,
    height: TAB_ICON_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { color: theme.textMuted, ...text.ui("caption", 600) },
  labelActive: { color: theme.accentText },
}));
