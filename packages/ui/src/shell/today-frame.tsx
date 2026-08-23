import { Text, View } from "react-native";
import { Button } from "../primitives/button";
import { face, makeStyles } from "../theme/index.ts";
import { space, type } from "../tokens.ts";
import { GroundPanel } from "./card";

export type TodayFrameProps = {
  appearanceAction: React.ReactNode;
  total: React.ReactNode;
  body: React.ReactNode;
  onAdd: () => void;
  addDisabled?: boolean;
};

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
  shell: { backgroundColor: t.shellFrom, padding: space.x5, paddingTop: space.x7, gap: space.x4 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { color: t.shellText, fontSize: type.displayTwo.fontSize, ...face.display(600) },
  body: { flex: 1, gap: space.x3 },
  add: { alignSelf: "center", minWidth: 72 },
}));
