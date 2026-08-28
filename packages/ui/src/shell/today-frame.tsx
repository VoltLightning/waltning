import { Text, View } from "react-native";
import { Button } from "../primitives/button";
import { face } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space, type } from "../tokens.ts";
import { GroundPanel } from "./card";

export type TodayFrameProps = {
  appearanceAction: React.ReactNode;
  total: React.ReactNode;
  body: React.ReactNode;
  onAdd: () => void;
  addDisabled?: boolean;
};

/**
 * The shell is one flat colour — `t.shell`, no gradient. The heading is the UI
 * face: a headline is not a figure, and the display face exists for figures.
 *
 * The add button below is the placeholder for the floating one: `design-system/
 * 02` §2.5 reserves the system's only shadow for a circular button that floats
 * above the whole screen, docks to the bottom edge, and remembers where it was
 * put. That is a component with gestures, safe-area insets and a device
 * preference behind it, and it lands with its own card; until then the action
 * is here, in the layout, so the screen still has one.
 */
export function TodayFrame({ appearanceAction, total, body, onAdd, addDisabled }: TodayFrameProps) {
  const styles = useStyles();
  return (
    <View style={styles.root}>
      <View style={styles.shell}>
        <View style={styles.header}>
          <Text style={styles.heading}>Today</Text>
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

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.ground },
  shell: { backgroundColor: t.shell, padding: space.x5, paddingTop: space.x7, gap: space.x4 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { color: t.shellText, fontSize: type.displayTwo.fontSize, ...face.ui(600) },
  body: { flex: 1, gap: space.x3 },
  add: { alignSelf: "center", minWidth: 72 },
}));
