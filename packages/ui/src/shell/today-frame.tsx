import { Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { useSafeArea } from "../primitives/safe-area";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { GroundPanel } from "./card";

export type TodayFrameProps = {
  appearanceAction: React.ReactNode;
  total: React.ReactNode;
  body: React.ReactNode;
  onAdd: () => void;
  addDisabled?: boolean;
};

/**
 * The shell is one flat colour — `theme.shell`, no gradient. The heading is the UI
 * face: a headline is not a figure, and the display face exists for figures.
 *
 * The add button below is the placeholder for the floating one: `design-system/
 * 02` §2.5 reserves the system's only shadow for a circular button that floats
 * above the whole screen, docks to the bottom edge, and remembers where it was
 * put. That is a component with gestures and a device preference behind it, and
 * it lands with its own card; until then the action is here, in the layout, so
 * the screen still has one.
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
export function TodayFrame({ appearanceAction, total, body, onAdd, addDisabled }: TodayFrameProps) {
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
        <View style={styles.add}>
          <Button
            label="+"
            onPress={onAdd}
            disabled={addDisabled ?? false}
            variant="primary"
            size="lg"
          />
        </View>
      </GroundPanel>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.ground },
  shell: { backgroundColor: theme.shell, padding: space.x5, gap: space.x4 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { color: theme.shellText, ...text.ui("displayTwo") },
  body: { flex: 1, gap: space.x3 },
  add: { alignSelf: "center", minWidth: 72 },
}));
