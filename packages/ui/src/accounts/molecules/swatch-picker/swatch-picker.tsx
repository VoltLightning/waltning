/**
 * `<SwatchPicker>` — an account's colour: its kind's, or one of nine.
 *
 * **The first choice is *its kind's*, and it is drawn in that colour.** Most
 * accounts should never be touched — the ramp's defaults are already told
 * apart (`02-tokens` §2.1b) — so the resting choice is the default, shown as
 * the colour it would be, and picking another is a deliberate override that
 * can always be taken back.
 *
 * **Nine, never a free colour.** Each is one of the ramp's pairs, so an
 * account given a colour by hand keeps every contrast and spacing guarantee
 * the defaults carry; a hex field would give up both on the first pick.
 *
 * Swatches rather than a `Select`: a colour is chosen by looking, and a list
 * of nine names is a list of nine things to imagine.
 */

import { ACCOUNT_COLOR, type AccountColor, type AccountKind } from "@waltning/core/registry/inputs";
import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import type { Messages } from "../../../i18n/en.ts";
import { useT } from "../../../i18n/provider";
import { PressableScaled } from "../../../primitives/atoms/pressable-scaled/pressable-scaled";
import { useInteraction } from "../../../primitives/interaction.ts";
import { focusBorder } from "../../../theme/focus.ts";
import { text } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { radius, space, touchTarget } from "../../../tokens.ts";
import { accountTint, kindTint } from "../../kind-tint.ts";

export type SwatchPickerProps = {
  /** The account's kind — what *its kind's* colour is. */
  kind: AccountKind;
  /** `null` is the kind's own. */
  value: AccountColor | null;
  onChange: (value: AccountColor | null) => void;
};

const NAME_KEY: Record<AccountColor, keyof Messages["accounts"]> = {
  blue: "colorBlue",
  teal: "colorTeal",
  rose: "colorRose",
  slate: "colorSlate",
  violet: "colorViolet",
  umber: "colorUmber",
  warm_grey: "colorWarmGrey",
  sky: "colorSky",
  rust: "colorRust",
};

export function SwatchPicker({ kind, value, onChange }: SwatchPickerProps) {
  const t = useT();
  const styles = useStyles();
  const theme = useTheme();

  const options = useMemo(
    () => [
      { key: "kind", value: null, name: t("accounts.colorOfKind"), ink: kindTint(kind, theme).ink },
      ...ACCOUNT_COLOR.map((color) => ({
        key: color,
        value: color,
        name: t(`accounts.${NAME_KEY[color]}`),
        ink: accountTint({ kind, color }, theme).ink,
      })),
    ],
    [kind, theme, t],
  );
  const chosen = options.find((option) => option.value === value) ?? options[0];

  return (
    <View style={styles.root}>
      <Text style={styles.label}>
        {t("accounts.color")}
        {chosen === undefined ? "" : ` · ${chosen.name}`}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t("accounts.color")}
        style={styles.grid}
      >
        {options.map((option) => (
          <Swatch
            key={option.key}
            name={option.name}
            ink={option.ink}
            value={option.value}
            selected={option.value === value}
            isDefault={option.value === null}
            onChange={onChange}
          />
        ))}
      </View>
    </View>
  );
}

type SwatchProps = {
  name: string;
  ink: string;
  value: AccountColor | null;
  selected: boolean;
  /** *Its kind's* — drawn with a mark inside, so it reads as "the default" and not a tenth colour. */
  isDefault: boolean;
  onChange: (value: AccountColor | null) => void;
};

function Swatch({ name, ink, value, selected, isDefault, onChange }: SwatchProps) {
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const handlePress = useCallback(() => onChange(value), [onChange, value]);
  const fill = useMemo(() => ({ backgroundColor: ink }), [ink]);
  return (
    <PressableScaled
      accessibilityRole="radio"
      accessibilityLabel={name}
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      onPress={handlePress}
      style={[
        styles.target,
        selected ? styles.selected : null,
        hovered ? styles.hovered : null,
        focused ? styles.focused : null,
      ]}
      {...handlers}
    >
      <View style={[styles.swatch, fill]}>
        {isDefault ? <View style={styles.defaultMark} /> : null}
      </View>
    </PressableScaled>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.md },
  label: { color: theme.textMuted, ...text.ui("kicker") },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  target: {
    width: touchTarget.min,
    height: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: "transparent",
  },
  selected: { borderColor: theme.text },
  hovered: { backgroundColor: theme.hoverFill },
  /** The target has a border of its own, so focus is that border — never a ring outside it (§2.6). */
  focused: focusBorder(theme.focusRing),
  swatch: {
    width: 28,
    height: 28,
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  /** A small ring on the default — "its kind's" is not a tenth colour. */
  defaultMark: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: theme.surface,
  },
}));
