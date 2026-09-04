/**
 * `<Keypad>` — `design-system/05` §5.1, `03` §3.7: 0–9, comma, delete.
 * Bottom-anchored, thumb-zone (Fitts).
 *
 * **The one component `motionFrequency.constant` names.** §2.7's table: J02
 * runs several times a day and a capture is a dozen taps, so a keypad that
 * animates is a keypad that feels slow by the second week. Press feedback is
 * `usePressScale` and *nothing more* — no ripple, no colour transition beyond
 * what the scale itself implies.
 *
 * **The reported key is always `","`, never `"."`.** The *label* on the
 * decimal key follows the locale (`decimalMark`, `ui/i18n/locales.ts`) —
 * Polish shows `,`, English shows `.` — but the value this emits is the
 * canonical comma every caller downstream already parses
 * (`AmountField#parseAmount` accepts both separators). A locale-varying *key*
 * would mean every consumer re-derives the mark to know what it just
 * received; a locale-varying *label* costs nothing because only the glyph on
 * the button changes.
 *
 * **Delete is drawn, not `"⌫"`.** The system draws its own marks —
 * `FloatingAdd`'s plus, `Select`'s chevron and token ×; a literal glyph would
 * be the one icon depending on a font shipping it. The delete key reuses the
 * × construction: removing the last digit is the same "take one thing away"
 * as removing a picked token.
 */

import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { decimalMark } from "../i18n/locales.ts";
import { useLocale, useT } from "../i18n/provider";
import { useInteraction } from "../primitives/interaction.ts";
import { usePressScale } from "../primitives/press-scale.ts";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";

export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "," | "delete";

export type KeypadProps = {
  onKey: (key: KeypadKey) => void;
  disabled?: boolean;
};

const ROWS: readonly (readonly KeypadKey[])[] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [",", "0", "delete"],
];

export function Keypad({ onKey, disabled = false }: KeypadProps) {
  const locale = useLocale();
  const styles = useStyles();
  const mark = decimalMark(locale);

  return (
    <View style={styles.grid}>
      {ROWS.map((row) => (
        <View key={row.join("")} style={styles.row}>
          {row.map((key) => (
            <KeypadButton key={key} value={key} mark={mark} onKey={onKey} disabled={disabled} />
          ))}
        </View>
      ))}
    </View>
  );
}

type KeypadButtonProps = {
  value: KeypadKey;
  mark: "." | ",";
  onKey: (key: KeypadKey) => void;
  disabled: boolean;
};

function KeypadButton({ value, mark, onKey, disabled }: KeypadButtonProps) {
  const t = useT();
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  const press = usePressScale();
  const handlePress = useCallback(() => onKey(value), [onKey, value]);

  const glyph = value === "," ? mark : value;
  const label = value === "delete" ? t("common.delete") : glyph;

  return (
    <Animated.View style={[styles.cell, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={handlePress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        {...handlers}
        style={[styles.key, focused ? styles.focused : null, disabled ? styles.disabled : null]}
      >
        {value === "delete" ? (
          <View style={styles.deleteCross}>
            <View style={[styles.deleteCrossBar, styles.deleteCrossBarA]} />
            <View style={[styles.deleteCrossBar, styles.deleteCrossBarB]} />
          </View>
        ) : (
          <Text style={styles.keyLabel}>{glyph}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((theme) => ({
  grid: { gap: space.md },
  row: { flexDirection: "row", gap: space.md },
  cell: { flex: 1 },
  key: {
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: theme.subtleFill,
  },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  disabled: { opacity: 0.45 },
  keyLabel: { color: theme.text, ...text.ui("displayThree") },
  deleteCross: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  deleteCrossBar: { position: "absolute", width: 17, height: 2, backgroundColor: theme.text },
  deleteCrossBarA: { transform: [{ rotate: "45deg" }] },
  deleteCrossBarB: { transform: [{ rotate: "-45deg" }] },
}));
