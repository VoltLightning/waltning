import { Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { useSafeArea } from "../primitives/safe-area";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { GroundPanel } from "./card";
import type { FloatPosition } from "./float-geometry.ts";
import { FloatingAdd } from "./floating-add";

export type TodayFrameProps = {
  appearanceAction: React.ReactNode;
  total: React.ReactNode;
  body: React.ReactNode;
  onAdd: () => void;
  addDisabled?: boolean;
  /** Where the floating add button is on this device; `null` is the default. */
  floatPosition: FloatPosition | null;
  onFloatPositionChange: (next: FloatPosition) => void;
};

/**
 * The shell is one flat colour — `theme.shell`, no gradient. The heading is the UI
 * face: a headline is not a figure, and the display face exists for figures.
 *
 * **The add button floats over the whole frame, header included.** §2.9 makes
 * it the topmost layer, so it is the last child of the root rather than a row
 * inside the ground panel — a row at the bottom of the list was a bar, and a
 * bar is the one thing the button is specified not to be.
 *
 * **The shell clears the status bar because the device says how tall it is.**
 * `paddingTop` was `space.x7` — 34, a number chosen to look like a status bar
 * and therefore wrong on every device whose status bar is not 34. Android runs
 * about 24, an iPhone with a Dynamic Island 59: the heading floated on one and
 * clipped under the other, and nothing in the layout said which.
 *
 * The inset is *clearance* and the padding is the design's own breathing room,
 * so they add rather than compete. `max()` would put the heading hard against
 * the status bar on exactly the phones that need the most room.
 */
export function TodayFrame({
  appearanceAction,
  total,
  body,
  onAdd,
  addDisabled,
  floatPosition,
  onFloatPositionChange,
}: TodayFrameProps) {
  const t = useT();
  const styles = useStyles();
  const insets = useSafeArea();

  // Composed here rather than in `useStyles`: `makeStyles` caches per theme,
  // and these vary per device. A cache keyed on the theme alone would hand the
  // second device the first one's notch.
  const clearance = {
    paddingTop: space.x5 + insets.top,
    paddingLeft: space.x5 + insets.left,
    paddingRight: space.x5 + insets.right,
  };

  return (
    <View style={styles.root}>
      <View style={[styles.shell, clearance]}>
        <View style={styles.header}>
          <Text style={styles.heading}>{t("shell.today")}</Text>
          {appearanceAction}
        </View>
        <View>{total}</View>
      </View>
      <GroundPanel>
        <View style={styles.body}>{body}</View>
      </GroundPanel>
      <FloatingAdd
        onAdd={onAdd}
        disabled={addDisabled ?? false}
        position={floatPosition}
        onPositionChange={onFloatPositionChange}
      />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.ground },
  shell: { backgroundColor: theme.shell, padding: space.x5, gap: space.x4 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { color: theme.shellText, ...text.ui("displayTwo") },
  body: { flex: 1, gap: space.x3 },
}));
