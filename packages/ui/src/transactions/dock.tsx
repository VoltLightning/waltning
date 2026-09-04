/**
 * `<Dock>` — `design-system/05` §5.1: the bottom-anchored composer. Mode row,
 * keypad, full-width Save.
 *
 * **`mode` is typed `"keypad"`, on purpose.** It is the only mode arc 1
 * builds — voice (S08), receipt (S07) and conversational capture are named in
 * `modes` so the row shows the shape S05 will eventually have, but nothing
 * behind them exists yet, and a wider type here would let a caller claim
 * otherwise. `wave-3-shared.md` names this explicitly: those three are not
 * built in this wave.
 *
 * **The keypad is `children`, not a prop this component understands.** `Dock`
 * composes `SegmentControl` for the mode row and a full-width `Button` for
 * Save; what fills the middle is the caller's — S05's next card wires
 * `AmountField` and `Keypad` into it. A `Dock` that imported `Keypad` itself
 * would be a screen wearing a primitive's name.
 *
 * **Only the bottom inset is cleared here.** The dock sits under everything
 * else on the screen and its own edge is the one that ever meets a home
 * indicator; `Shell`'s header clears the top the same way, each component
 * clearing only the edge it actually touches.
 */

import { View } from "react-native";
import { Button } from "../primitives/button";
import { useSafeArea } from "../primitives/safe-area";
import { type Segment, SegmentControl } from "../primitives/segment-control";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type DockModeOption = { value: string; label: string; disabled?: boolean };

export type DockProps = {
  /** The only mode arc 1 runs. See the file header. */
  mode: "keypad";
  /** Two to four — `SegmentControl`'s own floor and ceiling for a mode row. */
  modes: readonly [DockModeOption, DockModeOption, ...DockModeOption[]];
  onMode: (mode: string) => void;
  /** The keypad slot — never built by `Dock` itself. */
  children: React.ReactNode;
  onSave: () => void;
  saveLabel: string;
  saveDisabled?: boolean;
};

export function Dock({
  mode,
  modes,
  onMode,
  children,
  onSave,
  saveLabel,
  saveDisabled = false,
}: DockProps) {
  const styles = useStyles();
  const insets = useSafeArea();

  // Computed rather than cached in `useStyles`: the inset is per-device, and
  // a theme-keyed cache would hand the second device the first one's home
  // indicator (`shell.tsx`'s `clearance` does the same).
  const clearance = { paddingBottom: space.x3 + insets.bottom };

  // `Array#map` widens a tuple to a plain array even though its length
  // cannot change — `modes`'s own type already guarantees at least two, so
  // this restates that rather than discovering it.
  const segments = modes.map(
    (option): Segment => ({
      value: option.value,
      label: option.label,
      ...(option.disabled === undefined ? {} : { disabled: option.disabled }),
    }),
  ) as [Segment, Segment, ...Segment[]];

  return (
    <View style={[styles.root, clearance]}>
      <SegmentControl segments={segments} value={mode} onChange={onMode} />
      <View style={styles.keypad}>{children}</View>
      <View style={styles.saveRow}>
        <Button
          label={saveLabel}
          onPress={onSave}
          disabled={saveDisabled}
          variant="primary"
          size="lg"
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    gap: space.x3,
    paddingHorizontal: space.x3,
    paddingTop: space.x3,
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  keypad: { gap: space.md },
  saveRow: { width: "100%" },
}));
